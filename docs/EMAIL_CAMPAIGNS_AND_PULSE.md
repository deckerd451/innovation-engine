# Current release: Community Pulse and campaign delivery controls

The administrator has configured a campaign mailing address and Resend webhook
signing secret and deployed `campaign-email` and `campaign-email-events`.
The production admin page now explicitly calls `renderCampaigns(content,
{draftsOnly:false})`. The renderer still defaults to draft-only for other callers.

Opening campaigns, previewing audiences and saving drafts never sends email.
Start with **Send test to my verified email**. Inspect its footer and links,
then confirm the signed delivery event reaches the webhook successfully before
sending a pilot. Production delivery and webhook processing still need this
end-to-end verification; deployment alone does not prove they work.

Pilot sending requires an accepted test. Continuing the remaining queue requires
a started pilot and the administrator's review checkbox. Server configuration,
active admin authorization, draft ownership, eligibility and SQL limits continue
to apply. Existing individual claim emails and Community Pulse are unchanged.

---

# Email campaigns and Community Pulse

This release adds an admin campaign workflow and a separate member aggregate
report. It does not send any emails on deployment or when reports are opened.
It does not add tracking pixels or collect guest identities.

## Campaign workflow

Open Admin → People → Email campaigns, or the Email campaigns action in
Overview/Community. Select All eligible accounts, Unclaimed, Inactive, or Active.
Active/inactive split claimed accounts at 30 days using last_seen_at. Admin
accounts are excluded even from All; this is community outreach, not an admin
notification list.

1. Enter a plain-text subject/message and choose Home, Projects, or Opportunities.
2. Preview recipients, exclusion reasons and eligibility counts. Preview is
   paginated in groups of 50. Use the Exclude checkboxes to remove additional
   people. No email is sent by a preview or draft.
3. Create the fixed draft/audience snapshot. Saved content is visible in the
   delivery report. Editing the form afterward does not change that draft.
4. Send a test to the signed-in admin's verified email. A test cannot claim a
   recipient's account. Each draft permits one reserved test attempt. If that attempt fails, create
   a new draft after correcting delivery configuration. Setup errors before
   reservation can be retried on the same draft. Inspect the actual test inbox.
5. Send a pilot of up to five eligible recipients. Unclaimed profiles receive
   individual server-generated Supabase Auth magic links to claim.html;
   claimed profiles receive the selected app destination.
6. Review the report and the pilot experience, check the approval box, and
   choose Send remaining queue. The open page sends sequential batches of at
   most five. Pause takes effect after the current batch; leaving/closing the
   page stops future batches. Reopen the campaign in history to resume.
7. Cancel stops ready recipients. It cannot retract reserved or accepted mail.

A campaign creator may send/cancel their own campaigns; other admins can view
reports. All mutations and eligibility are enforced in PostgreSQL, not only UI.
Preview and reporting are admin-only; underlying campaign, recipient, event
and suppression tables have RLS and no anon/authenticated table grants.

## Eligibility and limits

Recipients come only from stored profiles, never caller-provided addresses.
Exclude invalid/missing email, disabled accounts, admins, unsubscribed/bounced/
complained addresses, recognized test/fixture profile names or +test/+claimtest/
+fixture aliases, and ambiguous unclaimed addresses. Additional test accounts
must be manually excluded in preview. Deduplicate normalized email addresses;
claimed rows take priority. An unclaimed address shared by multiple profiles
is skipped instead of issuing an ambiguous claim link.

Eligibility and the unchanged email snapshot are rechecked on each reservation.
Suppression is checked again, so new opt-outs affect future queue entries.
A global transactional lock prevents concurrent sends bypassing the limits:
50 reserved requests/hour, 90/day across campaigns including tests, and one
non-test campaign attempt per address per seven days. Existing Auth/claim
emails have their own provider limits and can consume additional Resend quota.
The provider can reject requests even below the application caps.

Resend requests use stable per-recipient Idempotency-Key values. The app never
automatically retries ambiguous outcomes or failed recipients. A timeout or
lost response is Unknown, not confirmation of either success or failure.
Sending rows interrupted for ten minutes become Unknown on report refresh.
The remaining-queue loop stops if a response is failed, unknown, or its audit
write is unconfirmed. Inspect Resend before deciding on another campaign.

Accepted means the provider accepted the API request, not inbox delivery.
Signed email.delivered/email.bounced/email.complained events update reports.
Bounces/complaints suppress future campaigns; delivery cannot override those
states. Event IDs are deduplicated, and provider-ID transaction locks handle
an event arriving before the send receipt has been written. Tests are separate
from campaign totals. Reports require manual refresh for later provider events.
No open/click rate is claimed or inferred.

## Unsubscribe

Each email contains an unsubscribe page and standard RFC 8058 one-click headers.
The page removes the secret fragment before imports and requires explicit
confirmation; visiting/scanning the link is not an opt-out. Provider one-click
POSTs are accepted by campaign-email's token route. GET never changes a
preference. The token is a private token made from two random UUIDs. Responses reveal no
address. Preferences are email-specific and affect community campaigns only;
transactional Auth/sign-in and manually requested claim emails are unaffected.
Ready entries in existing campaigns are suppressed too.

## Community Pulse

Members reach pulse.html from Home or the admin Community Pulse action. They
can see active visible public projects, public open/unexpired opportunities,
and grouped profile/accepted-connection milestones. Common skills are shared
only when at least five visible profiles list them. Six monthly profile bands
show aggregate growth. Profile/connection counts are rounded down in groups of
five, with values below five (including zero) reported as Fewer than 5. Null
means suppressed; missing/invalid data is Unavailable, never assumed zero.

