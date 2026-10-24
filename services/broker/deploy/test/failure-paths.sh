#!/bin/sh
# BLOCKER-006 failure-path tests for the LensMate broker stack.
#
# Mock mode only: the broker runs BROKER_MODE=mock and the script refuses to start if OPENROUTER_API_KEY is set, so no
# provider call is possible. The committed Dockerfile and compose files are exported with `git archive HEAD` into a
# temporary directory, so the build sees LF line endings even on a Windows checkout. The stack runs in its own compose
# project (lensmate-broker-failtest) on no published host port. Placeholder secrets are generated under the temporary
# directory, which is deleted at the end together with the project's containers and volumes.
#
# Usage:    sh services/broker/deploy/test/failure-paths.sh
# Options:  FAILTEST_IMAGE=<tag>  test an existing image instead of building one from the repository root.
# Exit:     0 all scenarios PASS, 1 a scenario FAILed (or containers changed), 2 a precondition stopped the run.
# Scenarios and expectations are listed in README.md in this folder.

set -u

# Git for Windows: stop bash from rewriting /paths inside docker and compose arguments.
MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV

PROJECT=lensmate-broker-failtest
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../../.." && pwd)
CUR=$(date -u +%Y-%m)

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) WINDOWS=1 ;;
  *) WINDOWS=0 ;;
esac

# Paths handed to docker compose, openssl and node must be Windows paths on Git for Windows.
winpath() {
  if [ "$WINDOWS" = 1 ]; then cygpath -m "$1"; else printf '%s\n' "$1"; fi
}

die() {
  printf 'refusing to run: %s\n' "$1" >&2
  exit 2
}

# ---------------------------------------------------------------- preconditions
command -v docker >/dev/null 2>&1 || die "docker is not on PATH"
docker info >/dev/null 2>&1 || die "the docker daemon is not reachable"
command -v timeout >/dev/null 2>&1 || die "timeout is not on PATH"
[ -z "${OPENROUTER_API_KEY:-}" ] || die "OPENROUTER_API_KEY is set; unset it (these tests are mock mode only)"
if [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT")" ] ||
  [ -n "$(docker ps -aq --filter "name=$PROJECT")" ]; then
  die "containers for project $PROJECT already exist; remove them first"
fi
if [ -n "$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")" ]; then
  die "volumes for project $PROJECT already exist; remove them first"
fi

SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/lensmate-failtest.XXXXXX") || die "could not create a temporary directory"
RESULTS="$SCRATCH/results.txt"
BEFORE="$SCRATCH/containers-before.txt"
AFTER="$SCRATCH/containers-after.txt"
: > "$RESULTS"
TORN_DOWN=0

list_other_containers() {
  docker ps -a --format '{{.ID}} {{.Names}} {{.Image}} {{.State}}' | sort
}

# ---------------------------------------------------------------- teardown (also runs on interrupt)
teardown() {
  [ "$TORN_DOWN" = 0 ] || return 0
  TORN_DOWN=1
  ids=$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT")
  if [ -n "$ids" ]; then
    # shellcheck disable=SC2086
    docker rm -f $ids >/dev/null 2>&1
  fi
  if [ -f "${OVERRIDE:-/nonexistent}" ]; then
    docker compose -p "$PROJECT" -f "$BASE" -f "$OVERRIDE_W" down -v --remove-orphans >/dev/null 2>&1
  fi
  left=$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")
  list_other_containers > "$AFTER"
  printf '\nNon-project containers after teardown:\n'
  sed 's/^/  /' "$AFTER"
  if diff "$BEFORE" "$AFTER" >/dev/null 2>&1; then
    printf 'Non-project container list: UNCHANGED (%s entries)\n' "$(wc -l < "$BEFORE" | tr -d ' ')"
  else
    printf 'Non-project container list: CHANGED\n'
    diff "$BEFORE" "$AFTER" | sed 's/^/  /'
    CONTAINERS_CHANGED=1
  fi
  if [ -n "$left" ]; then
    printf 'Project volumes still present after down -v: %s\n' "$left"
    PROJECT_LEFT=1
  fi
  case "$SCRATCH" in
    */lensmate-failtest.*) rm -rf "$SCRATCH" ;;
  esac
}
CONTAINERS_CHANGED=0
PROJECT_LEFT=0
trap 'teardown' EXIT
trap 'exit 130' INT TERM

