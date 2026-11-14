-- Delivered unsubscribe links must outlive a campaign feature rollback.
DO $$ BEGIN
 ASSERT to_regclass('public.email_campaign_recipients') IS NOT NULL, 'Delivered tokens deleted on rollback';
 ASSERT to_regclass('public.email_campaign_suppressions') IS NOT NULL, 'Opt-outs deleted on rollback';
 ASSERT to_regprocedure('public.reserve_email_campaign_batch(uuid,uuid,text,boolean)') IS NULL, 'Sending remains enabled after rollback';
 ASSERT to_regprocedure('public.get_community_pulse()') IS NULL, 'Pulse rollback did not remove its report';
END $$;
SET ROLE anon;
SELECT public.unsubscribe_campaign_email(repeat('a',64));
RESET ROLE;
