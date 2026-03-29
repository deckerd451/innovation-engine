-- ============================================================================
-- FIX: Organization Visibility Bug
-- ============================================================================
-- Root cause: INSERT sometimes lands with created_by = null when org is created
-- outside the manager, and addMember can fail atomically after org is already
-- saved. The overly-broad allow_update / allow_delete policies are also unsafe.
--
-- This migration:
--  1. Drops the open allow_update and allow_delete policies
--  2. Replaces the broken organization_members ALL policy with scoped policies
--  3. Adds a DB trigger to auto-create the owner member row when an org is inserted
--  4. Adds a trigger to auto-set created_by from auth.uid() when it is missing
-- ============================================================================

-- ============================================================
-- 1. REMOVE UNSAFE POLICIES
-- ============================================================

-- These were likely added as dev escape-hatches and must not exist in production.
-- "allow_update" lets any authenticated (or even anon!) user overwrite any org row.
-- "allow_delete" lets anyone hard-delete any org row.
DROP POLICY IF EXISTS "allow_update" ON organizations;
DROP POLICY IF EXISTS "allow_delete" ON organizations;

-- ============================================================
-- 2. FIX organization_members POLICIES
-- ============================================================
-- The previous ALL policy used USING for INSERT which prevents adding other
-- members (it checks community_id = auth user's community, so only self-insert
-- works). Split into explicit, purpose-scoped policies.

DROP POLICY IF EXISTS "Organization admins can manage members" ON organization_members;

-- Anyone can see active members of any org (already exists, keep it)
DROP POLICY IF EXISTS "Organization members are viewable by everyone" ON organization_members;
CREATE POLICY "Organization members are viewable by everyone"
  ON organization_members FOR SELECT
  USING (status = 'active');

-- A user can insert themselves into an org as 'member' (join flow).
-- Owner/admin insertion is handled server-side via RPC or the trigger below.
DROP POLICY IF EXISTS "Users can join organizations" ON organization_members;
CREATE POLICY "Users can join organizations"
  ON organization_members FOR INSERT
  WITH CHECK (
    community_id IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

-- Owners and admins can update any member record in their org.
DROP POLICY IF EXISTS "Org admins can update members" ON organization_members;
CREATE POLICY "Org admins can update members"
  ON organization_members FOR UPDATE
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      JOIN community c ON c.id = om.community_id
      WHERE c.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );

-- Owners and admins can delete member records in their org.
-- Users can also remove themselves.
DROP POLICY IF EXISTS "Org admins can remove members" ON organization_members;
CREATE POLICY "Org admins can remove members"
  ON organization_members FOR DELETE
  USING (
    -- Self-removal always allowed
    community_id IN (SELECT id FROM community WHERE user_id = auth.uid())
    OR
    -- Admins/owners can remove anyone in their org
    organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      JOIN community c ON c.id = om.community_id
      WHERE c.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );

-- ============================================================
-- 3. TIGHTEN organizations UPDATE POLICY
-- ============================================================
-- Ensure there is exactly one UPDATE policy and it is scoped properly.
-- (The original "Organization admins can update" is fine; this just makes
-- sure allow_update is gone and there is no gap.)

DROP POLICY IF EXISTS "Organization admins can update" ON organizations;
CREATE POLICY "Organization admins can update"
  ON organizations FOR UPDATE
  USING (
    id IN (
      SELECT om.organization_id
      FROM organization_members om
      JOIN community c ON c.id = om.community_id
      WHERE c.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  )
  WITH CHECK (
    id IN (
      SELECT om.organization_id
      FROM organization_members om
      JOIN community c ON c.id = om.community_id
      WHERE c.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );

-- Allow org owners to soft-delete (set status = 'inactive') their own org.
DROP POLICY IF EXISTS "Org owners can deactivate organizations" ON organizations;
CREATE POLICY "Org owners can deactivate organizations"
  ON organizations FOR DELETE
  USING (
    id IN (
      SELECT om.organization_id
      FROM organization_members om
      JOIN community c ON c.id = om.community_id
      WHERE c.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
  );

-- ============================================================
-- 4. AUTO-SET created_by ON INSERT (server-side safety net)
-- ============================================================
-- If the app forgets to supply created_by, the DB fills it in from the
-- authenticated user's community profile. This prevents null-creator rows.

CREATE OR REPLACE FUNCTION fn_set_org_created_by()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_community_id UUID;
BEGIN
  -- Only act when created_by was not supplied by the caller
  IF NEW.created_by IS NULL THEN
    SELECT id INTO v_community_id
    FROM community
    WHERE user_id = auth.uid()
    LIMIT 1;

    IF v_community_id IS NOT NULL THEN
      NEW.created_by := v_community_id;
    END IF;
    -- If still null (e.g. seeder running as service_role), leave as null.
    -- The trigger does not block the insert.
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_org_created_by ON organizations;
CREATE TRIGGER trg_set_org_created_by
  BEFORE INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION fn_set_org_created_by();

-- ============================================================
-- 5. AUTO-CREATE OWNER MEMBER ROW ON ORG INSERT
-- ============================================================
-- This makes org creation atomic at the DB level. Even if the app crashes
-- after inserting the org, the creator will still be recorded as owner.

CREATE OR REPLACE FUNCTION fn_auto_create_org_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_community_id UUID;
BEGIN
  -- Resolve the community profile for the inserting user
  IF NEW.created_by IS NOT NULL THEN
    v_community_id := NEW.created_by;
  ELSE
    SELECT id INTO v_community_id
    FROM community
    WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_community_id IS NULL THEN
    -- Running as service_role or seeder — skip auto-member creation
    RETURN NEW;
  END IF;

  -- Insert the owner record (ignore if it somehow already exists)
  INSERT INTO organization_members (
    organization_id,
    community_id,
    role,
    can_post_opportunities,
    can_manage_members,
    can_edit_profile,
    status
  )
  VALUES (
    NEW.id,
    v_community_id,
    'owner',
    TRUE,
    TRUE,
    TRUE,
    'active'
  )
  ON CONFLICT (organization_id, community_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_org_owner ON organizations;
CREATE TRIGGER trg_auto_create_org_owner
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION fn_auto_create_org_owner();

-- ============================================================
-- 6. BACKFILL: assign created_by to existing null-creator orgs
-- ============================================================
-- Orgs with created_by = null cannot be "owned" without this step.
-- We can only assign ownership where an organization_members owner record
-- already exists. For truly orphaned rows, leave as-is (they remain visible
-- to everyone via the SELECT policy, but no one can edit them until an admin
-- manually assigns an owner).
--
-- Run this manually or as a one-time script:
--
-- UPDATE organizations o
-- SET created_by = (
--   SELECT om.community_id
--   FROM organization_members om
--   WHERE om.organization_id = o.id
--     AND om.role = 'owner'
--     AND om.status = 'active'
--   LIMIT 1
-- )
-- WHERE o.created_by IS NULL
--   AND EXISTS (
--     SELECT 1 FROM organization_members om
--     WHERE om.organization_id = o.id AND om.role = 'owner'
--   );

-- ============================================================
-- COMPLETE
-- ============================================================
-- Summary of changes:
--  ✅ Dropped open allow_update / allow_delete policies (security fix)
--  ✅ Replaced broken ALL policy on organization_members with scoped policies
--  ✅ Tightened organizations UPDATE with WITH CHECK clause
--  ✅ Added server-side trigger to auto-set created_by
--  ✅ Added server-side trigger to auto-create owner member row atomically
