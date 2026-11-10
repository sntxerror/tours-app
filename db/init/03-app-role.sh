#!/bin/sh
# Least-privilege role for the backend. Runs last (after schema + seed), as the admin user.
# The admin (POSTGRES_USER) is a superuser and is only used for initialisation/maintenance;
# the app gets DML on the application tables and nothing else (no DDL, no superuser).
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_pw="$APP_DB_PASSWORD" -v db="$POSTGRES_DB" <<'EOSQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_pw'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"app_user";

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_user";

GRANT SELECT, INSERT, UPDATE, DELETE ON users, vacation_requests, event_outbox TO :"app_user";
EOSQL
