-- ================================================================
-- FIX: Personal Opportunity RLS Policies
-- ================================================================
-- Allows community members to create and manage their own
-- opportunities directly (without requiring org membership).
-- Previously only org members with can_post_opportunities could
-- insert/update, blocking individual community members.
-- ================================================================

-- Allow community members to post personal opportunities
-- (not tied to an organization)
DROP POLICY IF EXISTS "Community members can post personal opportunities" ON opportunities;
CREATE POLICY "Community members can post personal opportunities"
  ON opportunities FOR INSERT
  WITH CHECK (
    posted_by IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
    AND organization_id IS NULL
  );

-- Allow opportunity creators to update their own opportunities
DROP POLICY IF EXISTS "Opportunity creators can update their own" ON opportunities;
CREATE POLICY "Opportunity creators can update their own"
  ON opportunities FOR UPDATE
  USING (
    posted_by IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );

-- Allow opportunity creators to delete (soft-close) their own opportunities
DROP POLICY IF EXISTS "Opportunity creators can delete their own" ON opportunities;
CREATE POLICY "Opportunity creators can delete their own"
  ON opportunities FOR DELETE
  USING (
    posted_by IN (
      SELECT id FROM community WHERE user_id = auth.uid()
    )
  );