printf 'Non-project containers before the run (must be untouched):\n'
list_other_containers > "$BEFORE"
sed 's/^/  /' "$BEFORE"

# ---------------------------------------------------------------- export committed sources and secrets
REPO_W=$(winpath "$REPO")
HEAD_SHA=$(git -C "$REPO_W" rev-parse --short HEAD) || die "not a git checkout"
SRC="$SCRATCH/src"
mkdir -p "$SRC"
git -C "$REPO_W" archive --format=tar HEAD | tar -x -C "$SRC" || die "git archive HEAD failed"
DEPLOY="$SRC/services/broker/deploy"
BASE=$(winpath "$DEPLOY/docker-compose.yml")
MIGRATE=$(winpath "$DEPLOY/docker-compose.migrate.yml")
ADMIN=$(winpath "$DEPLOY/docker-compose.admin.yml")

SECRETS="$SCRATCH/secrets"
mkdir -p "$SECRETS"
OWNER_PW=$(openssl rand -hex 24)
APP_PW=$(openssl rand -hex 24)
ADMIN_PW=$(openssl rand -hex 24)
printf '%s' "$OWNER_PW" > "$SECRETS/postgres_owner_password"
printf '%s' "$APP_PW" > "$SECRETS/broker_app_password"
printf '%s' "$ADMIN_PW" > "$SECRETS/broker_admin_password"
printf '%s' "postgres://broker_app:$APP_PW@postgres:5432/broker" > "$SECRETS/broker_app_database_url"
printf '%s' "postgres://broker_admin:$ADMIN_PW@postgres:5432/broker" > "$SECRETS/broker_admin_database_url"
printf '%s' "postgres://broker_owner:$OWNER_PW@postgres:5432/broker" > "$SECRETS/postgres_owner_database_url"
printf '%s' "placeholder-not-a-key-mock-mode-only" > "$SECRETS/openrouter_api_key"
unset OWNER_PW APP_PW ADMIN_PW

IMAGE=${FAILTEST_IMAGE:-lensmate-broker-failtest:local}
OVERRIDE="$SCRATCH/docker-compose.failtest.yml"
{
  printf 'services:\n  broker:\n    image: %s\n    ports: !override []\n' "$IMAGE"
  printf 'secrets:\n'
  for s in broker_app_database_url openrouter_api_key broker_admin_database_url \
    postgres_owner_database_url postgres_owner_password broker_app_password broker_admin_password; do
    printf '  %s:\n    file: "%s"\n' "$s" "$(winpath "$SECRETS/$s")"
  done
} > "$OVERRIDE"
OVERRIDE_W=$(winpath "$OVERRIDE")
BASE_W="$BASE"

export BROKER_MODE=mock
export BROKER_MONTHLY_CAP_PAISE=50000
export BROKER_FX_PAISE_PER_USD=8500

# Compose helpers: base stack; migration and admin overlays only for their one-off commands.
dc() { docker compose -p "$PROJECT" -f "$BASE_W" -f "$OVERRIDE_W" "$@"; }
dcm() { docker compose -p "$PROJECT" -f "$BASE_W" -f "$MIGRATE" -f "$OVERRIDE_W" "$@"; }
dca() { docker compose -p "$PROJECT" -f "$BASE_W" -f "$ADMIN" -f "$OVERRIDE_W" "$@"; }

record() { # id scenario expected observed verdict
  printf '%s|%s|%s|%s|%s\n' "$1" "$2" "$3" "$4" "$5" >> "$RESULTS"
  printf '[%s] %s %s\n    expected: %s\n    observed: %s\n' "$5" "$1" "$2" "$3" "$4"
}
verdict() { if [ "$1" = yes ]; then printf 'PASS'; else printf 'FAIL'; fi; }

