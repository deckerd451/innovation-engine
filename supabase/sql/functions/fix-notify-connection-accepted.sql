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
    -- NOTE: the app's main page is index.html — there is no dashboard.html
    -- (that filename is obsolete from a previous layout and 404s on GitHub
    -- Pages). Link to the accepter's profile; the frontend's in-app
    -- notification router (unified-notification-system.js) opens it via
    -- the node panel instead of a full page navigation when possible.
    PERFORM create_notification(
      NEW.from_user_id,  -- Changed from NEW.user_id
      'connection_accepted',
      COALESCE(accepter_name, 'Someone') || ' accepted your connection request',
      'You are now connected!',
      '/index.html?user=' || NEW.to_user_id::text,
      jsonb_build_object('connection_id', NEW.id, 'user_id', NEW.to_user_id)  -- Changed from NEW.connected_user_id
    );
  END IF;
  
  RETURN NEW;
END;
$$;
