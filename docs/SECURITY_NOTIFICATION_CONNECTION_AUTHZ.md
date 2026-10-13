# Notification and connection authorization fix

Migration: `supabase/sql/migrations/20261013_notification_connection_authz.sql`
Rollback: `supabase/sql/rollback/20261013_notification_connection_authz_rollback.sql`
Tests: `scripts/tests/run-authz-db.sh` (PostgreSQL), `scripts/tests/test-notification-connection-authz.js` (`npm test`)

**Status: prepared and tested locally. Not applied to production.**

## Problems (verified read-only in production on 2026-10-13)

| # | Problem | Evidence (production catalog) |
|---|---|---|
| 1 | Any signed-in member can create a notification for any recipient, with any title and link | Policy `System can create notifications`: `INSERT TO authenticated WITH CHECK (true)`; `anon`/`authenticated` hold every table privilege on `notifications` |
| 2 | Anyone, including signed-out callers, can execute `create_notification` | `SECURITY DEFINER`, owner `postgres`, no `search_path`, ACL grants `PUBLIC`, `anon`, `authenticated`; the body is a bare `INSERT` with no caller check |
| 3 | A member can re-address or rewrite their own notification | `Users can update their own notifications` has `USING` but no `WITH CHECK`, and table-level `UPDATE` |
| 4 | A sender can accept their own request, which fires a false "X accepted your connection request" | `Users can update their connections`: `UPDATE TO authenticated USING (from = me OR to = me)` with no `WITH CHECK`; all 9 connection policies are `PERMISSIVE` and combine with OR; no guard trigger; `trigger_notify_connection_accepted` fires on any change to `accepted` |
| 5 | Either party can change `to_user_id`/`from_user_id`, `type`, or the Collaboration Concierge reason/prompt/status | Same policy; no column restriction |
| 6 | A request can be inserted already `accepted` | Both INSERT policies check only `from_user_id` |
| 7 | Any caller can send any member a `project_invite` notification | `project_members` policy `System can add project members` `WITH CHECK (true)` plus `notify_project_invite` (`SECURITY DEFINER`) notifies `NEW.user_id` unconditionally |

## Writers inventoried before changing anything

**Notification writers (production functions and triggers):**
- `notify_connection_request` / `notify_connection_accepted` on `connections`
- `notify_endorsement` on `endorsements`
- `notify_new_message` on `messages`
- `notify_project_invite` on `project_members`
- `notify_opportunity_interest` on `opportunity_interests`

All are `SECURITY DEFINER`, owned by `postgres`, and call `create_notification` or insert directly.

**Browser notification writers:** only `assets/js/comprehensive-fixes.js` (`createNotification`), used by `submitProjectRequest` (`project_request`) and `submitOrganizationJoinRequest` (`org_join_request`). Production holds 0 notifications of either type, 0 `project_requests` rows, and 0 pending organization memberships. Every other browser write to `notifications` is `.update({ read: true })` (`notification-bell.js:357`, `unified-notification-system.js:1216`).

**Connection writers:**
- *Browser:*
  - `connections.js` (send, accept, decline, cancel, remove)
  - `dashboardPane.js` (insert pending, recipient accept, delete)
  - `node-panel.js`, `start-flow-unified.js` and `unified-network-integration.js` (insert pending, delete)
  - `collaboration-concierge.js` (`context_*` updates)
- *Server:* `promote_edge_to_connection` and `ingest_nearify_interaction` (`SECURITY DEFINER`, which create or promote **accepted** connections), and `handle_bid_acceptance`. That last one is invoker-rights, and it inserts `type='project'`, which `connections_type_check` already rejects.
- **Dead code:** `neuralInteractive.js` and `unified-network/action-resolver.js` insert columns that don't exist.

## The fix

