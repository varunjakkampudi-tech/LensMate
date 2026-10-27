# Runbook: deploy the LensMate broker

Scope: the LensMate broker on the shared Hostinger VPS. It covers only the LensMate Compose project `lensmate-broker`.
OraOne containers and the shared proxy are not changed by this runbook.

## Deploy from GitHub Actions

1. Open the repository's **Actions** tab, then **Deploy broker**, then **Run workflow**.
2. Enter the branch: `dev` or `main`. Any other value is refused.
3. The job waits in the `vps-production` environment for approval. Approve it in GitHub.
4. The job pins the server's host key, then streams `services/broker/deploy/deploy-remote.sh` to the server.
5. The script fetches the branch, rebuilds only the broker, and waits for `/healthz`. The job fails if the health check
   does not pass within about 90 seconds.

Deploying `main` needs the owner's approval for that specific release (OWNER-DECISION-002). Never deploy a branch
that has not passed CI.

## Verify after a deploy

```bash
curl -s https://api.lensmate.tech/healthz          # expect {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" https://oraone.in/   # expect 200
```

## Roll back

Run **Deploy broker** again with the branch that holds the last good commit. If that commit is not the tip of a
branch, create a branch at that commit first, then deploy it. Do not edit the server by hand.

## Secrets and configuration

- GitHub secrets: `VPS_HOST`, `VPS_USER`, `VPS_HOST_KEY` (pinned host key), `VPS_SSH_KEY` (deploy key).
  The deploy key is a dedicated key. Rotate it if it is ever exposed.
- On the server, git-ignored and mode 600: `/opt/lensmate/src/.env.production` and
  `/opt/lensmate/src/services/broker/deploy/secrets/*`. The workflow never writes these.
- The OpenRouter key is not on the server while the broker is in mock mode (`BROKER_MODE=mock`).

## Before any live (paid) call

Live calls stay off until the owner: sets a live-test budget above INR 0, approves the cloud-processing disclosure,
approves the model list in `services/broker/src/pricing.ts`, and approves the charging rule for failed calls
(all broker security and spend controls are approved). Then set `BROKER_MODE=live` on the server and record the approved change in the release evidence.

## Known limits

- The shared proxy's link to the LensMate network is a runtime connection. It is lost if the OraOne proxy container
  is recreated. Restore it with `docker network connect lensmate-broker_egress oraone-prod-proxy`, then reload the proxy.
- The proxy's `/etc/caddy/Caddyfile` is a read-only mount, so reloads use a copy in `/tmp` inside the container.

## Rollback constraint (schema)

The settlement trigger (`broker_reservation_settles_buckets`) moves reserved spend into the buckets itself. A broker build
older than the one that installed it must not run against the ledger: it would move reserved spend a second time. To roll
back the code, roll back the schema only by an owner-reviewed migration, never by running the old build alone.
