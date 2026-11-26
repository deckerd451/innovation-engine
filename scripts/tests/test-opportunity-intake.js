#!/usr/bin/env node
const assert = require('node:assert/strict');
const {providerCandidates} = require('../opportunity-intake');
const row = {organization:'Example',sourceUrl:'https://example.org/volunteer',status:'published',reviewedAt:'2026-11-26'};
const result = providerCandidates({schemaVersion:1,scope:'Charleston',sources:[row,{...row,sourceUrl:row.sourceUrl+'?utm_source=test#top'},{...row,sourceUrl:'javascript:alert(1)'},{...row,sourceUrl:'https://a:b@example.org'},{...row,organization:''},null]});
assert.equal(result.length,1);
assert.equal(result[0].status,'needs_review');
assert.equal(result[0].availability,'unconfirmed');
assert.equal(result[0].reviewedAt,undefined);
assert.throws(()=>providerCandidates({schemaVersion:2,sources:[]}));
console.log('Provider intake checks passed');
