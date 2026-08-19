-- Bounded connection-identity repair, following the correctness review
-- that fixed get_admin_network_analytics() in 20260819b. That fix deduped
-- relationships at read time inside one RPC; this migration fixes the
-- underlying defect at the source so every other surface (member-facing
-- and admin) reads correct data without needing its own dedup logic.
--
-- ============================================================================
-- AUDIT FINDINGS (verified against this codebase, not assumed)
-- ============================================================================
--
-- CORRECTION (post-live-run): the first version of this migration listed
-- `updated_at` as a confirmed live column of public.connections and set it
-- in step 2a's UPDATE. A live Supabase run failed with
-- `column "updated_at" of relation "connections" does not exist`. The
-- claim was wrong -- it was based on sql/nearify_ingestion_pipeline.sql's
-- promote_edge_to_connection() RPC, which also references
-- connections.updated_at (both in an UPDATE and an INSERT column list).
-- That RPC is itself in the same "manually applied, not guaranteed to
-- match the live database" category as every file under supabase/sql (see
-- supabase/sql/README.md) -- it should never have been treated as
-- confirmed live-schema evidence on its own. assets/js/dashboardPane.js
-- (lines ~3912-3927) independently makes the identical assumption
-- (`.order("updated_at", ...)`, `conn.updated_at`) when building "Connection
-- Accepted" notifications from a live `connections` query -- corroborating,
-- from a second independent source, that `updated_at` does not exist on
-- the live table, and that this pre-existing notification code has the
-- same latent bug. That is a separate, pre-existing defect outside this
-- migration's bounded scope and is left untouched here.
-- The columns this migration actually depends on (id, from_user_id,
-- to_user_id, status, created_at) are corroborated more strongly: the
-- live run's own error confirms Step 1 (which queries exactly these
-- columns) executed successfully -- the failure was reported specifically
-- at step 2a's `updated_at` reference, not at any of these. They are also
-- the exact column list assets/js/connections.js's safeUpdateConnectionRow()
-- / readConnectionRow() actually select in production
-- (`"id, from_user_id, to_user_id, status, type, created_at"` -- notably
-- omitting updated_at). `type` is not read or written by this migration at
-- all, so it carries no risk here regardless.
--
-- Schema (corrected): public.connections(id, from_user_id, to_user_id,
-- status, type, created_at) -- no updated_at column on the live table.
-- Endpoints reference public.community(id). Note: supabase/sql/reference/
-- COMPLETE_SCHEMA_FIX.sql describes an OLDER schema with different column
-- names (user_id/connected_user_id) and a UNIQUE(user_id, connected_user_id)
-- constraint -- that file is stale relative to the live schema and its
-- constraint does not apply to the deployed from_user_id/to_user_id columns.
-- No unique constraint on any (from_user_id, to_user_id) pairing exists
-- anywhere in tracked SQL for the live column names.
--
-- 1. Duplicates can exist for BOTH pending and accepted relationships (not
--    accepted-only). connections.js's own ACTIVE_STATUSES = ['pending',
--    'accepted'] already treats both as "live"; sendConnectionRequest()'s
--    pre-check blocks a new insert only when an existing row is pending or
--    accepted, and explicitly ALLOWS inserting a fresh row after a prior
--    one was rejected/canceled ("If inactive (rejected/canceled), allow a
--    new request"). So rejected/canceled history is a legitimate,
--    intentionally-repeatable state -- it must never be deduped away.
--
-- 2. Reciprocal rows CAN carry different statuses. The race is: two people
--    request each other at close to the same time (both check-then-insert
--    checks pass before either insert lands, since neither found the
--    other's not-yet-committed row), producing two rows for one pair, one
--    per direction. From there either row can independently be accepted,
--    declined, or left pending -- e.g. one row 'accepted' and a leftover
--    duplicate row 'pending', or two rows both 'accepted'.
--
-- 3. Columns to preserve when collapsing a duplicate pair: the survivor is
--    the EARLIEST-created active row for that pair (preserves original
--    request timing/direction, id, and created_at), upgraded to the
--    STRONGEST status found among its duplicates (accepted > pending).
--    `type` is the survivor's own (not merged). There is no updated_at
--    column to bump (see CORRECTION above). Rejected/canceled rows for the
--    same pair are never touched.
--
-- 4. The surviving row can be chosen fully deterministically: rank by
--    created_at ASC (earliest wins, preserving true relationship origin),
--    then id ASC as a final tiebreak -- a total order with no ambiguous
--    case within the (pending, accepted) rows. Status strength is applied
--    separately, as an upgrade onto whichever row that ranking picks (see
--    step 2a below), so the two preservation goals -- earliest metadata
--    and strongest current state -- are independent and both honored
--    even when they point at different rows. A verification check runs
--    after cleanup, before the constraint is added, and RAISEs (aborting
--    the migration, changing nothing further) if any pair still has more
--    than one active row -- this can only happen from a bug in the cleanup
--    logic itself, not from ambiguous product data, since the ranking
--    above is total.
--
-- Confirms this is a bounded, bounded-risk fix: promote_edge_to_connection
-- (sql/nearify_ingestion_pipeline.sql -- an unverified, possibly-never-
-- applied file, see CORRECTION above) already inserts with
-- `ON CONFLICT DO NOTHING` against from_user_id/to_user_id -- i.e. it was
-- already written assuming a uniqueness constraint would exist, consistent
-- with (though not proof of) the uniqueness gap this migration closes.
-- Both live JS "Connect" handlers (assets/js/connections.js sendConnectionRequest,
-- assets/js/node-panel.js window.sendConnectionFromPanel) already handle a
-- Postgres 23505 (unique_violation) response with a friendly, non-fatal
-- toast/alert -- they were also already written for a constraint that
-- never existed. This migration makes the constraint they were designed
-- around actually real; no JS changes are required for the write path.
-- Other connections-table INSERTs found in the repo (assets/js/
-- neuralInteractive.js, assets/js/start-flow-unified.js, assets/js/
-- unified-network/action-resolver.js's _executeConnect) are either not
-- loaded by index.html at all, or reference the stale user_id/
-- connected_user_id columns and would already fail before ever reaching
-- this constraint -- pre-existing, unrelated dead/broken code, left
-- untouched (out of scope for this bounded repair).
--
-- Apply manually via the Supabase Dashboard SQL editor or:
--   supabase db execute -f supabase/sql/migrations/20260819c_connection_identity_integrity.sql
-- (supabase/sql is not executed automatically -- see supabase/sql/README.md)
-- Idempotent: safe to run more than once. Run AFTER 20260819_admin_analytics_
-- privacy.sql and 20260819b_admin_analytics_identity_fix.sql (independent of
-- them, but keeps the three same-day migrations in their intended order).

-- ============================================================================
-- STEP 1: Report current duplicate state (visible in NOTICE output)
-- ============================================================================

DO $$
DECLARE
  v_duplicate_pairs integer;
  v_redundant_rows integer;
BEGIN
  SELECT count(*), coalesce(sum(cnt) - count(*), 0)
    INTO v_duplicate_pairs, v_redundant_rows
  FROM (
    SELECT count(*) AS cnt
    FROM public.connections
    WHERE status IN ('pending', 'accepted')
    GROUP BY least(from_user_id, to_user_id), greatest(from_user_id, to_user_id)
    HAVING count(*) > 1
  ) dup;

  RAISE NOTICE 'connection identity repair: % unordered pair(s) with more than one active (pending/accepted) row, % redundant row(s) to be removed', v_duplicate_pairs, v_redundant_rows;
END $$;

-- ============================================================================
-- STEP 2: Deterministically collapse duplicate active rows per pair
-- ============================================================================

-- 2a. Upgrade the surviving (earliest-created) active row per pair to the
--     strongest status found among its duplicates, in case a *later*
--     duplicate row is the one that was actually accepted. id, from_user_id/
--     to_user_id (direction), created_at, and type are all preserved
--     untouched on the survivor -- only status changes. There is no
--     updated_at column on the live connections table to also set (see the
--     CORRECTION note at the top of this file).
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY least(from_user_id, to_user_id), greatest(from_user_id, to_user_id)
      ORDER BY created_at ASC, id ASC
    ) AS rn,
    count(*) OVER (
      PARTITION BY least(from_user_id, to_user_id), greatest(from_user_id, to_user_id)
    ) AS pair_size,
    max(CASE status WHEN 'accepted' THEN 2 WHEN 'pending' THEN 1 ELSE 0 END) OVER (
      PARTITION BY least(from_user_id, to_user_id), greatest(from_user_id, to_user_id)
    ) AS best_rank
  FROM public.connections
  WHERE status IN ('pending', 'accepted')
)
UPDATE public.connections c
SET status = CASE r.best_rank WHEN 2 THEN 'accepted' ELSE 'pending' END
FROM ranked r
WHERE c.id = r.id
  AND r.rn = 1
  AND r.pair_size > 1
  AND c.status IS DISTINCT FROM (CASE r.best_rank WHEN 2 THEN 'accepted' ELSE 'pending' END);

-- 2b. Remove the now-redundant duplicate rows. Only rows ranked below the
--     survivor within an active (pending/accepted) group are ever
--     targeted -- a rejected/canceled row is never part of this ranking
--     (WHERE status IN ('pending','accepted') scopes it out entirely), so
--     legitimate history can never be deleted here, and a pair with only
--     one active row is untouched (rn=1 is the only row, nothing has
--     rn>1). Re-derives the ranking fresh so it reflects step 2a's
--     upgrade.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY least(from_user_id, to_user_id), greatest(from_user_id, to_user_id)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.connections
  WHERE status IN ('pending', 'accepted')
)
DELETE FROM public.connections
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ============================================================================
-- STEP 3: Verify cleanup is complete before adding any constraint
-- ============================================================================
-- Fails closed: if this fires, it means step 2's deterministic ranking
-- logic itself has a bug (the ranking is a total order over pending/
-- accepted rows, so a real duplicate should be impossible to survive it) --
-- not that the underlying data was ambiguous. Aborts the whole migration;
-- no constraint or index is added and nothing else is changed.

DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM (
    SELECT 1
    FROM public.connections
    WHERE status IN ('pending', 'accepted')
    GROUP BY least(from_user_id, to_user_id), greatest(from_user_id, to_user_id)
    HAVING count(*) > 1
  ) dup;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'connection identity repair: % unordered pair(s) still have more than one active row after cleanup -- aborting before adding uniqueness protection. Investigate manually.', v_remaining;
  END IF;

  RAISE NOTICE 'connection identity repair: cleanup verified -- 0 unordered pairs have more than one active row. Safe to add uniqueness protection.';
END $$;

-- ============================================================================
-- STEP 4: Self-connections must remain invalid, enforced at the DB level too
-- ============================================================================
-- Already blocked in every live "Connect" handler at the application layer;
-- this closes the gap where nothing enforced it in the database itself.
-- NOT VALID + a separate VALIDATE keeps this migration's own semantics
-- explicit: if a self-connection row somehow already exists, VALIDATE
-- raises a clear error naming the constraint rather than this ALTER
-- silently doing something unexpected.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.connections'::regclass
      AND conname = 'connections_no_self_connection'
  ) THEN
    ALTER TABLE public.connections
      ADD CONSTRAINT connections_no_self_connection
      CHECK (from_user_id <> to_user_id) NOT VALID;
    ALTER TABLE public.connections
      VALIDATE CONSTRAINT connections_no_self_connection;
  END IF;
