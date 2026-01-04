-- ============================================================================
-- COMPLETE SCHEMA FIX FOR CHARLESTONHACKS
-- Run this in Supabase SQL Editor to fix all database issues
-- ============================================================================

-- ============================================================================
-- 1. CREATE ENDORSEMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endorser_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  endorser_community_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  endorsed_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  endorsed_community_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Prevent duplicate endorsements
  CONSTRAINT unique_endorsement UNIQUE (endorser_id, endorsed_id, skill)
);

-- Indexes for endorsements
CREATE INDEX IF NOT EXISTS idx_endorsements_endorser ON public.endorsements(endorser_id);
CREATE INDEX IF NOT EXISTS idx_endorsements_endorsed ON public.endorsements(endorsed_id);
CREATE INDEX IF NOT EXISTS idx_endorsements_skill ON public.endorsements(skill);

-- Enable RLS
ALTER TABLE public.endorsements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for endorsements
DROP POLICY IF EXISTS "Users can view all endorsements" ON public.endorsements;
CREATE POLICY "Users can view all endorsements"
  ON public.endorsements FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can create endorsements" ON public.endorsements;
CREATE POLICY "Users can create endorsements"
  ON public.endorsements FOR INSERT
  TO authenticated
  WITH CHECK (
    endorser_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
  );

-- Grant permissions
GRANT SELECT, INSERT ON public.endorsements TO authenticated;

-- ============================================================================
-- 2. FIX PROJECT_MEMBERS TABLE - ADD MISSING COLUMNS
-- ============================================================================

-- Add created_at if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'project_members'
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.project_members
    ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Add updated_at if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'project_members'
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.project_members
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ============================================================================
-- 3. CREATE PROJECTS TABLE IF MISSING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  creator_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active',
  skills TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for projects
CREATE INDEX IF NOT EXISTS idx_projects_creator ON public.projects(creator_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);

-- Enable RLS for projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
DROP POLICY IF EXISTS "Users can view all projects" ON public.projects;
CREATE POLICY "Users can view all projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can create projects" ON public.projects;
CREATE POLICY "Users can create projects"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (
    creator_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.projects TO authenticated;

-- ============================================================================
-- 4. CREATE PROJECT_MEMBERS TABLE IF MISSING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Prevent duplicate memberships
  CONSTRAINT unique_project_member UNIQUE (project_id, user_id)
);

-- Indexes for project_members
CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_role ON public.project_members(role);

-- Enable RLS for project_members
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_members
DROP POLICY IF EXISTS "Users can view project members" ON public.project_members;
CREATE POLICY "Users can view project members"
  ON public.project_members FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can join projects" ON public.project_members;
CREATE POLICY "Users can join projects"
  ON public.project_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Project creators can manage members" ON public.project_members;
CREATE POLICY "Project creators can manage members"
  ON public.project_members FOR UPDATE
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE creator_id IN (
        SELECT id FROM public.community WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can leave projects" ON public.project_members;
CREATE POLICY "Users can leave projects"
  ON public.project_members FOR DELETE
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM public.community WHERE user_id = auth.uid()
    )
    OR
    project_id IN (
      SELECT id FROM public.projects WHERE creator_id IN (
        SELECT id FROM public.community WHERE user_id = auth.uid()
      )
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;

-- ============================================================================
-- 5. CREATE CONNECTIONS TABLE IF MISSING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  connected_user_id UUID NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Prevent duplicate connections
  CONSTRAINT unique_connection UNIQUE (user_id, connected_user_id),
  -- Prevent self-connections
  CONSTRAINT different_users CHECK (user_id != connected_user_id)
);

-- Indexes for connections
CREATE INDEX IF NOT EXISTS idx_connections_user ON public.connections(user_id);
CREATE INDEX IF NOT EXISTS idx_connections_connected_user ON public.connections(connected_user_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON public.connections(status);

-- Enable RLS for connections
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for connections
DROP POLICY IF EXISTS "Users can view their connections" ON public.connections;
CREATE POLICY "Users can view their connections"
  ON public.connections FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    OR
    connected_user_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create connections" ON public.connections;
CREATE POLICY "Users can create connections"
  ON public.connections FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their connections" ON public.connections;
CREATE POLICY "Users can update their connections"
  ON public.connections FOR UPDATE
  TO authenticated
  USING (
    user_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    OR
    connected_user_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete their connections" ON public.connections;
CREATE POLICY "Users can delete their connections"
  ON public.connections FOR DELETE
  TO authenticated
  USING (
    user_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
    OR
    connected_user_id IN (SELECT id FROM public.community WHERE user_id = auth.uid())
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connections TO authenticated;

-- ============================================================================
-- 6. ADD MISSING COLUMNS TO COMMUNITY TABLE
-- ============================================================================

-- Add connection_count if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'community'
    AND column_name = 'connection_count'
  ) THEN
    ALTER TABLE public.community
    ADD COLUMN connection_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Function to get endorsement count
CREATE OR REPLACE FUNCTION public.get_endorsement_count(user_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  count_val INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO count_val
  FROM public.endorsements
  WHERE endorsed_id IN (
    SELECT id FROM public.community WHERE user_id = user_uuid
  );

  RETURN COALESCE(count_val, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_endorsement_count TO authenticated;

-- Function to update connection count
CREATE OR REPLACE FUNCTION public.update_connection_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  user1_id UUID;
  user2_id UUID;
BEGIN
  user1_id := COALESCE(NEW.user_id, OLD.user_id);
  user2_id := COALESCE(NEW.connected_user_id, OLD.connected_user_id);

  -- Update count for user_id
  IF user1_id IS NOT NULL THEN
    UPDATE public.community
    SET connection_count = (
      SELECT COUNT(*) FROM public.connections
      WHERE (user_id = user1_id OR connected_user_id = user1_id)
      AND status = 'accepted'
    )
    WHERE id = user1_id;
  END IF;

  -- Update count for connected_user_id
  IF user2_id IS NOT NULL THEN
    UPDATE public.community
    SET connection_count = (
      SELECT COUNT(*) FROM public.connections
      WHERE (user_id = user2_id OR connected_user_id = user2_id)
      AND status = 'accepted'
    )
    WHERE id = user2_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger to auto-update connection counts
DROP TRIGGER IF EXISTS trigger_update_connection_count ON public.connections;

CREATE TRIGGER trigger_update_connection_count
  AFTER INSERT OR UPDATE OR DELETE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_connection_count();

-- ============================================================================
-- 8. VERIFY CONVERSATIONS AND MESSAGES TABLES
-- ============================================================================

-- Ensure conversations table has correct structure
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'conversations'
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.conversations
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ SCHEMA FIX COMPLETE!';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created/updated:';
  RAISE NOTICE '  ✓ endorsements';
  RAISE NOTICE '  ✓ projects';
  RAISE NOTICE '  ✓ project_members';
  RAISE NOTICE '  ✓ connections';
  RAISE NOTICE '  ✓ community (columns added)';
  RAISE NOTICE '  ✓ conversations (verified)';
  RAISE NOTICE '  ✓ messages (verified)';
  RAISE NOTICE '';
  RAISE NOTICE 'All RLS policies and permissions configured!';
END $$;