**Notifications**
- **`create_notification`:** revoke from `PUBLIC`, `anon` and `authenticated`; grant to `service_role`; pin `search_path = public, pg_temp`. The migration aborts if the owner is a member-assumable role. The existing `SECURITY DEFINER` trigger functions run as `postgres`, so they keep calling it. Their `search_path` is pinned too; their bodies are unchanged except `notify_project_invite`.
- **INSERT:** drop `System can create notifications`. No member INSERT policy remains, and INSERT, DELETE, TRUNCATE, REFERENCES and TRIGGER are revoked from `anon` and `authenticated`.
- **UPDATE:** members may update only the `read` column (`GRANT UPDATE (read)`), and the update policy now has a matching `WITH CHECK`.
- **Join-request notifications:**
  - New `notify_project_request` and `notify_organization_join_request` triggers replace the browser inserts.
  - Each notifies only when the signed-in member is the requester, and derives the recipient from `projects.creator_id` or `organizations.created_by`.
  - The titles, messages and links match the old browser text.
- **`notify_project_invite`:** notifies only when one of these is true:
  - the inserter is the project creator;
  - the inserter is an existing team member;
  - members are adding themselves (existing behaviour);
  - the call is trusted server code (JWT role is neither `anon` nor `authenticated`).

**Connections**

A `BEFORE INSERT OR UPDATE` trigger, `enforce_connection_authorization`, applies to every write made as `anon` or `authenticated`, however many permissive policies match. Writes inside `SECURITY DEFINER` functions (BLE/Nearify promotion) and from `service_role` run as a different `current_user` and are not restricted.

| Write | Rule |
|---|---|
| INSERT | `from_user_id` is the caller; `status = 'pending'`; `context_status` null or `pending`; no completion fields |
| Any UPDATE | caller is one of the two members; `id`, `from_user_id`, `to_user_id`, `created_at`, `type`, `context_type`, `context_reason`, `context_prompt` are immutable |
| `pending → accepted / rejected` | recipient only |
| `pending → canceled` | sender only |
| any other status change | refused (no reopening, no un-accepting) |
| `context_status pending → accepted` | recipient, and the connection is accepted |
| `context_status pending → declined` | recipient |
| `context_status accepted → completed` | either member; `context_completed_by` must be the caller |
| `context_schedule` | either member, Concierge rows only |
| `context_outcome` | either member, only once completed |

Additional table privileges:
- TRUNCATE, REFERENCES and TRIGGER are revoked from `anon` and `authenticated`.
- INSERT, UPDATE and DELETE are revoked from `anon` (signed-out callers could never satisfy a policy).
- DELETE is unchanged: either member can still remove a connection.

**Browser**
- `comprehensive-fixes.js` no longer creates notifications (its cache-busting `?v=` is bumped in `index.html`).
- In `connections.js`, the cancel fallback, used only if a DELETE is refused, now has the recipient decline (`rejected`) instead of cancel.

## Tests

```
scripts/tests/run-authz-db.sh     # local cluster in a temp dir; never touches Supabase
npm test                          # includes test-notification-connection-authz.js
```

`run-authz-db.sh` runs the following against `scripts/tests/fixtures/notification-connection-prod-baseline.sql`, a local copy of production's policies, grants, function bodies, ACLs and triggers for these tables:

1. **Negative control:** both test files fail on the unmodified baseline.
2. **Idempotency:** the migration applies twice.
3. **Both test files pass after the migration:**
   - `notification-authz-db.sql` covers members, unrelated members, anonymous callers and `service_role`. It shows each legitimate notification still arrives (connection request and acceptance, endorsement, invite from creator and from a team member, self-join, server invite, project request, organization request), and that forged ones don't.
   - `connection-authz-db.sql` covers valid and invalid transitions for sender, recipient, an unrelated member and an anonymous caller. It also covers BLE promotion through the real `promote_edge_to_connection`, `service_role` writes, and the full Collaboration Concierge journey.
4. **Each protection is load-bearing:** undoing any single protection makes a test fail. The protections checked are the trigger, the INSERT policy, column UPDATE, the function grant, the invite guard, and the request triggers.
5. **Rollback** restores the baseline catalog exactly (233 entries).

## Deployment plan (requires explicit authorization; not done)

Ordering: **database first, then browser.** Both orders are safe, but database-first leaves no gap.

1. **Pre-check (read-only).** Confirm production still matches the baseline this was written against:
   - The policies on `notifications` and `connections`.
   - The `create_notification` ACL.
   - The `notify_project_invite` body.
   - That no `enforce_connection_authorization` trigger exists yet.

   Re-run the read-only catalog queries described above. If anything differs, regenerate the baseline fixture and re-run the tests first.
