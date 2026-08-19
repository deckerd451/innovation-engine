#!/usr/bin/env node

// Regression coverage for the Admin privacy/visibility contract added
// alongside the Admin Panel Analytics work:
//
//  1. avatar-utils.js's shouldHidePhoto(user, viewerId) -- the single pure
//     function every "should I show this person's photo to this viewer"
//     decision goes through. Exercised directly against the real function.
//
//  2. community.is_hidden (already the "listed/searchable" contract
//     enforced by search/matching/suggestions) was missing from two of the
//     four surfaces this deliverable was asked to cover: the Synapse graph
//     (graph-data-store.js) and People Worth Knowing (daily-brief-engine.js).
//     Verified directly against the actual query text, matching the
//     convention in test-opportunity-visibility-privacy.js, rather than
//     re-executing those modules (both have real Supabase-backed imports
//     with network/DOM side effects unsuited to a VM sandbox).
//
//  3. photo_visible is wired into the two surfaces that actually fetch and
//     render a raw avatar field for other people: the Synapse graph
//     (graph-data-store.js, imageUrl) and Search (searchEngine.js,
//     image_url). People Worth Knowing renders text-only cards with no
//     avatar field, so it has no photo path to gate (verified below).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');

// --- 1. shouldHidePhoto, executed directly -------------------------------
//
// avatar-utils.js imports the Supabase client from a remote esm.sh URL at
// module scope (side effect, not available in a plain Node test). Strip
// just that one import line and the `export` keyword from its function
// declarations, then run the rest of the real file as a classic script --
// shouldHidePhoto itself has no dependency on the stripped import.
function loadShouldHidePhoto() {
  const src = fs.readFileSync(path.join(root, 'assets/js/avatar-utils.js'), 'utf8');
  const transformed = src
    .replace(/^import\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?\s*$/m, 'const supabase = null;')
    .replace(/^export function/gm, 'function');
  const sandbox = { window: { location: { search: '' } }, localStorage: { getItem: () => null }, URLSearchParams, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(transformed, sandbox, { filename: 'avatar-utils.js (transformed for test)' });
  assert.equal(typeof sandbox.shouldHidePhoto, 'function', 'avatar-utils.js must define shouldHidePhoto');
  return sandbox.shouldHidePhoto;
}

const shouldHidePhoto = loadShouldHidePhoto();

// Default (photo_visible unset/true): never hidden, from anyone.
assert.equal(shouldHidePhoto({ id: 'a' }, 'viewer'), false, 'no photo_visible field must default to visible');
assert.equal(shouldHidePhoto({ id: 'a', photo_visible: true }, 'viewer'), false);

// photo_visible=false: hidden from a stranger...
assert.equal(shouldHidePhoto({ id: 'a', user_id: 'auth-a', photo_visible: false }, 'someone-else'), true);
// ...but never from the person themself, matched by community id...
assert.equal(shouldHidePhoto({ id: 'a', user_id: 'auth-a', photo_visible: false }, 'a'), false);
// ...or by auth user_id (duplicate/legacy community row for the same human,
// same pattern as the id-OR-user_id self-match already used for People
// Worth Knowing's self-exclusion fix).
assert.equal(shouldHidePhoto({ id: 'a', user_id: 'auth-a', photo_visible: false }, 'auth-a'), false);

// Unknown viewer (viewerId null/undefined) must fail closed -- hide, not show.
assert.equal(shouldHidePhoto({ id: 'a', photo_visible: false }, null), true);
assert.equal(shouldHidePhoto(null, 'viewer'), false, 'a missing user object must not throw');

console.log('✅ shouldHidePhoto behaves correctly');

// --- 2 & 3. Source-level verification of the four required surfaces ------

const graphSrc = fs.readFileSync(path.join(root, 'assets/js/unified-network/graph-data-store.js'), 'utf8');
const searchSrc = fs.readFileSync(path.join(root, 'assets/js/searchEngine.js'), 'utf8');
const pwkSrc = fs.readFileSync(path.join(root, 'assets/js/intelligence/daily-brief-engine.js'), 'utf8');
const dashboardSrc = fs.readFileSync(path.join(root, 'assets/js/command-dashboard.js'), 'utf8');

// Synapse graph: listed AND photo-visibility gates, in _loadNodes().
assert.match(graphSrc, /_loadNodes\s*\(\)\s*\{[\s\S]*?is_hidden\.is\.null,is_hidden\.eq\.false/,
  'graph-data-store.js _loadNodes() must filter out is_hidden members (was previously unfiltered)');
assert.match(graphSrc, /shouldHidePhoto\(user, this\._userId\)/,
  'graph-data-store.js must gate node imageUrl through shouldHidePhoto');

// Explore -> People is sourced from the same graph-data-store cache
// (command-dashboard.js _getGraphData() reads window.graphDataStore first),
// so the graph fix above covers it too -- verify that sourcing is still
// true rather than assuming it.
assert.match(dashboardSrc, /window\.graphDataStore/,
  'Explore -> People must still source nodes from window.graphDataStore for the graph-level privacy fix to cover it');

// Search: listed (already correct) AND photo-visibility gate added.
assert.match(searchSrc, /is_hidden\.is\.null,is_hidden\.eq\.false/,
  'searchEngine.js must keep filtering out is_hidden members');
assert.match(searchSrc, /photo_visible/, 'searchEngine.js must select photo_visible');
assert.match(searchSrc, /shouldHidePhoto\(m, viewerId\)/,
  'searchEngine.js must gate image_url through shouldHidePhoto');

// People Worth Knowing: listed gate added; no avatar field is fetched or
// rendered by this surface (start-daily-digest.js renders headline/subhead
// text only), so there is no photo path here to gate.
assert.match(pwkSrc, /is_hidden\.is\.null,is_hidden\.eq\.false/,
  'daily-brief-engine.js\'s community candidate query must filter out is_hidden members (was previously unfiltered)');
const digestSrc = fs.readFileSync(path.join(root, 'assets/js/start-daily-digest.js'), 'utf8');
assert.doesNotMatch(digestSrc, /image_url|avatar_storage_path|getCardAvatarUrl|getGraphAvatarUrl/,
  'People Worth Knowing cards must remain text-only -- if this starts rendering a photo, shouldHidePhoto must be wired in there too');

console.log('✅ test-synapse-privacy-visibility passed');