wait_healthz() {
  i=0
  while [ "$i" -lt 60 ]; do
    if dc exec -T broker wget -q -O - http://127.0.0.1:8080/healthz 2>/dev/null | grep -q '"status":"ok"'; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

start_broker() { # starts the broker service and waits for /healthz
  dc up -d broker >"$SCRATCH/up.log" 2>&1
  wait_healthz
}

stop_broker() { # stops it cleanly and prints the container exit code
  dc stop -t 30 broker >/dev/null 2>&1
  cid=$(dc ps -aq broker)
  docker inspect -f '{{.State.ExitCode}}' "$cid" 2>/dev/null
}

# A one-off broker run that must refuse to start: expects a non-zero exit and the AnchorError code in its output.
refusal() { # id code scenario
  out="$SCRATCH/$1.out"
  timeout 240 docker compose -p "$PROJECT" -f "$BASE_W" -f "$OVERRIDE_W" run --rm -T broker >"$out" 2>&1
  rc=$?
  line=$(grep -m1 'broker failed to start' "$out")
  if [ "$rc" -eq 124 ]; then
    observed="did not exit within 240 s (still running)"
    ok=no
  elif [ "$rc" -ne 0 ] && grep -q "broker failed to start: AnchorError: $2\$" "$out"; then
    observed="exit $rc; $line"
    ok=yes
  else
    observed="exit $rc; ${line:-no refusal line in output}"
    ok=no
  fi
  record "$1" "$3" "exit non-zero, message AnchorError: $2" "$observed" "$(verdict "$ok")"
}

anchor_sh() { dc run --rm -T --entrypoint sh broker -c "$1" >"$SCRATCH/anchor-sh.log" 2>&1; }
anchor_cat() { dc run --rm -T --entrypoint cat broker /var/lib/broker-anchor/ledger-anchor.json 2>/dev/null; }
sql() { # sql <database> <statement>, run as the owner role over the socket inside the postgres container
  dc exec -T postgres psql "postgres://broker_owner@/$1?host=/run/postgresql" -X -q -v ON_ERROR_STOP=1 -tA -c "$2"
}

# Test shims: the PostgreSQL 17 client tools run inside the project's postgres container, which has no published port.
mkdir -p "$SCRATCH/bin"
for tool in pg_dump pg_restore psql; do
  {
    printf '#!/bin/sh\n'
    printf '# Test shim: runs %s inside the project postgres container.\n' "$tool"
    printf 'exec docker compose -p %s -f "%s" -f "%s" exec -T postgres %s "$@"\n' "$PROJECT" "$BASE_W" "$OVERRIDE_W" "$tool"
  } > "$SCRATCH/bin/$tool"
  chmod +x "$SCRATCH/bin/$tool"
done

# ---------------------------------------------------------------- set-up: build, database, migration
printf '\nSource commit: %s (git archive HEAD)\n' "$HEAD_SHA"
if [ -z "${FAILTEST_IMAGE:-}" ]; then
  printf 'Building %s from the repository root (log: %s)\n' "$IMAGE" "$SCRATCH/build.log"
  if ! dc build broker >"$SCRATCH/build.log" 2>&1; then
    tail -n 40 "$SCRATCH/build.log" >&2
    die "image build failed"
  fi
fi
if ! dc up -d --wait postgres >"$SCRATCH/pg-up.log" 2>&1; then
  tail -n 40 "$SCRATCH/pg-up.log" >&2
  die "postgres did not become healthy"
fi
dcm run --rm -T broker node dist/migrate-cli.js >"$SCRATCH/migrate.log" 2>&1
if ! grep -q 'migration complete' "$SCRATCH/migrate.log"; then
  cat "$SCRATCH/migrate.log" >&2
  die "migration as the owner role failed"
fi
printf 'Set-up: postgres healthy, owner migration complete.\n'

# ---------------------------------------------------------------- a: missing anchor with spend
reset_ledger() { sql broker "TRUNCATE broker_budget_month CASCADE" >/dev/null 2>&1; }
anchor_sh 'rm -rf /var/lib/broker-anchor/ledger-anchor.json*'
reset_ledger
sql broker "INSERT INTO broker_budget_month (month, spent_paise) VALUES ('$CUR', 300)" >/dev/null 2>&1
refusal a NO_ANCHOR_WITH_SPEND "Missing anchor with existing spend"
reset_ledger

# ---------------------------------------------------------------- b: corrupt anchor
anchor_sh 'printf "{not json" > /var/lib/broker-anchor/ledger-anchor.json'
refusal b ANCHOR_INVALID "Corrupt anchor file"
anchor_sh 'rm -rf /var/lib/broker-anchor/ledger-anchor.json*'

# ---------------------------------------------------------------- c: unreadable anchor (directory at the path)
anchor_sh 'rm -f /var/lib/broker-anchor/ledger-anchor.json && mkdir /var/lib/broker-anchor/ledger-anchor.json'
refusal c ANCHOR_UNREADABLE "Unreadable anchor (directory at the anchor path)"
anchor_sh 'rm -rf /var/lib/broker-anchor/ledger-anchor.json*'

# ---------------------------------------------------------------- d: rollback prevention, then documented recovery
# A valid anchor is written by a clean start. Spend 500 is then recorded and the broker restarted, so the anchor holds 500.
# The first start of an empty ledger needs the owner's genesis flag; it is unset again right after.
export BROKER_LEDGER_GENESIS=yes
if start_broker; then d_start=yes; else d_start=no; fi
d_stop=$(stop_broker)
set_spend() { sql broker "INSERT INTO broker_budget_month (month, spent_paise) VALUES ('$CUR', $1) ON CONFLICT (month) DO UPDATE SET spent_paise = EXCLUDED.spent_paise" >/dev/null 2>&1; }
set_spend 500
if start_broker; then d_restart=yes; else d_restart=no; fi
unset BROKER_LEDGER_GENESIS
anchored_now=$(anchor_cat)
d_stop2=$(stop_broker)
case "$anchored_now" in *"\"$CUR\":500"*) d_anchor=yes ;; *) d_anchor=no ;; esac
record d-setup "Valid anchor recording spend 500" \
  "clean start, then broker restarted with spend 500; anchor holds $CUR=500" \
  "first start=$d_start; anchor after restart: $(printf '%s' "$anchored_now" | head -c 120); stop exit=$d_stop2" \
  "$(if [ "$d_start" = yes ] && [ "$d_restart" = yes ] && [ "$d_anchor" = yes ] && [ "$d_stop" = 0 ] && [ "$d_stop2" = 0 ]; then printf PASS; else printf FAIL; fi)"

