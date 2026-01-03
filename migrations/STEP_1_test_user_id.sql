DO $$
BEGIN
  RAISE NOTICE '🔍 Testing: Checking if user_id column exists...';

  PERFORM column_name
  FROM information_schema.columns
  WHERE table_name = 'community'
    AND column_name = 'user_id';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_id column does not exist in community table!';
  END IF;

  RAISE NOTICE '✅ user_id column exists';
END $$;
