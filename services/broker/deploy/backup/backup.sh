#!/usr/bin/env bash
# Encrypted dump of the broker ledger. Not scheduled by this repository: the owner installs it after
# approval. Retention defaults to 14 days.
#
# Required environment:
#   BROKER_BACKUP_DATABASE_URL   read-only backup role, host/port/db/user only (NO password; see PGPASSFILE)
#   PGPASSFILE                   protected password file for that role, mode 0600
#   BROKER_BACKUP_KEY_FILE       encryption key file (at least 32 bytes), kept separate from the backup directory
#   BROKER_BACKUP_MAC_KEY_FILE   integrity key file (at least 32 bytes), different from the encryption key
#   BROKER_BACKUP_DIR            destination directory
# Optional:
#   BROKER_BACKUP_RETENTION_DAYS (default 14)
set -euo pipefail
source "$(dirname "$0")/lib.sh"

: "${BROKER_BACKUP_DATABASE_URL:?set BROKER_BACKUP_DATABASE_URL}"
: "${BROKER_BACKUP_KEY_FILE:?set BROKER_BACKUP_KEY_FILE}"
: "${BROKER_BACKUP_MAC_KEY_FILE:?set BROKER_BACKUP_MAC_KEY_FILE}"
: "${BROKER_BACKUP_DIR:?set BROKER_BACKUP_DIR}"
retention="${BROKER_BACKUP_RETENTION_DAYS:-14}"
[[ "$retention" =~ ^[0-9]+$ ]] || die "backup" "BROKER_BACKUP_RETENTION_DAYS must be a whole number"
require_key_file "$BROKER_BACKUP_KEY_FILE" "backup"
require_key_file "$BROKER_BACKUP_MAC_KEY_FILE" "backup"
require_distinct_keys "$BROKER_BACKUP_KEY_FILE" "$BROKER_BACKUP_MAC_KEY_FILE" "backup"
[[ -d "$BROKER_BACKUP_DIR" ]] || die "backup" "backup directory does not exist"
refuse_password_in_url "$BROKER_BACKUP_DATABASE_URL" "backup"

umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$BROKER_BACKUP_DIR/broker-$stamp.dump.enc"
partial="$final.partial"
mac_final="$final.hmac"
trap 'rm -f "$partial" "$mac_final.partial"' EXIT

pg_dump --format=custom --no-owner --no-privileges --dbname="$BROKER_BACKUP_DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$BROKER_BACKUP_KEY_FILE" -out "$partial"

# Verify before keeping: the archive must read back cleanly after decryption.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$BROKER_BACKUP_KEY_FILE" -in "$partial" \
  | pg_restore --list >/dev/null || die "backup" "verification failed; partial file removed"

# Integrity tag over the ciphertext, so a changed byte is caught before any decryption on restore.
hmac_file "$partial" "$BROKER_BACKUP_MAC_KEY_FILE" > "$mac_final.partial"
mv "$partial" "$final"
mv "$mac_final.partial" "$mac_final"

find "$BROKER_BACKUP_DIR" -maxdepth 1 \( -name 'broker-*.dump.enc' -o -name 'broker-*.dump.enc.hmac' -o -name 'broker-*.partial' \) \
  -mtime "+$retention" -delete
echo "backup written: $final"