# Lower recorded spend (TRUNCATE is not blocked by the row trigger; it simulates a restore) to 100 and expect ROLLED_BACK.
sql broker "TRUNCATE broker_budget_month CASCADE" >/dev/null 2>&1
sql broker "INSERT INTO broker_budget_month (month, spent_paise) VALUES ('$CUR', 100)" >/dev/null 2>&1
refusal d ROLLED_BACK "Rollback prevention: database spend 100 below anchored 500"

# Documented recovery: the owner raises recorded spend back to the anchored value, then the broker starts.
sql broker "UPDATE broker_budget_month SET spent_paise = 500 WHERE month = '$CUR'" >/dev/null 2>&1
if start_broker; then ok=yes; else ok=no; fi
healthz=$(dc exec -T broker wget -q -O - http://127.0.0.1:8080/healthz 2>/dev/null)
record d-recovery "Owner raises spend to 500 (anchored value), broker starts" \
  "container starts, /healthz 200" "healthz body: ${healthz:-none}" "$(verdict "$ok")"
if [ "$ok" != yes ]; then dc logs --tail 30 broker >"$SCRATCH/d-recovery.log" 2>&1; fi

# ---------------------------------------------------------------- e: backup and restore safeguards
# Device for the round trip: admin role issues a code (never printed), the broker redeems it.
dca run --rm -T broker node dist/admin-cli.js enrol-code >"$SCRATCH/enrol-code.txt" 2>&1
CODE=$(sed -n 's/^enrolment code .*: //p' "$SCRATCH/enrol-code.txt")
dc exec -T broker node -e '
const body = JSON.stringify({ code: process.argv[1], label: "failtest-device" });
fetch("http://127.0.0.1:8080/v1/enrol", { method: "POST", headers: { "content-type": "application/json" }, body })
  .then(async (r) => process.stdout.write(String(r.status) + " " + (await r.text()) + "\n"))
  .catch((e) => process.stdout.write("request-error " + e.name + "\n"));
' "$CODE" >"$SCRATCH/enrol-response.txt" 2>&1
ENROL_STATUS=$(cut -d' ' -f1 "$SCRATCH/enrol-response.txt")
DEVICE_ID=$(sed -n 's/.*"deviceId":"\([^"]*\)".*/\1/p' "$SCRATCH/enrol-response.txt")
DEVICE_SECRET=$(sed -n 's/.*"deviceSecret":"\([^"]*\)".*/\1/p' "$SCRATCH/enrol-response.txt")
unset CODE
printf 'Enrolment: HTTP %s (credentials kept in the temporary directory only)\n' "$ENROL_STATUS"

# ---------------------------------------------------------------- h/i: revocation needs the anchor volume (separate mount)
# h: the anchor directory sits in the container's writable layer (tmpfs, same device as its parent). Revoke must refuse,
#    and the device must stay active.
dca run --rm -T --entrypoint sh broker -c "mkdir -p /tmp/nomount && BROKER_LEDGER_ANCHOR_FILE=/tmp/nomount/anchor.json node dist/admin-cli.js revoke $DEVICE_ID" >"$SCRATCH/h.txt" 2>&1
H_RC=$?
H_STATE=$(sql broker "SELECT revoked_at IS NULL FROM broker_device WHERE device_id = '$DEVICE_ID'")
record h "Revoke refuses when the anchor is not a separate volume, and the device stays active" \
  "exit non-zero; device still active" "exit=$H_RC; device active=$H_STATE" \
  "$(if [ "$H_RC" != 0 ] && [ "$H_STATE" = t ]; then printf PASS; else printf FAIL; fi)"
# i: the real volume is mounted in the admin container. Revoke succeeds and the anchor records the revocation.
dca run --rm -T broker node dist/admin-cli.js revoke "$DEVICE_ID" >"$SCRATCH/i.txt" 2>&1
I_RC=$?
I_ANCHOR=$(anchor_cat)
case "$I_ANCHOR" in *"$DEVICE_ID"*) I_REC=yes ;; *) I_REC=no ;; esac
record i "Revoke with the volume mounted succeeds and the anchor records the revocation" \
  "exit 0; anchor lists the device" "exit=$I_RC; anchor lists device=$I_REC" \
  "$(if [ "$I_RC" = 0 ] && [ "$I_REC" = yes ]; then printf PASS; else printf FAIL; fi)"

