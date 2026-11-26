#!/usr/bin/env node
const assert = require('node:assert/strict');
const {reviewQueue} = require('../opportunity-renewal');
const now = Date.parse('2026-11-26T12:00:00Z');
const row = {organization:'Example',sourceUrl:'https://example.org/volunteer',status:'published',reviewedAt:'2026-11-25T12:00:00Z',deadline:'2026-12-10T12:00:00Z'};
const classify = patch => reviewQueue({schemaVersion:1,opportunities:[{...row,...patch}]},now)[0];
assert.equal(classify({}).status,'current');
assert.equal(classify({}).reviewBy,'2026-12-02T12:00:00.000Z');
assert.equal(classify({deadline:'2026-11-28T12:00:00Z'}).status,'review_due');
assert.equal(classify({deadline:'2026-11-26T12:00:00Z'}).status,'expired');
assert.equal(classify({reviewedAt:'2026-11-19T12:00:00Z'}).status,'expired');
for(const patch of [{sourceUrl:'http://example.org'},{sourceUrl:'https://user:pass@example.org'},{reviewedAt:'2026-11-27'},{deadline:'invalid'},{status:'staged'}]) assert.equal(classify(patch).status,'invalid');
assert.throws(()=>reviewQueue({schemaVersion:2,opportunities:[]},now));
console.log('Opportunity renewal checks passed');
