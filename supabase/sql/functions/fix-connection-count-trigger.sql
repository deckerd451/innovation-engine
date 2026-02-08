-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- Fix the connection count trigger to use correct column names
-- The connections table uses from_user_id and to_user_id, not user_id and connected_user_id

CREATE OR REPLACE FUNCTION public.update_connection_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  user1_id UUID;
  user2_id UUID;
BEGIN
  -- Get the user IDs from the correct column names
  user1_id := COALESCE(NEW.from_user_id, OLD.from_user_id);
  user2_id := COALESCE(NEW.to_user_id, OLD.to_user_id);

  -- Update count for from_user_id
  IF user1_id IS NOT NULL THEN
    UPDATE public.community
    SET connection_count = (
      SELECT COUNT(*) FROM public.connections
      WHERE (from_user_id = user1_id OR to_user_id = user1_id)
      AND status = 'accepted'
    )
    WHERE id = user1_id;
  END IF;

  -- Update count for to_user_id
  IF user2_id IS NOT NULL THEN
    UPDATE public.community
    SET connection_count = (
      SELECT COUNT(*) FROM public.connections
      WHERE (from_user_id = user2_id OR to_user_id = user2_id)
      AND status = 'accepted'
    )
    WHERE id = user2_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_update_connection_count ON public.connections;

CREATE TRIGGER trigger_update_connection_count
  AFTER INSERT OR UPDATE OR DELETE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_connection_count();

-- Now recalculate all connection counts to fix any stale data
UPDATE public.community
SET connection_count = (
  SELECT COUNT(*)
  FROM public.connections
  WHERE (connections.from_user_id = community.id OR connections.to_user_id = community.id)
  AND connections.status = 'accepted'
);

-- Verify the fix
SELECT 
  c.name,
  c.connection_count,
  (
    SELECT COUNT(*) 
    FROM connections conn
    WHERE (conn.from_user_id = c.id OR conn.to_user_id = c.id)
    AND conn.status = 'accepted'
  ) as actual_count
FROM community c
WHERE c.user_id IS NOT NULL
ORDER BY c.name;
