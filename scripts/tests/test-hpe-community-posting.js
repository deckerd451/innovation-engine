#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('assets/js/organizations/organization-profile.js','utf8');
const manager=fs.readFileSync('assets/js/organizations/opportunities.js','utf8');
assert.match(source,/m\.can_post_opportunities === true/);
assert.match(source,/if \(!canPost\) return/);
assert.match(source,/name="confirmed" required/);
assert.match(source,/await manager\.refreshCurrentUser\(\)/);
assert.match(source,/await manager\.createOpportunity\(/);
assert.match(source,/organization_id: org\.id/);
assert.match(source,/escapeHtml\(opportunity\.title\)/);
assert.match(manager,/!member\.can_post_opportunities/);
console.log('Community posting contract checks passed');

assert.match(manager,/const \{ type, \.\.\.fields \} = opportunityData/);
assert.match(manager,/opportunity_type: fields\.opportunity_type \?\? type/);
assert.match(source,/opportunity_type: fields\.get\("type"\)/);
