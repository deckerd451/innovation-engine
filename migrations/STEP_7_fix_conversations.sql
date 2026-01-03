DO $$
BEGIN
  RAISE NOTICE '🔧 Fixing existing conversations...';
END $$;

-- Drop constraints
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_participant_1_id_fkey;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_participant_2_id_fkey;

-- Fix participant_1_id
UPDATE public.conversations
SET participant_1_id = (
  SELECT c.id
  FROM public.community c
  WHERE c.user_id = conversations.participant_1_id
  LIMIT 1
)
WHERE participant_1_id NOT IN (SELECT id FROM public.community)
  AND participant_1_id IN (SELECT public.community.user_id FROM public.community WHERE public.community.user_id IS NOT NULL);

-- Fix participant_2_id
UPDATE public.conversations
SET participant_2_id = (
  SELECT c.id
  FROM public.community c
  WHERE c.user_id = conversations.participant_2_id
  LIMIT 1
)
WHERE participant_2_id NOT IN (SELECT id FROM public.community)
  AND participant_2_id IN (SELECT public.community.user_id FROM public.community WHERE public.community.user_id IS NOT NULL);

-- Delete orphaned conversations
DELETE FROM public.conversations c
WHERE c.participant_1_id NOT IN (SELECT id FROM public.community)
   OR c.participant_2_id NOT IN (SELECT id FROM public.community);

-- Re-add constraints
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_participant_1_id_fkey
  FOREIGN KEY (participant_1_id)
  REFERENCES public.community(id)
  ON DELETE CASCADE;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_participant_2_id_fkey
  FOREIGN KEY (participant_2_id)
  REFERENCES public.community(id)
  ON DELETE CASCADE;

DO $$
BEGIN
  RAISE NOTICE '✅ Conversations fixed';
END $$;
