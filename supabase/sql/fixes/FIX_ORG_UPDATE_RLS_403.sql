-- ============================================================================
-- FIX: 403 on organizations PATCH (update/soft-delete)
-- ============================================================================
-- Symptom:
--   PATCH /rest/v1/organizations?id=eq.<uuid> → 403
--   "new row violates row-level security policy for table organizations"
--   Error code: 42501
--
-- Cause:
--   The "Organization admins can update" policy in FIX_ORG_VISIBILITY_BUG.sql
--   included an explicit WITH CHECK clause. PostgreSQL evaluates WITH CHECK
--   against the NEW row values. When the update sets status = 'inactive',
--   the WITH CHECK subquery runs in that context and can return no rows,
--   causing the 403 even for legitimate owners/admins.
--
-- Fix:
--   Drop the WITH CHECK. PostgreSQL automatically applies the USING expression
--   as WITH CHECK when no explicit WITH CHECK is defined. Since organization
--   id never changes in an update, the USING check (owner/admin membership)
--   passes identically for both old and new rows.
--
-- Run this in the Supabase SQL editor.
-- ============================================================================

DROP POLICY IF EXISTS "Organization admins can update" ON organizations;

CREATE POLICY "Organization admins can update"
  ON organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM organization_members om
      JOIN community c ON c.id = om.community_id
      WHERE om.organization_id = organizations.id
        AND c.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );
-- No WITH CHECK — PostgreSQL reuses USING automatically.
-- EXISTS is used instead of id IN (...) for clarity and index efficiency.
