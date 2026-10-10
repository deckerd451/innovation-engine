# Profile photo consent

## Behavior

Photos default to hidden from other members, including existing profiles whose
old `photo_visible=true` value came from the previous default or an admin action.
A signed-in member sees their own photo. A signed-in admin, identified by the
current community profile's `user_role='Admin'`, can view all photos. Other
signed-in members see a photo only with both `photo_visible=true` and a
server-recorded `photo_consent_at`.

The profile editor provides the member's opt-in checkbox. Uploading a photo or
accepting a connection does not grant consent. The admin panel retains its
listing control and displays photo consent read-only. The owner-only RPC records
consent; a trigger rejects other users' changes, including admin overrides.

## Deployment order

1. Apply `supabase/sql/migrations/20261010_photo_consent.sql` to the standalone
   Innovation Engine's Supabase project. The transaction backfills private
   defaults without deleting photos. Reapplying preserves recorded opt-ins.
2. Verify authenticated owner opt-in/out succeeds, other users (including
   admins) cannot alter that choice, and anonymous calls fail. Test against the
   live RLS policies. The migration and owner opt-in/out, non-owner denial, and anonymous denial were tested on 2026-10-10 in a rolled-back transaction before applying the migration.
3. Deploy the frontend changes together to the standalone GitHub Pages site.
   Explicit community queries now include `photo_consent_at`, so the migration
   must precede the frontend release.
4. Verify with owner, admin, ordinary-member, and signed-out sessions across
   graph, search, profile, connection requests, messaging and team lists.

## Storage work still required

The shared `hacksbucket` currently has public avatar URLs, and some profiles may
reference external OAuth photos. This patch controls display and member consent;
it does not make those existing files inaccessible by URL or remove raw URLs
from community queries. Do not describe it as file-level access protection.

Before a storage migration, inspect the live bucket contents, policies, image
path formats, external URLs, and other assets sharing the bucket. Do not make
the entire shared bucket private without accounting for non-avatar assets.

The remaining storage work is to copy avatars into a dedicated private bucket,
serve authorized photos through authenticated downloads or short-lived signed
URLs, update upload/removal paths, verify owner/admin/consented reads with RLS,
and retire old public copies after verifying each copy. Existing downloaded or
cached copies and externally hosted originals cannot be revoked by this app.

## Local validation

`node scripts/tests/test-photo-consent.js` exercises the real shared policy and
avatar cache for legacy defaults, opt-in/out, owner/admin access, signed-out
access and stale admin state. `npm test` runs the full offline regression suite.
Syntax validation of changed scripts passes. The repository-wide lint command
has an unrelated pre-existing syntax error in unused root `dashboard.js:57`.
