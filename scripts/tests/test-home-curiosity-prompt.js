#!/usr/bin/env node
'use strict';

// "What are you curious about?" asks a member to share interests, so Home
// shows it only to members who have listed neither interests nor skills.
// Anyone who has listed either is never asked again, and a bio, photo or any
// other profile detail is never required. Synthetic profiles only, through
// the same decision home-view.js uses to paint the prompt.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('assets/js/home-view.js', 'utf8');
const page = { addEventListener() {}, setTimeout, console, Promise, Date, Map, Set, Number, String, JSON, document: { body: { dataset: {} } } };
page.window = page;
vm.createContext(page);
vm.runInContext(source, page);
const { wantsCuriosityPrompt } = page.HomeViewTesting;
assert.equal(typeof wantsCuriosityPrompt, 'function', 'Home exposes the prompt decision for tests');

const member = (extra = {}) => ({ id: 'member-1', name: 'Test Member', ...extra });

// Nothing listed: invited, whatever else the profile has.
for (const [label, profile] of [
  ['no skills or interests at all', member()],
  ['empty lists', member({ skills: [], interests: [] })],
  ['empty and blank strings', member({ skills: '', interests: '  ' })],
  ['blank entries only', member({ skills: [' ', ''], interests: [null] })],
  ['JSON-encoded empty lists', member({ skills: '[]', interests: '[""]' })],
  ['commas only', member({ skills: ' , ', interests: ',' })],
  ['a complete profile apart from skills and interests', member({ bio: 'Organizer in Charleston', image_url: '/images/me.png', skills: [], interests: [] })],
]) {
  assert.equal(wantsCuriosityPrompt(profile), true, `invited: ${label}`);
}

// Interests or skills listed: never asked again, with no bio or photo needed.
for (const [label, profile] of [
  ['interests only', member({ interests: ['Climate'] })],
  ['skills only', member({ skills: ['Python'] })],
  ['both', member({ skills: ['Python'], interests: ['Climate'] })],
  ['a comma-separated interest string', member({ interests: 'climate, civic tech' })],
  ['a JSON-encoded skill list', member({ skills: '["Python"]' })],
  ['one real entry among blanks', member({ skills: ['', 'HCD'] })],
  ['no bio or photo', member({ skills: ['Python'], bio: '', image_url: null })],
]) {
  assert.equal(wantsCuriosityPrompt(profile), false, `not asked again: ${label}`);
}

assert.equal(wantsCuriosityPrompt(null), false, 'no profile yet, no prompt');

// The prompt stays optional and leads to Edit Profile, never a setup gate.
assert.match(source, /It’s optional, and you can skip it\./);
assert.match(source, /data-home-action="edit-profile">Share your interests</);
assert.doesNotMatch(source, /filled < 4/, 'the old five-field completeness count is gone');

console.log('Home curiosity prompt: all checks passed');
