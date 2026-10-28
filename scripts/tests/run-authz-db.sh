#!/usr/bin/env bash
# Authorization tests (notifications, connections, memberships, proximity
# connections, People you met) against a throwaway local PostgreSQL cluster. Never touches a
# Supabase project: it creates its own cluster in a fresh temporary
# directory, listens on 127.0.0.1 only, and removes the directory on exit.
#
#   scripts/tests/run-authz-db.sh            # needs initdb/pg_ctl/psql on PATH
#
# Checks:
#   1. Negative control: every test file FAILS on the production baseline.
#   2. The migrations apply in order, and apply again (idempotent).
#   3. Every test file PASSES after the migrations.
#   4. Undoing any single protection makes a test fail.
#   5. Simultaneous Connect taps from both members end in one accepted
#      connection (two concurrent sessions), and fail without the pair lock.
#   6. Each rollback restores the catalog it started from, exactly.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASELINES=("$ROOT/scripts/tests/fixtures/notification-connection-prod-baseline.sql" "$ROOT/scripts/tests/fixtures/membership-edge-prod-baseline.sql" "$ROOT/scripts/tests/fixtures/nearify-peers-prod-baseline.sql")
HELPERS="$ROOT/scripts/tests/fixtures/authz-test-helpers.sql"
M1="$ROOT/supabase/sql/migrations/20261013_notification_connection_authz.sql"
M2="$ROOT/supabase/sql/migrations/20261013b_membership_and_proximity_authz.sql"
R1="$ROOT/supabase/sql/rollback/20261013_notification_connection_authz_rollback.sql"
R2="$ROOT/supabase/sql/rollback/20261013b_membership_and_proximity_authz_rollback.sql"
M3="$ROOT/supabase/sql/migrations/20261028_nearify_peers_hidden_members.sql"
R3="$ROOT/supabase/sql/rollback/20261028_nearify_peers_hidden_members_rollback.sql"
TESTS=(notification-authz-db.sql connection-authz-db.sql membership-authz-db.sql nearify-peers-authz-db.sql)
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
fresh_db authz_migrated "$M1" "$M2" "$M3" "$M1" "$M2" "$M3"
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
  fresh_db authz_sabotage "$M1" "$M2" "$M3"
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

sabotage "People you met shows hidden members to everyone" nearify-peers-authz-db.sql \
  "$(cat "$R3")"
sabotage "People you met hides hidden members from accepted connections too" nearify-peers-authz-db.sql \
  "$(sed -n '/^CREATE OR REPLACE FUNCTION public.get_nearify_event_peers/,/^\$\$;/p' "$M3" | sed "s/WHERE k.status = 'accepted'/WHERE false/")"
sabotage "People you met shows hidden members once any request exists" nearify-peers-authz-db.sql \
  "$(sed -n '/^CREATE OR REPLACE FUNCTION public.get_nearify_event_peers/,/^\$\$;/p' "$M3" | sed "s/WHERE k.status = 'accepted'/WHERE k.status IS NOT NULL/")"

sabotage "requester sent an invitation for their own join request" notification-authz-db.sql \
  "$(sed -n '/^CREATE OR REPLACE FUNCTION public.notify_project_invite/,/^\$function\$;/p' "$R1")"
sabotage "creator not told about a pending project_members request" notification-authz-db.sql \
  "$(sed -n '/^CREATE OR REPLACE FUNCTION public.notify_project_invite/,/^\$\$;/p' "$M1" | sed "s/IF NEW.role = 'pending' THEN/IF false THEN/")"

