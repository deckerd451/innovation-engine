#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const page = { URL, addEventListener() {} };
page.window = page;
vm.runInNewContext(fs.readFileSync('assets/js/home-view.js','utf8'),page);
const pick = page.HomeViewTesting.externalPick;
const now = Date.parse('2026-11-26T12:00:00Z');
const row = {title:'Volunteer',organization:'Example',sourceUrl:'https://example.org/apply',status:'published',reviewedAt:'2026-11-25',deadline:'2026-12-01'};
assert.equal(pick([row],new Set(),now).url,row.sourceUrl);
for (const patch of [{status:'staged'},{sourceUrl:'javascript:alert(1)'},{sourceUrl:'https://user:pass@example.org'},{deadline:'2026-11-25'},{reviewedAt:'2026-11-01'},{reviewedAt:'2026-11-27'}]) assert.equal(pick([{...row,...patch}],new Set(),now),null);
assert.equal(pick([row],new Set([row.sourceUrl]),now),null);
assert.equal(pick(null,new Set(),now),null);
console.log('External opportunity fallback checks passed');
