# Membership and proximity-connection authorization fix

Migration: `supabase/sql/migrations/20261013b_membership_and_proximity_authz.sql`. It applies after `20261013_notification_connection_authz.sql`.
Rollback: `supabase/sql/rollback/20261013b_membership_and_proximity_authz_rollback.sql`
Tests: `scripts/tests/run-authz-db.sh` (`membership-authz-db.sql`, plus the notification and connection suites), and `scripts/tests/test-notification-connection-authz.js` (`npm test`).

**Status: prepared and tested locally. Not applied to production. One part needs a product decision (Nearify QR ingestion, below).**

## What production does today (read-only audit, 2026-10-13)

Facts come from the production catalog and aggregate counts. Behaviour was reproduced on a local copy of production's tables, policies, grants and function bodies (`scripts/tests/fixtures/*-prod-baseline.sql`).

| Path | Authorization flaw | Does it work today? |
|---|---|---|
| `ingest_nearify_interaction` | `SECURITY DEFINER`, executable by `anon` and `authenticated`. With `p_signal_type = 'qr_confirmed'` it inserts or updates an **accepted** connection between any two community IDs the caller names. | **No.** Every call fails because `interaction_edges` has no `updated_at` column. Even with that fixed, its `ON CONFLICT` target has no matching unique index, and its `'confirmed'` status violates the table's CHECK. The flaw is latent, and a schema "repair" would arm it. |
| `promote_edge_to_connection` | `SECURITY DEFINER`, executable by `anon`. It never checks that the caller is on the edge, and creates an **accepted** connection, so the other member never agrees. | **No.** It fails on the same missing column, and its `'promoted'` status also violates the CHECK. The web "Connect" buttons on proximity suggestions currently error. |
| `organization_members` INSERT | `allow_insert WITH CHECK (true)` for `public`, plus full table grants to `anon`. **Anyone can insert any membership, including making themselves owner or admin of any organization.** | **Yes, exploitable now.** |
| `organization_members` UPDATE/DELETE | `allow_update` / `allow_delete USING (true)` for `public`. | **Masked.** The other UPDATE/DELETE policies query `organization_members` from inside its own policy, so PostgreSQL rejects every member UPDATE or DELETE with *infinite recursion detected in policy*. That also breaks the legitimate flows: leaving an organization, and admins changing or removing members. |
| `organizations` INSERT | `created_by` is whatever the client sends, and `fn_auto_create_org_owner` (`SECURITY DEFINER`) makes that person the owner. | **Yes.** An organization can be created in someone else's name. |
| `project_members` INSERT | `System can add project members WITH CHECK (true)` for `public`. Any role other than `pending` grants access to the project's tasks (the `project_tasks` policies). | **Yes, exploitable now.** Anyone, including signed-out callers, can add anyone, themselves included, to any team. |
| `project_members` UPDATE | `Users can update their own membership USING (user_id = me)`, with no `WITH CHECK`. | **Yes.** A pending requester can approve themselves to `member` or `creator`. |

**Counts:**
- Organization members: 10 owners, 8 members, 0 pending.
- Project members: 9 creator rows, 18 members, 0 pending.
- `interaction_edges`: 4 rows, the last in April 2026.
- Connections: 0 of type `ble_proximity`.
- `nearify_identity_map`: 2 links.

## Callers traced before changing anything

**`ingest_nearify_interaction`**
- **Nearify iOS** (`nearify-ios/Beacon/Services/NearifyIngestionService.swift`, called from `ConnectAttendeeView.swift` after a QR scan) calls it through `AppEnvironment.shared.supabaseClient`. That client points at **`nearify-prod` (`unndeygygkgodmmdnlup`), not Innovation Engine** (`mqbsjlgnsirqsmfnreqd`). It has done so since the repository's first commit (2026-04-03). A read-only catalog check found no `ingest_nearify_interaction` in `nearify-prod`, and no function there that calls Innovation Engine. The app's call is fire-and-forget and already fails silently.
- **Web:** `assets/js/nearify-ingestion-client.js` calls it, but no page loads that file.
- **Result:** nothing that currently ships reaches the Innovation Engine function. An older build that pointed at Innovation Engine could exist on a device; the repository history can't rule that out, and the function fails for such a build anyway.

**`promote_edge_to_connection`**: `ble-passive-networking.js` (`acceptSuggestion`), `eventModeGravity.js` (`promoteSuggestedEdge`) and `nearify-events-panel.js` (Connect button). These are signed-in browser calls with edge IDs. The edge IDs come from `get_nearify_event_peers` and the edge queries. The edge SELECT/UPDATE policies compare `auth.uid()` with a community ID, and no production profile has `id = user_id`, so direct edge reads match nobody.