# Two members tap Connect at the same moment, each on their own direction of
# the proximity edge. Session A holds its transaction open while B's tap runs.
# Expect one connection, accepted: B's tap waits for A's and then accepts it.
race() { # database; prints "<total> <accepted>" connections between A and B
  "${PSQL[@]}" -d "$1" >/dev/null <<'SQL'
INSERT INTO public.community (id, user_id, name, email) VALUES
  ('10000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000f1', 'Fay', 'fay@example.test'),
  ('10000000-0000-4000-8000-0000000000f2', 'a0000000-0000-4000-8000-0000000000f2', 'Gus', 'gus@example.test');
INSERT INTO public.interaction_edges (id, from_user_id, to_user_id, status) VALUES
  ('70000000-0000-4000-8000-0000000000f1', '10000000-0000-4000-8000-0000000000f1', '10000000-0000-4000-8000-0000000000f2', 'suggested'),
  ('70000000-0000-4000-8000-0000000000f2', '10000000-0000-4000-8000-0000000000f2', '10000000-0000-4000-8000-0000000000f1', 'suggested');
SQL
  "${PSQL[@]}" -d "$1" >/dev/null 2>&1 <<'SQL' &
BEGIN;
SELECT t.act('a0000000-0000-4000-8000-0000000000f1');
SET LOCAL ROLE authenticated;
SELECT public.promote_edge_to_connection('70000000-0000-4000-8000-0000000000f1');
SELECT pg_sleep(2);
COMMIT;
SQL
  local first=$!
  sleep 0.7
  "${PSQL[@]}" -d "$1" >/dev/null 2>&1 <<'SQL' || true
BEGIN;
SELECT t.act('a0000000-0000-4000-8000-0000000000f2');
SET LOCAL ROLE authenticated;
SELECT public.promote_edge_to_connection('70000000-0000-4000-8000-0000000000f2');
COMMIT;
SQL
  wait "$first" || true
  "${PSQL[@]}" -d "$1" -At -c "SELECT count(*) || ' ' || count(*) FILTER (WHERE status = 'accepted') FROM public.connections WHERE '10000000-0000-4000-8000-0000000000f1' IN (from_user_id, to_user_id) AND '10000000-0000-4000-8000-0000000000f2' IN (from_user_id, to_user_id)"
}

echo "5. Simultaneous Connect taps are serialized"
fresh_db authz_race "$M1" "$M2"
result="$(race authz_race)"
if [ "$result" = "1 1" ]; then
  echo "   ok: one connection, accepted"
else
  echo "   FAILED: simultaneous taps left $result (total accepted) connections"; fail=1
fi
fresh_db authz_race_sabotage "$M1" "$M2"
apply authz_race_sabotage <(sed -n '/^CREATE OR REPLACE FUNCTION public.promote_edge_to_connection/,/^\$\$;/p' "$M2" \
  | sed '/PERFORM pg_advisory_xact_lock/,/, 0));/d')
result="$(race authz_race_sabotage)"
if [ "$result" = "1 1" ]; then
  echo "   NOT CAUGHT: pair lock removed"; fail=1
else
  echo "   caught: pair lock removed -> $result (total accepted) connections"
fi

echo "6. Rollbacks restore the catalog they started from"
fresh_db authz_rollback
s0="$(snapshot authz_rollback)"
apply authz_rollback "$M1"; s1="$(snapshot authz_rollback)"
apply authz_rollback "$M2"; s2="$(snapshot authz_rollback)"
apply authz_rollback "$M3"; s3="$(snapshot authz_rollback)"
apply authz_rollback "$R3"; s2b="$(snapshot authz_rollback)"
apply authz_rollback "$R2"; s1b="$(snapshot authz_rollback)"
apply authz_rollback "$R1"; s0b="$(snapshot authz_rollback)"
if [ "$s1" = "$s2" ] || [ "$s0" = "$s1" ] || [ "$s2" = "$s3" ]; then echo "   a migration changed nothing?"; fail=1; fi
for pair in "s2:s2b:People you met rollback" "s1:s1b:membership rollback" "s0:s0b:notification rollback"; do
  IFS=: read -r a b label <<<"$pair"
  if [ "${!a}" = "${!b}" ]; then
    echo "   ok: $label ($(wc -l <<<"${!a}" | tr -d ' ') catalog entries identical)"
  else
    echo "   FAILED: $label"; diff <(echo "${!a}") <(echo "${!b}") | sed 's/^/     /'; fail=1
  fi
done

if [ "$fail" -ne 0 ]; then echo "authorization database checks FAILED"; exit 1; fi
echo "authorization database checks passed"
