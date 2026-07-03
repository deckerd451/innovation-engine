-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

-- Fix the notify_connection_request function to use correct column names
CREATE OR REPLACE FUNCTION notify_connection_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sender_name TEXT;
BEGIN
  -- Only notify on new pending requests
  IF NEW.status = 'pending' AND (OLD IS NULL OR OLD.status != 'pending') THEN
    -- Get sender's name
    SELECT name INTO sender_name
    FROM community
    WHERE id = NEW.from_user_id;  -- Changed from NEW.user_id
    
    -- Create notification for recipient
    -- NOTE: the app's main page is index.html — there is no dashboard.html
    -- (that filename is obsolete from a previous layout and 404s on GitHub
    -- Pages). Link to the sender's profile; the frontend's in-app
    -- notification router (unified-notification-system.js) opens it via
    -- the node panel instead of a full page navigation when possible.
    PERFORM create_notification(
      NEW.to_user_id,  -- Changed from NEW.connected_user_id
      'connection_request',
      COALESCE(sender_name, 'Someone') || ' sent you a connection request',
      'Review and respond to this connection request',
      '/index.html?user=' || NEW.from_user_id::text,
      jsonb_build_object('connection_id', NEW.id, 'sender_id', NEW.from_user_id)  -- Changed from NEW.user_id
    );
  END IF;
  
  RETURN NEW;
END;
$$;
