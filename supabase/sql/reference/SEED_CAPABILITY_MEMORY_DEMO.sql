-- Capability Memory demonstration seed
--
-- Purpose: add one safe, repeatable example for end-to-end testing of goal
-- search and task import. This script does not invent UUIDs, create users or
-- create projects. It selects an existing project whose creator is an
-- existing community member and aborts if no suitable row exists.
--
-- Review the selected project and creator in the NOTICE output before applying
-- this script. Run with the Supabase SQL editor or migration tooling that has
-- permission to insert seed data. Do not put service-role keys in this file.

DO $$
DECLARE
  selected_project UUID;
  selected_creator UUID;
  existing_capability UUID;
  capability_title CONSTANT TEXT := 'Validate a business idea through customer interviews';
  capability_goal CONSTANT TEXT := 'Determine whether potential customers have a real problem worth solving.';
BEGIN
  -- Serialize repeat runs, including two operators applying the seed at once.
  PERFORM pg_advisory_xact_lock(hashtext('innovation-engine:capability-memory-demo:v1'));

  SELECT p.id, p.creator_id
    INTO selected_project, selected_creator
  FROM public.projects p
  JOIN public.community c ON c.id = p.creator_id
  WHERE c.user_id IS NOT NULL
    AND COALESCE(p.status, 'active') <> 'archived'
  ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST, p.id
  LIMIT 1;

  IF selected_project IS NULL OR selected_creator IS NULL THEN
    RAISE EXCEPTION 'No existing project with an authorized community creator was found; no demo capability was inserted.';
  END IF;

  SELECT id INTO existing_capability
  FROM public.capability_packages
  WHERE title = capability_title
    AND goal = capability_goal
    AND summary LIKE 'DEMONSTRATION CONTENT —%'
  LIMIT 1;

  IF existing_capability IS NOT NULL THEN
    RAISE NOTICE 'Demo capability already exists (id %, project %, creator %); no duplicate inserted.', existing_capability, selected_project, selected_creator;
    RETURN;
  END IF;

  INSERT INTO public.capability_packages (
    project_id,
    creator_id,
    title,
    goal,
    summary,
    steps,
    tools,
    constraints,
    failure_notes,
    success_criteria,
    permission_mode,
    evidence_status,
    version
  ) VALUES (
    selected_project,
    selected_creator,
    capability_title,
    capability_goal,
    'DEMONSTRATION CONTENT — Use this example to test goal search and task import. It represents a reusable interview workflow; it is not evidence that the workflow has been completed.',
    jsonb_build_array(
      'Identify five potential customers.',
      'Prepare five open-ended interview questions.',
      'Interview the customers.',
      'Record recurring problems.',
      'Decide whether to prototype the idea.'
    ),
    '[]'::jsonb,
    jsonb_build_object('demonstration', true, 'requires_real_customer_consent', true),
    'Demonstration seed only. No outcomes, time savings, costs, or independent verification have been recorded.',
    jsonb_build_array(
      'Five interviews completed.',
      'Recurring problems documented.',
      'A clear decision about whether to proceed.'
    ),
    'community',
    'untested',
    1
  )
  RETURNING id INTO existing_capability;

  RAISE NOTICE 'Inserted demo capability % for existing project % and community creator %.', existing_capability, selected_project, selected_creator;
END $$;

-- Optional post-run review (read-only):
-- SELECT id, project_id, creator_id, title, permission_mode, evidence_status,
--        version, steps, success_criteria
-- FROM public.capability_packages
-- WHERE title = 'Validate a business idea through customer interviews';
