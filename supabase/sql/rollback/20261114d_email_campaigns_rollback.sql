-- Disable sending functions FIRST. Export delivery audit if needed.
-- Retain suppression data and unsubscribe RPC/tokens for links already delivered.
BEGIN;
DROP FUNCTION IF EXISTS public.admin_email_campaign(text,uuid,jsonb);
DROP FUNCTION IF EXISTS public.reserve_email_campaign_batch(uuid,uuid,text,boolean);
DROP FUNCTION IF EXISTS public.finish_email_campaign_recipient(uuid,text,text,text);
DROP FUNCTION IF EXISTS public.record_email_campaign_event(text,text,text);
DROP FUNCTION IF EXISTS public.campaign_audience(text);
DROP FUNCTION IF EXISTS public.campaign_actor_allowed(uuid);
-- Deliberately preserve email_campaign* tables and unsubscribe_campaign_email.
-- Dropping suppression/token data would invalidate delivered unsubscribe links.
COMMIT;
