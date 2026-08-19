-- Bounded retention/engagement instrumentation: the smallest durable model
-- that can answer "are users coming back, and what's associated with it."
--
-- ============================================================================
-- PHASE 1 AUDIT SUMMARY (what already exists, and why none of it suffices)
-- ============================================================================
--
-- activity_log(auth_user_id, community_user_id, action_type, details, created_at)
--   RLS: SELECT USING (auth_user_id = auth.uid()) -- own rows only.
--   Live-written only by an award_xp trigger on endorsements and a few
--   project-task events (assets/js/project-tasks.js, node-panel.js). Not a
--   general session/visit log, and not semantically about "did they come
--   back" -- reusing it would conflate XP bookkeeping with retention
--   measurement. Not reused.
--
-- presence_sessions -- ephemeral, TTL/upsert-based "who's near this node
--   right now" for live graph presence, not a durable visit history (rows
--   expire/get overwritten). Cannot answer "did this user have a session
--   7 days ago." Not reused.
--
-- community.last_seen_at -- durable, but a single overwritten timestamp
--   with no history. Cannot answer "when was their FIRST session" or
--   "did they return within 7 days of that" -- both need a persisted
--   sequence of visits, not a snapshot. Per this task's explicit
--   instruction, historical retention must never be inferred from this
--   field. Not reused for retention math (still used elsewhere, unchanged).
--
-- community.reflection_last_visited_at / reflection_previous_visited_at --
--   durable, but a 2-value rolling watermark scoped to one feature
--   (Reflection), not a general session/event model. The NEW
--   reflection_viewed event is logged at the exact same call site that
--   already writes this watermark (assets/js/start-daily-digest.js), so
--   the two stay consistent without touching Reflection's own logic.
--
-- get_start_sequence_data() -- computes per-user aggregates on the fly
--   from existing tables; it does not store visit/session history, so it
--   cannot answer retention questions either. Its "one JSON-returning
--   SECURITY DEFINER function" shape is reused as the pattern for the new
--   admin RPC below (same pattern as get_admin_network_analytics()).
--
-- Conclusion: nothing existing durably records "when did a user visit"
-- as a sequence over time. A new, minimal (session, event) model is
-- required; nothing already-reliable is being duplicated.
--
-- ============================================================================
-- SCHEMA CAUTION (see supabase/sql/migrations/20260819c and 20260819b's own
-- corrections): supabase/sql is manually applied and has repeatedly proven
-- to drift from the live database (a prior migration in this same series
-- failed live because a reference file wrongly claimed connections had an
-- updated_at column). This migration only creates NEW tables -- it does not
-- assume the shape of any existing table except reading
-- community.user_role (already the live, corroborated admin-authorization
-- column used by get_admin_network_analytics(), applied and confirmed
-- working) and community.id (primary key, foundational). No other existing
-- column is touched.
--
-- Apply manually via the Supabase Dashboard SQL editor or:
--   supabase db execute -f supabase/sql/migrations/20260820_retention_instrumentation.sql
-- Apply AFTER 20260819_admin_analytics_privacy.sql (this migration's RPC
-- depends on community.user_role='Admin' already being the live admin
-- authority that migration establishes). Independent of 20260819b/c.
-- Idempotent: safe to run more than once.

-- ============================================================================
-- STEP 1: product_sessions -- one row per qualifying authenticated visit
-- ============================================================================
-- No ended_at: there is no reliable signal for when a session truly ends
-- (this pass deliberately avoids heartbeat/unload tracking -- see PHASE 3
-- of the instrumentation plan), so a column we can never populate honestly
-- is omitted rather than left permanently null.