sql broker "CREATE ROLE broker_backup LOGIN" >/dev/null 2>&1
sql broker "GRANT CONNECT ON DATABASE broker TO broker_backup; GRANT USAGE ON SCHEMA public TO broker_backup; GRANT SELECT ON ALL TABLES IN SCHEMA public TO broker_backup" >/dev/null 2>&1
SRC_SPEND=$(sql broker "SELECT spent_paise FROM broker_budget_month WHERE month = '$CUR'")
SRC_DEVICES=$(sql broker "SELECT count(*) FROM broker_device")

KEY="$SCRATCH/backup.key"
MACKEY="$SCRATCH/backup-mac.key"
openssl rand -hex 32 > "$KEY"
openssl rand -hex 32 > "$MACKEY"
KEY_W=$(winpath "$KEY")
MACKEY_W=$(winpath "$MACKEY")
BKDIR="$SCRATCH/backups"
mkdir -p "$BKDIR"
BKDIR_W=$(winpath "$BKDIR")

# On Windows the key-file mode check always refuses (NTFS reports 644). The script itself keeps the check; on Windows the
# test runs a copy of the backup scripts with only that one line removed, as the runbook documents.
SCRIPTS="$DEPLOY/backup"
if [ "$WINDOWS" = 1 ]; then
  SCRIPTS="$SCRATCH/scripts"
  mkdir -p "$SCRIPTS"
  cp "$DEPLOY/backup/backup.sh" "$DEPLOY/backup/restore.sh" "$DEPLOY/backup/lib.sh" "$SCRIPTS/"
  sed -i '/8#\$mode & 077/d' "$SCRIPTS/lib.sh"
  printf 'Windows: running a scratch copy of backup/ with the key-file mode check removed (runbook, Windows note). Original scripts are unchanged.\n'
fi

( export BROKER_BACKUP_DATABASE_URL="postgres://broker_backup@/broker?host=/run/postgresql" \
    BROKER_BACKUP_KEY_FILE="$KEY_W" BROKER_BACKUP_MAC_KEY_FILE="$MACKEY_W" BROKER_BACKUP_DIR="$BKDIR_W" \
    PATH="$SCRATCH/bin:$PATH"; bash "$SCRIPTS/backup.sh" ) >"$SCRATCH/backup.log" 2>&1
