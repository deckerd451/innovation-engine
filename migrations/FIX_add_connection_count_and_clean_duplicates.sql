-- ============================================================================
-- FIX: Add connection_count column and clean up duplicate conversations
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '🔧 Adding connection_count column and cleaning duplicates...';
END $$;

-- Step 1: Add connection_count column if it doesn't exist
ALTER TABLE public.community
ADD COLUMN IF NOT EXISTS connection_count INTEGER DEFAULT 0;

-- Step 2: Calculate and populate connection_count for all users
UPDATE public.community
SET connection_count = (
  SELECT COUNT(*)
  FROM public.connections
  WHERE (from_user_id = community.id OR to_user_id = community.id)
    AND status = 'accepted'
);

-- Step 3: Clean up duplicate conversations (keep most recent)
DELETE FROM public.conversations conv1
WHERE EXISTS (
  SELECT 1 FROM public.conversations conv2
  WHERE conv2.participant_1_id = conv1.participant_1_id
    AND conv2.participant_2_id = conv1.participant_2_id
    AND conv2.created_at > conv1.created_at
);

-- Step 4: Ensure unique constraint exists
ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS unique_participants;

ALTER TABLE public.conversations
ADD CONSTRAINT unique_participants
UNIQUE (participant_1_id, participant_2_id);

-- Step 5: Create index on community(user_id) for RLS performance
CREATE INDEX IF NOT EXISTS idx_community_user_id ON public.community(user_id);

DO $$
BEGIN
  RAISE NOTICE '✅ connection_count added, duplicates removed, indexes created!';
END $$;
