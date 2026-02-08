-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- Fix the notify_connection_accepted function to use correct column names
CREATE OR REPLACE FUNCTION notify_connection_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  accepter_name TEXT;
BEGIN
  -- Only notify when status changes to accepted
  IF NEW.status = 'accepted' AND (OLD IS NULL OR OLD.status != 'accepted') THEN
    -- Get accepter's name
    SELECT name INTO accepter_name
    FROM community
    WHERE id = NEW.to_user_id;  -- Changed from NEW.connected_user_id
    
    -- Notify the original sender
    PERFORM create_notification(
      NEW.from_user_id,  -- Changed from NEW.user_id
      'connection_accepted',
      COALESCE(accepter_name, 'Someone') || ' accepted your connection request',
      'You are now connected!',
      '/dashboard.html',
      jsonb_build_object('connection_id', NEW.id, 'user_id', NEW.to_user_id)  -- Changed from NEW.connected_user_id
    );
  END IF;
  
  RETURN NEW;
END;
$$;