**Organization memberships (browser):**
- `command-dashboard.js:1535` and `comprehensive-fixes.js:325`: join request (`pending`).
- `dashboard-actions.js:3746` (`joinOrganization`): **instant active self-join**.
- `dashboard-actions.js:3673`: owner row on create. This duplicates the trigger and already fails on the unique key.
- `dashboard-actions.js:3803`: leave.
- `organization-manager.js:680/721/758`: admin add, remove and change role/permissions.
- **Server:** `fn_auto_create_org_owner` and `fn_set_org_created_by` (both `SECURITY DEFINER`) and `deactivate_organization`.

**Project memberships (browser):**
- `node-panel.js:2893` and `dashboardPane.js:2476`: join request (`pending`).
- `dashboardPane.js:3082` (`joinProject`): **instant self-join as `member`**.
- `node-panel.js:2822`: creator invites a member.
- `node-panel.js:4065/4175`: creator approves or declines.
- `node-panel.js:3394`: creator removes.
- `enhanced-project-creation.js:874`: creator row.
- **Not loaded by any page:** `projects.js`, `enhanced-team-builder.js` (pending invitations) and `collaboration-tools.js` (`acceptTeamInvitation`, an invitee self-update `pending → member`).
- **Server:** `add_creator_as_member` and `project_auto_add_creator_member` (invoker-rights triggers on `projects`), `project_members_dedupe`, and `handle_bid_acceptance` (invoker-rights; 0 bids exist, and it inserts a connection `type` that the CHECK rejects).

## Intended rules (what the migration enforces)

Holding a member ID, an edge ID or the public key is never authorization. Every rule is checked against the signed-in member (`authz_current_member_id()`, from `auth.uid()`).

The rules run in `BEFORE` triggers on every `anon`/`authenticated` write, however many permissive policies match. Trusted server code isn't restricted: `SECURITY DEFINER` functions running as their owner, and `service_role`. The allow-everything policies are replaced with policies that state the intent. Those policies use `SECURITY DEFINER` helpers (`authz_current_member_id`, `authz_org_role`), which also removes the self-recursion that breaks member UPDATE/DELETE today.

**Proximity connections**
- `promote_edge_to_connection` can be executed by `authenticated` and `service_role` only.
- The caller must be on the edge; otherwise it returns "Edge not found", the same answer as for an unknown edge.
- The first tap creates a **pending** request to the other member.
- Taps on the same pair are serialized with a transaction-level advisory lock on the two members (in either edge direction). If both members tap at once, the second tap waits for the first, finds its request and accepts it. Without the lock, both would send requests and neither would connect.
- A tap by the other member, or accepting the request normally, accepts it. Both members have then agreed.
- Dismissed (`ignored`/`blocked`) suggestions and declined or cancelled requests are never revived.
- It writes only statuses the CHECK allows (`accepted`). It never creates an accepted connection from one member's tap.
- **`ingest_nearify_interaction`:** `service_role` only (server-to-server). Its body is unchanged.
- **`interaction_edges`:** INSERT, DELETE and maintenance privileges are revoked from members, and every write privilege from `anon`. Edges are written only by `SECURITY DEFINER` functions.

**Organizations**
- `created_by` must be the creator (set when empty), and can't be changed afterwards.
- **Members** may:
  - ask to join (`role 'member'`, `status 'pending'`, no permission flags);
  - leave.

  They may not add themselves as active, admin or owner, or act for anyone else.
- **Owners and admins** may:
  - approve requests;
  - add, edit and remove members and admins;
  - change permission flags.
- **Only owners** may grant, change or remove ownership.
- An organization always keeps at least one active owner.
- The creator of an organization that has no owner yet may insert their own owner row. This keeps the create flow working whichever side writes the row.

**Projects**
- **Anyone signed in** may ask to join (`role 'pending'`, for themselves only).
- **The creator**:
  - adds members;
  - approves or declines requests;
  - changes roles;
  - removes members.
- **Members** may leave.
- **The creator role** is held only by the project creator.
- A membership can't be moved to another project or member.
- **Signed-out callers** have no write privileges.

## Browser changes (needed for compatibility)

- **`dashboardPane.js` `joinProject`:** inserts `role: "pending"` and says the request was sent, instead of joining instantly.
- **`dashboard-actions.js` `joinOrganization`:** inserts `status: 'pending'` and says the request was sent.
- **`ble-passive-networking.js`** and **`nearify-events-panel.js`:** report "Connection request sent" / "Request sent" until the other person agrees, and "Connected" after.
- **Cache-busters:** bumped in `index.html` for these four scripts. `test-post-auth-module-load-recovery.js` is updated to the new `dashboard-actions.js` version.

## Decisions required (not made here)

1. **Nearify QR ingestion into Innovation Engine (product consent plus iOS release).** Today it is unreachable and broken, and this migration limits it to `service_role`. To bring it back, someone must decide **whether a QR scan counts as consent from the person who displayed the code.** Then:
   - *If yes:* the scan needs proof that the server can verify, such as a short-lived code signed by the scanned member's session. It should be ingested server-to-server (an Edge Function using `service_role`), never by a client naming two IDs. That means an iOS release and a function fix: the missing `updated_at` column, the `ON CONFLICT` index, and the status values.
   - *If no:* add an authenticated variant that sends a **pending** request from the scanner, with the same semantics as `promote_edge_to_connection`, and ship an iOS update to call it.

   Until then, nothing changes for iOS users, because the shipped app already can't reach this function.
