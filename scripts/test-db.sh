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
# score a demo viewer's candidates with the shared TS matcher
psql -At -X -d "$DB" -c "select matchable_json_many(array['00000000-0000-4000-8000-000000000003'::uuid] || array(select feed_prefilter('00000000-0000-4000-8000-000000000003')))" > "${TMPDIR:-/tmp}/linky-feed.json"
npx tsx scripts/check-feed-json.ts "${TMPDIR:-/tmp}/linky-feed.json"
for f in supabase/tests/[1-9]*.sql; do echo "test: $f"; run "$f"; done
echo "database tests passed"
