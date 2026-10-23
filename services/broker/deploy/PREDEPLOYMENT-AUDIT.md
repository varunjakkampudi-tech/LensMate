# Hostinger VPS pre-deployment audit (BLOCKER-006)

Status: PARTIAL. Date 2026-10-24. The VPS inventory, resource, port and proxy checks could not be performed. No SSH access was provided and none was sought. No credentials were requested or used, and no browser or hPanel session was opened. No container was started or stopped, no proxy, DNS, firewall or server configuration was changed, and no OraOne file or database was touched. Nothing was deployed.

## 1. What was reviewed from the repository

- `services/broker/deploy/docker-compose.yml`: the broker and Postgres services, networks, secrets and resource limits.
- `services/broker/deploy/Dockerfile`: multi-stage build, non-root runtime, health check.
- `services/broker/deploy/README.md`: the owner runbook.
- Broker token handling in `services/broker/src/server.ts` and `packages/core/src/broker-client.ts`.

## 2. Compose and container review

| Item                                             | Current state                                                                       | Assessment                                                                                                                                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project name                                     | `lensmate-broker`                                                                   | Good. Container, network and volume names are prefixed with it, so they do not collide with other projects.                                                                                                            |
| Broker port                                      | Published as `127.0.0.1:8080:8080`                                                  | Loopback only, which is right. Port 8080 may already be in use on the VPS. Unverified (section 4).                                                                                                                     |
| Networks                                         | `egress` (outbound for the provider call) and `db` (internal, no route out)         | Good. Postgres has no route out and no published port.                                                                                                                                                                 |
| Hardening                                        | `read_only`, `cap_drop: ALL`, `no-new-privileges`, non-root `node` user             | Good.                                                                                                                                                                                                                  |
| Postgres capabilities                            | `CHOWN, DAC_OVERRIDE, FOWNER, SETGID, SETUID` added                                 | Needed by the official image's entrypoint. Not tested, because Docker is not running here.                                                                                                                             |
| Limits                                           | Broker 384 MB, 0.5 CPU, 128 PIDs. Postgres 512 MB, 0.5 CPU                          | Conservative. Must fit the free memory and CPU on the VPS (section 4).                                                                                                                                                 |
| Logging                                          | json-file, 10 MB by 3 files                                                         | Good. Bounded. Logs carry no prompts, replies or secrets (verified by tests).                                                                                                                                          |
| Restart policy                                   | `unless-stopped` on both                                                            | Good.                                                                                                                                                                                                                  |
| Health checks                                    | Broker: Dockerfile `HEALTHCHECK` on `/healthz`. Postgres: `pg_isready`              | Good. The broker's `/healthz` checks the ledger database.                                                                                                                                                              |
| Secrets                                          | Files under `./secrets`, with no secret in the compose file                         | Good.                                                                                                                                                                                                                  |
| **Postgres superuser**                           | `POSTGRES_USER: broker` makes the app role the image's superuser                    | **Risk.** The broker should use a non-superuser role that owns only its three tables. Corrective action: a one-time init script that creates `broker_app` with no superuser rights.                                    |
| **Client token in the app**                      | Bearer tokens are passed to the app by the caller, and no enrolment path exists yet | **Risk.** See section 6.                                                                                                                                                                                               |
| **Backups**                                      | None                                                                                | **Risk.** The ledger is the cap's source of truth. A lost ledger resets spend to zero. Corrective action: a nightly `pg_dump` to a separate location, with a tested restore. Owner decision on location and retention. |
| `BROKER_CLIENTS_JSON` as an environment variable | Holds hashes only                                                                   | Acceptable, because hashes are not secrets. But it appears in `docker inspect` output. Corrective action: move it to a file secret too.                                                                                |

## 3. Reverse proxy and hostname

Not inspected (no SSH). The compose file publishes the broker only on loopback, so a route is needed to reach it from the phone. Options, each needing your approval:

- **Preferred:** a new hostname (for example `broker.<domain>`) on whichever proxy already serves OraOne, with its own TLS certificate and upstream `127.0.0.1:8080`. This changes shared infrastructure, so OraOne's routes must be reviewed before and after.
- **Alternative:** a separate proxy container on a separate port, with its own certificate. This adds a public listener and needs a firewall rule.

The domain is an owner decision (`lensmate.tech` is the recorded product domain, but the broker hostname is not inferred from it).

## 4. VPS inventory and capacity (not yet verified)

The following must be confirmed with the read-only commands in section 7 before any deployment:

