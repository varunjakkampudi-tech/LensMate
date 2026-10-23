#!/bin/sh
# Runs once, on first start of the Postgres container, as the superuser (BLOCKER-006 item 1).
# It creates two least-privilege roles: broker_app (the broker at runtime) and broker_admin (the owner's admin CLI,
# which issues enrolment codes and revokes devices). Neither is a superuser, neither can create roles or databases,
# and neither owns anything. Passwords come from Docker secret files and are never written into this script or an image.
# Table rights are granted later by `node dist/migrate-cli.js`, which runs as the owner role.
set -eu

app_password="$(cat /run/secrets/broker_app_password)"
[ -n "$app_password" ] || { echo "broker_app_password secret is empty" >&2; exit 1; }
admin_password="$(cat /run/secrets/broker_admin_password)"
[ -n "$admin_password" ] || { echo "broker_admin_password secret is empty" >&2; exit 1; }

psql -v ON_ERROR_STOP=1 -v app_password="$app_password" -v admin_password="$admin_password" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE broker_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE broker_app PASSWORD :'app_password';
CREATE ROLE broker_admin LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE broker_admin PASSWORD :'admin_password';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
