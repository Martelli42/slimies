#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Applies the migrations to a throwaway PostgreSQL database and exercises the
# game logic end to end. Requires a local PostgreSQL 15+ server.
#
#   PGHOST=/tmp PGPORT=55432 PGUSER=postgres ./scripts/test-schema.sh
#
# The `auth` schema Supabase provides is stubbed by scripts/supabase-stub.sql
# so the same migrations can run without a Supabase instance.
# ---------------------------------------------------------------------------
set -euo pipefail

DB="${TEST_DB:-ascendant_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PGHOST="${PGHOST:-/tmp}"
export PGPORT="${PGPORT:-55432}"
export PGUSER="${PGUSER:-postgres}"

psql -q -d postgres -c "drop database if exists $DB" >/dev/null
psql -q -d postgres -c "create database $DB" >/dev/null

run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }

run "$ROOT/scripts/supabase-stub.sql"
for file in "$ROOT"/supabase/migrations/*.sql; do
  echo "-- applying $(basename "$file")"
  run "$file"
done
echo "-- applying seed.sql"
run "$ROOT/supabase/seed.sql"

echo "-- running assertions"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/scripts/schema-assertions.sql"
echo "schema OK"
