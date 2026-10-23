# Broker deployment runbook (Hostinger VPS, owner-run)

Status: PREPARED, NOT DEPLOYED. The agent has not built the image, started the stack, or contacted the VPS.
Approval gate: every step below that changes the server, creates a secret, or starts billable calls needs the
owner's explicit approval for that step (BLOCKER-006).

## What is in this folder

- `Dockerfile`: multi-stage build, non-root runtime, health check. Built from the repository root.
- `docker-compose.yml`: the broker and its PostgreSQL database. The database network is internal, with no published
  port. The broker is published on `127.0.0.1:8080` only, so a reverse proxy with TLS must sit in front of it (owner
  choice, see decisions below).
- `.env.example`: variable names and placeholders only. Never commit a real `.env`.

## Isolation from other Viswatra products

- Use the compose project name `lensmate-broker` (set in the file). Do not share containers, networks, volumes or
  databases with OraOne, CareerScope or FixHub24.
- The Hostinger VPS currently runs another product's live deployment (LensMate-v9 Amendment 2026-10-20D). Do not
  modify its containers, files or firewall rules. A separate VPS is a candidate only, not purchased.
- The database is reachable only from the broker, on the internal `db` network.

## Secrets (owner creates these; never commit them)

Create files under `services/broker/deploy/secrets/` on the server, with mode `0600`:

- `openrouter_api_key`: the OpenRouter key. Only the owner holds it.
- `broker_database_url`: `postgres://broker:<password>@postgres:5432/broker`.
- `postgres_password`: the same password as in the database URL.

The broker reads these through the `*_FILE` variables. A secret is never placed in a compose file, an environment
listing, a log, a URL or the app.

Client credentials: generate a random client secret (at least 32 characters, enforced by the broker), give the app only that secret, and put
`{"id": "<client-id>", "secretSha256": "<sha256 of secret>"}` in `BROKER_CLIENTS_JSON`. The broker stores only the hash.
`hashClientSecret` in `src/config.ts` computes the hash.

## Owner decisions required before live mode

1. **Monthly cap.** Proposed start INR 500 (50000 paise). Set `BROKER_MONTHLY_CAP_PAISE` and the same value in
   `BROKER_OWNER_CAP_CONFIRMATION_PAISE`. The broker refuses live mode unless the two match.
2. **Exchange rate.** Set `BROKER_FX_PAISE_PER_USD` to the rate the owner accepts. No default is supplied.
3. **Reverse proxy, TLS and hostname.** Choose the proxy (for example Caddy or nginx) and the broker hostname. The
   hostname is an owner decision and is not inferred from `lensmate.tech`. DNS and certificates are owner actions.
   Also choose the VPS: the shared Hostinger VPS under the isolation rules, or the planned separate VPS.
4. **Logs and retention.** The broker logs outcome, cost and latency, never prompts, replies or secrets. Choose how
   long the server keeps container logs and ledger rows.
5. **Provider privacy and models.** See `docs/governance/provider-privacy-and-models.md`, including the upstream
   endpoint check and the disclosure text.
6. **Backups.** Choose the backup schedule for the ledger database and test a restore.

## Steps (owner approval per step)

1. Confirm the image builds: `docker build -f services/broker/deploy/Dockerfile .` from the repository root.
2. Start in mock mode (`BROKER_MODE=mock`, the default). The broker makes no provider call in this mode.
3. Check health: `curl -s http://127.0.0.1:8080/healthz` returns `{"status":"ok"}`.
4. Check the usage endpoint with a test client credential: it returns the cap and zero spend.
5. Only after decisions 1 to 6 and an explicit owner authorization for real calls: set `BROKER_MODE=live`, confirm
   the cap, and run one small owner-authorized call. Stop at the first unexpected result.

## Rollback

`docker compose -p lensmate-broker down` stops the stack. The ledger volume stays unless removed explicitly. Removing
the volume deletes spend history, so do it only with the owner's approval.

## What has been verified and what has not

- Verified by tests (mocked provider, in-memory ledger, real PostgreSQL 17 for the ledger): see
  `services/broker/src/*.test.ts` and `docs/measurements`-style traceability in `PROGRESS.md`.
- Not verified: the Docker image build, the compose stack start-up, the reverse proxy, TLS, the firewall and the
  health check inside the container. Docker is not running in the agent environment.
