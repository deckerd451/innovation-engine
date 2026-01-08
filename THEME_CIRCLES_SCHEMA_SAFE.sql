-- ================================================================
-- CharlestonHacks Innovation Engine - Theme/Idea Circles Schema
-- SAFE VERSION - Drops existing tables first
-- ================================================================
--
-- This version safely handles existing tables by dropping them first.
-- USE WITH CAUTION: This will delete existing theme circle data!
--
-- If you want to preserve data, use a migration approach instead.
-- ================================================================

-- Drop existing objects (in correct order due to dependencies)
DROP VIEW IF EXISTS active_themes_summary;
DROP TRIGGER IF EXISTS theme_participant_activity ON theme_participants;
DROP FUNCTION IF EXISTS update_theme_activity();
DROP FUNCTION IF EXISTS decay_theme_circles();
DROP TABLE IF EXISTS theme_actions CASCADE;
DROP TABLE IF EXISTS theme_participants CASCADE;
DROP TABLE IF EXISTS theme_circles CASCADE;

-- ================================================================
-- Theme Circles Table
-- ================================================================

CREATE TABLE theme_circles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',

  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'archived', 'dissipated')),

  -- Origin tracking
  created_by UUID REFERENCES community(id),
  origin_type TEXT NOT NULL CHECK (origin_type IN ('admin', 'search', 'behavior', 'event')),

  -- Engagement metrics
  activity_score INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),

  -- Visual positioning (for synapse visualization)
  x REAL,
  y REAL,

  -- Optional call-to-action
  cta_text TEXT,
  cta_link TEXT
);

-- Index for active themes
CREATE INDEX idx_theme_circles_active
  ON theme_circles(status, expires_at)
  WHERE status = 'active';

-- Index for creator lookups
CREATE INDEX idx_theme_circles_creator
  ON theme_circles(created_by);

-- ================================================================
-- Theme Participants Table
-- ================================================================

CREATE TABLE theme_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES theme_circles(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES community(id) ON DELETE CASCADE,

  -- Engagement levels: hover | interested | active | proposing
  engagement_level TEXT NOT NULL DEFAULT 'interested'
    CHECK (engagement_level IN ('hover', 'interested', 'active', 'proposing')),

  -- Signals (users can set multiple)
  signals TEXT[] DEFAULT '{}',  -- e.g. ['available', 'seeking-collaborators', 'has-expertise']

  -- Timestamps
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicates
  UNIQUE(theme_id, community_id)
);

-- Index for theme lookups
CREATE INDEX idx_theme_participants_theme
  ON theme_participants(theme_id, engagement_level);

-- Index for user lookups
CREATE INDEX idx_theme_participants_user
  ON theme_participants(community_id);

-- ================================================================
-- Theme Actions Table (for coordination nudges)
-- ================================================================

CREATE TABLE theme_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES theme_circles(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES community(id),

  action_type TEXT NOT NULL CHECK (action_type IN (
    'propose_project',
    'schedule_session',
    'draft_outline',
    'signal_availability'
  )),

  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- ================================================================
-- Auto-Decay Function (runs periodically)
-- ================================================================

CREATE OR REPLACE FUNCTION decay_theme_circles()
RETURNS void AS $$
BEGIN
  -- Mark expired themes as dissipated (if no significant activity)
  UPDATE theme_circles
  SET status = 'dissipated'
  WHERE status = 'active'
    AND expires_at < NOW()
    AND activity_score < 10;

  -- Archive expired themes with some activity
  UPDATE theme_circles
  SET status = 'archived'
  WHERE status = 'active'
    AND expires_at < NOW()
    AND activity_score >= 10;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- Activity Update Function
-- ================================================================

CREATE OR REPLACE FUNCTION update_theme_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE theme_circles
  SET
    activity_score = activity_score + 1,
    last_activity_at = NOW()
  WHERE id = NEW.theme_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on participant joins
CREATE TRIGGER theme_participant_activity
  AFTER INSERT OR UPDATE ON theme_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_theme_activity();

-- ================================================================
-- RLS Policies (Row Level Security)
-- ================================================================

-- Enable RLS
ALTER TABLE theme_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_actions ENABLE ROW LEVEL SECURITY;

-- Everyone can view active themes
CREATE POLICY "Public read access to active themes"
  ON theme_circles FOR SELECT
  USING (status = 'active' OR created_by IN (
    SELECT id FROM community WHERE user_id = auth.uid()
  ));

-- Only creators can update themes (or admins in your app logic)
CREATE POLICY "Creators can update their themes"
  ON theme_circles FOR UPDATE
  USING (created_by IN (
    SELECT id FROM community WHERE user_id = auth.uid()
  ));

-- Authenticated users can create themes
CREATE POLICY "Authenticated users can create themes"
  ON theme_circles FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Participants policies
CREATE POLICY "Public read access to participants"
  ON theme_participants FOR SELECT
  USING (true);

CREATE POLICY "Users can join themes"
  ON theme_participants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their participation"
  ON theme_participants FOR UPDATE
  USING (
    community_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

-- Actions policies
CREATE POLICY "Public read access to theme actions"
  ON theme_actions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can propose actions"
  ON theme_actions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ================================================================
-- Helpful Views
-- ================================================================

CREATE VIEW active_themes_summary AS
SELECT
  tc.id,
  tc.title,
  tc.description,
  tc.tags,
  tc.created_at,
  tc.expires_at,
  tc.activity_score,
  tc.origin_type,
  COUNT(DISTINCT tp.community_id) as participant_count,
  COUNT(DISTINCT CASE WHEN tp.engagement_level IN ('active', 'proposing') THEN tp.community_id END) as active_count
FROM theme_circles tc
LEFT JOIN theme_participants tp ON tc.id = tp.theme_id
WHERE tc.status = 'active'
  AND tc.expires_at > NOW()
GROUP BY tc.id;

-- ================================================================
-- Success Message
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Theme Circles schema created successfully!';
  RAISE NOTICE 'Tables: theme_circles, theme_participants, theme_actions';
  RAISE NOTICE 'Functions: decay_theme_circles(), update_theme_activity()';
  RAISE NOTICE 'View: active_themes_summary';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Next steps:';
  RAISE NOTICE '1. Test with: SELECT * FROM active_themes_summary;';
  RAISE NOTICE '2. Create a test theme from the admin UI';
  RAISE NOTICE '3. Verify with: SELECT * FROM theme_circles;';
END $$;
