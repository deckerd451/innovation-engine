-- ============================================================================
-- FIX: get_unread_count() uses auth.uid() for sender_id comparison
-- but sender_id stores community.id (not auth.users.id).
--
-- This causes the RPC to count the user's OWN sent messages as unread
-- because auth.uid() never matches any community-ID-based sender_id.
--
-- The application layer now bypasses this RPC entirely (notification-bell.js
-- and unified-notification-system.js query directly with community ID).
-- This SQL fix is provided for completeness if you want to fix the RPC too.
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

  -- FIX: compare sender_id against community ID, not auth.uid()
  SELECT COUNT(*)::INTEGER INTO unread_count
  FROM public.messages m
  WHERE m.read = FALSE
    AND m.sender_id != current_user_community_id
    AND m.conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id = current_user_community_id
         OR participant_2_id = current_user_community_id
    );

  RETURN COALESCE(unread_count, 0);
END;
$$;
