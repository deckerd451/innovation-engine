-- ============================================================================
-- CREATE THEME_PARTICIPANTS TABLE
-- ============================================================================
-- This table tracks which users participate in which themes

CREATE TABLE IF NOT EXISTS public.theme_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  theme_id UUID NOT NULL REFERENCES public.theme_circles(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  
  -- Engagement tracking
  engagement_level TEXT DEFAULT 'exploring', -- exploring, participating, leading
  signals TEXT, -- Additional engagement signals
  
  -- Timestamps
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate participations
  CONSTRAINT unique_theme_participation UNIQUE (theme_id, community_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_theme_participants_theme ON public.theme_participants(theme_id);
CREATE INDEX IF NOT EXISTS idx_theme_participants_community ON public.theme_participants(community_id);
CREATE INDEX IF NOT EXISTS idx_theme_participants_engagement ON public.theme_participants(engagement_level);

-- Enable RLS
ALTER TABLE public.theme_participants ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view all theme participants" ON public.theme_participants;
CREATE POLICY "Users can view all theme participants"
  ON public.theme_participants FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can join themes" ON public.theme_participants;
CREATE POLICY "Users can join themes"
  ON public.theme_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    community_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can leave themes" ON public.theme_participants;
CREATE POLICY "Users can leave themes"
  ON public.theme_participants FOR DELETE
  TO authenticated
  USING (
    community_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their participation" ON public.theme_participants;
CREATE POLICY "Users can update their participation"
  ON public.theme_participants FOR UPDATE
  TO authenticated
  USING (
    community_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.theme_participants TO authenticated;

-- ============================================================================
-- DONE
-- ============================================================================
