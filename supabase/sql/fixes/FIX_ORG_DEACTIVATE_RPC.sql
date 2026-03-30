-- ============================================================================
-- RPC: deactivate_organization
-- ============================================================================
-- Called by node-panel.js window._deleteOrgFromPanel() to soft-delete an org.
--
-- Uses SECURITY DEFINER so it runs as postgres and bypasses RLS on the
-- organizations UPDATE. Authorization is enforced explicitly inside the
-- function body — only the owner's community profile can trigger this.
--
-- Run once in the Supabase SQL Editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION deactivate_organization(org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
BEGIN
  -- Resolve the caller's community profile from their auth session
  SELECT id INTO v_community_id
  FROM community
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only owners can deactivate
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND community_id    = v_community_id
      AND role            = 'owner'
      AND status          = 'active'
  ) THEN
    RAISE EXCEPTION 'Permission denied: only the owner can remove this organization';
  END IF;

  UPDATE organizations
  SET status     = 'inactive',
      updated_at = NOW()
  WHERE id = org_id;
END;
$$;
