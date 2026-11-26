#!/usr/bin/env node
const assert=require('node:assert/strict');
const {matchOpportunities}=require('../opportunity-matching');
const now=Date.parse('2026-11-26T12:00:00Z');
const base={status:'published',reviewedAt:'2026-11-25',deadline:'2026-12-01',sourceUrl:'https://example.org'};
const inventory={schemaVersion:1,opportunities:[{...base,title:'Food',topics:['food']},{...base,title:'Garden',topics:['garden','Garden']},{...base,title:'Expired',deadline:'2026-11-25',topics:['garden']}]};
assert.deepEqual(matchOpportunities(inventory,[' GARDEN '],now).map(x=>x.opportunity.title),['Garden','Food']);
assert.deepEqual(matchOpportunities(inventory,['garden'],now)[0].matchedTopics,['garden']);
assert.deepEqual(matchOpportunities(inventory,[],now).map(x=>x.opportunity.title),['Food','Garden']);
console.log('Opportunity matching checks passed');
