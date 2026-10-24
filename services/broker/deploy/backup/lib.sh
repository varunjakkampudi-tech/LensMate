# Shared helpers for backup.sh and restore.sh. Sourced, not run.
#
# Credentials never go on the command line. A connection URL must not contain a password: the password is read by
# libpq from PGPASSFILE (mode 0600). The URL carries only host, port, database and user.
# Integrity uses HMAC-SHA256 with a key separate from the encryption key, computed by node so the key is read from a
# file and never passed as an argument.

die() { echo "$1: $2" >&2; exit 1; }

require_key_file() {
  local file="$1" label="$2"
  [[ -f "$file" ]] || die "$label" "key file not found"
  local size; size="$(wc -c < "$file")"
  (( size >= 32 )) || die "$label" "key file is too short"
  # Group or other access means the key is exposed. Windows reports 644 for most files, so this refuses there too;
  # the owner runs these scripts on the Linux VPS, where the mode is meaningful.
  local mode; mode="$(stat -c %a "$file" 2>/dev/null || echo 600)"
  (( 8#$mode & 077 )) && die "$label" "key file must not be readable by group or others (mode $mode)"
  return 0
}

refuse_password_in_url() {
  local url="$1" label="$2"
  # A colon in the userinfo (user:password@host) or a password query parameter is refused. user@host and host-only
  # URLs are allowed. Only PGPASSFILE may carry the password.
  # Only postgres:// or postgresql:// URLs are accepted. The libpq keyword form (host=... password=...) is refused,
  # because it would put the password on the command line.
  # Any query parameter whose name contains "pass" (password, sslpassword, passfile...) is refused: libpq reads such values
  # from the URL and they would sit in the process argument list.
  local scheme='^postgres(ql)?://' userinfo='://[^@]*:[^@]*@'
  local keyword='(^|[[:space:]])[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd][[:space:]]*=' query='[?&][^=&]*[Pp][Aa][Ss][Ss][^=&]*='
  if [[ ! "$url" =~ $scheme ]]; then
    die "$label" "the connection must be a postgres:// URL with no password; use PGPASSFILE instead"
  fi
  # Percent-encoded parameter names are refused too: libpq decodes them, so "%70assword" is "password" to libpq.
  local encoded='[?&][^=&]*%'
  if [[ "$url" =~ $userinfo ]] || [[ "$url" =~ $query ]] || [[ "$url" =~ $keyword ]] || [[ "$url" =~ $encoded ]]; then
    die "$label" "the connection URL contains a password; use PGPASSFILE instead"
  fi
}

hmac_file() {
  # Args: <file> <mac-key-file>. Prints the hex HMAC of the file.
  node -e 'const c = require("crypto"), f = require("fs");
const key = f.readFileSync(process.argv[2], "utf8").trim();
process.stdout.write(c.createHmac("sha256", key).update(f.readFileSync(process.argv[1])).digest("hex"));' "$1" "$2"
}

# The encryption key and the integrity key must be different. Reusing one key defeats the separation the tag relies on.
require_distinct_keys() {
  # openssl reads the first line of the encryption key file; the HMAC key is the whole file, trimmed the way node's
  # String.prototype.trim does (every Unicode whitespace). Two files that share either form are the same secret for one
  # of the two uses, so both forms are compared. Node does the trim so the rule matches the HMAC exactly.
  local first_a first_b all_a all_b
  first_a="$(head -n 1 "$1" | tr -d '[:space:]')"
  first_b="$(head -n 1 "$2" | tr -d '[:space:]')"
  all_a="$(node -e 'process.stdout.write(require("fs").readFileSync(process.argv[1], "utf8").trim())' "$1")"
  all_b="$(node -e 'process.stdout.write(require("fs").readFileSync(process.argv[1], "utf8").trim())' "$2")"
  if [ "$first_a" = "$first_b" ] || [ "$all_a" = "$all_b" ]; then
    die "$3" "the encryption key and the integrity key must be different files"
  fi
}
