#!/usr/bin/env bash
# Signed-out community content suite on a throwaway local cluster. Never touches Supabase.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${DB_TESTS_PG_PORT:-54336}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ie-dbtests-XXXXXX")"
cleanup() { pg_ctl -D "$WORK/data" -m fast stop >/dev/null 2>&1 || true; case "$WORK" in */ie-dbtests-*) rm -rf "$WORK" ;; esac; }
trap cleanup EXIT
initdb -D "$WORK/data" -U postgres -A trust >/dev/null
pg_ctl -D "$WORK/data" -l "$WORK/log" -w -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null
PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1 -d postgres)
run() { "${PSQL[@]}" -f "$ROOT/$1" >/dev/null; }
echo "Signed-out access to community content"
run scripts/tests/fixtures/signed-out-community-content-bootstrap.sql
before=$("${PSQL[@]}" -At -c "SET ROLE anon; SELECT count(*) FROM ideas" | tail -1)
[ "$before" -gt 0 ] || { echo "FAIL: fixture does not reproduce public read"; exit 1; }
run supabase/sql/migrations/20261124b_restrict_signed_out_community_content.sql
run supabase/sql/migrations/20261124b_restrict_signed_out_community_content.sql
run scripts/tests/signed-out-community-content-db.sql
run supabase/sql/rollback/20261124b_restrict_signed_out_community_content_rollback.sql
after=$("${PSQL[@]}" -At -c "SET ROLE anon; SELECT count(*) FROM ideas" | tail -1)
[ "$after" = "1" ] || { echo "FAIL: rollback did not restore previous behaviour"; exit 1; }
echo "   ok (rollback restores previous behaviour)"
