BEGIN;
DROP FUNCTION IF EXISTS public.finish_admin_claim_email(uuid,boolean,text);
DROP FUNCTION IF EXISTS public.reserve_admin_claim_emails(uuid[]);
DROP TABLE IF EXISTS public.admin_claim_email_requests;
COMMIT;
