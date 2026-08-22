#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const manager = fs.readFileSync(path.join(root, 'assets/js/organizations/opportunities.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'opportunity.html'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'assets/js/command-dashboard.js'), 'utf8');
const coordinator = fs.readFileSync(path.join(root, 'assets/js/explorer-coordinator.js'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'assets/js/node-panel.js'), 'utf8');
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
assert.match(manager, /const \{ posted_by: _ignoredPostedBy, \.\.\.safeUpdates \} = updates/, 'updateOpportunity must not submit posted_by changes');
assert.match(manager, /\.update\(\{[\s\S]{0,100}\.\.\.safeUpdates/, 'updateOpportunity must only submit sanitized updates');
assert.match(page, /profileId === opportunity\.posted_by/, 'poster view must be selected by canonical community identity');
assert.match(page, /getInterestedPeople\(opportunityId\)/, 'poster detail page must load interested people');
assert.match(page, /expressOpportunityInterest\(opportunityId\)/, 'member detail page must support expressing interest');
assert.match(page, /withdrawOpportunityInterest\(opportunityId\)/, 'member detail page must support withdrawing interest');
assert.match(manager, /name,\s*email,\s*role/, 'poster query must retrieve the interested member contact email');
assert.match(page, /href="mailto:/, 'poster must have a direct contact action for interested members');
assert.match(page, /people\.map\(\(\{ community: person, created_at \}\) => person \?/, 'null community profiles must be handled per interest row');
assert.match(page, /Profile unavailable/, 'hidden or unavailable profiles must render without exposing profile data');

assert.match(dashboard, /ExplorerCoordinator\.selectOpportunity\(\{ id, label: name \}\)/, 'the normal Opps surface must select opportunities through ExplorerCoordinator');
assert.match(coordinator, /await window\.openNodePanel\(\{ id, type: 'opportunity', name: label \}\)/, 'opportunity selection must preserve the current detail-panel flow');
assert.match(panel, /href="opportunity\.html\?id=\$\{encodeURIComponent\(opp\.id\)\}"/, 'the in-app opportunity panel must use a deployment-base-safe relative link to the canonical interest workflow');
assert.doesNotMatch(panel, /href="\/opportunity\.html\?/, 'the canonical interest link must not discard a GitHub Pages project base path');
assert.match(panel, /Express or manage interest/, 'members must see an obvious interest action in the normal in-app flow');
assert.match(panel, /View interested people/, 'posters must see an obvious interested-people action in the normal in-app flow');

assert.match(migration, /UNIQUE\s*\(opportunity_id, community_id\)/i, 'duplicate interest must be prevented in the database');
assert.match(migration, /Members and posters can view opportunity interests/, 'read access policy must be explicit');
assert.match(migration, /poster\.user_id = auth\.uid\(\)/, 'only the actual poster may read other members\' interests');
assert.match(migration, /o\.posted_by <> opportunity_interests\.community_id/, 'posters must not express interest in their own opportunity');
assert.match(migration, /BEFORE UPDATE OF posted_by ON public\.opportunities/i, 'posted_by changes must be blocked at the database boundary');
assert.match(migration, /NEW\.posted_by IS DISTINCT FROM OLD\.posted_by/, 'poster immutability must compare old and new ownership');
assert.doesNotMatch(migration, /FOR SELECT[\s\S]{0,120}USING\s*\(true\)/i, 'interested identities must not be public to all authenticated members');

const openPublicGate = page.indexOf("opportunity.status !== 'open' || opportunity.is_public !== true");
const interestLookup = page.indexOf('interest = await getOpportunityInterest(opportunityId)');
const deadlineGate = page.indexOf('deadlinePassed && !isPoster && !interest');
assert.ok(openPublicGate !== -1 && openPublicGate < interestLookup, 'closed and private opportunities must remain unavailable before interest handling');
assert.ok(interestLookup !== -1 && interestLookup < deadlineGate, 'existing interest must be loaded before applying the deadline gate');
assert.match(page, /deadlinePassed && !isPoster && !interest/, 'expired opportunities must remain available only to posters and existing interested members');
assert.match(page, /if \(isPoster\) await renderInterestedPeople\(\)/, 'poster must still load interested people after passing the deadline gate');
assert.match(page, /interest = interest\s*\?\s*\(await withdrawOpportunityInterest\(opportunityId\), null\)\s*:\s*await expressOpportunityInterest\(opportunityId\)/, 'existing interested members must retain withdrawal while new interest uses the protected insert path');
assert.match(migration, /o\.application_deadline IS NULL OR o\.application_deadline > NOW\(\)/, 'database policy must block new interest after the deadline');

console.log('Opportunity interest flow and privacy: all checks passed');
