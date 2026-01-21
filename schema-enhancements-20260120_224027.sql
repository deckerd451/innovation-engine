-- Production Readiness Schema Enhancements
-- Run this in your Supabase SQL editor

-- Activity tracking table (if not exists)
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES community(id),
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  target_user_id UUID REFERENCES community(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance metrics table (if not exists)
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES community(id),
  session_id TEXT,
  metric_type TEXT NOT NULL,
  metric_value NUMERIC,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User preferences table (if not exists)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES community(id),
  ui_preferences JSONB DEFAULT '{}',
  notification_settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_event_type ON activity_log(event_type);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_user_id ON performance_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_recorded_at ON performance_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_type ON performance_metrics(metric_type);

-- RLS Policies (if RLS is enabled)
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Activity log policies
CREATE POLICY IF NOT EXISTS "Users can view community activity" ON activity_log
  FOR SELECT USING (true); -- Public read for community activity

CREATE POLICY IF NOT EXISTS "Users can insert their own activity" ON activity_log
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

-- Performance metrics policies
CREATE POLICY IF NOT EXISTS "Users can view their own metrics" ON performance_metrics
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY IF NOT EXISTS "Users can insert their own metrics" ON performance_metrics
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

-- User preferences policies
CREATE POLICY IF NOT EXISTS "Users can manage their own preferences" ON user_preferences
  FOR ALL USING (auth.uid()::text = user_id::text);

-- Sample activity data for new communities
INSERT INTO activity_log (user_id, event_type, event_data) 
SELECT 
  id,
  'user_joined',
  jsonb_build_object('welcome', true)
FROM community 
WHERE id NOT IN (SELECT DISTINCT user_id FROM activity_log WHERE user_id IS NOT NULL)
LIMIT 5;

COMMIT;
