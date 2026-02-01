-- Unified Network Discovery Schema
-- Creates tables for presence tracking, node interactions, and discovery dismissals
-- Version: 1.0.0
-- Date: 2026-02-01

-- ============================================================================
-- 1. PRESENCE_SESSIONS TABLE
-- ============================================================================
-- Tracks ephemeral real-time presence energy for nodes
-- TTL-based with automatic cleanup

CREATE TABLE IF NOT EXISTS presence_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL CHECK (context_type IN ('theme', 'project', 'profile', 'general')),
  context_id UUID NOT NULL,
  energy DECIMAL(3,2) NOT NULL CHECK (energy >= 0 AND energy <= 1),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient presence queries
CREATE INDEX IF NOT EXISTS idx_presence_active 
  ON presence_sessions(user_id, expires_at) 
  WHERE expires_at > NOW();

CREATE INDEX IF NOT EXISTS idx_presence_context 
  ON presence_sessions(context_type, context_id);

CREATE INDEX IF NOT EXISTS idx_presence_expires 
  ON presence_sessions(expires_at);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_presence_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER presence_sessions_updated_at
  BEFORE UPDATE ON presence_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_presence_sessions_updated_at();

-- Function to clean up expired presence sessions
CREATE OR REPLACE FUNCTION cleanup_expired_presence_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM presence_sessions
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comment on table
COMMENT ON TABLE presence_sessions IS 'Tracks ephemeral real-time presence energy for nodes with TTL-based expiration';
COMMENT ON COLUMN presence_sessions.energy IS 'Presence energy value [0, 1]';
COMMENT ON COLUMN presence_sessions.expires_at IS 'TTL expiration timestamp';
COMMENT ON COLUMN presence_sessions.context_type IS 'Type of context: theme, project, profile, or general';
COMMENT ON COLUMN presence_sessions.context_id IS 'ID of the context (theme_id, project_id, user_id, etc.)';

-- ============================================================================
-- 2. NODE_INTERACTIONS TABLE
-- ============================================================================
-- Tracks user interactions with nodes for relevance scoring