backup_rc=$?
set -- "$BKDIR"/broker-*.dump.enc
BACKUP="$1"
BACKUP_W=$(winpath "$BACKUP")
magic=$(head -c 8 "$BACKUP" 2>/dev/null)
tag=$(cat "$BACKUP.hmac" 2>/dev/null)
case "$magic" in Salted__*) enc=yes ;; *) enc=no ;; esac
if [ "$backup_rc" -eq 0 ] && [ "$enc" = yes ] && printf '%s' "$tag" | grep -Eq '^[0-9a-f]{64}$'; then ok=yes; else ok=no; fi
record e1 "Backup writes an encrypted dump and an HMAC-SHA256 tag" \
  "exit 0; ciphertext starts with the OpenSSL salt header; 64-hex tag file" \
  "exit $backup_rc; header=$magic; tag length=${#tag} (value not printed); file=$(basename "$BACKUP")" "$(verdict "$ok")"

restore_try() { # label file target-url confirm
  ( export BROKER_RESTORE_DATABASE_URL="$3" BROKER_RESTORE_CONFIRM="$4" \
      BROKER_BACKUP_KEY_FILE="$KEY_W" BROKER_BACKUP_MAC_KEY_FILE="$MACKEY_W" PATH="$SCRATCH/bin:$PATH"
    bash "$SCRIPTS/restore.sh" "$2" ) >"$SCRATCH/restore-$1.log" 2>&1
  restore_rc=$?
  restore_line=$(grep -m1 -E 'restore:' "$SCRATCH/restore-$1.log")
  [ -n "$restore_line" ] || restore_line=$(tail -n 1 "$SCRATCH/restore-$1.log")
}

restore_try wrong-confirm "$BACKUP_W" "postgres://broker_owner@/broker?host=/run/postgresql" "not-the-target"
if [ "$restore_rc" -ne 0 ] && grep -q "confirmation does not match" "$SCRATCH/restore-wrong-confirm.log"; then ok=yes; else ok=no; fi
record e2 "Restore refuses a wrong confirmation" "exit non-zero, 'confirmation does not match'" \
  "exit $restore_rc; $restore_line" "$(verdict "$ok")"

restore_try non-empty "$BACKUP_W" "postgres://broker_owner@/broker?host=/run/postgresql" "broker"
if [ "$restore_rc" -ne 0 ] && grep -q "already holds ledger tables" "$SCRATCH/restore-non-empty.log"; then ok=yes; else ok=no; fi
record e3 "Restore refuses a non-empty target (live ledger 'broker')" \
  "exit non-zero, 'already holds ledger tables'" "exit $restore_rc; $restore_line" "$(verdict "$ok")"

# Tampered copy: one ciphertext byte changed. The check must fail before anything is decrypted or any database is touched.
TAMPER_DIR="$SCRATCH/tamper"
mkdir -p "$TAMPER_DIR"
TAMPER="$TAMPER_DIR/broker-tampered.dump.enc"
cp "$BACKUP" "$TAMPER"
cp "$BACKUP.hmac" "$TAMPER.hmac"
printf 'X' | dd of="$TAMPER" bs=1 seek=200 conv=notrunc >/dev/null 2>&1
restore_try tampered "$(winpath "$TAMPER")" "postgres://broker_owner@/broker_restore_check?host=/run/postgresql" "broker_restore_check"
if [ "$restore_rc" -ne 0 ] && grep -q "integrity check failed" "$SCRATCH/restore-tampered.log"; then ok=yes; else ok=no; fi
record e4 "Restore refuses a tampered file before decryption" \
  "exit non-zero, 'integrity check failed' (target database does not exist yet, so no database step ran)" \
  "exit $restore_rc; $restore_line" "$(verdict "$ok")"

sql broker "CREATE DATABASE broker_restore_check" >/dev/null 2>&1
restore_try empty "$BACKUP_W" "postgres://broker_owner@/broker_restore_check?host=/run/postgresql" "broker_restore_check"
restored_spend=$(sql broker_restore_check "SELECT spent_paise FROM broker_budget_month WHERE month = '$CUR'" 2>/dev/null)
restored_devices=$(sql broker_restore_check "SELECT count(*) FROM broker_device" 2>/dev/null)
if [ "$restore_rc" -eq 0 ] && [ "$restored_spend" = "$SRC_SPEND" ] && [ "$restored_devices" = "$SRC_DEVICES" ] && [ -n "$SRC_SPEND" ]; then ok=yes; else ok=no; fi
record e5 "Restore into an empty database succeeds and reproduces spend" \
  "exit 0; restored spend = source spend ($SRC_SPEND paise); device count = source ($SRC_DEVICES)" \
  "exit $restore_rc; restored spend=$restored_spend; restored devices=$restored_devices; $restore_line" "$(verdict "$ok")"

