#!/usr/bin/env bash
# Notification and connection authorization tests against a throwaway local
# PostgreSQL cluster. Never touches a Supabase project: it creates its own
# cluster in a fresh temporary directory, listens on 127.0.0.1 only, and
# removes the directory on exit.
#
#   scripts/tests/run-authz-db.sh            # needs initdb/pg_ctl/psql on PATH
#
# Checks:
#   1. Negative control: both test files FAIL on the production baseline.
#   2. The migration applies, and applies again (idempotent).
#   3. Both test files PASS after the migration.
#   4. The rollback restores the baseline catalog exactly.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASELINE="$ROOT/scripts/tests/fixtures/notification-connection-prod-baseline.sql"
HELPERS="$ROOT/scripts/tests/fixtures/authz-test-helpers.sql"
MIGRATION="$ROOT/supabase/sql/migrations/20261013_notification_connection_authz.sql"
ROLLBACK="$ROOT/supabase/sql/rollback/20261013_notification_connection_authz_rollback.sql"
TESTS=("$ROOT/scripts/tests/notification-authz-db.sql" "$ROOT/scripts/tests/connection-authz-db.sql")
PORT="${AUTHZ_PG_PORT:-54331}"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ie-authz-XXXXXX")"
cleanup() {
  pg_ctl -D "$WORK/data" -m fast stop >/dev/null 2>&1 || true
  case "$WORK" in */ie-authz-*) rm -rf "$WORK" ;; esac
}
trap cleanup EXIT

# Superuser named postgres, as in Supabase, so function owners match.
initdb -D "$WORK/data" -U postgres -A trust >/dev/null
pg_ctl -D "$WORK/data" -l "$WORK/log" -w \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null

PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
fresh_db() {
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1" >/dev/null 2>&1
  "${PSQL[@]}" -d "$1" -f "$BASELINE" >/dev/null
  "${PSQL[@]}" -d "$1" -f "$HELPERS" >/dev/null
}
snapshot() {
  "${PSQL[@]}" -d "$1" -At <<'SQL'
SELECT 'policy|' || tablename || '|' || policyname || '|' || cmd || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
  FROM pg_policies WHERE schemaname = 'public'
UNION ALL
SELECT 'table|' || table_name || '|' || grantee || '|' || string_agg(privilege_type, ',' ORDER BY privilege_type)
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role') GROUP BY table_name, grantee
UNION ALL
SELECT 'column|' || table_name || '|' || column_name || '|' || grantee || '|' || privilege_type
  FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated') AND table_name = 'notifications'
UNION ALL
SELECT 'function|' || p.oid::regprocedure::text || '|' || pg_get_userbyid(p.proowner) || '|' || coalesce((SELECT string_agg(g, ' ' ORDER BY g) FROM (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ':' || a.privilege_type AS g FROM aclexplode(p.proacl) a) acl), 'default') || '|' || coalesce(array_to_string(p.proconfig, ','), '') || '|' || md5(pg_get_functiondef(p.oid))
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
UNION ALL
SELECT 'trigger|' || tgrelid::regclass::text || '|' || tgname || '|' || pg_get_triggerdef(oid)
  FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text NOT LIKE 't.%'
ORDER BY 1;
SQL
}

fail=0
echo "1. Negative control: tests must fail on the production baseline"
fresh_db authz_baseline
for test in "${TESTS[@]}"; do
  if out="$("${PSQL[@]}" -d authz_baseline -f "$test" 2>&1)"; then
    echo "   UNEXPECTED PASS: $(basename "$test") passed without the migration"; fail=1
  else
    echo "   expected failure: $(basename "$test"): $(grep -m1 -oE '(NOT DENIED|FAILED|BLOCKED LEGITIMATE ACTION|UNEXPECTED ROW COUNT)[^"]*' <<<"$out" || tail -1 <<<"$out")"
  fi
done

echo "2. Migration applies twice"
fresh_db authz_migrated
"${PSQL[@]}" -d authz_migrated -f "$MIGRATION" >/dev/null 2>&1
"${PSQL[@]}" -d authz_migrated -f "$MIGRATION" >/dev/null 2>&1
echo "   ok"

echo "3. Tests pass after the migration"
for test in "${TESTS[@]}"; do
  if out="$("${PSQL[@]}" -d authz_migrated -f "$test" 2>&1)"; then
    echo "   $out"
  else
    echo "   FAILED: $(basename "$test")"; echo "$out" | sed 's/^/     /'; fail=1
  fi
done

echo "4. Each protection is load-bearing: undoing it alone makes a test fail"
sabotage() { # label, test file, SQL that undoes one protection
  fresh_db authz_sabotage
  "${PSQL[@]}" -d authz_sabotage -f "$MIGRATION" >/dev/null 2>&1
  "${PSQL[@]}" -d authz_sabotage -c "$3" >/dev/null 2>&1
  if out="$("${PSQL[@]}" -d authz_sabotage -f "$ROOT/scripts/tests/$2" 2>&1)"; then
    echo "   NOT CAUGHT: $1"; fail=1
  else
    echo "   caught: $1 -> $(grep -m1 -oE '(NOT DENIED|FAILED|BLOCKED LEGITIMATE ACTION|UNEXPECTED ROW COUNT)[^"]*' <<<"$out" || tail -1 <<<"$out")"
  fi
}
sabotage "connection trigger disabled" connection-authz-db.sql \
  "ALTER TABLE public.connections DISABLE TRIGGER enforce_connection_authorization"
sabotage "member INSERT on notifications restored" notification-authz-db.sql \
  "GRANT INSERT ON public.notifications TO authenticated; CREATE POLICY p ON public.notifications FOR INSERT TO authenticated WITH CHECK (true)"
sabotage "column-level notification UPDATE widened" notification-authz-db.sql \
  "GRANT UPDATE ON public.notifications TO authenticated"
sabotage "create_notification executable by members" notification-authz-db.sql \
  "GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, jsonb) TO authenticated"
sabotage "project invite guard removed" notification-authz-db.sql \
  "$(sed -n '/^CREATE OR REPLACE FUNCTION public.notify_project_invite/,/^\$function\$;/p' "$ROLLBACK")"
sabotage "join-request notification triggers dropped" notification-authz-db.sql \
  "DROP TRIGGER notify_project_request ON public.project_requests; DROP TRIGGER notify_organization_join_request ON public.organization_members"

echo "5. Rollback restores the baseline catalog"
fresh_db authz_rollback
before="$(snapshot authz_rollback)"
"${PSQL[@]}" -d authz_rollback -f "$MIGRATION" >/dev/null 2>&1
during="$(snapshot authz_rollback)"
"${PSQL[@]}" -d authz_rollback -f "$ROLLBACK" >/dev/null 2>&1
after="$(snapshot authz_rollback)"
if [ "$before" = "$during" ]; then echo "   migration changed nothing?"; fail=1; fi
if [ "$before" = "$after" ]; then
  echo "   ok ($(wc -l <<<"$before" | tr -d ' ') catalog entries identical)"
else
  echo "   FAILED: catalog differs after rollback"; diff <(echo "$before") <(echo "$after") | sed 's/^/     /'; fail=1
fi

if [ "$fail" -ne 0 ]; then echo "authorization database checks FAILED"; exit 1; fi
echo "authorization database checks passed"
