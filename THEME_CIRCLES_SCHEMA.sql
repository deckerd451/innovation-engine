-- ================================================================
-- CharlestonHacks Innovation Engine - Theme/Idea Circles Schema
-- ================================================================
--
-- Theme Circles are temporary gravitational fields that represent
-- moments in time where attention, intent, and people briefly align.
--
-- They are NOT:
-- - Static groups
-- - Permanent features
-- - Channels or forums
--
-- They ARE:
-- - Temporary coordination spaces
-- - Signals of emerging collaboration
-- - Low-friction alignment mechanisms
--
-- ================================================================

-- Theme Circles Table
CREATE TABLE IF NOT EXISTS theme_circles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
CREATE INDEX IF NOT EXISTS idx_theme_circles_active
  ON theme_circles(status, expires_at)
  WHERE status = 'active';

-- Index for creator lookups
CREATE INDEX IF NOT EXISTS idx_theme_circles_creator
  ON theme_circles(created_by);

-- ================================================================
-- Theme Participants Table
-- ================================================================

CREATE TABLE IF NOT EXISTS theme_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
CREATE INDEX IF NOT EXISTS idx_theme_participants_theme
  ON theme_participants(theme_id, engagement_level);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_theme_participants_user
  ON theme_participants(community_id);

-- ================================================================
-- Theme Actions Table (for coordination nudges)
-- ================================================================

CREATE TABLE IF NOT EXISTS theme_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
-- This function automatically transitions themes based on time/activity

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
-- Updates activity score when participants engage

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
  USING (status = 'active' OR created_by = auth.uid());

-- Only admins and creators can update themes
CREATE POLICY "Creators can update their themes"
  ON theme_circles FOR UPDATE
  USING (created_by = auth.uid());

-- Admins can insert themes (handled by app logic)
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
    EXISTS (
      SELECT 1 FROM community
      WHERE community.user_id = auth.uid()
      AND community.id = theme_participants.community_id
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

-- View: Active themes with participant counts
CREATE OR REPLACE VIEW active_themes_summary AS
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
-- Sample Data (for testing)
-- ================================================================

-- Insert a sample admin-seeded theme
-- INSERT INTO theme_circles (
--   title,
--   description,
--   tags,
--   expires_at,
--   origin_type,
--   created_by
-- ) VALUES (
--   'AI in Healthcare - Grant Matchmaking',
--   'NSF Smart Health grant cycle - connect with researchers and practitioners working on AI applications in healthcare',
--   ARRAY['ai', 'healthcare', 'grant', 'research'],
--   NOW() + INTERVAL '30 days',
--   'admin',
--   -- Replace with actual admin user ID
--   '00000000-0000-0000-0000-000000000000'
-- );

-- ================================================================
-- Migration Notes
-- ================================================================
--
-- To apply this schema:
-- 1. Connect to your Supabase database
-- 2. Run this SQL in the SQL editor
-- 3. Verify tables are created
-- 4. Test with sample data
--
-- To schedule auto-decay:
-- Use Supabase Database Webhooks or pg_cron:
-- SELECT cron.schedule('decay-themes', '0 * * * *', 'SELECT decay_theme_circles()');
--
-- ================================================================
