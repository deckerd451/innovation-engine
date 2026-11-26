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

// Guard against moving session resets back into the deferred paint handler.
const source = fs.readFileSync('assets/js/home-view.js','utf8');
const deferred = source.slice(source.indexOf('function calmly('),source.indexOf('function paintSuggestions('));
const clear = source.slice(source.indexOf('function clear()'),source.indexOf('function show()'));
assert.ok(deferred.includes('paints.forEach'), 'deferred paint handler found');
for (const reset of ['externalGeneration += 1','externalInventory = []','externalLoadedAt = 0','externalLoading = false','externalDismissed.clear()','externalMember = null']) {
  assert.ok(!deferred.includes(reset), 'deferred paint must preserve: '+reset);
  assert.ok(clear.includes(reset), 'session clear must reset: '+reset);
}
console.log('External inventory lifecycle guard passed');
