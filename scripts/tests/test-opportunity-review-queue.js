#!/usr/bin/env node
const assert=require('node:assert/strict');
const {reviewCandidates}=require('../opportunity-review-queue');
const now=Date.parse('2026-11-26');
const p={organization:'Provider',sourceUrl:'https://example.org/volunteer?utm_source=x',status:'published'};
const e={organization:'Nearify',title:'Meetup',sourceUrl:'https://nearify.org/events/event.html?id=1',startsAt:'2026-12-01',attendees:['private']};
const q=reviewCandidates([p,{...p,sourceUrl:'https://example.org/volunteer'}],[e,{...e,startsAt:'2026-11-25'},{...e,sourceUrl:'https://example.org/event'}],now);
assert.equal(q.candidates.length,2);
assert.equal(q.candidates[0].sourceUrl,'https://example.org/volunteer');
assert.ok(q.candidates.every(x=>x.status==='needs_review'&&x.participationType===null));
assert.equal(q.candidates[1].attendees,undefined);
assert.equal(q.candidates[1].geographicRelevance,null);
assert.throws(()=>reviewCandidates(null,[]),TypeError);
console.log('Unified review queue checks passed');
