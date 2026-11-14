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
#   - Claiming an older profile by email on the server
#     (claim_community_profile_by_email as deployed), which sign-in relies on.
#   - Member email privacy (scripts/tests/run-email-privacy-db.sh): members
#     and visitors can't read other members' emails; admins can, through
#     admin-only functions; sign-in and claiming keep working.
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

echo "2. Claiming an older profile (claim_community_profile_by_email)"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ie_claim" >/dev/null
# A model of the function as deployed (not the repository's older version).
for step in fixture function test; do
  case "$step" in
    fixture) out="$("${PSQL[@]}" -d ie_claim -f "$ROOT/scripts/tests/fixtures/claim-profile-bootstrap.sql" 2>&1)" ;;
    function) out="$("${PSQL[@]}" -d ie_claim -f "$ROOT/scripts/tests/fixtures/claim-profile-production-model.sql" 2>&1)" ;;
    test) out="$("${PSQL[@]}" -d ie_claim -f "$ROOT/scripts/tests/claim-profile-db.sql" 2>&1)" ;;
  esac || { echo "   FAILED ($step):"; echo "$out" | tail -5 | sed 's/^/     /'; exit 1; }
done
echo "   $out"

echo "3. Member email privacy (scripts/tests/run-email-privacy-db.sh)"
bash "$ROOT/scripts/tests/run-email-privacy-db.sh" | sed 's/^/   /'

if [ -f "$ROOT/scripts/tests/run-authz-db.sh" ]; then
  echo "4. Authorization suite (scripts/tests/run-authz-db.sh)"
  bash "$ROOT/scripts/tests/run-authz-db.sh"
else
  echo "4. Authorization suite: scripts/tests/run-authz-db.sh not in this tree"
fi


echo "Visitor recording and admin reporting permissions"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ie_site_visits" >/dev/null
for f in \
  scripts/tests/fixtures/site-visits-bootstrap.sql \
  supabase/sql/migrations/20261112_site_visits.sql \
  scripts/tests/site-visits-db.sql \
  supabase/sql/rollback/20261112_site_visits_rollback.sql; do
  "${PSQL[@]}" -d ie_site_visits -f "$ROOT/$f" >/dev/null
done
echo "   ok (including rollback)"

echo "Admin unconnected-member review permissions and pagination"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ie_unconnected" >/dev/null
for f in \
  scripts/tests/fixtures/site-visits-bootstrap.sql \
  scripts/tests/fixtures/admin-unconnected-bootstrap.sql \
  supabase/sql/migrations/20261113_admin_unconnected_review.sql \
  scripts/tests/admin-unconnected-db.sql \
  supabase/sql/rollback/20261113_admin_unconnected_review_rollback.sql; do
  "${PSQL[@]}" -d ie_unconnected -f "$ROOT/$f" >/dev/null
done
echo "   ok (including rollback)"
echo "Claim-email authorization, eligibility, throttling and rollback"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ie_claim_email" >/dev/null
for f in \
  scripts/tests/fixtures/site-visits-bootstrap.sql \
  scripts/tests/fixtures/admin-claim-email-bootstrap.sql \
  supabase/sql/migrations/20261113b_admin_claim_email.sql \
  scripts/tests/admin-claim-email-db.sql \
  supabase/sql/rollback/20261113b_admin_claim_email_rollback.sql; do
  "${PSQL[@]}" -d ie_claim_email -f "$ROOT/$f" >/dev/null
done
echo "   ok (including rollback)"
echo "database checks passed"
