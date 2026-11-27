# Synthetic Gemini pilot validation

Draft backend only. Do not merge or deploy until reviewed and tested. No personal data may be sent to Gemini. Confirm the configured Google project is unpaid and the selected model supports free inference and structured output using current official documentation and account settings.

## Deployment sequence
1. Review the migration and run it against a disposable PostgreSQL/Supabase environment with the existing HPOE schema. Verify service-role-only RPC access, ineligible denial, two requests per account, twenty total, concurrent reservations, and UTC rollover.
2. Run Deno type checking on supabase/functions/hpoe-synthesize/index.ts. Test authentication failures, malformed requests, provider errors and invalid response shapes with mocked dependencies before deployment.
3. In the existing Supabase dashboard SQL editor, apply the reviewed migration from this branch only after confirming the prior HPOE migration exists. Do not modify audience or consent records.
4. In Edge Functions deploy hpoe-synthesize from the reviewed index.ts. Keep HPOE_SYNTHETIC_ENABLED unset or false. Reuse GEMINI_API_KEY; never retrieve or display it. Set HPOE_GEMINI_MODEL to the verified free model identifier. Do not enable billing.
5. Verify the disabled endpoint returns 503. Set HPOE_SYNTHETIC_ENABLED=true only for the bounded test window. Existing HPOE audience and opt-in gate access.
6. From an authenticated eligible account, POST {"operation":"synthetic"} to the function with its current access token and project publishable/anon key. Never share the token. Verify HTTP 200, synthetic=true, verified=false, and proposal fields. Check that outputAsset equals nextInputAsset and capability equals nextUsesCapability. Evaluate substantive feasibility separately; matching strings alone do not prove meaningful propagation.
7. Disable HPOE_SYNTHETIC_ENABLED immediately after testing. Record sanitized output and status, not credentials. No frontend or participant rollout is authorized by this test.

## Rollback
Disable the server switch first. Remove the deployed function if necessary. If removing the database objects, run in SQL editor:
```sql
BEGIN;
DROP FUNCTION IF EXISTS public.hpoe_reserve_generation(uuid);
DROP TABLE IF EXISTS public.hpoe_generation_usage;
COMMIT;
```
This removes only the new quota objects. Do not remove existing HPOE consent or collaboration tables. Keep the Gemini secret unless independently deciding to revoke it.

## Evidence
No runtime tests, database tests, live inference, or production deployment have yet been completed on this reconstruction. The earlier Work test results are not evidence for this branch.