CREATE TABLE IF NOT EXISTS public.product_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id uuid REFERENCES public.community(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_sessions IS
  'One row per qualifying authenticated visit. A visit resumes the same row (last_activity_at extended, throttled) if activity continues within 30 minutes; otherwise a new row is created. Never written for anonymous/pre-auth visits.';

CREATE INDEX IF NOT EXISTS idx_product_sessions_user_started
  ON public.product_sessions (user_id, started_at);

ALTER TABLE public.product_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert own sessions" ON public.product_sessions;
CREATE POLICY "insert own sessions" ON public.product_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "select own sessions" ON public.product_sessions;
CREATE POLICY "select own sessions" ON public.product_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "update own sessions" ON public.product_sessions;
CREATE POLICY "update own sessions" ON public.product_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No admin-bypass policy: admins never read raw session rows, only the
-- aggregate RPC below (PHASE 6 requirement).

-- ============================================================================
-- STEP 2: product_events -- a small, fixed taxonomy of meaningful actions
-- ============================================================================
-- Deliberately excludes message content, search text, profile text,
-- opportunity descriptions, URLs, IP addresses, and any device
-- fingerprint -- entity_id is the only per-event payload, and it is a
-- bare id (a UUID pointer), never free text.

CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id uuid REFERENCES public.community(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.product_sessions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_events_event_type_check CHECK (event_type IN (
    'session_started',
    'person_viewed',
    'connection_requested',
    'connection_accepted',
    'opportunity_viewed',
    'message_sent',
    'reflection_viewed'
  ))
);

COMMENT ON TABLE public.product_events IS
  'Fixed, small taxonomy of meaningful product actions (see the CHECK constraint). No content/text/URLs/device data -- entity_id is a bare pointer only. opportunity_applied and project_joined were evaluated and left out: no single canonical, reliably-wired production action exists for either (see the migration''s companion report).';

CREATE INDEX IF NOT EXISTS idx_product_events_user_time
  ON public.product_events (user_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_product_events_type_time
  ON public.product_events (event_type, occurred_at);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert own events" ON public.product_events;
CREATE POLICY "insert own events" ON public.product_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "select own events" ON public.product_events;
CREATE POLICY "select own events" ON public.product_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Events are immutable (no UPDATE policy) and not user-deletable (no
-- DELETE policy) -- a product_events row is an append-only fact.

-- No admin-bypass policy here either: the RPC below is the only path
-- through which aggregate numbers reach Admin Analytics.

-- ============================================================================
-- STEP 3: admin retention/engagement aggregate RPC
-- ============================================================================
-- Same fail-closed pattern as get_admin_network_analytics()
-- (20260819_admin_analytics_privacy.sql): SECURITY DEFINER, gated on the
-- caller's own community.user_role = 'Admin', RAISEs (returns nothing) for
-- anyone else. Returns computed aggregates only -- no raw session or event
-- rows, no user identities, no emails, ever leave this function.
--
-- Retention definitions (encoded here, not just in comments, so the SQL
-- and the documentation cannot silently drift apart):
--   ACTIVE USER (7d/30d)  = distinct user_id with >=1 session started_at
--                           within the window.
--   RETURNING USER        = user_id with >=2 product_sessions rows, ever
--                           (each row already represents a visit at least
--                           30 minutes apart from the last, so 2 rows is
--                           unambiguously "came back on a separate visit").
--   D1 RETENTION           = among users whose first-ever session's
--                           calendar day D is at least 2 days in the past
--                           (so D+1 has fully elapsed), % with another
--                           session on calendar day D+1.
--   D7 / D30 RETENTION     = "returned at least once during days 1-N"
--                           (a rolling window), NOT exact-day D+N -- for a
--                           small community, exact-day retention is
--                           almost always near-zero and not meaningful.
--                           Cohort = users whose first session is at
--                           least N+1 days in the past (full window has
--                           elapsed); retained = has >=1 later session
--                           within N days of that first session.
--   ACTIVATION              = performed >=1 of
--                           (connection_requested, connection_accepted,
--                           message_sent) -- the three events with a
--                           single, reliably-wired canonical production
--                           action (see the migration's companion
--                           report). Viewing alone never counts.
--   RETURN SIGNAL           = for a candidate action, among the D7-eligible
--                           cohort: % who ever performed that action and
--                           returned within 7 days of their first session,
--                           vs. % who never performed it. Descriptive only
--                           -- labeled association, not causation, in the
--                           client. Suppressed entirely (both sides) below
--                           p_min_cohort per side.
--
-- A NULL rate_pct/cohort_n of 0 means "not measurable yet", distinct from
-- an actual 0% -- the client must render these differently (PHASE 7/11).

CREATE OR REPLACE FUNCTION public.get_admin_retention_analytics(p_min_cohort integer DEFAULT 5)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_result json;
BEGIN
  SELECT (user_role = 'Admin') INTO v_is_admin
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'not_authorized: admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_min_cohort IS NULL OR p_min_cohort < 1 THEN
    p_min_cohort := 5;
  END IF;

  WITH first_session AS (
    SELECT user_id, min(started_at) AS first_started_at
    FROM public.product_sessions
    GROUP BY user_id
  ),
  session_counts AS (
    SELECT user_id, count(*) AS n
    FROM public.product_sessions
    GROUP BY user_id
  ),
  d1_cohort AS (
    SELECT fs.user_id, fs.first_started_at
    FROM first_session fs
    WHERE fs.first_started_at::date <= (current_date - 2)
  ),
  d1_retained AS (
    SELECT c.user_id
    FROM d1_cohort c
    WHERE EXISTS (
      SELECT 1 FROM public.product_sessions s
      WHERE s.user_id = c.user_id
        AND s.started_at::date = (c.first_started_at::date + 1)
    )
  ),
  d7_cohort AS (
    SELECT fs.user_id, fs.first_started_at
    FROM first_session fs
    WHERE fs.first_started_at <= now() - interval '8 days'
  ),
  d7_retained AS (
    SELECT c.user_id
    FROM d7_cohort c
    WHERE EXISTS (
      SELECT 1 FROM public.product_sessions s
      WHERE s.user_id = c.user_id
        AND s.started_at > c.first_started_at
        AND s.started_at <= c.first_started_at + interval '7 days'
    )
  ),
  d30_cohort AS (
    SELECT fs.user_id, fs.first_started_at
    FROM first_session fs
    WHERE fs.first_started_at <= now() - interval '31 days'
  ),
  d30_retained AS (
    SELECT c.user_id
    FROM d30_cohort c
    WHERE EXISTS (
      SELECT 1 FROM public.product_sessions s
      WHERE s.user_id = c.user_id
        AND s.started_at > c.first_started_at
        AND s.started_at <= c.first_started_at + interval '30 days'
    )
  ),
  activation_events AS (
    SELECT DISTINCT user_id
    FROM public.product_events
    WHERE event_type IN ('connection_requested', 'connection_accepted', 'message_sent')
  ),
  sessioned_users AS (
    SELECT DISTINCT user_id FROM public.product_sessions
  ),
  -- Behavior -> return association. Restricted to the same D7-eligible
  -- cohort as d7_retention above, so the comparison is apples-to-apples
  -- with the headline D7 number.
  action_cohorts AS (
    SELECT
      'connection_requested'::text AS action,
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id IN (SELECT user_id FROM public.product_events WHERE event_type = 'connection_requested')) AS did_n,
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id IN (SELECT user_id FROM public.product_events WHERE event_type = 'connection_requested')
          AND c.user_id IN (SELECT user_id FROM d7_retained)) AS did_retained_n,
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id NOT IN (SELECT user_id FROM public.product_events WHERE event_type = 'connection_requested')) AS not_n,
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id NOT IN (SELECT user_id FROM public.product_events WHERE event_type = 'connection_requested')
          AND c.user_id IN (SELECT user_id FROM d7_retained)) AS not_retained_n
    UNION ALL
    SELECT
      'message_sent'::text,
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id IN (SELECT user_id FROM public.product_events WHERE event_type = 'message_sent')),
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id IN (SELECT user_id FROM public.product_events WHERE event_type = 'message_sent')
          AND c.user_id IN (SELECT user_id FROM d7_retained)),
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id NOT IN (SELECT user_id FROM public.product_events WHERE event_type = 'message_sent')),
      (SELECT count(*) FROM d7_cohort c
        WHERE c.user_id NOT IN (SELECT user_id FROM public.product_events WHERE event_type = 'message_sent')
          AND c.user_id IN (SELECT user_id FROM d7_retained))
  ),
  action_signals AS (
    SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) AS j
    FROM (
      SELECT
        action,
        did_n,
        did_retained_n,
        not_n,
        not_retained_n,
        round((did_retained_n::numeric / did_n) * 100, 1) AS did_return_pct,
        round((not_retained_n::numeric / not_n) * 100, 1) AS not_return_pct
      FROM action_cohorts
      WHERE did_n >= p_min_cohort AND not_n >= p_min_cohort
    ) t
  ),
  totals AS (
    SELECT
      (SELECT min(started_at) FROM public.product_sessions) AS instrumentation_since,
      (SELECT count(*) FROM public.product_sessions WHERE started_at >= now() - interval '7 days') AS sessions_7d,
      (SELECT count(*) FROM public.product_sessions WHERE started_at >= now() - interval '30 days') AS sessions_30d,
      (SELECT count(DISTINCT user_id) FROM public.product_sessions WHERE started_at >= now() - interval '7 days') AS active_users_7d,
      (SELECT count(DISTINCT user_id) FROM public.product_sessions WHERE started_at >= now() - interval '30 days') AS active_users_30d,
      (SELECT count(*) FROM session_counts WHERE n >= 2) AS returning_users,
      (SELECT count(*) FROM sessioned_users) AS total_sessioned_users,
      (SELECT count(*) FROM sessioned_users su WHERE su.user_id IN (SELECT user_id FROM activation_events)) AS activated_users,
      (SELECT count(*) FROM d1_cohort) AS d1_cohort_n,
      (SELECT count(*) FROM d1_retained) AS d1_retained_n,
      (SELECT count(*) FROM d7_cohort) AS d7_cohort_n,
      (SELECT count(*) FROM d7_retained) AS d7_retained_n,
      (SELECT count(*) FROM d30_cohort) AS d30_cohort_n,
      (SELECT count(*) FROM d30_retained) AS d30_retained_n
  )
  SELECT json_build_object(
    'instrumentation_since', totals.instrumentation_since,
    'min_cohort_size', p_min_cohort,
    'sessions_7d', totals.sessions_7d,
    'sessions_30d', totals.sessions_30d,
    'active_users_7d', totals.active_users_7d,
    'active_users_30d', totals.active_users_30d,
    'returning_users', totals.returning_users,
    'activation', json_build_object(
      'activated_users', totals.activated_users,
      'eligible_users', totals.total_sessioned_users,
      'rate_pct', CASE WHEN totals.total_sessioned_users > 0
        THEN round((totals.activated_users::numeric / totals.total_sessioned_users) * 100, 1)
        ELSE NULL END
    ),
    'd1_retention', json_build_object(
      'cohort_n', totals.d1_cohort_n,
      'retained_n', totals.d1_retained_n,
      'rate_pct', CASE WHEN totals.d1_cohort_n > 0
        THEN round((totals.d1_retained_n::numeric / totals.d1_cohort_n) * 100, 1)
        ELSE NULL END,
      'definition', 'returned on the calendar day after their first session'
    ),
    'd7_retention', json_build_object(
      'cohort_n', totals.d7_cohort_n,
      'retained_n', totals.d7_retained_n,
      'rate_pct', CASE WHEN totals.d7_cohort_n > 0
        THEN round((totals.d7_retained_n::numeric / totals.d7_cohort_n) * 100, 1)
        ELSE NULL END,
      'definition', 'returned at least once within 7 days of first session'
    ),
    'd30_retention', json_build_object(
      'cohort_n', totals.d30_cohort_n,
      'retained_n', totals.d30_retained_n,
      'rate_pct', CASE WHEN totals.d30_cohort_n > 0
        THEN round((totals.d30_retained_n::numeric / totals.d30_cohort_n) * 100, 1)
        ELSE NULL END,
      'definition', 'returned at least once within 30 days of first session'
    ),
    'return_signals', action_signals.j
  ) INTO v_result
  FROM totals, action_signals;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_retention_analytics(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_retention_analytics(integer) TO authenticated;
