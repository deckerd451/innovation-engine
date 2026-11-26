#!/usr/bin/env node
const assert=require('node:assert/strict');
const {nearifyCandidates}=require('../nearify-opportunity-intake');
const now=Date.parse('2026-11-26');
const event={id:'a',name:'Community meetup',slug:'meetup',starts_at:'2026-12-01',attendees:['private'],created_by:'private'};
const rows=nearifyCandidates([event,event,{...event,id:'b',deleted_at:'2026-11-25'},{...event,id:'c',starts_at:'2026-11-25'}],now);
assert.equal(rows.length,1);
assert.equal(rows[0].sourceUrl,'https://nearify.org/events/event.html?slug=meetup&web=1');
assert.equal(rows[0].status,'needs_review');
assert.equal(rows[0].attendees,undefined);
assert.equal(rows[0].created_by,undefined);
assert.equal(nearifyCandidates([{...event,slug:null}],now)[0].sourceUrl,'https://nearify.org/events/event.html?id=a&web=1');
console.log('Nearify opportunity intake checks passed');
