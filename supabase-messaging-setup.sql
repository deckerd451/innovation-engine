-- ============================================================================
-- MESSAGING SYSTEM DATABASE SETUP
-- ============================================================================
-- This file sets up the complete messaging infrastructure for CharlestonHacks
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- 1. CONVERSATIONS TABLE
-- ============================================================================

-- Create conversations table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  participant_2_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,

  -- Context fields (optional - for project discussions, etc.)
  context_type TEXT,
  context_id UUID,
  context_title TEXT,

  -- Message tracking
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure no duplicate conversations between same participants
  CONSTRAINT unique_participants UNIQUE (participant_1_id, participant_2_id),

  -- Ensure participants are different
  CONSTRAINT different_participants CHECK (participant_1_id != participant_2_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_participant_1
  ON public.conversations(participant_1_id);

CREATE INDEX IF NOT EXISTS idx_conversations_participant_2
  ON public.conversations(participant_2_id);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message
  ON public.conversations(last_message_at DESC);

-- ============================================================================
-- 2. MESSAGES TABLE
-- ============================================================================

-- Create messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON public.messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON public.messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON public.messages(conversation_id, read) WHERE read = FALSE;

-- ============================================================================
-- 3. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on conversations table
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for clean setup)
DROP POLICY IF EXISTS "Users can view conversations they are part of" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON public.conversations;

-- Policy: Users can view conversations they're participating in
CREATE POLICY "Users can view conversations they are part of"
  ON public.conversations
  FOR SELECT
  USING (
    participant_1_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
    OR
    participant_2_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
  );

-- Policy: Authenticated users can create conversations
CREATE POLICY "Users can create conversations"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      participant_1_id IN (
        SELECT id FROM public.community WHERE user_id = auth.uid()
      )
      OR
      participant_2_id IN (
        SELECT id FROM public.community WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Users can update conversations they're part of (for last_message tracking)
CREATE POLICY "Users can update their conversations"
  ON public.conversations
  FOR UPDATE
  USING (
    participant_1_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
    OR
    participant_2_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- Enable RLS on messages table
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Drop existing message policies if they exist
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;

-- Policy: Users can view messages in conversations they're part of
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
         OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    )
  );

-- Policy: Users can send messages in conversations they're part of
CREATE POLICY "Users can send messages in their conversations"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
         OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    )
  );

-- Policy: Users can mark messages as read
CREATE POLICY "Users can update their own messages"
  ON public.messages
  FOR UPDATE
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE participant_1_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
         OR participant_2_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    )
  );

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Function: Get or create a conversation between two users
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

  -- Order participant IDs to ensure consistency (always smaller ID first)
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
    participant_1_id,
    participant_2_id,
    context_type,
    context_id,
    context_title,
    created_at,
    updated_at
  ) VALUES (
    p1_id,
    p2_id,
    ctx_type,
    ctx_id,
    ctx_title,
    NOW(),
    NOW()
  )
  RETURNING id INTO conversation_id;

  RETURN conversation_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation TO authenticated;

-- ============================================================================

-- Function: Get unread message count for current user
CREATE OR REPLACE FUNCTION public.get_unread_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_community_id UUID;
  unread_count INTEGER;
BEGIN
  -- Get current user's community ID
  SELECT id INTO current_user_community_id
  FROM public.community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF current_user_community_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Count unread messages in user's conversations
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_unread_count TO authenticated;

-- ============================================================================
-- 5. TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================================================

-- Function: Update conversation's last message info when new message is sent
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

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_conversation_last_message ON public.messages;

-- Create trigger
CREATE TRIGGER trigger_update_conversation_last_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_last_message();

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

-- Verify setup
DO $$
BEGIN
  RAISE NOTICE 'Messaging system setup complete!';
  RAISE NOTICE 'Tables created: conversations, messages';
  RAISE NOTICE 'RLS policies enabled and configured';
  RAISE NOTICE 'Functions created: get_or_create_conversation, get_unread_count';
  RAISE NOTICE 'Triggers created: update_conversation_last_message';
END $$;
