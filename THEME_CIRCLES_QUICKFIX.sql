-- ================================================================
-- Quick Fix for Existing Theme Circles Table
-- ================================================================
-- Use this if you already have a theme_circles table but it's
-- missing the status column or other fields.
--
-- This is safer than dropping the table if you have data.
-- ================================================================

-- Add status column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'theme_circles'
    AND column_name = 'status'
  ) THEN
    ALTER TABLE theme_circles
      ADD COLUMN status TEXT DEFAULT 'active'
      CHECK (status IN ('active', 'resolved', 'archived', 'dissipated'));
    RAISE NOTICE '✅ Added status column to theme_circles';
  ELSE
    RAISE NOTICE 'ℹ️  Status column already exists';
  END IF;
END $$;

-- Add other potentially missing columns
DO $$
BEGIN
  -- activity_score
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'theme_circles'
    AND column_name = 'activity_score'
  ) THEN
    ALTER TABLE theme_circles
      ADD COLUMN activity_score INTEGER DEFAULT 0;
    RAISE NOTICE '✅ Added activity_score column';
  END IF;

  -- last_activity_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'theme_circles'
    AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE theme_circles
      ADD COLUMN last_activity_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE '✅ Added last_activity_at column';
  END IF;

  -- x position
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'theme_circles'
    AND column_name = 'x'
  ) THEN
    ALTER TABLE theme_circles
      ADD COLUMN x REAL;
    RAISE NOTICE '✅ Added x column';
  END IF;

  -- y position
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'theme_circles'
    AND column_name = 'y'
  ) THEN
    ALTER TABLE theme_circles
      ADD COLUMN y REAL;
    RAISE NOTICE '✅ Added y column';
  END IF;

  -- cta_text
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'theme_circles'
    AND column_name = 'cta_text'
  ) THEN
    ALTER TABLE theme_circles
      ADD COLUMN cta_text TEXT;
    RAISE NOTICE '✅ Added cta_text column';
  END IF;

  -- cta_link
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'theme_circles'
    AND column_name = 'cta_link'
  ) THEN
    ALTER TABLE theme_circles
      ADD COLUMN cta_link TEXT;
    RAISE NOTICE '✅ Added cta_link column';
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_theme_circles_active
  ON theme_circles(status, expires_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_theme_circles_creator
  ON theme_circles(created_by);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Theme circles table updated successfully!';
  RAISE NOTICE '📝 Verify with: SELECT * FROM theme_circles;';
END $$;
