#!/usr/bin/env bash
# Applies migrations + seed to a throwaway database on a local Postgres with PostGIS
# and runs the SQL assertions in supabase/tests/. Requires psql + a running server.
#   PGHOST=... PGUSER=... scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TEST_DB:-linky_test}
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
run() { psql -v ON_ERROR_STOP=1 -q -X -d "$DB" -f "$1"; }
run supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do echo "migrate: $f"; run "$f"; done
echo "seed: supabase/seed.sql"; run supabase/seed.sql
for f in supabase/tests/[1-9]*.sql; do echo "test: $f"; run "$f"; done
echo "database tests passed"
