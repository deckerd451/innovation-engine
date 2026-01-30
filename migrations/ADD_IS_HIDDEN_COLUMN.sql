-- Add is_hidden column to community table
-- This allows admins to hide users from the community view

ALTER TABLE community 
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_community_is_hidden ON community(is_hidden);

-- Add comment
COMMENT ON COLUMN community.is_hidden IS 'When true, user is hidden from community searches and views (admin only)';
