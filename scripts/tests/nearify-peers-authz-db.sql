-- People you met (get_nearify_event_peers) and members hidden from discovery,
-- against PostgreSQL (disposable local database). Run by
-- scripts/tests/run-authz-db.sh after the baseline fixtures, the helpers and
-- the migrations. Must FAIL on the production baseline. All rows roll back.
--
-- Vic met: Pat (listed), Hana (hidden, not connected), Hugo (hidden, an
-- accepted connection), Hope (hidden, asked Vic to connect: pending) and
-- Hal (hidden, Vic's request was rejected). Hana was also the only person
-- Vic met at "Quiet Summit".
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
BEGIN;

INSERT INTO public.community (id, user_id, name, email, bio, image_url, is_hidden) VALUES
  ('10000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a1', 'Vic', 'vic@example.test', 'Viewer bio', NULL, false),
  ('10000000-0000-4000-8000-0000000000a2', 'a0000000-0000-4000-8000-0000000000a2', 'Pat', 'pat@example.test', 'Pat bio', 'https://example.test/pat.png', false),
  ('10000000-0000-4000-8000-0000000000a3', 'a0000000-0000-4000-8000-0000000000a3', 'Hana', 'hana@example.test', 'Hana secret bio', 'https://example.test/hana.png', true),
  ('10000000-0000-4000-8000-0000000000a4', 'a0000000-0000-4000-8000-0000000000a4', 'Hugo', 'hugo@example.test', 'Hugo bio', NULL, true),
  ('10000000-0000-4000-8000-0000000000a5', 'a0000000-0000-4000-8000-0000000000a5', 'Hope', 'hope@example.test', 'Hope bio', NULL, true),
  ('10000000-0000-4000-8000-0000000000a6', 'a0000000-0000-4000-8000-0000000000a6', 'Hal', 'hal@example.test', 'Hal bio', NULL, true);

INSERT INTO public.connections (from_user_id, to_user_id, status) VALUES
  ('10000000-0000-4000-8000-0000000000a4', '10000000-0000-4000-8000-0000000000a1', 'accepted'),
  ('10000000-0000-4000-8000-0000000000a5', '10000000-0000-4000-8000-0000000000a1', 'pending'),
  ('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a6', 'rejected');

INSERT INTO public.interaction_edges (id, from_user_id, to_user_id, status, meta) VALUES
  ('70000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a2', 'suggested', '{"event_id": "ev-harbor", "event_name": "Harbor Night", "signal_type": "ble", "occurred_at": "2026-10-01T20:00:00Z"}'),
  ('70000000-0000-4000-8000-0000000000a3', '10000000-0000-4000-8000-0000000000a3', '10000000-0000-4000-8000-0000000000a1', 'suggested', '{"event_id": "ev-harbor", "event_name": "Harbor Night", "signal_type": "ble", "occurred_at": "2026-10-01T21:00:00Z"}'),
  ('70000000-0000-4000-8000-0000000000b3', '10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a3', 'suggested', '{"event_id": "ev-quiet", "event_name": "Quiet Summit", "signal_type": "qr_confirmed", "occurred_at": "2026-10-05T18:00:00Z"}'),
  ('70000000-0000-4000-8000-0000000000a4', '10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a4', 'suggested', '{"event_id": "ev-founders", "event_name": "Founders Meetup", "signal_type": "ble", "occurred_at": "2026-09-10T19:00:00Z"}'),
  ('70000000-0000-4000-8000-0000000000a5', '10000000-0000-4000-8000-0000000000a5', '10000000-0000-4000-8000-0000000000a1', 'suggested', '{"event_id": "ev-harbor", "event_name": "Harbor Night", "signal_type": "ble", "occurred_at": "2026-10-01T22:00:00Z"}'),
  ('70000000-0000-4000-8000-0000000000a6', '10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a6', 'suggested', '{"event_id": "ev-harbor", "event_name": "Harbor Night", "signal_type": "ble", "occurred_at": "2026-10-01T22:30:00Z"}');

-- What a member gets from People you met, called as that member.
CREATE TEMP TABLE seen (who text, r jsonb) ON COMMIT DROP;
GRANT ALL ON seen TO authenticated;

SELECT t.act('a0000000-0000-4000-8000-0000000000a1');
SET LOCAL ROLE authenticated;
INSERT INTO seen SELECT 'vic', public.get_nearify_event_peers();
RESET ROLE;

-- Listed members and accepted connections, nobody else.
SELECT t.eq((SELECT count(*) FROM seen, jsonb_path_query(r, '$.events[*].peers[*].community_id') p
             WHERE who = 'vic' AND p #>> '{}' IN ('10000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a4')), 2,
            'Vic sees Pat (listed) and Hugo (hidden, an accepted connection)');
SELECT t.eq((SELECT count(*) FROM seen, jsonb_path_query(r, '$.events[*].peers[*]') p WHERE who = 'vic'), 2,
            'hidden members who are not accepted connections are left out (not connected, pending, rejected)');
-- Nothing about them leaks: no name, bio, photo, id, edge id or event.
SELECT t.eq((SELECT count(*) FROM seen WHERE who = 'vic' AND (
               r::text ~ '(Hana|Hope|Hal|secret bio|hana\.png|0000000000a3|0000000000a5|0000000000a6|0000000000b3|Quiet Summit|ev-quiet)')), 0,
            'no name, bio, photo, id, edge id or event of a hidden member who is not a connection');
-- Counts: an event where Vic met only Hana is gone; Harbor Night lists Pat only.
SELECT t.eq((SELECT jsonb_array_length(r->'events') FROM seen WHERE who = 'vic'), 2, 'events: Harbor Night and Founders Meetup only');
SELECT t.eq((SELECT jsonb_array_length(e->'peers') FROM seen, jsonb_array_elements(r->'events') e
             WHERE who = 'vic' AND e->>'event_id' = 'ev-harbor'), 1, 'Harbor Night counts Pat only');
-- Harbor Night's date comes from Pat's encounter, not a hidden member's.
SELECT t.eq((SELECT count(*) FROM seen, jsonb_array_elements(r->'events') e
             WHERE who = 'vic' AND e->>'event_id' = 'ev-harbor' AND (e->>'occurred_at') LIKE '2026-10-01%20:00%'), 1,
            'Harbor Night is dated by the visible encounter');
-- Hugo, an accepted connection, keeps his encounter, with its details.
SELECT t.eq((SELECT count(*) FROM seen, jsonb_path_query(r, '$.events[*].peers[*] ? (@.name == "Hugo" && @.headline == "Hugo bio" && @.edge_id == "70000000-0000-4000-8000-0000000000a4")') p
             WHERE who = 'vic'), 1, 'an accepted connection who is hidden keeps the encounter and its details');

-- A hidden member still sees the people they met.
SELECT t.act('a0000000-0000-4000-8000-0000000000a3');
SET LOCAL ROLE authenticated;
INSERT INTO seen SELECT 'hana', public.get_nearify_event_peers();
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM seen, jsonb_path_query(r, '$.events[*].peers[*] ? (@.name == "Vic")') p WHERE who = 'hana'), 2,
            'a hidden member still sees whom they met (both events)');

-- Filtered, not deleted: the records are intact, and Hana returns when listed.
SELECT t.eq((SELECT count(*) FROM public.interaction_edges WHERE '10000000-0000-4000-8000-0000000000a1' IN (from_user_id, to_user_id)), 6,
            'every encounter record is kept');
UPDATE public.community SET is_hidden = false WHERE id = '10000000-0000-4000-8000-0000000000a3';
SELECT t.act('a0000000-0000-4000-8000-0000000000a1');
SET LOCAL ROLE authenticated;
INSERT INTO seen SELECT 'vic-after', public.get_nearify_event_peers();
RESET ROLE;
SELECT t.eq((SELECT count(*) FROM seen, jsonb_path_query(r, '$.events[*].peers[*] ? (@.name == "Hana")') p WHERE who = 'vic-after'), 2,
            'once no longer hidden, Hana''s encounters are back');

-- Who may call it is unchanged.
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.get_nearify_event_peers()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: anon can execute get_nearify_event_peers';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_nearify_event_peers()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAILED: members cannot execute get_nearify_event_peers';
  END IF;
END $$;

ROLLBACK;
\o
\echo 'People you met hidden-member checks passed'
