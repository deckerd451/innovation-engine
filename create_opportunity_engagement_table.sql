-- ================================================================
-- CREATE OPPORTUNITY_ENGAGEMENT TABLE
-- ================================================================
-- Run this in Supabase SQL Editor

-- Create opportunity_engagement table
CREATE TABLE IF NOT EXISTS public.opportunity_engagement (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('join', 'bookmark', 'click')),
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate engagements
  UNIQUE(user_id, opportunity_id, action)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_opp_engagement_user 
  ON public.opportunity_engagement(user_id);
  
CREATE INDEX IF NOT EXISTS idx_opp_engagement_opp 
  ON public.opportunity_engagement(opportunity_id);
  
CREATE INDEX IF NOT EXISTS idx_opp_engagement_created 
  ON public.opportunity_engagement(created_at DESC);

-- Enable RLS
ALTER TABLE public.opportunity_engagement ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read all engagements
CREATE POLICY "Users can view all engagements"
  ON public.opportunity_engagement
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Users can insert their own engagements
CREATE POLICY "Users can track their own engagements"
  ON public.opportunity_engagement
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = (
      SELECT user_id 
      FROM public.community 
      WHERE id = opportunity_engagement.user_id 
      LIMIT 1
    )
  );

-- Policy: Users can update their own engagements
CREATE POLICY "Users can update their own engagements"
  ON public.opportunity_engagement
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = (
      SELECT user_id 
      FROM public.community 
      WHERE id = opportunity_engagement.user_id 
      LIMIT 1
    )
  );

-- Add comment
COMMENT ON TABLE public.opportunity_engagement IS 
  'Tracks user engagement with opportunities (join, bookmark, click actions)';

-- Verify table was created
SELECT 
  'opportunity_engagement table created successfully' AS status,
  COUNT(*) AS row_count 
FROM public.opportunity_engagement;
