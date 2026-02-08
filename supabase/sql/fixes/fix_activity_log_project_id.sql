-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================


-- ================================================================
-- FIX: Add project_id generated column to activity_log
-- ================================================================
-- Extracts project_id from JSONB details column for efficient querying
-- Safe: Non-destructive, adds indexes for performance
-- ================================================================

-- Add generated column (extracts UUID from details->>'project_id')
ALTER TABLE activity_log 
ADD COLUMN IF NOT EXISTS project_id UUID 
GENERATED ALWAYS AS ((details->>'project_id')::uuid) STORED;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS activity_log_project_id_idx 
  ON activity_log (project_id);

CREATE INDEX IF NOT EXISTS activity_log_created_at_idx 
  ON activity_log (created_at);

-- Verify
SELECT 
  'activity_log.project_id column added' AS status,
  COUNT(*) AS rows_with_project_id
FROM activity_log
WHERE project_id IS NOT NULL;
