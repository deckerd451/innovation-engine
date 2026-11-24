#!/usr/bin/env bash
# Guest Zork saves suite on a throwaway local cluster. Never touches Supabase.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${DB_TESTS_PG_PORT:-54337}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ie-dbtests-XXXXXX")"
cleanup() { pg_ctl -D "$WORK/data" -m fast stop >/dev/null 2>&1 || true; case "$WORK" in */ie-dbtests-*) rm -rf "$WORK" ;; esac; }
trap cleanup EXIT
initdb -D "$WORK/data" -U postgres -A trust >/dev/null
pg_ctl -D "$WORK/data" -l "$WORK/log" -w -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null
PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1 -d postgres)
run() { "${PSQL[@]}" -f "$ROOT/$1" >/dev/null; }
echo "Guest Zork saves"
run scripts/tests/fixtures/zork-saves-bootstrap.sql
before=$("${PSQL[@]}" -At -c "SET ROLE anon; SELECT count(*) FROM zork_saves" | tail -1)
[ "$before" = "1" ] || { echo "FAIL: fixture does not reproduce public access"; exit 1; }
if "${PSQL[@]}" -f "$ROOT/supabase/sql/migrations/20261124d_zork_saves_close_public_access.sql" >/dev/null 2>&1; then
  echo "FAIL: phase B ran before phase A"; exit 1; fi
run supabase/sql/migrations/20261124c_zork_saves_private_keys.sql
run supabase/sql/migrations/20261124c_zork_saves_private_keys.sql
run supabase/sql/migrations/20261124d_zork_saves_close_public_access.sql
run scripts/tests/zork-saves-db.sql
run supabase/sql/rollback/20261124d_zork_saves_close_public_access_rollback.sql
run supabase/sql/rollback/20261124c_zork_saves_private_keys_rollback.sql
echo "   ok (phase order enforced; rollbacks run)"
