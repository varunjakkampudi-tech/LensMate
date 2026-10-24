# Broker deployment runbook (owner-run, not deployed)

Status: PREPARED. The agent has not built the image, started the stack, connected to the VPS, or contacted any
provider. Every step below that changes a server, creates a secret, or starts billable calls needs the owner's
explicit approval for that step. The VPS audit is in `PREDEPLOYMENT-AUDIT.md`, and it is incomplete until the owner
sends the read-only inventory.

## What is in this folder

- `Dockerfile`: multi-stage build, non-root runtime, health check. Built from the repository root.
- `docker-compose.yml`: the broker and PostgreSQL. The database network is internal, with no published port. The
  broker is published on `127.0.0.1:8080` only, so a reverse proxy with TLS must sit in front of it.
- `db/01-create-app-role.sh`: runs once on the first start of the database. It creates the least-privilege
  application role `broker_app`. It is not superuser and owns nothing.
- `backup/backup.sh` and `backup/restore.sh`: encrypted backup with verification and 14-day retention, and a restore
  that refuses to run without a confirmed target database.
- `.env.example`: variable names and placeholders only. Never commit a real `.env`.

## Database roles

- `broker_owner` is the superuser created by the image. It runs migrations only, and it is never used by the broker.
- `broker_app` is the application role. It records reservations and spend, reads devices, registers devices and
  redeems enrolment codes. It cannot create or drop tables, cannot delete rows, cannot issue codes or revoke devices,
  and cannot lower recorded spend. Tests check each of these (`services/broker/src/security.integration.test.ts`).
- `broker_admin` is the admin role. It issues enrolment codes and revokes devices. It runs only from the owner's
  one-off admin CLI (`docker-compose.admin.yml`), never inside the broker container.
- Immutability triggers apply to every role, including the owner: a revocation cannot be undone, a used code cannot be
  reused, and recorded spend cannot decrease.
- The broker refuses to start if any ledger table is missing (`verifySchema`). It never runs migrations itself.

Migration (owner role, once per release):

```bash
docker compose -p lensmate-broker -f docker-compose.yml -f docker-compose.migrate.yml run --rm broker node dist/migrate-cli.js
```

The migration is safe to repeat. It creates the tables if missing and grants `broker_app` its rights.

## Secrets (owner creates these; never commit them)

Files under `services/broker/deploy/secrets/` on the server, mode `0600`:

- `openrouter_api_key`: the OpenRouter key. Only the owner holds it. Not yet placed.
- `broker_app_password`: the password for `broker_app`. Used by the init script.
- `broker_app_database_url`: `postgres://broker_app:<password>@postgres:5432/broker`.
- `postgres_owner_password`: the password for `broker_owner`.
- `postgres_owner_database_url`: `postgres://broker_owner:<password>@postgres:5432/broker`. Used only by the migration
  override (`docker-compose.migrate.yml`), never by the normal broker containers.
- `broker_admin_password`: the password for `broker_admin`. Used by the init script.
- `broker_admin_database_url`: `postgres://broker_admin:<password>@postgres:5432/broker`. Used only by the admin
  override (`docker-compose.admin.yml`).

No secret goes in a compose file, an environment listing, a log, a URL or the app. The broker reads secrets through
the `*_FILE` variables.

## Devices (per-device credentials, no shared secret)

There is no shared broker secret, and none goes in the app. Each phone enrols once:

1. The owner runs `docker compose -p lensmate-broker -f docker-compose.yml -f docker-compose.admin.yml run --rm broker node dist/admin-cli.js enrol-code`. This prints a
   code once. It is single use, valid for 10 minutes, and stored only as a hash.
2. The owner types the code into the app. The app calls `POST /v1/enrol` and receives its own device id and secret.
3. The app keeps the secret in secure device storage. Secure storage is not yet wired into the app (it needs an
   Expo dependency that has not been approved), so the app cannot enrol yet.
4. To revoke a phone, run `docker compose -p lensmate-broker -f docker-compose.yml -f docker-compose.admin.yml run --rm broker node dist/admin-cli.js revoke <deviceId>`. It takes effect on the next request.
5. The same command with `list-devices` shows ids, labels and status. It never prints a secret.

## Backups (not scheduled; the owner installs and approves)

Create a read-only backup role for the owner to use, separate from `broker_app`. Its password goes in a libpq password
file, not in any URL or command line:

```bash
# /secure/pgpass: one line, mode 0600.  host:port:database:user:password
PGPASSFILE=/secure/pgpass BROKER_BACKUP_DATABASE_URL="postgres://broker_backup@postgres:5432/broker" \
  BROKER_BACKUP_KEY_FILE=/secure/backup.key BROKER_BACKUP_MAC_KEY_FILE=/secure/backup-mac.key \
  BROKER_BACKUP_DIR=/mnt/backups BROKER_BACKUP_RETENTION_DAYS=14 services/broker/deploy/backup/backup.sh
```

The script writes an encrypted dump and an HMAC-SHA256 integrity tag (computed with the separate MAC key), verifies
that the dump can be read back, and deletes backups older than 14 days. A connection URL that contains a password is
refused. Restore into a new, empty database only:

```bash
PGPASSFILE=/secure/pgpass BROKER_RESTORE_DATABASE_URL="postgres://broker_owner@postgres:5432/<target>" \
  BROKER_BACKUP_KEY_FILE=/secure/backup.key BROKER_BACKUP_MAC_KEY_FILE=/secure/backup-mac.key \
  BROKER_RESTORE_CONFIRM=<target> services/broker/deploy/backup/restore.sh <file.dump.enc>
```

