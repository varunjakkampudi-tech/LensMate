# Hostinger VPS: read-only audit and deployment runbook

Status: **PROPOSED. Nothing has been run on the server, deployed, or exposed.** Deploying needs your explicit approval
of the exact configuration in section 4. Until then, the broker stays in mock mode and paid calls stay off.

Server: Hostinger VPS id `1984950` (hPanel: https://hpanel.hostinger.com/vps/1984950/overview).
The assistant cannot sign in to hPanel or reach the server, so every step below is run by the owner.

## 1. Read-only audit (run first; changes nothing)

Run these in the hPanel browser terminal or over SSH as a non-root user. Paste the output back, with any secret values
removed. Each command only reads state.

```bash
uname -a && cat /etc/os-release | head -3
```

```bash
uptime && free -h && df -h /
```

```bash
docker --version && docker compose version 2>/dev/null || echo "docker compose not installed"
```

```bash
ss -tulpn
```

```bash
sudo ufw status verbose 2>/dev/null || echo "ufw not installed"
```

```bash
sudo sshd -T 2>/dev/null | grep -E '^(permitrootlogin|passwordauthentication|pubkeyauthentication|port) '
```

```bash
systemctl list-units --type=service --state=running --no-pager | head -40
```

What the audit must answer:

- Which ports are listening to the public internet. Only SSH should be public. Broker port 8080 must bind to `127.0.0.1`.
- Whether root login and password login over SSH are disabled.
- Whether a firewall is active. Expected: deny inbound except SSH and, only if approved, 443.
- Whether Docker is present and what is already running (other projects on the same VPS must not be disturbed).
- Disk and memory headroom for PostgreSQL 17 plus the broker.

## 2. Target architecture (proposed)

```
Internet ──► 443 (Caddy or nginx, TLS, only if approved) ──► 127.0.0.1:8080 broker (Fastify)
                                                              │
                                                              ├─► 127.0.0.1:5432 PostgreSQL 17 (not public)
                                                              └─► openrouter.ai (outbound, https only)
```

- The broker keeps its per-device bearer credentials. The phone never receives the OpenRouter key.
- PostgreSQL is not published. The broker reaches it on localhost only.
- The anchor file for spend continuity sits on a separate path from the database data directory
  (`BROKER_LEDGER_ANCHOR_FILE`, see `services/broker/src/ledger-anchor.ts`).
- Backups use `services/broker/deploy/backup/backup.sh` and are tested with `restore.sh` before go-live.

## 3. Pre-deployment checks that run locally (no server needed)

```bash
pnpm exec jest services/broker/src/config.test.ts services/broker/src/server.test.ts services/broker/src/budget.test.ts
```

```bash
(cd services/broker && pnpm exec tsc --noEmit)
```

The Postgres integration tests (`*.integration.test.ts`) need a throwaway database. Run them against a local instance,
never against the VPS.

## 4. The exact configuration to approve

Approve, or change, each line. Nothing is deployed until you reply with the approval.

| Item             | Proposed value                                            | Why                                                                             |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Mode             | `BROKER_MODE=mock`                                        | No provider calls. Live needs section 5.                                        |
| Paid calls       | `BROKER_PAID_CALLS=off`                                   | Config refuses live mode while off.                                             |
| Dev-test cap     | `BROKER_DEV_TEST_CAP_PAISE` unset                         | Set only when live testing is approved (max 5000 = ₹50, enforced in code).      |
| Monthly cap      | `BROKER_MONTHLY_CAP_PAISE=50000` (₹500)                   | Existing owner-confirmed cap.                                                   |
| Public exposure  | None. Broker bound to `127.0.0.1`                         | Phone access uses the LAN HTTPS route (decision 0003), not the public internet. |
| Public TLS (443) | Not opened                                                | Open only if you choose Option A or C in decision 0003.                         |
| Database         | PostgreSQL 17, localhost only                             | Not reachable from outside.                                                     |
| Secrets          | Env file mode 600, owned by the service user, outside git | Never printed, never committed.                                                 |
| Backups          | Nightly `backup.sh`, restore tested before go-live        | Required before any real data.                                                  |

Reply with: "approve section 4 as written", or list the changes you want.

## 5. Going live with paid calls (separate approval, later)

Do not do this step until you explicitly approve paid calls and the spend limit.

1. Set `BROKER_MODE=live`, `BROKER_PAID_CALLS=on`, `OPENROUTER_API_KEY` (from the environment file, never typed into a
   chat), `BROKER_DATABASE_URL`, `BROKER_LEDGER_ANCHOR_FILE`.
2. For the owner's test phase, set `BROKER_DEV_TEST_CAP_PAISE` to the approved amount (at most 5000). Paid attempts then
   draw on one cumulative bucket that does not reset monthly.
3. Set `BROKER_OWNER_CAP_CONFIRMATION_PAISE` equal to `BROKER_MONTHLY_CAP_PAISE`. The broker refuses to start otherwise.

## 6. Rollback

- Stop the service. Set `BROKER_MODE=mock` and `BROKER_PAID_CALLS=off`, then restart. This stops all paid calls at once.
- Revoke a device with the admin CLI (`pnpm -F @lensmate/broker admin:devices`). Revocation keeps its records.
- Restore the database from the last verified backup only if data was damaged. Never delete the anchor file to "reset"
  spend; that breaks spend continuity.

## Not verified here

- The VPS state (nothing above has been run).
- Whether the existing server already runs other workloads that the broker must not disturb.
- Backup and restore on the VPS.
