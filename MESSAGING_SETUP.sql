-- ================================================================
-- MESSAGING SYSTEM DATABASE SETUP
-- ================================================================
-- Run this in your Supabase SQL editor to enable messaging functionality

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant1_id UUID REFERENCES community(id) ON DELETE CASCADE,
  participant2_id UUID REFERENCES community(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique conversations between two users
  CONSTRAINT unique_conversation UNIQUE (participant1_id, participant2_id),
  -- Ensure participant1_id < participant2_id for consistency
  CONSTRAINT ordered_participants CHECK (participant1_id < participant2_id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES community(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  
  -- Ensure content is not empty
  CONSTRAINT non_empty_content CHECK (length(trim(content)) > 0)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_participant1 ON conversations(participant1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_participant2 ON conversations(participant2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at);

-- Enable Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
CREATE POLICY IF NOT EXISTS "Users can view their own conversations" ON conversations
  FOR SELECT USING (
    auth.uid()::text = participant1_id::text OR 
    auth.uid()::text = participant2_id::text
  );

CREATE POLICY IF NOT EXISTS "Users can create conversations" ON conversations
  FOR INSERT WITH CHECK (
    auth.uid()::text = participant1_id::text OR 
    auth.uid()::text = participant2_id::text
  );

CREATE POLICY IF NOT EXISTS "Users can update their own conversations" ON conversations
  FOR UPDATE USING (
    auth.uid()::text = participant1_id::text OR 
    auth.uid()::text = participant2_id::text
  );

-- RLS Policies for messages
CREATE POLICY IF NOT EXISTS "Users can view messages in their conversations" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = messages.conversation_id 
      AND (
        conversations.participant1_id::text = auth.uid()::text OR 
        conversations.participant2_id::text = auth.uid()::text
      )
    )
  );

CREATE POLICY IF NOT EXISTS "Users can send messages in their conversations" ON messages
  FOR INSERT WITH CHECK (
    auth.uid()::text = sender_id::text AND
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = messages.conversation_id 
      AND (
        conversations.participant1_id::text = auth.uid()::text OR 
        conversations.participant2_id::text = auth.uid()::text
      )
    )
  );

CREATE POLICY IF NOT EXISTS "Users can update their own messages" ON messages
  FOR UPDATE USING (auth.uid()::text = sender_id::text);

-- Function to automatically update conversation updated_at when new message is sent
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations 
  SET updated_at = NOW() 
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation timestamp on new message
DROP TRIGGER IF EXISTS trigger_update_conversation_timestamp ON messages;
CREATE TRIGGER trigger_update_conversation_timestamp
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();

-- Function to ensure ordered participants in conversations
CREATE OR REPLACE FUNCTION ensure_ordered_participants()
RETURNS TRIGGER AS $$
BEGIN
  -- Swap participants if they're in wrong order
  IF NEW.participant1_id > NEW.participant2_id THEN
    NEW.participant1_id := OLD.participant2_id;
    NEW.participant2_id := OLD.participant1_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to ensure ordered participants
DROP TRIGGER IF EXISTS trigger_ensure_ordered_participants ON conversations;
CREATE TRIGGER trigger_ensure_ordered_participants
  BEFORE INSERT OR UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION ensure_ordered_participants();

-- Create a view for easier conversation queries
CREATE OR REPLACE VIEW conversation_details AS
SELECT 
  c.*,
  p1.name as participant1_name,
  p1.image_url as participant1_image,
  p2.name as participant2_name,
  p2.image_url as participant2_image,
  (
    SELECT COUNT(*) 
    FROM messages m 
    WHERE m.conversation_id = c.id
  ) as message_count,
  (
    SELECT m.content 
    FROM messages m 
    WHERE m.conversation_id = c.id 
    ORDER BY m.created_at DESC 
    LIMIT 1
  ) as last_message_content,
  (
    SELECT m.created_at 
    FROM messages m 
    WHERE m.conversation_id = c.id 
    ORDER BY m.created_at DESC 
    LIMIT 1
  ) as last_message_at
FROM conversations c
LEFT JOIN community p1 ON c.participant1_id = p1.id
LEFT JOIN community p2 ON c.participant2_id = p2.id;

-- Grant permissions on the view
GRANT SELECT ON conversation_details TO authenticated;

-- Sample data (optional - remove if you don't want sample conversations)
-- This creates a sample conversation between the first two users in your community table
DO $$
DECLARE
  user1_id UUID;
  user2_id UUID;
  conv_id UUID;
BEGIN
  -- Get first two users
  SELECT id INTO user1_id FROM community ORDER BY created_at LIMIT 1;
  SELECT id INTO user2_id FROM community WHERE id != user1_id ORDER BY created_at LIMIT 1;
  
  -- Only create sample data if we have at least 2 users
  IF user1_id IS NOT NULL AND user2_id IS NOT NULL THEN
    -- Ensure proper ordering
    IF user1_id > user2_id THEN
      SELECT user1_id, user2_id INTO user2_id, user1_id;
    END IF;
    
    -- Create sample conversation
    INSERT INTO conversations (participant1_id, participant2_id)
    VALUES (user1_id, user2_id)
    ON CONFLICT (participant1_id, participant2_id) DO NOTHING
    RETURNING id INTO conv_id;
    
    -- Add sample messages if conversation was created
    IF conv_id IS NOT NULL THEN
      INSERT INTO messages (conversation_id, sender_id, content) VALUES
      (conv_id, user1_id, 'Hey! Welcome to CharlestonHacks messaging! 👋'),
      (conv_id, user2_id, 'Thanks! This is awesome - love the real-time messaging system! 🚀'),
      (conv_id, user1_id, 'Absolutely! Ready to collaborate on some amazing projects? 💡');
    END IF;
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Messaging system setup completed successfully! 🎉';
  RAISE NOTICE 'Tables created: conversations, messages';
  RAISE NOTICE 'Indexes created for optimal performance';
  RAISE NOTICE 'RLS policies enabled for security';
  RAISE NOTICE 'Triggers created for automatic updates';
  RAISE NOTICE 'View created: conversation_details';
  RAISE NOTICE 'Sample data added (if users exist)';
  RAISE NOTICE '';
  RAISE NOTICE 'Your messaging system is now ready to use! 💬';
END $$;

COMMIT;