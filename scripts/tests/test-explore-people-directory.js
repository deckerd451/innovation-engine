#!/usr/bin/env node
'use strict';

// Explore → People is the community directory; Network → People stays the
// member's relationships (command-dashboard.js). Offline guards for:
//  - anyone the member is not connected to shows as "First L." with at most
//    three skills, the same identity rule as searchEngine.js and node-panel.js
//  - the directory reads community rows with the same hidden-from-discovery
//    filter as every other discovery surface, and leaves out the member
//    themselves (including a duplicate row for them)
//  - which list People shows follows the page: Network keeps accepted
//    connections and pending requests, everything else gets the directory
//  - moving between pages redraws the list and its count
// No database functions or permissions change. The rendered behaviour, with a
// synthetic stranger and a hidden member, is
// scripts/tests/browser/run-explore-people.mjs.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../assets/js/command-dashboard.js'), 'utf8');

assert.match(source, /\.from\('community'\)\s*\.select\('id, user_id, name, skills, interests'\)\s*\.or\('is_hidden\.is\.null,is_hidden\.eq\.false'\)/,
  'the directory never includes members hidden from discovery');
assert.match(source, /String\(p\.id\) !== String\(_userId\) && !\(selfAuth && String\(p\.user_id\) === selfAuth\)/,
  'the directory never includes the member themselves');
assert.match(source, /if \(connectedIds\.has\(id\)\) return \{ id: p\.id, name: p\.name, meta: 'Connected' \};\s*const name = isAdmin \? p\.name : _limitedDisplayName\(p\.name\);/,
  'full names only for accepted connections (and admins); anyone else "First L.", as search and the profile panel');
assert.match(source, /const theirs = isAdmin \? \[[^\]]*\] : _resourceTerms\(p\.skills\)\.slice\(0, 3\);/,
  'what a stranger shares comes only from what their limited profile shows (first three skills)');
assert.match(source, /const _peopleView = \(\) => \(document\.body\.dataset\.destination === 'network' \? 'network' : 'explore'\);/,
  'People follows the page: relationships in Network, the directory elsewhere');
assert.match(source, /resourceType === 'people' && _peopleView\(\) === 'explore' && _enrichedData\.directory/);
assert.match(source, /\} else if \(resourceType === 'people'\) \{[\s\S]{0,1500}_enrichedData\.acceptedConnections[\s\S]{0,600}_enrichedData\.pendingConnections[\s\S]{0,600}_dedupeById\(\[\.\.\.connected, \.\.\.pending\]\)/,
  'Network still lists accepted connections and pending requests');
assert.match(source, /window\.addEventListener\('app-destination-changed', \(\) => \{\s*_renderCompactStatus\(_currentTier\);\s*if \(_activeResourceTab === 'people'\) _renderResources\(_currentTier\);/,
  'moving between Explore and Network redraws People and its count');

console.log('Explore people directory: all checks passed');