CREATE TABLE IF NOT EXISTS node_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  node_id UUID NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN ('person', 'project', 'theme', 'organization')),
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('view', 'tap', 'connect', 'dismiss', 'focus', 'explore')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient interaction queries
CREATE INDEX IF NOT EXISTS idx_interactions_user 
  ON node_interactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interactions_node 
  ON node_interactions(node_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interactions_user_node 
  ON node_interactions(user_id, node_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interactions_type 
  ON node_interactions(interaction_type, created_at DESC);

-- Function to get recent interactions for a user
CREATE OR REPLACE FUNCTION get_recent_interactions(
  p_user_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  node_id UUID,
  node_type TEXT,
  interaction_type TEXT,
  interaction_count BIGINT,
  last_interaction TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ni.node_id,
    ni.node_type,
    ni.interaction_type,
    COUNT(*) as interaction_count,
    MAX(ni.created_at) as last_interaction
  FROM node_interactions ni
  WHERE ni.user_id = p_user_id
    AND ni.created_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY ni.node_id, ni.node_type, ni.interaction_type
  ORDER BY last_interaction DESC;
END;
$$ LANGUAGE plpgsql;

-- Comment on table
COMMENT ON TABLE node_interactions IS 'Tracks user interactions with nodes for relevance scoring and history';
COMMENT ON COLUMN node_interactions.node_type IS 'Type of node: person, project, theme, or organization';
COMMENT ON COLUMN node_interactions.interaction_type IS 'Type of interaction: view, tap, connect, dismiss, focus, or explore';
COMMENT ON COLUMN node_interactions.metadata IS 'Additional metadata about the interaction (JSON)';

-- ============================================================================
-- 3. DISCOVERY_DISMISSALS TABLE
-- ============================================================================
-- Tracks dismissed discovery nodes with cooldown period

CREATE TABLE IF NOT EXISTS discovery_dismissals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  node_id UUID NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN ('person', 'project', 'theme', 'organization')),
  dismissed_at TIMESTAMPTZ DEFAULT NOW(),
  reintroduce_after TIMESTAMPTZ NOT NULL,
  dismissal_reason TEXT,
  relevance_score_at_dismissal DECIMAL(3,2),
  presence_energy_at_dismissal DECIMAL(3,2),
  
  UNIQUE(user_id, node_id)
);

-- Indexes for efficient dismissal queries
CREATE INDEX IF NOT EXISTS idx_dismissals_reintroduce 
  ON discovery_dismissals(user_id, reintroduce_after);

CREATE INDEX IF NOT EXISTS idx_dismissals_user_node 
  ON discovery_dismissals(user_id, node_id);

CREATE INDEX IF NOT EXISTS idx_dismissals_active 
  ON discovery_dismissals(user_id, dismissed_at) 
  WHERE reintroduce_after > NOW();

-- Function to check if node is dismissed
CREATE OR REPLACE FUNCTION is_node_dismissed(
  p_user_id UUID,
  p_node_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  dismissal_record RECORD;
BEGIN
  SELECT * INTO dismissal_record
  FROM discovery_dismissals
  WHERE user_id = p_user_id
    AND node_id = p_node_id
    AND reintroduce_after > NOW();
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to dismiss a node
CREATE OR REPLACE FUNCTION dismiss_discovery_node(
  p_user_id UUID,
  p_node_id UUID,
  p_node_type TEXT,
  p_relevance_score DECIMAL(3,2) DEFAULT NULL,
  p_presence_energy DECIMAL(3,2) DEFAULT NULL,
  p_dismissal_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  dismissal_id UUID;
  cooldown_hours INTEGER := 24;
BEGIN
  -- Insert or update dismissal
  INSERT INTO discovery_dismissals (
    user_id,
    node_id,
    node_type,
    dismissed_at,
    reintroduce_after,
    dismissal_reason,
    relevance_score_at_dismissal,
    presence_energy_at_dismissal
  ) VALUES (
    p_user_id,
    p_node_id,
    p_node_type,
    NOW(),
    NOW() + (cooldown_hours || ' hours')::INTERVAL,
    p_dismissal_reason,
    p_relevance_score,
    p_presence_energy
  )
  ON CONFLICT (user_id, node_id) 
  DO UPDATE SET
    dismissed_at = NOW(),
    reintroduce_after = NOW() + (cooldown_hours || ' hours')::INTERVAL,
    dismissal_reason = p_dismissal_reason,
    relevance_score_at_dismissal = p_relevance_score,
    presence_energy_at_dismissal = p_presence_energy
  RETURNING id INTO dismissal_id;
  
  RETURN dismissal_id;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old dismissals
CREATE OR REPLACE FUNCTION cleanup_old_dismissals()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete dismissals older than 30 days
  DELETE FROM discovery_dismissals
  WHERE dismissed_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comment on table
COMMENT ON TABLE discovery_dismissals IS 'Tracks dismissed discovery nodes with 24-hour cooldown period';
COMMENT ON COLUMN discovery_dismissals.reintroduce_after IS 'Timestamp after which node can be reintroduced (dismissed_at + 24 hours)';
COMMENT ON COLUMN discovery_dismissals.relevance_score_at_dismissal IS 'Relevance score at time of dismissal for comparison';
COMMENT ON COLUMN discovery_dismissals.presence_energy_at_dismissal IS 'Presence energy at time of dismissal for comparison';

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE presence_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_dismissals ENABLE ROW LEVEL SECURITY;

-- Presence sessions policies
CREATE POLICY "Users can view their own presence sessions"
  ON presence_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own presence sessions"
  ON presence_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own presence sessions"
  ON presence_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own presence sessions"
  ON presence_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Node interactions policies
CREATE POLICY "Users can view their own interactions"
  ON node_interactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own interactions"
  ON node_interactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Discovery dismissals policies
CREATE POLICY "Users can view their own dismissals"
  ON discovery_dismissals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dismissals"
  ON discovery_dismissals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dismissals"
  ON discovery_dismissals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dismissals"
  ON discovery_dismissals FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 5. HELPER VIEWS
-- ============================================================================

-- View for active presence sessions
CREATE OR REPLACE VIEW active_presence_sessions AS
SELECT 
  ps.*,
  EXTRACT(EPOCH FROM (ps.expires_at - NOW())) as seconds_until_expiry
FROM presence_sessions ps
WHERE ps.expires_at > NOW()
ORDER BY ps.energy DESC, ps.expires_at ASC;

COMMENT ON VIEW active_presence_sessions IS 'Active presence sessions that have not expired';

-- View for recent interactions summary
CREATE OR REPLACE VIEW recent_interactions_summary AS
SELECT 
  user_id,
  node_id,
  node_type,
  COUNT(*) as total_interactions,
  MAX(created_at) as last_interaction,
  ARRAY_AGG(DISTINCT interaction_type) as interaction_types
FROM node_interactions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id, node_id, node_type;

COMMENT ON VIEW recent_interactions_summary IS 'Summary of interactions in the past 7 days';

-- ============================================================================
-- 6. MAINTENANCE FUNCTIONS
-- ============================================================================

-- Scheduled cleanup function (to be called by cron or scheduled job)
CREATE OR REPLACE FUNCTION unified_network_maintenance()
RETURNS TABLE (
  expired_presence_cleaned INTEGER,
  old_dismissals_cleaned INTEGER
) AS $$
DECLARE
  presence_count INTEGER;
  dismissal_count INTEGER;
BEGIN
  -- Clean up expired presence sessions
  presence_count := cleanup_expired_presence_sessions();
  
  -- Clean up old dismissals
  dismissal_count := cleanup_old_dismissals();
  
  RETURN QUERY SELECT presence_count, dismissal_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION unified_network_maintenance IS 'Maintenance function to clean up expired data. Should be run periodically (e.g., hourly)';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify tables exist
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'presence_sessions') THEN
    RAISE NOTICE '✅ presence_sessions table created';
  END IF;
  
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'node_interactions') THEN
    RAISE NOTICE '✅ node_interactions table created';
  END IF;
  
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'discovery_dismissals') THEN
    RAISE NOTICE '✅ discovery_dismissals table created';
  END IF;
END $$;

-- Show table sizes
SELECT 
  'presence_sessions' as table_name,
  COUNT(*) as row_count
FROM presence_sessions
UNION ALL
SELECT 
  'node_interactions' as table_name,
  COUNT(*) as row_count
FROM node_interactions
UNION ALL
SELECT 
  'discovery_dismissals' as table_name,
  COUNT(*) as row_count
FROM discovery_dismissals;