The dedicated get_community_pulse RPC requires a signed-in, enabled community
account. It excludes hidden/disabled/admin and recognized test-name profiles,
and connections with such endpoints. It returns no names, email addresses,
profile IDs, visitor details, claim statuses, inactive/unconnected-member lists,
or admin activity. The browser never requests or filters an admin report for
members. Aggregate figures are a summary, not a real-time activity feed or proof
of useful participation. No member can access campaign tables or admin RPCs.

## Production release: complete these steps before sending

1. Run these in Supabase SQL Editor, in order:
   - supabase/sql/migrations/20261114d_email_campaigns.sql
   - supabase/sql/migrations/20261114e_member_community_pulse.sql
2. In Supabase Edge Functions → Secrets, configure privately:
   - RESEND_API_KEY: sending-only key for notify.charlestonhacks.com.
   - CAMPAIGN_POSTAL_ADDRESS: the real mailing address to include in outreach.
   - CAMPAIGN_FROM_EMAIL (optional): defaults to
     CharlestonHacks <noreply@notify.charlestonhacks.com>.
   - CAMPAIGN_APP_URL (optional): defaults to
     https://deckerd451.github.io/innovation-engine/ (must end in /).
   Never put keys in SQL, website code, screenshots or PR comments. Supabase
   supplies its own URL/anon/service-role values to the functions automatically.
3. From this branch in the local checkout, deploy with the existing CLI login:

   ```sh
   npx supabase functions deploy campaign-email --remote=mqbsjlgnsirqsmfnreqd
   npx supabase functions deploy campaign-email-events --remote=mqbsjlgnsirqsmfnreqd
   ```

   verify_jwt is false in config because campaign-email verifies the bearer
   with Auth.getUser, then service-only SQL independently verifies the active
   admin actor and draft ownership. The unsubscribe token route is intentionally
   unauthenticated. The events function instead requires a signed webhook.
4. In Resend → Webhooks, add
   https://mqbsjlgnsirqsmfnreqd.supabase.co/functions/v1/campaign-email-events
   for email.delivered, email.bounced and email.complained. Copy its whsec_
   signing secret into Supabase Secrets as RESEND_WEBHOOK_SECRET. Delivery is
   disabled until all required configuration, including this secret, is present.
   Use Resend's signed test event and confirm HTTP 200; missing/invalid/stale
   signatures return 401 and make no database changes.
5. Keep the existing claim.html redirect URL allowed in Supabase Auth. The
   Resend domain is already verified; existing Auth SMTP is unchanged.
6. Merge/release the frontend after CI/review. Test Community Pulse as a normal
   member and confirm an anonymous/disabled user is denied the aggregate RPC.
   In Campaigns, create a draft and test email, inspect content/footer/links,
   then send only the explicit pilot. Confirm accepted → delivered through a
   real signed event. Test unsubscribe with a controlled recipient and confirm
   it is excluded from a subsequent preview. Only then approve the queue.

No production email has been sent by the implementation or automated tests.
Production API credentials, webhook registration and inbox tests must be done
in the connected services; they are not established by a passing local suite.

## Retention and rollback

Campaign records and recipient addresses/tokens are private delivery audit
and preference records. They are retained until an authorized operator sets a
retention policy. Do not delete suppression/token rows for delivered mail;
unsubscribe links must remain functional. Database contact fingerprints are
lookup keys, not a claim of anonymization.

Pause/cancel sending and disable normal delivery before rollback. Revert the
UI, then apply the rollback files. Campaign rollback deliberately preserves
suppression/recipient/token tables and the unsubscribe RPC so delivered links
remain valid. Keep the campaign-email unsubscribe route, webhook endpoint and
unsubscribe.html available for delivered emails; disable sends by removing the
Resend API key, not by deleting the unsubscribe route. Already delivered claim
links require claim.html to remain until Auth expiry. The Pulse rollback drops
only its member aggregate RPC. No rollback can retract delivered messages.

## Local verification

- npm test: request validation, permission boundaries, HTML escaping,
  outcome honesty, token unsubscribe and signed/replay-window webhook tests.
- npm run test:db: disposable PostgreSQL tests for audience selection,
  duplicate/exclusion rules, test/pilot/review gates, eligibility rechecks,
  throttles, suppression, early/out-of-order events, cancellation, member-safe
  Pulse and rollback. No production database is used.
- node scripts/tests/browser/run-campaigns-pulse.mjs: desktop/mobile workflow,
  accessibility scans, safe text, member-report access denial and unsubscribe.
- Pinned Deno SDK adapter tests run without network permission and assert
  verified actor selection, private claim links, idempotency and unsubscribe
  headers. Functions are type-checked with frozen dependency locks.

## Guided campaign screen

Campaigns are listed newest first with creation time and a short draft ID.
The selected draft is highlighted and its identity stays above the sending steps.
A draft owned by another login is explicitly view-only; creating a new draft
under the current account preserves the ownership checks. New campaigns are
composed separately from the selected draft's saved message.

The report groups sending into test, pilot, and remaining recipients. It shows
test delivery status beside the first step and reveals the approval checkbox
only after a pilot starts. Recipient details, cancellation and limits are under
a disclosure. All send actions remain explicit; selecting, refreshing, previewing
and saving never sends email. No database or Edge Function changes are required
for this layout update.