- Free memory against the planned 896 MB (broker plus Postgres) plus the existing OraOne footprint.
- Free CPU against the planned 1.0 CPU.
- Disk space for the Postgres volume and for logs.
- Whether port 8080, 5432 (must not be published), or any port the broker's network uses is already bound.
- Whether Docker and Compose are installed, and their versions.
- The firewall state (ufw, nftables or iptables) and whether it allows the proxy's ports only.
- The running reverse proxy, its configuration approach, and how OraOne's domain is routed.

## 5. Port and name conflicts

Unverified. The broker needs one host port (8080, loopback). Postgres publishes none. The Docker network names `lensmate-broker_egress` and `lensmate-broker_db` are prefixed by the project name. A conflict is likely only on 8080, and that is checked by section 7, step 4.

## 6. Token risk in a distributed mobile app

The broker authenticates with `Bearer <clientId>.<secret>`. If that secret were embedded in the app bundle, every installed copy would carry it, and anyone who extracts it could spend the monthly cap or use the broker. A secret in a mobile bundle is not a secret. This would violate the approved rule that provider keys never go in the app.

Corrective actions before any real use:

- No shared secret in the app. Each device gets its own credential, issued after an enrolment step that is not yet built.
- Credentials are revocable per device, and the broker records which device made each request.
- Preferably short-lived tokens, issued after authentication, with the long-lived secret held only in the platform's secure storage.
- Until enrolment exists, the broker must not be reachable by any app build. Mock-only deployment is the only safe state.

## 7. Read-only commands for the owner (run on the VPS, send back the output)

These do not change anything. Do not run `docker inspect` without a `--format` that excludes environment (its default output includes environment values).

```bash
# 1. Host capacity
uname -a; uptime; nproc; free -h; df -h; lsblk

# 2. Docker and Compose
docker --version; docker compose version

# 3. Running containers: names, images and published ports only
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'

# 4. Listening ports and their owning processes
sudo ss -tlnp

# 5. Per-container resource use (no environment)
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'

# 6. Networks and volumes (names only)
docker network ls --format 'table {{.Name}}\t{{.Driver}}'
docker volume ls --format '{{.Name}}'

# 7. Firewall state (read-only)
sudo ufw status verbose
sudo nft list ruleset 2>/dev/null | head -60

# 8. Reverse proxy identification (names and config path only)
docker ps --format '{{.Names}} {{.Image}}' | grep -i -E 'traefik|caddy|nginx' || true
systemctl list-units --type=service --state=running | grep -i -E 'nginx|caddy|apache' || true
```

Do not paste any command output that contains environment variables, passwords, tokens, or application data. If in doubt, redact before sending.

## 8. Safe deployment plan (after the audit is reviewed and approved)

1. Confirm section 4 values: memory and CPU headroom, port 8080 free, disk space, Docker present.
2. Create the non-superuser database role (section 2) before any data is written.
3. Put the secrets under `services/broker/deploy/secrets/` on the server, mode `0600`, with the OpenRouter key placed by the owner. The agent does not read it.
4. Start in **mock mode only**. `BROKER_MODE=mock`. No provider call is possible in this mode.
5. Verify `/healthz` on loopback, then the usage endpoint with a test credential.
6. Add the proxy route only after the owner approves the hostname and reviews OraOne's routes.
7. Live mode stays off until the owner separately authorizes one limited test within the INR 500 cap.

## 9. Open risks and owner actions

| #   | Risk                                                                          | Corrective action                                       | Owner action                                    |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| 1   | Postgres app role is a superuser                                              | Create a least-privilege role                           | Approve the init script                         |
| 2   | No backups, so a lost ledger resets spend                                     | Nightly dump, tested restore                            | Choose location and retention                   |
| 3   | Shared secret could reach the app bundle                                      | Per-device credentials and enrolment                    | Approve the design before any app build uses it |
| 4   | Shared VPS: a conflict or resource shortfall could affect OraOne              | Section 7 checks before deployment                      | Run section 7 and send output                   |
| 5   | Proxy change touches OraOne's routes                                          | Review before and after; no change without approval     | Approve the hostname and proxy                  |
| 6   | Unverified Docker build and Postgres capabilities                             | Run mock-mode deployment on the server                  | Approve mock-only deployment                    |
| 7   | Reasoning-token billing and cancelled-call billing with OpenRouter unverified | Verify with OpenRouter's documentation before live mode | Authorize the verification                      |

## 10. Decision needed

Send the section 7 output, approve the non-superuser role and backup plan, and approve the hostname. Only then request explicit approval for the mock-only LensMate deployment. Live mode remains blocked until a separate authorization.
