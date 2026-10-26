#!/bin/sh
# Runs once, on first start of the Postgres container, as the superuser (BLOCKER-006 item 1).
# It creates two least-privilege roles: broker_app (the broker at runtime) and broker_admin (the owner's admin CLI,
# which issues enrolment codes and revokes devices). Neither is a superuser, neither can create roles or databases,
# and neither owns anything. Table rights are granted later by `node dist/migrate-cli.js`, which runs as the owner role.
#
# Passwords are read inside psql from the Docker secret files, so they never appear on a command line or in the
# process list, and they are never written into this script or an image.
set -eu

[ -s /run/secrets/broker_app_password ] || { echo "broker_app_password secret is missing or empty" >&2; exit 1; }
[ -s /run/secrets/broker_admin_password ] || { echo "broker_admin_password secret is missing or empty" >&2; exit 1; }

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\set app_password `cat /run/secrets/broker_app_password`
\set admin_password `cat /run/secrets/broker_admin_password`
CREATE ROLE broker_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE broker_app PASSWORD :'app_password';
CREATE ROLE broker_admin LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE broker_admin PASSWORD :'admin_password';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
