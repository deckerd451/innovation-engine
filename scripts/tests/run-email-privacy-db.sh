#!/usr/bin/env bash
# Member email privacy migrations against a throwaway local PostgreSQL
# cluster. Never touches a Supabase project: it creates its own cluster in a
# fresh temporary directory, listens on 127.0.0.1 only, and removes it on
# exit. Synthetic data only.
#
#   scripts/tests/run-email-privacy-db.sh     # needs initdb/pg_ctl/psql on PATH
#
# Checks:
#   1. Negative control: the tests FAIL on the production model (members can
#      read every email).
#   2. Part A then part B apply, and apply again (idempotent).
#   3. The tests pass.
#   4. Each safety stop stops: part B without part A; a view, a policy or a
#      SECURITY INVOKER function still reading email; part A when a function
#      isn't the expected definition.
#   5. Rollbacks restore the catalog they started from, exactly; part A's
#      rollback refuses while part B is applied; the one-statement emergency
#      rollback makes email readable again.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${EMAIL_PRIVACY_PG_PORT:-54333}"
BASE=(
  "$ROOT/scripts/tests/fixtures/email-privacy-prod-baseline.sql"
  "$ROOT/supabase/sql/functions/get_start_sequence_data.sql"
  "$ROOT/supabase/sql/migrations/20260822c_project_interest_followups.sql"
  "$ROOT/scripts/tests/fixtures/claim-profile-production-model.sql"
)
A="$ROOT/supabase/sql/migrations/20261029_member_email_privacy_prepare.sql"
B="$ROOT/supabase/sql/migrations/20261029b_member_email_privacy_lock.sql"
RA="$ROOT/supabase/sql/rollback/20261029_member_email_privacy_prepare_rollback.sql"
RB="$ROOT/supabase/sql/rollback/20261029b_member_email_privacy_lock_rollback.sql"
TEST="$ROOT/scripts/tests/email-privacy-db.sql"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ie-emailpriv-XXXXXX")"
cleanup() {
  pg_ctl -D "$WORK/data" -m fast stop >/dev/null 2>&1 || true
  case "$WORK" in */ie-emailpriv-*) rm -rf "$WORK" ;; esac
}
trap cleanup EXIT

# Superuser named postgres, as in Supabase, so function owners match.
initdb -D "$WORK/data" -U postgres -A trust >/dev/null
pg_ctl -D "$WORK/data" -l "$WORK/log" -w \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null

PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
apply() { "${PSQL[@]}" -d "$1" -f "$2" 2>&1; }
fresh_db() { # name, then files to apply after the baseline
  local db="$1"; shift
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db" >/dev/null 2>&1
  local f
  for f in "${BASE[@]}" "$@"; do
    if ! out="$(apply "$db" "$f")"; then echo "   setup failed in $f:"; echo "$out" | tail -3 | sed 's/^/     /'; exit 1; fi
  done
}
first_failure() { grep -m1 -oE '(NOT DENIED|FAILED)[^"]*' <<<"$1" || tail -1 <<<"$1"; }
snapshot() {
  "${PSQL[@]}" -d "$1" -At <<'SQL'
SELECT 'policy|' || schemaname || '.' || tablename || '|' || policyname || '|' || cmd || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
  FROM pg_policies
UNION ALL
SELECT 'relacl|' || c.oid::regclass::text || '|' || coalesce(c.relacl::text, '') || '|' || coalesce(array_to_string(c.reloptions, ','), '')
  FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v', 'm')
UNION ALL
SELECT 'attacl|' || attrelid::regclass::text || '.' || attname || '|' || attacl::text
  FROM pg_attribute WHERE attrelid = 'public.community'::regclass AND attacl IS NOT NULL
UNION ALL
SELECT 'view|' || c.oid::regclass::text || '|' || md5(pg_get_viewdef(c.oid))
  FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v'
UNION ALL
SELECT 'function|' || p.oid::regprocedure::text || '|' || pg_get_userbyid(p.proowner) || '|' || coalesce(p.proacl::text, 'default') || '|' || md5(pg_get_functiondef(p.oid))
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
UNION ALL
SELECT 'schema|' || nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema'
ORDER BY 1;
SQL
}
expect_stop() { # label, db, file, expected message
  if out="$(apply "$2" "$3")"; then
    echo "   NOT STOPPED: $1"; fail=1
  elif grep -q "$4" <<<"$out"; then
    echo "   stops: $1"
  else
    echo "   WRONG STOP: $1: $(tail -1 <<<"$out")"; fail=1
  fi
}

fail=0
echo "1. Negative control: the tests must fail on the production model"
fresh_db ep_baseline
if out="$(apply ep_baseline "$TEST")"; then
  echo "   UNEXPECTED PASS without the migrations"; fail=1
else
  echo "   expected failure: $(first_failure "$out")"