Restore checks the integrity tag before it decrypts anything, and it refuses a target that already holds `broker_*`
tables. After a restore, run the migration (owner role) to re-apply the grants. Then complete these steps before the
broker is pointed at the restored database:

1. **Spend continuity.** The broker keeps a spend anchor on its own volume (`broker_anchor`), which a restore never
   touches. At start-up the broker refuses to run if recorded spend is below the anchored spend for any month
   (`ROLLED_BACK`). The owner recovers by raising recorded spend to the anchored value, or to the provider-billed
   amount if that is higher, using the owner role. The spend trigger allows an increase and refuses a decrease. Never
   lower the anchor. If the anchor is lost, the broker refuses to start while any recent month has spend (`NO_ANCHOR_WITH_SPEND`).
2. **Revocations.** A restore brings back devices as they were at the backup time. Re-run
   `admin-cli revoke <deviceId>` for every device revoked after that backup, before the broker starts.
3. **Verification.** `admin-cli list-devices` must show the revocations you expect, and the broker's start-up log must
   not report a continuity failure.

Known residual risks: the anchor proves only what the broker itself recorded. Writes that reached the database in the
moment between a settle and its anchor write can be lost on a rollback (one attempt, bounded). The anchor volume is only
as trustworthy as the server that holds it. The encryption key and the MAC key
must be backed up separately; without them the backups cannot be read or checked. Run the scripts only on the Linux
host that holds the key files, never on a shared machine.

Tested locally against a throwaway PostgreSQL 17: a restore reproduced the source spend and device count, a non-empty
target, a mismatched confirmation, a tampered file, a wrong MAC key, a password in either URL, and retention were each
handled as specified. Windows note: the key-file mode check refuses on Windows, so the local round trip ran on a
scratch copy with that one check removed. The owner must run these scripts on the Linux VPS.

## Isolation from other Viswatra products

- Use the compose project name `lensmate-broker`. Do not share containers, networks, volumes or databases with
  OraOne, CareerScope or FixHub24.
- The Hostinger VPS currently runs OraOne. Do not modify its containers, files or firewall rules.
- Confirm the port and resource plan from the read-only inventory (`PREDEPLOYMENT-AUDIT.md`, section 7) first.

## Owner decisions

1. The monthly cap (proposed 50000 paise, INR 500) in `BROKER_MONTHLY_CAP_PAISE`, and the same value in
   `BROKER_OWNER_CAP_CONFIRMATION_PAISE` before live mode.
2. The exchange rate `BROKER_FX_PAISE_PER_USD`. No default.
3. The reverse proxy, TLS and hostname. The hostname is not inferred from `lensmate.tech`.
4. Where backups are stored, and how long they are kept beyond 14 days.
5. The conservative charging rule: failed attempts are charged at worst case, so a long outage consumes the cap.

## Steps (each needs approval)

1. Confirm the VPS inventory and that port 8080 and the resources are free.
2. Build the image: `docker build -f services/broker/deploy/Dockerfile .` from the repository root.
3. Create the secrets above.
4. Start the database and the broker in mock mode (`BROKER_MODE=mock`, the default). No provider call is possible.
5. Run the migration, then check `/healthz` on loopback.
6. Add the proxy route only after the owner approves the hostname and reviews OraOne's routes.
7. Live mode only after a separate authorization for one limited test within the cap.

## Rollback

`docker compose -p lensmate-broker down` stops the stack. The volume is kept. Removing it deletes the ledger, so do
that only with approval and a verified backup.

## Verified and not verified

- Verified by tests: enrolment (admin-only issuance, replay, uniform refusal, rate limit, concurrency), revocation
  (permanent, takes effect at once), authentication (hashes cannot authenticate), the cap, the database role limits,
  the immutability triggers, the schema guard, the backup and restore round trip (on a throwaway PostgreSQL 17),
  integrity-tag refusal, and retention.
- Not verified: the Docker image build, the compose stack start-up, the init script inside the container, the proxy,
  TLS, and the firewall. Docker is not running in the agent environment.

## Ledger genesis and revocation records (owner runbook)

- **First start of a new ledger (once, by the owner).** Set `BROKER_LEDGER_GENESIS=yes` for that one start only, then
  remove it. The broker starts an empty ledger, writes the anchor, and records the genesis in the database. From then on
  a missing anchor refuses to start (`NO_ANCHOR`), even if the variable is still set. The variable is not a permanent
  setting, and it does nothing once the database records a genesis.
- **Restoring a backup taken before the genesis.** Restoring an empty pre-genesis backup can start a new ledger. The
  database cannot tell that apart from a true first start, so the owner must decide that the restored database is the
  right ledger (check the provider's billed amounts for the month first). This is a residual risk; it is not automated.
- **Revoking a device.** Use only the admin CLI with `BROKER_LEDGER_ANCHOR_FILE` set; it refuses otherwise and changes
  nothing. The revocation is recorded on the anchor volume before the command reports success.
- **Revocations made directly in SQL.** The admin role can change `broker_device` directly. The broker records any such
  revocation on the anchor at its next start. Between a direct SQL revocation and the next broker start, a restore of an
  older backup would re-activate the device; restart the broker after any manual revocation.
- **Keys for backups.** The encryption key file and the integrity key file must hold different keys. The guard refuses
  files that share their first line, and files that differ only by whitespace.
