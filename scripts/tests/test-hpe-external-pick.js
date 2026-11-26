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

const garden={...row,title:'Garden',sourceUrl:'https://example.org/garden',topics:['Garden','garden']};
assert.equal(pick([row,garden],new Set(),now,[' GARDEN ']).title,'Garden');
assert.equal(pick([row,garden],new Set(),now,[]).url,row.sourceUrl);
assert.equal(pick([row,garden],new Set([garden.sourceUrl]),now,['garden']).url,row.sourceUrl);
assert.equal(pick([row,{...garden,deadline:'2026-11-25'}],new Set(),now,['garden']).url,row.sourceUrl);

const eligible=page.HomeViewTesting.pilotEligible;
const consent={memberId:'a',adultConfirmed:true,scope:'charleston-sc',consentVersion:1};
assert.equal(eligible(true,consent,'a'),true);
for(const args of [[false,consent,'a'],[true,null,'a'],[true,consent,'b'],[true,{...consent,adultConfirmed:false},'a'],[true,{...consent,scope:'other'},'a']]) assert.equal(eligible(...args),false);
assert.equal(pick([row],new Set(),now,[],'charleston-sc'),null);
assert.equal(pick([{...row,geographicRelevance:'charleston-sc',eligibility:'adult_public',participationType:'contribution'}],new Set(),now,[],'charleston-sc').url,row.sourceUrl);
assert.ok(clear.includes('pilotEnrollment = null'));

assert.ok(source.includes('data-pilot-control hidden'));
assert.ok(source.includes('data-pilot-join disabled'));
assert.ok(source.includes('if (!confirm.checked) return;'));
page.currentUserProfile={id:'a'};
page.HPEParticipationPilot=true;
assert.equal(page.HomeView.enrollPilot({adultConfirmed:false,scope:'charleston-sc',consentVersion:1}),false);
assert.equal(page.HomeView.enrollPilot({adultConfirmed:true,scope:'charleston-sc',consentVersion:1}),true);
page.HomeView.withdrawPilot();
page.HPEParticipationPilot=false;
assert.equal(page.HomeView.enrollPilot({adultConfirmed:true,scope:'charleston-sc',consentVersion:1}),false);


const firstPath = {...row, pathwayId:'dog-care', title:'Dog care'};
const secondPath = {...row, pathwayId:'cat-care', title:'Cat care'};
const firstPick = pick([firstPath,secondPath],new Set(),now);
assert.equal(firstPick.title,'Dog care');
assert.equal(firstPick.dismissalKey,JSON.stringify([row.sourceUrl,'dog-care']));
const skipped = new Set([firstPick.dismissalKey]);
const secondPick = pick([firstPath,secondPath],skipped,now);
assert.equal(secondPick.title,'Cat care');
skipped.add(secondPick.dismissalKey);
assert.equal(pick([firstPath,secondPath],skipped,now),null);
for (const pathwayId of ['', 'UPPER', 'bad/path', 123, 'a'.repeat(81)]) {
  assert.equal(pick([{...row,pathwayId}],new Set(),now),null);
}
assert.equal(pick([row],new Set([row.sourceUrl]),now),null);
console.log('Independent pathway dismissal checks passed');
