-- ============================================================================
-- CHARLESTONHACKS - HELPER FUNCTIONS & TRIGGERS
-- ============================================================================
-- Run this AFTER the main migration completes successfully
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '⚙️  Creating helper functions and triggers...';
END $$;

-- ============================================================================
-- FUNCTION 1: Get or create conversation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  other_user_id UUID,
  ctx_type TEXT DEFAULT NULL,
  ctx_id UUID DEFAULT NULL,
  ctx_title TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_community_id UUID;
  other_user_community_id UUID;
  conversation_id UUID;
  p1_id UUID;
  p2_id UUID;
BEGIN
  -- Get current user's community ID
  SELECT id INTO current_user_community_id
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  -- Get other user's community ID
  SELECT id INTO other_user_community_id
  FROM public.community
  WHERE user_id = other_user_id
  LIMIT 1;

  -- Validate both users exist
  IF current_user_community_id IS NULL THEN
    RAISE EXCEPTION 'Current user not found in community table';
  END IF;

  IF other_user_community_id IS NULL THEN
    RAISE EXCEPTION 'Other user not found in community table';
  END IF;

  -- Order participant IDs to ensure consistency
  IF current_user_community_id < other_user_community_id THEN
    p1_id := current_user_community_id;
    p2_id := other_user_community_id;
  ELSE
    p1_id := other_user_community_id;
    p2_id := current_user_community_id;
  END IF;

  -- Try to find existing conversation
  SELECT id INTO conversation_id
  FROM public.conversations
  WHERE (participant_1_id = p1_id AND participant_2_id = p2_id)
     OR (participant_1_id = p2_id AND participant_2_id = p1_id)
  LIMIT 1;

  -- If conversation exists, return it
  IF conversation_id IS NOT NULL THEN
    RETURN conversation_id;
  END IF;

  -- Create new conversation
  INSERT INTO public.conversations (
    participant_1_id, participant_2_id, context_type, context_id,
    context_title, created_at, updated_at
  ) VALUES (
    p1_id, p2_id, ctx_type, ctx_id, ctx_title, NOW(), NOW()
  )
  RETURNING id INTO conversation_id;

  RETURN conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_conversation TO authenticated;

-- ============================================================================
-- FUNCTION 2: Get unread message count
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_unread_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_community_id UUID;
  unread_count INTEGER;
BEGIN
  SELECT id INTO current_user_community_id
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF current_user_community_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::INTEGER INTO unread_count
  FROM public.messages m
  WHERE m.read = FALSE
    AND m.sender_id != auth.uid()
    AND m.conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id = current_user_community_id
         OR participant_2_id = current_user_community_id
    );

  RETURN COALESCE(unread_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_count TO authenticated;

-- ============================================================================
-- FUNCTION 3: Award XP
-- ============================================================================

CREATE OR REPLACE FUNCTION public.award_xp(
  amount INTEGER,
  action_type TEXT,
  details JSONB DEFAULT NULL
)
RETURNS TABLE(new_xp INTEGER, new_level INTEGER, did_level_up BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_xp INTEGER;
  current_level INTEGER;
  new_xp_value INTEGER;
  new_level_value INTEGER;
  community_id_val UUID;
  did_level_up_val BOOLEAN := FALSE;
BEGIN
  SELECT id, xp, level INTO community_id_val, current_xp, current_level
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF community_id_val IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  new_xp_value := current_xp + amount;

  -- Calculate level
  CASE
    WHEN new_xp_value >= 50000 THEN new_level_value := 10;
    WHEN new_xp_value >= 25000 THEN new_level_value := 9;
    WHEN new_xp_value >= 10000 THEN new_level_value := 8;
    WHEN new_xp_value >= 5000 THEN new_level_value := 7;
    WHEN new_xp_value >= 2000 THEN new_level_value := 6;
    WHEN new_xp_value >= 1000 THEN new_level_value := 5;
    WHEN new_xp_value >= 500 THEN new_level_value := 4;
    WHEN new_xp_value >= 250 THEN new_level_value := 3;
    WHEN new_xp_value >= 100 THEN new_level_value := 2;
    ELSE new_level_value := 1;
  END CASE;

  IF new_level_value > current_level THEN
    did_level_up_val := TRUE;
  END IF;

  UPDATE public.community
  SET xp = new_xp_value, level = new_level_value, updated_at = NOW()
  WHERE id = community_id_val;

  INSERT INTO public.activity_log (user_id, community_id, action_type, xp_awarded, details)
  VALUES (auth.uid(), community_id_val, action_type, amount, details);

  RETURN QUERY SELECT new_xp_value, new_level_value, did_level_up_val;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_xp TO authenticated;

-- ============================================================================
-- TRIGGER 1: Update conversation last message
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 100),
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_conversation_last_message ON public.messages;

CREATE TRIGGER trigger_update_conversation_last_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_last_message();

-- ============================================================================
-- TRIGGER 2: Auto-award XP for endorsements
-- ============================================================================

CREATE OR REPLACE FUNCTION public.award_xp_for_endorsement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.community
  SET xp = xp + 5, endorsements_given = endorsements_given + 1
  WHERE id = NEW.endorser_community_id;

  UPDATE public.community
  SET xp = xp + 10, endorsements_received = endorsements_received + 1
  WHERE id = NEW.endorsed_community_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_award_xp_endorsement ON public.endorsements;

CREATE TRIGGER trigger_award_xp_endorsement
  AFTER INSERT ON public.endorsements
  FOR EACH ROW
  EXECUTE FUNCTION public.award_xp_for_endorsement();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT SELECT ON public.achievements TO authenticated;
GRANT SELECT, INSERT ON public.user_achievements TO authenticated;
GRANT SELECT ON public.xp_leaderboard TO authenticated;
GRANT SELECT ON public.streak_leaderboard TO authenticated;
GRANT SELECT ON public.connection_leaderboard TO authenticated;

-- ============================================================================
-- COMPLETE!
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Helper functions and triggers created!';
  RAISE NOTICE 'Functions: get_or_create_conversation, get_unread_count, award_xp';
  RAISE NOTICE 'Triggers: update_conversation_last_message, award_xp_for_endorsement';
END $$;
