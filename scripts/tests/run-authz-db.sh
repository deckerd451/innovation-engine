#!/usr/bin/env bash
# Authorization tests (notifications, connections, memberships, proximity
# connections) against a throwaway local PostgreSQL cluster. Never touches a
# Supabase project: it creates its own cluster in a fresh temporary
# directory, listens on 127.0.0.1 only, and removes the directory on exit.
#
#   scripts/tests/run-authz-db.sh            # needs initdb/pg_ctl/psql on PATH
#
# Checks:
#   1. Negative control: every test file FAILS on the production baseline.
#   2. Both migrations apply in order, and apply again (idempotent).
#   3. Every test file PASSES after the migrations.
#   4. Undoing any single protection makes a test fail.
#   5. Each rollback restores the catalog it started from, exactly.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASELINES=("$ROOT/scripts/tests/fixtures/notification-connection-prod-baseline.sql" "$ROOT/scripts/tests/fixtures/membership-edge-prod-baseline.sql")
HELPERS="$ROOT/scripts/tests/fixtures/authz-test-helpers.sql"
M1="$ROOT/supabase/sql/migrations/20261013_notification_connection_authz.sql"
M2="$ROOT/supabase/sql/migrations/20261013b_membership_and_proximity_authz.sql"
R1="$ROOT/supabase/sql/rollback/20261013_notification_connection_authz_rollback.sql"
R2="$ROOT/supabase/sql/rollback/20261013b_membership_and_proximity_authz_rollback.sql"
TESTS=(notification-authz-db.sql connection-authz-db.sql membership-authz-db.sql)
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
apply() { "${PSQL[@]}" -d "$1" -f "$2" >/dev/null 2>&1; }
fresh_db() { # name, then migrations to apply
  local db="$1"; shift
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db" >/dev/null 2>&1
  for f in "${BASELINES[@]}" "$HELPERS" "$@"; do apply "$db" "$f"; done
}
first_failure() { grep -m1 -oE '(NOT DENIED|NOT BLOCKED|FAILED|BLOCKED LEGITIMATE ACTION|UNEXPECTED ROW COUNT)[^"]*' <<<"$1" || tail -1 <<<"$1"; }
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
  if out="$("${PSQL[@]}" -d authz_baseline -f "$ROOT/scripts/tests/$test" 2>&1)"; then
    echo "   UNEXPECTED PASS: $test passed without the migrations"; fail=1
  else
    echo "   expected failure: $test: $(first_failure "$out")"
  fi
done

echo "2. Migrations apply in order, twice"
fresh_db authz_migrated "$M1" "$M2" "$M1" "$M2"
echo "   ok"

echo "3. Tests pass after the migrations"
for test in "${TESTS[@]}"; do
  if out="$("${PSQL[@]}" -d authz_migrated -f "$ROOT/scripts/tests/$test" 2>&1)"; then
    echo "   $out"
  else
    echo "   FAILED: $test"; echo "$out" | sed 's/^/     /'; fail=1
  fi
done

echo "4. Each protection is load-bearing: undoing it alone makes a test fail"
sabotage() { # label, test file, SQL that undoes one protection
  fresh_db authz_sabotage "$M1" "$M2"
  "${PSQL[@]}" -d authz_sabotage -c "$3" >/dev/null 2>&1
  if out="$("${PSQL[@]}" -d authz_sabotage -f "$ROOT/scripts/tests/$2" 2>&1)"; then
    echo "   NOT CAUGHT: $1"; fail=1
  else
    echo "   caught: $1 -> $(first_failure "$out")"
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
sabotage "join-request notification triggers dropped" notification-authz-db.sql \
  "DROP TRIGGER notify_project_request ON public.project_requests; DROP TRIGGER notify_organization_join_request ON public.organization_members"
sabotage "organization membership trigger disabled" membership-authz-db.sql \
  "ALTER TABLE public.organization_members DISABLE TRIGGER enforce_organization_member_authorization"
sabotage "organization creator trigger disabled" membership-authz-db.sql \
  "ALTER TABLE public.organizations DISABLE TRIGGER enforce_organization_creator"
sabotage "project membership trigger disabled" membership-authz-db.sql \
  "ALTER TABLE public.project_members DISABLE TRIGGER enforce_project_member_authorization"
sabotage "self-update policy restored and project trigger disabled" membership-authz-db.sql \
  "CREATE POLICY p ON public.project_members FOR UPDATE TO public USING (user_id = get_community_id_from_auth()); ALTER TABLE public.project_members DISABLE TRIGGER enforce_project_member_authorization"
sabotage "ingest_nearify_interaction executable by members" membership-authz-db.sql \
  "GRANT EXECUTE ON FUNCTION public.ingest_nearify_interaction(uuid, uuid, uuid, uuid, uuid, text, numeric, timestamp with time zone, jsonb, text, text) TO anon, authenticated"
sabotage "promote_edge_to_connection consent removed" membership-authz-db.sql \
  "$(sed -n '/^CREATE OR REPLACE FUNCTION public.promote_edge_to_connection/,/^\$function\$;/p' "$R2" | sed "s/SET status = 'promoted', updated_at = now()/SET status = 'accepted'/")"

echo "5. Rollbacks restore the catalog they started from"
fresh_db authz_rollback
s0="$(snapshot authz_rollback)"
apply authz_rollback "$M1"; s1="$(snapshot authz_rollback)"
apply authz_rollback "$M2"; s2="$(snapshot authz_rollback)"
apply authz_rollback "$R2"; s1b="$(snapshot authz_rollback)"
apply authz_rollback "$R1"; s0b="$(snapshot authz_rollback)"
if [ "$s1" = "$s2" ] || [ "$s0" = "$s1" ]; then echo "   a migration changed nothing?"; fail=1; fi
for pair in "s1:s1b:membership rollback" "s0:s0b:notification rollback"; do
  IFS=: read -r a b label <<<"$pair"
  if [ "${!a}" = "${!b}" ]; then
    echo "   ok: $label ($(wc -l <<<"${!a}" | tr -d ' ') catalog entries identical)"
  else
    echo "   FAILED: $label"; diff <(echo "${!a}") <(echo "${!b}") | sed 's/^/     /'; fail=1
  fi
done

if [ "$fail" -ne 0 ]; then echo "authorization database checks FAILED"; exit 1; fi
echo "authorization database checks passed"