# ---------------------------------------------------------------- g: restart after clean shutdown with a valid anchor
if start_broker; then g_start=yes; else g_start=no; fi
g_stop=$(stop_broker)
if start_broker; then g_restart=yes; else g_restart=no; fi
g_body=$(dc exec -T broker wget -q -O - http://127.0.0.1:8080/healthz 2>/dev/null)
if [ "$g_start" = yes ] && [ "$g_stop" = 0 ] && [ "$g_restart" = yes ]; then ok=yes; else ok=no; fi
record g "Restart after clean shutdown with a valid anchor" \
  "clean stop exit 0; restart; /healthz 200" \
  "start=$g_start; stop exit=$g_stop; restart=$g_restart; healthz: ${g_body:-none}" "$(verdict "$ok")"

# ---------------------------------------------------------------- f: fail-closed when the anchor cannot be written
chat() { # one authenticated mock-mode chat request; prints "<HTTP status> <error code>"
  dc exec -T broker node -e '
const [auth, body] = process.argv.slice(1);
fetch("http://127.0.0.1:8080/v1/ai/text", { method: "POST", headers: { "content-type": "application/json", authorization: auth }, body })
  .then(async (r) => { const t = await r.text(); let c = ""; try { c = JSON.parse(t).code || ""; } catch (e) { c = "non-json"; } process.stdout.write(r.status + " " + c + "\n"); })
  .catch((e) => process.stdout.write("request-error " + e.name + "\n"));
' "Bearer $DEVICE_ID.$DEVICE_SECRET" '{"model":"google/gemini-2.5-flash-lite","messages":[{"role":"user","content":"failure-path probe"}],"maxOutputTokens":16}' 2>/dev/null
}
control=$(chat)
case "$control" in "200 "*) control_ok=yes ;; *) control_ok=no ;; esac
if [ "$control_ok" = yes ]; then
  dc exec -T broker sh -c 'rm -f /var/lib/broker-anchor/ledger-anchor.json && mkdir /var/lib/broker-anchor/ledger-anchor.json' >/dev/null 2>&1
  first=$(chat)
  second=$(chat)
  case "$first" in "503 LEDGER_UNAVAILABLE") f1=yes ;; *) f1=no ;; esac
  case "$second" in "503 LEDGER_UNAVAILABLE") f2=yes ;; *) f2=no ;; esac
  record f1 "Anchor replaced by a directory: the settlement that cannot record the anchor fails closed" \
    "reservation settles, anchor write fails, HTTP 503 LEDGER_UNAVAILABLE" "HTTP $first" "$(verdict "$f1")"
  record f2 "Next reservation after the anchor failure is refused" \
    "HTTP 503 LEDGER_UNAVAILABLE (ledger halted)" "HTTP $second" "$(verdict "$f2")"
else
  record f1 "Anchor replaced by a directory: fail-closed settlement" \
    "control chat returns 200 before the fault" "control request: $control (fault not injected; NOT RUN)" "NOT RUN"
  record f2 "Next reservation after the anchor failure is refused" \
    "HTTP 503 LEDGER_UNAVAILABLE" "not exercised: control request did not succeed" "NOT RUN"
fi

# ---------------------------------------------------------------- report and teardown
printf '\n%-14s %-62s %-8s %s\n' "ID" "SCENARIO" "RESULT" "EVIDENCE"
while IFS='|' read -r rid rname rexp robs rverd; do
  printf '%-14s %-62.62s %-8s %s\n' "$rid" "$rname" "$rverd" "$robs"
done < "$RESULTS"
fails=$(grep -c '|FAIL$' "$RESULTS")
notrun=$(grep -c '|NOT RUN$' "$RESULTS")
passes=$(grep -c '|PASS$' "$RESULTS")
printf '\nPASS=%s FAIL=%s NOT RUN=%s\n' "$passes" "$fails" "$notrun"

teardown
trap - EXIT
if [ "$fails" -gt 0 ] || [ "$CONTAINERS_CHANGED" = 1 ] || [ "$PROJECT_LEFT" = 1 ]; then
  exit 1
fi
exit 0
