#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { compose } = require('../../assets/js/hpoe-compose');
const now = Date.parse('2026-11-26T00:00:00Z');
const objective = { id:'garden', shared:true, kind:'organization', description:'Trial community growing beds', capabilityGaps:['growing','coordination'] };
const needs = [{ shared:true, objectiveId:'garden', description:'Accessible growing space', capabilities:['access design'], resources:['space','water'] },
  { shared:false, objectiveId:'garden', description:'private', capabilities:['private skill'], resources:['private resource'] }];
const participants = [
  { id:'a', shared:true, capabilities:['growing'], aspirations:['coordination'] },
  { id:'b', shared:true, capabilities:['access design'] },
  { id:'c', shared:true, capabilities:['coordination'] },
  { id:'d', shared:false, capabilities:['growing','access design','coordination'] },
  { id:'e', shared:true, aspirations:['growing'] }
];
const resources = [
  { id:'space', kind:'space', shared:true, available:true, evidenceRef:'provider-review:space', verifiedAt:'2026-11-25', availableUntil:'2026-11-27' },
  { id:'old-water', kind:'water', shared:true, available:true, evidenceRef:'provider-review:old', verifiedAt:'2026-11-20', availableUntil:'2026-11-26' },
  { id:'unknown-water', kind:'water', shared:true, available:true, availableUntil:'2026-11-27' }
];
const input = { objective, needs, participants, resources };
assert.equal(compose(input, { now }), null);
const plan = compose(input, { enabled:true, now });
assert.deepEqual(plan.team.map(p=>p.id), ['a','b','c','e']);
assert.deepEqual(plan.team[0].aspirations, ['coordination']);
assert.deepEqual(plan.team[3], { id:'e', capabilities:[], aspirations:['growing'] });
assert.deepEqual(plan.sharedNeeds, ['Accessible growing space']);
assert.deepEqual(plan.missing, { capabilities:[], resources:['water'] });
assert.equal(plan.feasibility, 'prerequisites_missing');
assert.equal(plan.firstAction.item, 'water');
assert.equal(plan.verifiedResources.length, 1);
assert.equal(plan.status, 'proposal');
assert.equal(compose({...input, objective:{...objective,shared:false}}, {enabled:true,now}), null);
assert.equal(compose({...input, participants:[participants[3]]}, {enabled:true,now}), null);
const complete = compose({ ...input, objective:{...objective,kind:'project'}, resources:resources.concat({
  ...resources[0], id:'water', kind:'water', evidenceRef:'provider-review:water'
}) }, {enabled:true,now});
assert.equal(complete.feasibility, 'ready_to_discuss');
assert.match(complete.explanation, /commitments still need confirmation/);
console.log('HPOE compositional evidence, abstention and feasibility checks passed');
