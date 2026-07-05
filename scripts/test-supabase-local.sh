#!/usr/bin/env bash
# Validates supabase/migrations + RLS behaviour on a throwaway local Postgres
# cluster (no Docker, no Supabase CLI needed). Requires postgres client+server
# binaries on PATH (brew install postgresql).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# prefer full server binaries over libpq's client-only keg
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
WORK="$(mktemp -d)"
PORT=5544

cleanup() {
  pg_ctl -D "$WORK/db" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

initdb -D "$WORK/db" -L "/opt/homebrew/opt/postgresql@18/share/postgresql" --auth=trust --username=postgres >/dev/null
pg_ctl -D "$WORK/db" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/pg.log" start >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -d postgres -c "create database moorhen_test" >/dev/null
"${PSQL[@]}" -d moorhen_test -f "$ROOT/supabase/tests/local-stub.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$migration")"
  "${PSQL[@]}" -d moorhen_test -f "$migration"
done
"${PSQL[@]}" -d moorhen_test -f "$ROOT/supabase/tests/rls.test.sql"
