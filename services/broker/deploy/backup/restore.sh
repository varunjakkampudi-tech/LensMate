#!/usr/bin/env bash
# Restores an encrypted ledger backup into a NEW, EMPTY database. It verifies the integrity tag before
# decrypting, refuses a target that already holds ledger tables, and requires the owner to type the target name.
# After a restore, run the migration (owner role) to re-apply the application and admin grants.
#
# Usage:  restore.sh <backup-file.dump.enc>
# Required environment:
#   BROKER_RESTORE_DATABASE_URL  target connection string, host/port/db/user only (NO password; use PGPASSFILE)
#   PGPASSFILE                   protected password file for the owner role used to restore
#   BROKER_BACKUP_KEY_FILE       the encryption key used for the backup
#   BROKER_BACKUP_MAC_KEY_FILE   the integrity key used for the backup
#   BROKER_RESTORE_CONFIRM       the target database name, typed by the owner
set -euo pipefail
source "$(dirname "$0")/lib.sh"

file="${1:-}"
[[ -n "$file" && -f "$file" ]] || die "restore" "usage: restore.sh <backup-file.dump.enc>"
: "${BROKER_RESTORE_DATABASE_URL:?set BROKER_RESTORE_DATABASE_URL}"
: "${BROKER_BACKUP_KEY_FILE:?set BROKER_BACKUP_KEY_FILE}"
: "${BROKER_BACKUP_MAC_KEY_FILE:?set BROKER_BACKUP_MAC_KEY_FILE}"
: "${BROKER_RESTORE_CONFIRM:?set BROKER_RESTORE_CONFIRM to the target database name}"
require_key_file "$BROKER_BACKUP_KEY_FILE" "restore"
require_key_file "$BROKER_BACKUP_MAC_KEY_FILE" "restore"
require_distinct_keys "$BROKER_BACKUP_KEY_FILE" "$BROKER_BACKUP_MAC_KEY_FILE" "restore"
refuse_password_in_url "$BROKER_RESTORE_DATABASE_URL" "restore"

target_name="${BROKER_RESTORE_DATABASE_URL%%\?*}"
target_name="${target_name##*/}"
[[ "$BROKER_RESTORE_CONFIRM" == "$target_name" ]] || die "restore" "confirmation does not match the target database name"

# 1. Integrity: the tag must match before the file is decrypted or read.
expected="$(cat "$file.hmac" 2>/dev/null || true)"
actual="$(hmac_file "$file" "$BROKER_BACKUP_MAC_KEY_FILE")"
[[ -n "$expected" && "$expected" == "$actual" ]] || die "restore" "integrity check failed; the backup was changed or the key is wrong"

# 2. Target must be empty of ledger tables, so a restore cannot overwrite a live ledger.
existing="$(psql "$BROKER_RESTORE_DATABASE_URL" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'broker_%'")"
[[ "$existing" == "0" ]] || die "restore" "target database already holds ledger tables; choose a new, empty database"

# 3. Restore without owners or privileges: grants are re-applied by the migration.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$BROKER_BACKUP_KEY_FILE" -in "$file" \
  | pg_restore --no-owner --no-privileges --exit-on-error --dbname="$BROKER_RESTORE_DATABASE_URL"
echo "restored into $target_name; now run the migration (owner role) to re-apply grants"
