-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- ============================================================================
-- COMPREHENSIVE FIXES SCHEMA
-- Run this in Supabase SQL Editor to add missing tables and columns
-- ============================================================================

-- ============================================================================
-- 1. COMMUNITY TABLE ENHANCEMENTS
-- ============================================================================

-- Add avatar storage path (for uploaded images)
ALTER TABLE community ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT;

-- Add XP and level tracking
ALTER TABLE community ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0;
ALTER TABLE community ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;

-- Add streak tracking
ALTER TABLE community ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
ALTER TABLE community ADD COLUMN IF NOT EXISTS last_activity_date DATE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_level ON community(level);
CREATE INDEX IF NOT EXISTS idx_community_total_xp ON community(total_xp);

-- ============================================================================
-- 2. PROJECT REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES community(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'withdrawn'
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Indexes for project requests
CREATE INDEX IF NOT EXISTS idx_project_requests_project ON project_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_project_requests_user ON project_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_project_requests_status ON project_requests(status);

-- Enable RLS
ALTER TABLE project_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own project requests" ON project_requests;
CREATE POLICY "Users can view their own project requests"
  ON project_requests FOR SELECT
  TO authenticated
  USING (user_id = (SELECT id FROM community WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Project creators can view requests for their projects" ON project_requests;
CREATE POLICY "Project creators can view requests for their projects"
  ON project_requests FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM projects WHERE creator_id = (SELECT id FROM community WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create project requests" ON project_requests;
CREATE POLICY "Users can create project requests"
  ON project_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT id FROM community WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update their own project requests" ON project_requests;
CREATE POLICY "Users can update their own project requests"
  ON project_requests FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT id FROM community WHERE user_id = auth.uid()));

-- ============================================================================
-- 3. NOTIFICATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES community(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'connection_request', 'project_invite', 'org_join_request', 'message', etc.
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  read BOOLEAN DEFAULT false,
  metadata JSONB, -- Additional data (e.g., sender_id, project_id, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = (SELECT id FROM community WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT id FROM community WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "System can create notifications" ON notifications;
CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate level from XP
CREATE OR REPLACE FUNCTION calculate_level(xp INTEGER)
RETURNS INTEGER AS $$
BEGIN
  -- Level formula: Level = floor(sqrt(XP / 100)) + 1
  -- Level 1: 0-99 XP
  -- Level 2: 100-399 XP
  -- Level 3: 400-899 XP
  -- Level 4: 900-1599 XP
  -- Level 5: 1600-2499 XP
  -- Level 6: 2500+ XP
  RETURN FLOOR(SQRT(xp / 100.0)) + 1;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get level title
CREATE OR REPLACE FUNCTION get_level_title(level INTEGER)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE
    WHEN level >= 10 THEN 'Legend'
    WHEN level >= 8 THEN 'Master'
    WHEN level >= 6 THEN 'Leader'
    WHEN level >= 4 THEN 'Expert'
    WHEN level >= 2 THEN 'Explorer'
    ELSE 'Newcomer'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate XP needed for next level
CREATE OR REPLACE FUNCTION xp_for_next_level(current_level INTEGER)
RETURNS INTEGER AS $$
BEGIN
  -- XP needed for next level = (level^2) * 100
  RETURN (current_level * current_level) * 100;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update user level based on XP
CREATE OR REPLACE FUNCTION update_user_level()
RETURNS TRIGGER AS $$
BEGIN
  NEW.level := calculate_level(NEW.total_xp);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update level when XP changes
DROP TRIGGER IF EXISTS trigger_update_level ON community;
CREATE TRIGGER trigger_update_level
  BEFORE UPDATE OF total_xp ON community
  FOR EACH ROW
  EXECUTE FUNCTION update_user_level();

-- Function to calculate streak
CREATE OR REPLACE FUNCTION calculate_streak(user_id_param UUID)
RETURNS INTEGER AS $$
DECLARE
  streak_count INTEGER := 0;
  last_date DATE;
  check_date DATE;
BEGIN
  -- Get the most recent activity date
  SELECT last_activity_date INTO last_date
  FROM community
  WHERE id = user_id_param;

  IF last_date IS NULL THEN
    RETURN 0;
  END IF;

  -- If last activity was today or yesterday, start counting
  IF last_date >= CURRENT_DATE - INTERVAL '1 day' THEN
    check_date := last_date;
    
    -- Count consecutive days backwards
    LOOP
      -- Check if there's activity on check_date
      -- This is a simplified version - you may want to check actual activity logs
      IF check_date < last_date - INTERVAL '365 days' THEN
        EXIT;
      END IF;
      
      streak_count := streak_count + 1;
      check_date := check_date - INTERVAL '1 day';
      
      -- For now, we'll just use the current_streak value from the table
      -- In a full implementation, you'd check an activity log table
      EXIT;
    END LOOP;
    
    -- Return the stored streak value
    SELECT current_streak INTO streak_count
    FROM community
    WHERE id = user_id_param;
    
    RETURN COALESCE(streak_count, 0);
  ELSE
    -- Streak is broken
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update streak on activity
CREATE OR REPLACE FUNCTION update_streak_on_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- If last activity was yesterday, increment streak
  IF NEW.last_activity_date = CURRENT_DATE - INTERVAL '1 day' THEN
    NEW.current_streak := COALESCE(NEW.current_streak, 0) + 1;
  -- If last activity was today, keep streak
  ELSIF NEW.last_activity_date = CURRENT_DATE THEN
    -- No change
    NULL;
  -- Otherwise, reset streak
  ELSE
    NEW.current_streak := 1;
  END IF;
  
  NEW.last_activity_date := CURRENT_DATE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. STORAGE BUCKET FOR AVATARS
-- ============================================================================

-- Create storage bucket for avatars (run this separately if needed)
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('avatars', 'avatars', true)
-- ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars
-- CREATE POLICY "Avatar images are publicly accessible"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'avatars');

-- CREATE POLICY "Users can upload their own avatar"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'avatars' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- CREATE POLICY "Users can update their own avatar"
--   ON storage.objects FOR UPDATE
--   USING (
--     bucket_id = 'avatars' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- CREATE POLICY "Users can delete their own avatar"
--   ON storage.objects FOR DELETE
--   USING (
--     bucket_id = 'avatars' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- ============================================================================
-- 6. FUNCTION TO GET UNREAD NOTIFICATION COUNT
-- ============================================================================

CREATE OR REPLACE FUNCTION get_unread_notification_count(user_id_param UUID)
RETURNS INTEGER AS $$
DECLARE
  count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO count
  FROM notifications
  WHERE user_id = user_id_param AND read = false;
  
  RETURN COALESCE(count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. FUNCTION TO CREATE NOTIFICATION
-- ============================================================================

CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, link, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_metadata)
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify community table columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'community' 
  AND column_name IN ('avatar_storage_path', 'total_xp', 'level', 'current_streak', 'last_activity_date')
ORDER BY column_name;

-- Verify project_requests table
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'project_requests'
);

-- Verify notifications table
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'notifications'
);

-- Test level calculation
SELECT 
  0 as xp, calculate_level(0) as level, get_level_title(calculate_level(0)) as title
UNION ALL
SELECT 100, calculate_level(100), get_level_title(calculate_level(100))
UNION ALL
SELECT 500, calculate_level(500), get_level_title(calculate_level(500))
UNION ALL
SELECT 1000, calculate_level(1000), get_level_title(calculate_level(1000))
UNION ALL
SELECT 2500, calculate_level(2500), get_level_title(calculate_level(2500))
UNION ALL
SELECT 5000, calculate_level(5000), get_level_title(calculate_level(5000));

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Schema updates completed successfully!';
END $$;
