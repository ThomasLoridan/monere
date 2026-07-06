#!/bin/sh
# Least-privilege bootstrap: one Postgres role per bounded context.
# The auth service owns the `identity` schema and nothing else.
# Read-only reporting role for the admin dashboard's SQL widgets.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE monere_auth LOGIN PASSWORD '${AUTH_DB_PASSWORD:-monere_auth_pw}';
  CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION monere_auth;
  REVOKE ALL ON SCHEMA public FROM PUBLIC;
  GRANT USAGE, CREATE ON SCHEMA identity TO monere_auth;

  CREATE ROLE monere_readonly LOGIN PASSWORD '${READONLY_DB_PASSWORD:-monere_readonly_pw}';
  GRANT USAGE ON SCHEMA identity TO monere_readonly;
  ALTER DEFAULT PRIVILEGES FOR ROLE monere_auth IN SCHEMA identity
    GRANT SELECT ON TABLES TO monere_readonly;
EOSQL