2. **Apply the migration** in one transaction (the file has `BEGIN`/`COMMIT`) with the SQL editor or `psql`. Production's `supabase_migrations.schema_migrations` is empty, so don't assume `supabase db push` history is accurate.
3. **The old browser keeps working** until the browser change ships:
   - Its `createNotification` insert is refused, but that function swallows errors (only a console message appears), and the new triggers send the notification instead, with no duplicates.
   - Its connection writes are all valid transitions.
   - The recipient-cancel fallback only runs if DELETE fails, and DELETE is still allowed.
4. **Ship the browser change** by merging the PR to `main` through the Governor Certification Gate. GitHub Pages then deploys it; the service worker is network-first and `comprehensive-fixes.js` has a new `?v=`.
5. **Verify after deployment:**
   - Read-only catalog checks: ACL, policies, trigger present.
   - Manual journeys with two real accounts:
     - send a request, then accept, decline and cancel;
     - mark a notification read;
     - project join request, then organization join request;
     - creator invites a teammate;
     - the Collaboration Concierge sequence: invite, accept, schedule, complete, outcome;
     - BLE edge promotion.

## Rollback plan

- **Database:** run the rollback file in one transaction. It restores the exact previous policies, grants, function ACLs and `search_path` settings, and the original `notify_project_invite` body, and it drops the new triggers and functions. **It re-opens every problem above.**
- **Browser:** reverting is optional. With the database rolled back and the new browser code, project and organization join requests don't notify anyone. Production has never had one of those notifications. Everything else behaves as before. To restore those two notifications too, revert the browser commit through a PR.
- **Partial rollback:** if only the connection rules cause trouble, run just the rollback's section 4 (`DROP TRIGGER enforce_connection_authorization` and the grant) and keep the notification fixes.

## Compatibility notes

- **Identity used by the trigger.** The trigger identifies members by `community.user_id = auth.uid()`; some older policies match by email (`get_community_id_from_auth`). In production, 62 of 83 profiles have no `user_id`, but only 2 of those match a sign-in account, and none is the recipient of a pending request. `auth.js` links such a profile by email at sign-in (`auth.js:462`) before connection features run.
- **Self-join notification kept.** Members adding themselves to a project still get the existing "Invited to join" notification. The wording is odd, but the behaviour is unchanged.
- **Org and project requests not sent from `comprehensive-fixes.js`.** Requests filed by other code paths (`command-dashboard.js`, `dashboard-actions.js`, `organization-manager.js`) now also notify the owner, provided the row is `pending` and filed by the requester. Previously they sent nothing.
- **Untrusted inserts with no signed-in member.** These no longer produce a project invite notification.

## Found but not fixed here (need separate decisions)

1. **`ingest_nearify_interaction` (highest risk).** It is `SECURITY DEFINER` and executable by `anon` and `authenticated`. With `p_signal_type = 'qr_confirmed'` it creates or promotes an **accepted** connection between any two community IDs. The Nearify iOS app calls it (`NearifyIngestionService.swift`), so restricting it needs coordinated app changes.
2. **`promote_edge_to_connection`.** It is executable by `anon` and `authenticated`, and promotes any interaction edge to an accepted connection without checking that the caller is one of its members. The browser BLE flows use it.
3. **`organization_members` policies.** `allow_insert`, `allow_update` and `allow_delete` are `true` for `public`, so anyone can add, change (including `role = 'owner'`) or delete memberships.
4. **`project_members` policy.** `System can add project members` is `WITH CHECK (true)`, so anyone can add anyone to any project. This fix only stops the notification it caused.
5. **`handle_bid_acceptance`.** It inserts `type = 'project'`, which `connections_type_check` rejects, so accepting a bid errors if that flow is used.
6. **`notify_new_message`.** It looks up the sender by `user_id`, but `messages.sender_id` holds the community ID, so message notifications never fire (0 in production).
7. **Broad table privileges.** `anon` and `authenticated` hold every privilege on most tables, so row-level security is the only barrier. The four intent-writing functions are also executable by `anon`; they refuse callers without a profile.