fi

echo "2. Part A, then part B, apply twice"
fresh_db ep_applied
for f in "$A" "$B" "$A" "$B"; do
  if ! out="$(apply ep_applied "$f")"; then echo "   FAILED applying $(basename "$f"):"; echo "$out" | tail -3 | sed 's/^/     /'; exit 1; fi
done
echo "   ok"

echo "3. Member email privacy checks"
if out="$(apply ep_applied "$TEST")"; then
  echo "   $(tail -1 <<<"$out")"
else
  echo "   FAILED: $(first_failure "$out")"; echo "$out" | tail -6 | sed "s/^/     /"; fail=1
fi

echo "4. Safety stops"
fresh_db ep_stop_b_first
expect_stop "part B before part A" ep_stop_b_first "$B" "Part A .* is not applied"

fresh_db ep_stop_view "$A"
"${PSQL[@]}" -d ep_stop_view -c "CREATE VIEW public.member_contacts WITH (security_invoker = true) AS SELECT id, email FROM public.community" >/dev/null
expect_stop "another view reads email" ep_stop_view "$B" "views still read community.email: member_contacts"

fresh_db ep_stop_policy "$A"
"${PSQL[@]}" -d ep_stop_policy -c "CREATE POLICY ideas_by_email ON public.ideas FOR SELECT USING (EXISTS (SELECT 1 FROM public.community c WHERE c.id = creator_id AND c.email = auth.email()))" >/dev/null
expect_stop "a policy reads email" ep_stop_policy "$B" "policies mention community and email"

fresh_db ep_stop_fn "$A"
"${PSQL[@]}" -d ep_stop_fn -c "CREATE FUNCTION public.legacy_email_lookup(p text) RETURNS uuid LANGUAGE sql STABLE AS \$\$ SELECT id FROM community WHERE email = p \$\$" >/dev/null
expect_stop "a SECURITY INVOKER function reads email" ep_stop_fn "$B" "SECURITY INVOKER functions mention community and email: legacy_email_lookup"

fresh_db ep_stop_def
"${PSQL[@]}" -d ep_stop_def -c "CREATE OR REPLACE FUNCTION public.get_project_interest_requests(p_project_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS \$\$ SELECT jsonb_build_object('email', (SELECT email FROM community LIMIT 1)) \$\$" >/dev/null
expect_stop "part A when a function isn't the expected definition" ep_stop_def "$A" "does not contain"
if [ "$("${PSQL[@]}" -d ep_stop_def -Atc "SELECT to_regclass('buildspace_rollback.member_email_privacy') IS NULL")" = t ]; then
  echo "   and part A left nothing behind"
else
  echo "   PART A LEFT CHANGES BEHIND after stopping"; fail=1
fi

echo "5. Rollbacks"
fresh_db ep_rb
before="$(snapshot ep_rb)"
apply ep_rb "$A" >/dev/null; after_a="$(snapshot ep_rb)"
apply ep_rb "$B" >/dev/null
expect_stop "part A's rollback while part B is applied" ep_rb "$RA" "Part B is still applied"
apply ep_rb "$RB" >/dev/null
if [ "$(snapshot ep_rb)" = "$after_a" ]; then echo "   part B's rollback restores the catalog after part A exactly"; else
  echo "   PART B ROLLBACK DIFFERS:"; diff <(echo "$after_a") <(snapshot ep_rb) | head -10 | sed 's/^/     /'; fail=1; fi
apply ep_rb "$RA" >/dev/null
if [ "$(snapshot ep_rb)" = "$before" ]; then echo "   part A's rollback restores the production model exactly"; else
  echo "   PART A ROLLBACK DIFFERS:"; diff <(echo "$before") <(snapshot ep_rb) | head -10 | sed 's/^/     /'; fail=1; fi
apply ep_rb "$RB" >/dev/null && apply ep_rb "$RA" >/dev/null
if [ "$(snapshot ep_rb)" = "$before" ]; then echo "   both rollbacks are safe to re-run"; else echo "   RE-RUN CHANGED THE CATALOG"; fail=1; fi

fresh_db ep_emergency "$A" "$B"
"${PSQL[@]}" -d ep_emergency -c "GRANT SELECT ON public.community TO anon, authenticated" >/dev/null
if [ "$("${PSQL[@]}" -d ep_emergency -Atc "SELECT has_column_privilege('authenticated', 'public.community', 'email', 'SELECT') AND has_column_privilege('anon', 'public.community', 'email', 'SELECT')")" = t ]; then
  echo "   the one-statement emergency rollback makes email readable again"
else
  echo "   EMERGENCY ROLLBACK DID NOT RESTORE ACCESS"; fail=1
fi

if [ "$fail" -ne 0 ]; then echo "member email privacy database checks FAILED"; exit 1; fi
echo "member email privacy database checks passed"