2. **Open organizations or projects.** This fix makes every join a request that an owner, admin or creator approves. That is the requirement that "a member cannot grant themselves membership". If some organizations or projects should be instantly joinable, that needs an explicit, owner-controlled setting (for example an `open` flag) that the triggers can honour. It isn't added here.
3. **Direct creator invitations.** `confirmProjectInvitation` (`node-panel.js`) adds the invitee as a full member immediately, with a notification but without asking them. That is authorized from the project side. Whether invitees must accept first is a product decision. The unloaded `enhanced-team-builder.js`/`collaboration-tools.js` invitation flow, which would need a self `pending → member` update, isn't supported by these rules.

## Deployment order (requires explicit authorization; not done)

1. **Pre-check (read-only):** confirm production still matches the baseline fixtures. Re-run the catalog queries for the policies, grants, function ACLs and bodies, and triggers on `organization_members`, `organizations`, `project_members`, `interaction_edges`, `connections` and `notifications`.
2. **Apply `20261013_notification_connection_authz.sql`** (database first; see `docs/SECURITY_NOTIFICATION_CONNECTION_AUTHZ.md`).
3. **Ship the browser change:** merge the PR once the required checks pass (`unit`, `db-authz`, `migration-hygiene` and CodeQL); GitHub Pages deploys it. The new browser works against the *old* membership rules, because a pending request is allowed today. The reverse isn't true: old browser code would show errors on its instant-join buttons. **So the browser must ship before step 4.**
4. **Apply `20261013b_membership_and_proximity_authz.sql`** in one transaction (it has `BEGIN`/`COMMIT`).
5. **Verify:**
   - Read-only catalog checks: triggers present; no `true` write policies on these tables; function ACLs.
   - Two-account journeys:
     - **Organizations:** create; join request, then approve; admin adds, edits and removes; owner hands over and leaves.
     - **Projects:** create; join request, then approve; creator invites; member leaves.
     - **Proximity:** Connect from both sides at an event, if any BLE or Nearify edges exist.

## Rollback

- **Database:** run `supabase/sql/rollback/20261013b_membership_and_proximity_authz_rollback.sql`. It restores the exact previous policies, grants, function bodies and ACLs (verified by catalog comparison), and **re-opens these flaws**. The notification migration is untouched.
- **Browser:** reverting is optional. With the database rolled back, the new browser still sends join requests, which work under the old rules.

## Tests

`scripts/tests/run-authz-db.sh` loads both baseline fixtures, which copy production for these tables, and then checks:
1. Every test file fails on the unmodified baseline.
2. Both migrations apply in order, twice.
3. All three test files pass:
   - **`membership-authz-db.sql` (organizations):** members, anonymous callers, owner, admin, sole-owner protection and hand-over.
   - **`membership-authz-db.sql` (projects):** creator, requester, team member, anonymous caller and the creator role.
   - **`membership-authz-db.sql` (proximity):** anonymous callers and unrelated members, first tap, second tap, dismissed suggestions, declined requests and the ingestion grants.
   - **`notification-authz-db.sql`** and **`connection-authz-db.sql`:** unchanged expectations, apart from the stricter membership rules.
4. Undoing any single protection makes a test fail (13 of 13, including the two project join-request notification rules).
5. Simultaneous Connect: two sessions tap at once on opposite edge directions while the first holds its transaction open. The result must be one accepted connection. With the pair lock removed, the same run leaves two pending requests, so the runner checks that too.
6. Each rollback restores the catalog it started from, exactly.

## Remaining risks (not addressed)

- **Event presence spoofing.** `ingest_nearify_event_presence` is `SECURITY DEFINER` and executable by `anon`. It records event presence for any community ID the caller names, which feeds the people-at-this-event signals.
- **Edge inference.** `infer_ble_edges` is `SECURITY DEFINER` and executable by `anon`, with no `search_path`. It only creates suggested edges from members' own presence sessions, but anyone can trigger it.
- **Broken edge policies.** The `interaction_edges` SELECT/UPDATE policies compare `auth.uid()` with community IDs, so they match nobody. Members can't read or dismiss their own suggestions directly.
- **Public membership lists.** `organization_members` SELECT is `allow_select USING (true)`, so pending join requests are publicly readable.
- **Bid acceptance.** `handle_bid_acceptance` inserts a connection type that `connections_type_check` rejects. Its policies also compare `projects.creator_id` with `auth.uid()`.
- **Project ownership transfer.** `projects` UPDATE (`Creators can update their projects`) has no `WITH CHECK`, so a creator can hand `creator_id` to someone else.
