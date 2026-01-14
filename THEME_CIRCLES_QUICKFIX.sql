-- ================================================================
-- CharlestonHacks - Quick Theme Circles Fix
-- ================================================================
-- This script ensures theme tables exist and creates minimal test data
-- Run this if you're getting "theme node not found" errors

-- Create tables if they don't exist (safe version)
CREATE TABLE IF NOT EXISTS theme_circles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'archived', 'dissipated')),
  created_by UUID REFERENCES community(id),
  origin_type TEXT NOT NULL CHECK (origin_type IN ('admin', 'search', 'behavior', 'event')),
  activity_score INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  x REAL,
  y REAL,
  cta_text TEXT,
  cta_link TEXT
);

CREATE TABLE IF NOT EXISTS theme_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES theme_circles(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  engagement_level TEXT NOT NULL DEFAULT 'interested'
    CHECK (engagement_level IN ('hover', 'interested', 'active', 'proposing')),
  signals TEXT[] DEFAULT '{}',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(theme_id, community_id)
);

-- Enable RLS if not already enabled
ALTER TABLE theme_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_participants ENABLE ROW LEVEL SECURITY;

-- Create policies if they don't exist
DO $$ 
BEGIN
  -- Check if policy exists before creating
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'theme_circles' 
    AND policyname = 'Public read access to active themes'
  ) THEN
    CREATE POLICY "Public read access to active themes"
      ON theme_circles FOR SELECT
      USING (status = 'active');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'theme_participants' 
    AND policyname = 'Public read access to participants'
  ) THEN
    CREATE POLICY "Public read access to participants"
      ON theme_participants FOR SELECT
      USING (true);
  END IF;
END $$;

-- Clear any existing demo themes to avoid conflicts
DELETE FROM theme_circles WHERE origin_type = 'admin' AND title LIKE '%Test Theme%';

-- Insert minimal test themes for the synapse graph
INSERT INTO theme_circles (
  title,
  description,
  tags,
  expires_at,
  origin_type,
  activity_score,
  status
) VALUES 
(
  'AI & Machine Learning',
  'Exploring artificial intelligence and machine learning applications',
  ARRAY['ai', 'machine-learning', 'data-science'],
  NOW() + INTERVAL '30 days',
  'admin',
  5,
  'active'
),
(
  'Web Development',
  'Building modern web applications and services',
  ARRAY['web', 'javascript', 'react', 'nodejs'],
  NOW() + INTERVAL '30 days',
  'admin',
  8,
  'active'
),
(
  'Startup Ideas',
  'Brainstorming and developing new startup concepts',
  ARRAY['startup', 'entrepreneurship', 'innovation'],
  NOW() + INTERVAL '30 days',
  'admin',
  3,
  'active'
);

-- Verify the setup
SELECT 
  'theme_circles' as table_name,
  COUNT(*) as row_count,
  COUNT(*) FILTER (WHERE status = 'active') as active_count
FROM theme_circles
UNION ALL
SELECT 
  'theme_participants' as table_name,
  COUNT(*) as row_count,
  NULL as active_count
FROM theme_participants;

-- Success message
DO $$ 
BEGIN
  RAISE NOTICE '✅ Theme circles quick fix applied!';
  RAISE NOTICE 'Created tables: theme_circles, theme_participants';
  RAISE NOTICE 'Added 3 test themes for synapse visualization';
  RAISE NOTICE 'Refresh your dashboard to see the changes';
END $$;