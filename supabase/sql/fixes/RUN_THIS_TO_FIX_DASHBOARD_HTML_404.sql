-- ============================================================================
-- MANUAL SUPABASE SCRIPT — run this once in the Supabase SQL Editor
-- ============================================================================
-- Fixes connection-request/connection-accepted notifications linking to
-- "/dashboard.html", which no longer exists (the app's main page is
-- index.html). On GitHub Pages this shows up as:
--   https://deckerd451.github.io/innovation-engine/dashboard.html -> 404
--
-- This script:
--   1. Re-creates notify_connection_request() / notify_connection_accepted()
--      so NEW notifications use "/index.html?user=<id>" instead of
--      "/dashboard.html".
--   2. Backfills EXISTING notification rows that already have the bad link
--      baked in (fixing the trigger only affects notifications created
--      from now on — old rows keep whatever link they were created with).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1a. notify_connection_request — fires when a new pending connection row
--     is inserted; notifies the recipient (to_user_id) about the sender.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_connection_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sender_name TEXT;
BEGIN
  IF NEW.status = 'pending' AND (OLD IS NULL OR OLD.status != 'pending') THEN
    SELECT name INTO sender_name
    FROM community
    WHERE id = NEW.from_user_id;

    PERFORM create_notification(
      NEW.to_user_id,
      'connection_request',
      COALESCE(sender_name, 'Someone') || ' sent you a connection request',
      'Review and respond to this connection request',
      '/index.html?user=' || NEW.from_user_id::text,
      jsonb_build_object('connection_id', NEW.id, 'sender_id', NEW.from_user_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1b. notify_connection_accepted — fires when status flips to 'accepted';
--     notifies the original sender (from_user_id) about the accepter.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_connection_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  accepter_name TEXT;
BEGIN
  IF NEW.status = 'accepted' AND (OLD IS NULL OR OLD.status != 'accepted') THEN
    SELECT name INTO accepter_name
    FROM community
    WHERE id = NEW.to_user_id;

    PERFORM create_notification(
      NEW.from_user_id,
      'connection_accepted',
      COALESCE(accepter_name, 'Someone') || ' accepted your connection request',
      'You are now connected!',
      '/index.html?user=' || NEW.to_user_id::text,
      jsonb_build_object('connection_id', NEW.id, 'user_id', NEW.to_user_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Backfill existing notification rows that still have the dead link.
--    The correct target user id is recovered from the metadata jsonb that
--    the trigger already stored alongside the link.
-- ----------------------------------------------------------------------------
UPDATE notifications
SET link = '/index.html?user=' || (metadata ->> 'user_id')
WHERE type = 'connection_accepted'
  AND link = '/dashboard.html'
  AND metadata ? 'user_id';

UPDATE notifications
SET link = '/index.html?user=' || (metadata ->> 'sender_id')
WHERE type = 'connection_request'
  AND link = '/dashboard.html'
  AND metadata ? 'sender_id';

-- Catch-all: any other notification rows pointing at the dead file with no
-- recoverable target id — send them to the app root instead of a 404.
UPDATE notifications
SET link = '/index.html'
WHERE link = '/dashboard.html';

-- ----------------------------------------------------------------------------
-- 3. Verify — should return 0 rows.
-- ----------------------------------------------------------------------------
SELECT count(*) AS remaining_dashboard_html_links
FROM notifications
WHERE link = '/dashboard.html';
