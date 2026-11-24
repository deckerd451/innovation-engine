\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', msg; END IF; END $$;
SET ROLE anon;
SELECT pg_temp.ok((SELECT count(*) FROM ideas) + (SELECT count(*) FROM idea_upvotes) + (SELECT count(*) FROM idea_comments)
  + (SELECT count(*) FROM project_comments) + (SELECT count(*) FROM project_upvotes) + (SELECT count(*) FROM signals)
  + (SELECT count(*) FROM theme_actions) + (SELECT count(*) FROM cynq_cards) + (SELECT count(*) FROM zork_events) = 0,
  'visitor sees no community content');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', false);
SELECT pg_temp.ok((SELECT count(*) FROM ideas) = 1 AND (SELECT count(*) FROM idea_upvotes) = 1 AND (SELECT count(*) FROM idea_comments) = 1
  AND (SELECT count(*) FROM project_comments) = 1 AND (SELECT count(*) FROM project_upvotes) = 1 AND (SELECT count(*) FROM signals) = 1
  AND (SELECT count(*) FROM theme_actions) = 1 AND (SELECT count(*) FROM cynq_cards) = 1, 'member still sees the same rows');
SELECT pg_temp.ok((SELECT count(*) FROM zork_events) = 0, 'zork events: member access unchanged (own rows only)');
RESET ROLE;
