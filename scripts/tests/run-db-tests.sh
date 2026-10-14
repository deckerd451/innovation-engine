#!/usr/bin/env bash
# Database permission suites against a throwaway local PostgreSQL cluster.
# Never touches a Supabase project: it creates its own cluster in a fresh
# temporary directory, listens on 127.0.0.1 only, and removes the directory
# on exit. CI runs this on every pull request.
#
#   scripts/tests/run-db-tests.sh            # needs initdb/pg_ctl/psql on PATH
#
# Suites:
#   - Assistance permission boundary (docs/VALIDATION.md).
#   - scripts/tests/run-authz-db.sh, when present: notification, connection,
#     membership and proximity authorization, with its own negative controls.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${DB_TESTS_PG_PORT:-54332}"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ie-dbtests-XXXXXX")"
cleanup() {
  pg_ctl -D "$WORK/data" -m fast stop >/dev/null 2>&1 || true
  case "$WORK" in */ie-dbtests-*) rm -rf "$WORK" ;; esac
}
trap cleanup EXIT

# Superuser named postgres, as in Supabase, so function owners match.
initdb -D "$WORK/data" -U postgres -A trust >/dev/null
pg_ctl -D "$WORK/data" -l "$WORK/log" -w \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null

PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)

echo "1. Assistance permission boundary"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ie_assistance" >/dev/null
for f in \
  scripts/tests/fixtures/supabase-minimal-bootstrap.sql \
  supabase/sql/tables/PROJECT_TASKS_SCHEMA.sql \
  supabase/sql/migrations/20261011_capability_memory.sql \
  scripts/tests/assistance-rls-db.sql; do
  if ! out="$("${PSQL[@]}" -d ie_assistance -f "$ROOT/$f" 2>&1)"; then
    echo "   FAILED in $f:"
    echo "$out" | tail -5 | sed 's/^/     /'
    exit 1
  fi
done
echo "   ok"

if [ -f "$ROOT/scripts/tests/run-authz-db.sh" ]; then
  echo "2. Authorization suite (scripts/tests/run-authz-db.sh)"
  bash "$ROOT/scripts/tests/run-authz-db.sh"
else
  echo "2. Authorization suite: scripts/tests/run-authz-db.sh not in this tree"
fi

echo "database checks passed"
