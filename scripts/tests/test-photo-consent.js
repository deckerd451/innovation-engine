#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const window = { currentAuthUser: { id: 'viewer-auth' }, location: { search: '' } };
const context = vm.createContext({ window, URLSearchParams, localStorage: { getItem: () => null }, console });
vm.runInContext(read('assets/js/photo-privacy.js'), context);
const photo = { id: 'member', user_id: 'member-auth', image_url: 'https://example.com/photo.jpg' };
const optedIn = { ...photo, photo_visible: true, photo_consent_at: '2026-10-10T00:00:00Z' };
const url = person => window.profilePhotoUrl(person);
assert.equal(window.profileInitials({ name: 'Ada Lovelace' }), 'AL');
assert.equal(window.profileInitials({ name: 'Prince' }), 'PR');

assert.equal(url(photo), null, 'existing users default private');
assert.equal(url({ ...photo, photo_visible: true }), null, 'legacy default true is not consent');
assert.equal(url({ ...optedIn, photo_visible: false }), null, 'opt-out takes precedence');
assert.equal(url(optedIn), photo.image_url, 'member opt-in allows signed-in viewers');
assert.equal(url({ ...photo, status: 'accepted' }), null, 'accepting a connection is not photo consent');
assert.equal(url(null), null);
assert.equal(url({ ...photo, avatar_url: photo.image_url }), null, 'OAuth fallbacks cannot bypass privacy');
window.currentAuthUser = null;
assert.equal(url(optedIn), null, 'signed-out viewers cannot see member photos');
window.currentAuthUser = { id: photo.user_id };
assert.equal(url(photo), photo.image_url, 'owner can view their private photo');
window.currentAuthUser = { id: 'admin-auth' };
window.currentUserProfile = { id: 'admin', user_id: 'admin-auth', user_role: 'Admin' };
assert.equal(url(photo), photo.image_url, 'authenticated admins can view private photos');
window.currentAuthUser = { id: 'different-auth' };
assert.equal(url(photo), null, 'a stale admin profile cannot grant another user access');

// Execute the real avatar cache: revoking consent must win over cached URLs.
vm.runInContext(read('assets/js/avatar-utils.js')
  .replace(/^import .*;$/m, 'const supabase = null;')
  .replace(/^export function/gm, 'function'), context);
assert.equal(context.getCardAvatarUrl(optedIn), photo.image_url);
assert.equal(context.getCardAvatarUrl({ ...optedIn, photo_visible: false }), null);
assert.equal(context.getGraphAvatarUrl(photo), null);
assert.equal(context.getProfileAvatarUrl(photo), null);
delete window.shouldHideProfilePhoto;
assert.equal(context.getCardAvatarUrl(optedIn), null, 'missing policy script fails closed');

// Verify the real profile UI records an explicit choice through the owner RPC.
const profile = read('profile.js');
assert.match(profile, /id="edit-photo-visible"/);
assert.match(profile, /safeProfile\.photo_visible === true && safeProfile\.photo_consent_at/);
assert.match(profile, /rpc\('set_my_photo_visibility'/);
assert.match(profile, /p_visible: \$\("edit-photo-visible"\)\?\.checked === true/);
const admin = read('assets/js/adminPrivacyPanel.js');
assert.match(admin, /disabled aria-label="Member photo sharing choice"/);
assert.doesNotMatch(admin, /setPhotoVisible/);

const sql = read('supabase/sql/migrations/20261010_photo_consent.sql');
assert.match(sql, /photo_visible SET DEFAULT false/);
assert.match(sql, /WHERE photo_consent_at IS NULL AND photo_visible IS DISTINCT FROM false/);
assert.match(sql, /OLD\.user_id IS DISTINCT FROM auth\.uid\(\)/);
assert.match(sql, /NEW\.photo_consent_at := CASE WHEN NEW\.photo_visible THEN now\(\) ELSE NULL END/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.set_my_photo_visibility\(boolean\) FROM PUBLIC, anon/);
const storageSql = read('supabase/sql/migrations/20261010_private_avatar_storage.sql');
assert.match(storageSql, /VALUES \('private-avatars', 'private-avatars', false/);
assert.match(storageSql, /owner\.photo_visible = true/);
assert.match(storageSql, /viewer\.user_role = 'Admin'/);
assert.match(storageSql, /Private avatar owners can upload/);
assert.doesNotMatch(storageSql, /UPDATE storage\.buckets[\s\S]*hacksbucket/);
assert.match(read('profile.js'), /from\("private-avatars"\)/);
assert.match(read('profile.js'), /createSignedUrl\(path, 3600\)/);
assert.match(read('profile.js'), /updated\.avatar_storage_path = uploadedAvatar\.path/);
assert.match(read('assets/js/avatar-upload.js'), /const BUCKET_NAME = 'private-avatars'/);
assert.match(read('assets/js/avatar-upload.js'), /createSignedUrl\(data\.path, 3600\)/);
assert.match(read('assets/js/photo-privacy.js'), /refreshProfilePhotoUrl/);
assert.match(read('auth.js'), /await window\.refreshProfilePhotoUrl\(profile\)/);

// Broad regression guard for raw photo rendering paths that used to bypass
// the admin panel's setting. These modules must use the shared policy.
for (const file of ['connectionRequests', 'messaging', 'node-panel', 'dashboardPane',
  'teamBuilder', 'leaderboard', 'live-activity-feed', 'nearify-events-panel']) {
  assert.match(read(`assets/js/${file}.js`), /window\.profilePhotoUrl\?\./, file);
}
assert.match(read('assets/js/unified-network/node-renderer.js'), /node-initials/);
assert.match(read('assets/js/unified-network/node-renderer.js'), /d\.imageUrl \? 'none' : 'block'/);
console.log('Photo consent: defaults, opt-in/out, owner/admin access, cache and UI checks passed');
