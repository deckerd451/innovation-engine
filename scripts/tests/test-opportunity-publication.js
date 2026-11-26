#!/usr/bin/env node
const assert = require('node:assert/strict');
const {proposeInventory} = require('../opportunity-publication');
const now=Date.parse('2026-11-26T12:00:00Z');
const row={title:'Volunteer',organization:'Example',sourceUrl:'https://example.org/volunteer',reviewStatus:'verified',reviewedAt:'2026-11-25T12:00:00Z',deadline:'2026-12-30T00:00:00Z',reviewer:'maintainer',evidenceNote:'Reviewed provider program page',availability:'provider_confirmation_required',participationType:'contribution',geographicRelevance:'charleston-sc',eligibility:'adult_public',kind:'recurring_program'};
const result=proposeInventory([row],now);
assert.equal(result.inventory.opportunities[0].deadline,'2026-12-02T12:00:00.000Z');
assert.equal(result.inventory.opportunities[0].status,'published');
assert.equal(result.inventory.opportunities[0].reviewer,undefined);
for(const patch of [{reviewer:''},{evidenceNote:''},{reviewStatus:'reachable'},{reviewedAt:'2026-11-01'},{availability:'unknown'}]) {
 const rejected=proposeInventory([{...row,...patch}],now);
 assert.equal(rejected.inventory.opportunities.length,0);
 assert.equal(rejected.rejectedCount,1);
}
console.log('Publication proposal checks passed');

assert.deepEqual(proposeInventory([{...row,topics:[' Garden ','garden',null,'x'.repeat(65)]}],now).inventory.opportunities[0].topics,['garden']);

for(const patch of [{participationType:null},{geographicRelevance:'unknown'},{eligibility:null},{kind:'scheduled_event'},{kind:'scheduled_event',startsAt:'2026-12-01'}]) assert.equal(proposeInventory([{...row,...patch}],now).rejectedCount,1);
assert.equal(proposeInventory([row],now).inventory.opportunities[0].geographicRelevance,'charleston-sc');
assert.equal(proposeInventory([{...row,kind:'scheduled_event',startsAt:'2026-12-31'}],now).rejectedCount,0);

const shared = proposeInventory([{...row,pathwayId:'garden',topics:['garden']},{...row,pathwayId:'events',topics:['events']},{...row,pathwayId:'garden',sourceUrl:row.sourceUrl+'?utm_source=test'}],now);
assert.equal(shared.rejectedCount,1);
assert.deepEqual(shared.inventory.opportunities.map(x=>[x.pathwayId,x.topics]),[['garden',['garden']],['events',['events']]]);
assert.equal(proposeInventory([{...row,pathwayId:'invalid id'}],now).rejectedCount,1);
