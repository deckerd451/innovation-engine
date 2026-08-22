#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const manager = fs.readFileSync(path.join(root, 'assets/js/organizations/opportunities.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'opportunity.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/sql/migrations/20260822_opportunity_interests.sql'), 'utf8');

for (const exportedFunction of [
  'getOpportunityInterest',
  'expressOpportunityInterest',
  'withdrawOpportunityInterest',
  'getInterestedPeople'
]) {
  assert.match(manager, new RegExp(`export async function ${exportedFunction}\\b`), `${exportedFunction} must be exported`);
}

assert.match(manager, /error\?\.code === ["']23505["'][\s\S]*getOpportunityInterest/, 'duplicate interest retries must be idempotent');
assert.match(manager, /\.eq\("community_id", currentUserCommunityId\)/, 'interest reads and deletes must be scoped to the signed-in profile');
assert.match(page, /profileId === opportunity\.posted_by/, 'poster view must be selected by canonical community identity');
assert.match(page, /getInterestedPeople\(opportunityId\)/, 'poster detail page must load interested people');
assert.match(page, /expressOpportunityInterest\(opportunityId\)/, 'member detail page must support expressing interest');
assert.match(page, /withdrawOpportunityInterest\(opportunityId\)/, 'member detail page must support withdrawing interest');
assert.match(manager, /name,\s*email,\s*role/, 'poster query must retrieve the interested member contact email');
assert.match(page, /href="mailto:/, 'poster must have a direct contact action for interested members');
assert.match(page, /people\.map\(\(\{ community: person, created_at \}\) => person \?/, 'null community profiles must be handled per interest row');
assert.match(page, /Profile unavailable/, 'hidden or unavailable profiles must render without exposing profile data');

assert.match(migration, /UNIQUE\s*\(opportunity_id, community_id\)/i, 'duplicate interest must be prevented in the database');
assert.match(migration, /Members and posters can view opportunity interests/, 'read access policy must be explicit');
assert.match(migration, /poster\.user_id = auth\.uid\(\)/, 'only the actual poster may read other members\' interests');
assert.match(migration, /o\.posted_by <> opportunity_interests\.community_id/, 'posters must not express interest in their own opportunity');
assert.doesNotMatch(migration, /FOR SELECT[\s\S]{0,120}USING\s*\(true\)/i, 'interested identities must not be public to all authenticated members');

console.log('Opportunity interest flow and privacy: all checks passed');
