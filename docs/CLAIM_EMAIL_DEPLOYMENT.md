# Real claim-email delivery

This replaces the single/bulk placeholders with Supabase Auth email delivery.
Nothing in this change sends emails automatically. Production delivery has not
been tested from this workspace; the tests use synthetic identities and mocked
Auth delivery.

## One-time production setup — before merging the frontend

1. In the existing Innovation Engine Supabase project's SQL Editor, run
   `supabase/sql/migrations/20261113b_admin_claim_email.sql` from this branch.
   It creates a private request audit table and two narrowly granted functions.
   It does not edit existing profiles or send mail.
2. Ensure Supabase Authentication has the Email provider enabled and allows
   new email signups if recipients do not already have Auth accounts. Then
   in Authentication email settings, enable/configure **custom SMTP**
   with your email provider's verified sender. Supabase's default mail service
   is restricted and is not suitable for sending to arbitrary members. Enter
   SMTP credentials only in Supabase's dashboard, never in the app or chat.
   Keep Auth email rate limits appropriate for expected volume. Auth emails
   and these claim emails share the project's delivery service and quotas.
3. Under Authentication → URL Configuration, add this exact redirect URL:
   `https://deckerd451.github.io/innovation-engine/claim.html`.
   Leave the existing Site URL and other redirect URLs intact. The Confirm Signup and Magic Link
   email templates must use Supabase's `{{ .ConfirmationURL }}` so the link is
   verified before redirecting. The existing template can be kept; it is shared
   with other Auth magic-link users, not a separate claim-only template.
4. From a checkout of this PR branch, authenticate the Supabase CLI through its
   browser login, then deploy the function to the existing project:

   ```sh
   npx supabase login
   npx supabase functions deploy send-claim-emails --project-ref mqbsjlgnsirqsmfnreqd
   ```

   Do not create a new project. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase to the Edge function;
   never put the service key in frontend code. The default fixed callback above
   is built into the function. Only if hosting elsewhere, set the server-only
   `CLAIM_EMAIL_REDIRECT_URL` to that deployment's fixed HTTPS claim page and
   update its allowed Auth redirect URL too.
5. Create/review the PR and merge after hosted checks and review pass. Wait for
   Pages deployment so `claim.html` and the new admin controls are live.
6. Test with one **unclaimed test profile using an inbox you control**, not your
   already-claimed admin email. In Admin → People, choose Send Claim Email.
   Confirm the recipient and verify the acceptance receipt, then check the
   inbox/spam folder. Open its link in a separate/private browser to avoid
   replacing your admin session. It should verify, claim the stored profile,
   and offer Continue to Innovation Engine. Confirm that the profile is claimed.
7. Only after that inbox test, use bulk sending. Mixed results are shown and
   unsuccessful/ineligible profiles remain selected for review. Do not blindly
   retry a network failure: the request may already have been accepted, and
   durable resend limits intentionally prevent immediate repeats.

## Runtime contract

- Browser sends profile IDs, never email addresses or redirect destinations.
- Edge authenticates the bearer token with `auth.getUser`; the SQL reservation
  independently requires `community.user_role = 'Admin'`. `verify_jwt=false`
  disables only the legacy gateway verifier; it does not make sending public.
- SQL reads stored email and skips already-claimed, disabled, missing-email,
  ambiguous-email and unknown profiles. A profile whose email is already
  attached to another claimed profile is also skipped. No profile is claimed
  merely by sending mail.
- Reservation commits before contacting Auth: one request per address per five
  minutes, at most five/address/day and 50/admin/hour. Concurrent retries cannot
  reserve another send immediately. Audit records remain if a profile is
  deleted; old audit rows are removed on later authorized requests after 30 days.
- UI batches up to 20 IDs/request, handles partial results and blocks duplicate
  clicks. It reports only confirmed API acceptance, never guaranteed delivery.
  Bounces, spam filtering and mailbox delivery require the SMTP provider's logs.
- Verified email links use Auth's implicit token callback. The standalone claim
  page removes tokens from its URL, explicitly sets the verified session, then
  calls the existing `claim_community_profile_by_email` function. It does not
  trust `claim_email` query hints, automatically redirect to arbitrary URLs,
  or update a profile on behalf of an unverified email.
- Email strings, tokens and links are not written to application logs. The
  private audit records profile/admin IDs, an address hash, timestamps and a
  coarse provider outcome; ordinary clients cannot read or finalize receipts.
- No automatic provider retries occur. Reservations with interrupted delivery
  remain throttled; acceptance does not mean the recipient has claimed.

## Troubleshooting

- 401/403: sign in again and confirm the caller's database profile has Admin
  role. The desktop email allowlist alone does not grant server privileges.
- Service/setup failure: check the migration and Edge deployment/function logs.
- Rejected email or provider limit: check SMTP configuration, verified sender,
  Auth rate limits and provider logs. Wait before retrying.
- Accepted but absent inbox: check spam and provider delivery/bounce logs; the
  app cannot prove inbox delivery from Auth's acceptance response.
- Link returns to the wrong page: check the exact Auth redirect allowlist and
  retained `{{ .ConfirmationURL }}` template. Do not use a PKCE email request
  initiated in the admin browser: the recipient does not have its verifier.
- Duplicate-email profiles: resolve duplicate records before requesting mail.

## Tests and rollback

`npm test` covers handler authorization/error outcomes, request shape, safe
callback completion and partial bulk failures. `npm run test:claim-email` tests
the actual admin controls and callback page with synthetic delivery. CI also
type-checks the Edge function with its pinned dependency lock and exercises
the real Supabase SDK adapter with synthetic HTTP responses (no network
permission), verifying admin/service-role separation and a non-PKCE email
redirect that the recipient can open on another device. `npm run test:db`
covers real SQL permissions, eligibility, throttling, audit finalization and
rollback. Existing claiming-by-verified-email tests continue to run.

Rollback in this order: disable the Edge function to stop new requests; roll
back the Admin sending UI while retaining `claim.html` and its callback scripts
until previously issued Auth links expire; then run `supabase/sql/rollback/20261113b_admin_claim_email_rollback.sql`.
The rollback drops the request audit history but does not undo verified claims
or delete user/profile records. It cannot retract emails already accepted.