END $$;

-- ============================================================================
-- STEP 5: Database-level uniqueness -- the actual future-proofing fix
-- ============================================================================
-- One unordered pair may have AT MOST ONE active (pending or accepted) row.
-- A rejected/canceled row never conflicts with a new pending row for the
-- same pair (product behavior explicitly relies on this -- see audit
-- finding #1), so this is a PARTIAL index, not a table-wide constraint.
-- A bare unique-violation here raises Postgres error code 23505, which
-- both live "Connect" handlers already handle gracefully (see audit
-- header) -- no application code change is required to activate that
-- existing behavior.

CREATE UNIQUE INDEX IF NOT EXISTS connections_unique_active_pair
  ON public.connections (LEAST(from_user_id, to_user_id), GREATEST(from_user_id, to_user_id))
  WHERE status IN ('pending', 'accepted');

-- ============================================================================
-- STEP 6: Repair community.connection_count so it can no longer be
-- inflated by a reciprocal duplicate row, even transiently
-- ============================================================================
-- The trigger previously counted connection ROWS ("(from_user_id = X OR
-- to_user_id = X) AND status = 'accepted'"); a reciprocal duplicate row
-- satisfies that WHERE clause twice for the same peer, inflating the
-- count by one per duplicate. Counting DISTINCT peer ids instead is
-- correct regardless of whether a duplicate row exists, and is now
-- doubly protected by step 5 preventing new duplicates from forming.
-- Column name, trigger name, and firing conditions are unchanged from
-- supabase/sql/functions/fix-connection-count-trigger.sql -- CREATE OR
-- REPLACE FUNCTION updates the existing trigger's behavior in place.

CREATE OR REPLACE FUNCTION public.update_connection_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  user1_id UUID;
  user2_id UUID;
BEGIN
  user1_id := COALESCE(NEW.from_user_id, OLD.from_user_id);
  user2_id := COALESCE(NEW.to_user_id, OLD.to_user_id);

  IF user1_id IS NOT NULL THEN
    UPDATE public.community
    SET connection_count = (
      SELECT count(DISTINCT peer) FROM (
        SELECT CASE WHEN conn.from_user_id = user1_id THEN conn.to_user_id ELSE conn.from_user_id END AS peer
        FROM public.connections conn
        WHERE (conn.from_user_id = user1_id OR conn.to_user_id = user1_id)
          AND conn.status = 'accepted'
      ) p
    )
    WHERE id = user1_id;
  END IF;

  IF user2_id IS NOT NULL THEN
    UPDATE public.community
    SET connection_count = (
      SELECT count(DISTINCT peer) FROM (
        SELECT CASE WHEN conn.from_user_id = user2_id THEN conn.to_user_id ELSE conn.from_user_id END AS peer
        FROM public.connections conn
        WHERE (conn.from_user_id = user2_id OR conn.to_user_id = user2_id)
          AND conn.status = 'accepted'
      ) p
    )
    WHERE id = user2_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Re-declared defensively in case fix-connection-count-trigger.sql (a
-- manual-apply-only file, like this one) was never actually applied to
-- this database -- this migration does not assume it was.
DROP TRIGGER IF EXISTS trigger_update_connection_count ON public.connections;
CREATE TRIGGER trigger_update_connection_count
  AFTER INSERT OR UPDATE OR DELETE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_connection_count();

-- ============================================================================
-- STEP 7: Backfill -- every member's connection_count reflects unique
-- accepted relationship pairs as of right now (post-cleanup)
-- ============================================================================
-- This single backfill is what makes every existing production consumer
-- of community.connection_count correct without a client-side change:
-- assets/js/node-panel.js's own-profile connection badge, assets/js/
-- searchEngine.js, assets/js/enhanced-search-discovery.js, assets/js/
-- leaderboard.js, assets/js/daily-engagement.js, assets/js/teamBuilder.js,
-- assets/js/intelligenceEngine.js, assets/js/intelligence/daily-brief-
-- engine.js, and supabase/sql/functions/get_start_sequence_data.sql (which
-- backs assets/js/start-ui-enhanced.js's "Your Network Status" / Network
-- Report and command-dashboard.js's "Network Status" sidebar fallback
-- path) all read this column directly with no dedup logic of their own.
-- command-dashboard.js's primary "Connected" stat (_renderCompactStatus,
-- acceptedPeerIds) was independently verified already correct -- it dedupes
-- peer ids into a JS Set at read time and does not depend on this column.

UPDATE public.community c
SET connection_count = (
  SELECT count(DISTINCT peer) FROM (
    SELECT CASE WHEN conn.from_user_id = c.id THEN conn.to_user_id ELSE conn.from_user_id END AS peer
    FROM public.connections conn
    WHERE (conn.from_user_id = c.id OR conn.to_user_id = c.id)
      AND conn.status = 'accepted'
  ) p
);
