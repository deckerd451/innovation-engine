#!/usr/bin/env node
// Contract-level tests: request validation, output validation gates, and the
// retrieval layer's own permission filter (defence in depth behind RLS).
const assert = require('node:assert/strict');
const path = require('node:path');
const outputs = require('./fixtures/assist-model-outputs.js');

const lib = file => import(path.join(__dirname, '../../supabase/functions/_shared/assist', file));
const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

(async () => {
  const { validateRequest, validateAssistance, distinctiveTerms, OUTPUT_SCHEMA, CONTRACT_VERSION } = await lib('contract.mjs');
  assert.equal(CONTRACT_VERSION, 1);

  // Requests
  assert.equal(validateRequest({ version: 1, mode: 'task', projectId: UUID_A, taskId: UUID_B }).ok, true);
  assert.equal(validateRequest({ version: 1, mode: 'objective', objective: 'x'.repeat(281) }).ok, false);
  assert.equal(validateRequest({ version: 1, mode: 'objective', objective: '   ' }).ok, false);
  assert.equal(validateRequest({ version: 1, mode: 'task', projectId: "'; drop table", taskId: UUID_B }).ok, false);
  assert.equal(validateRequest({ version: 1, mode: 'objective', objective: 'ok', clarifications: new Array(4).fill({ question: 'q', answer: 'a' }) }).ok, false);
  assert.equal(validateRequest({ version: 1, mode: 'objective', objective: 'ok', providerPreference: '../../etc' }).ok, false);
  assert.equal(validateRequest({ version: 1, mode: 'objective', objective: 'ok‮reversed' }).value.objective, 'okreversed', 'bidi controls are stripped');
  assert.equal(validateRequest([]).ok, false);

  // Output schema is provider-neutral JSON Schema
  assert.equal(OUTPUT_SCHEMA.type, 'object');
  assert.ok(!JSON.stringify(OUTPUT_SCHEMA).includes('anthropic'));

  const terms = distinctiveTerms('Supply Agents Agent Heights? What other Agents? Harborhack 2026 prep');
  assert.ok(terms.includes('agent') && terms.includes('harborhack') && !terms.includes('prep') && !terms.includes('2026'));
  const ctx = { refs: {}, contextTerms: terms, clarifications: [] };

  const clarify = validateAssistance(outputs.clarifyAgents(), ctx);
  assert.equal(clarify.ok, true, clarify.errors.join('; '));
  const two = outputs.clarifyAgents();
  two.clarification.question = 'Which agents? And by when?';
  assert.ok(validateAssistance(two, ctx).errors.includes('clarification must ask exactly one question'));
  const repeat = validateAssistance(outputs.clarifyAgents(), { ...ctx, clarifications: [{ question: outputs.clarifyAgents().clarification.question, answer: 'x' }] });
  assert.ok(repeat.errors.includes('clarification repeats a question already answered'));
  const forced = validateAssistance(outputs.clarifyAgents(), { ...ctx, clarifications: [1, 2, 3].map(n => ({ question: `q${n}`, answer: 'a' })) });
  assert.ok(forced.errors.includes('clarification limit reached; assistance must be provided'));
  for (const generic of ['What does success look like for Harborhack agents?', 'Can you clarify the agents task?', 'What’s blocking you on agents?']) {
    const out = outputs.clarifyAgents();
    out.clarification.question = generic;
    assert.equal(validateAssistance(out, ctx).ok, false, generic);
  }

  const people = validateAssistance(outputs.assistPeopleAgents(), ctx);
  assert.equal(people.ok, true, people.errors.join('; '));
  assert.deepEqual(people.value.intervention.blocks.map(block => block.id), ['b1', 'b2'], 'server assigns block ids');
  assert.deepEqual(people.value.intervention.blocks[0].items.map(item => item.key), ['what-an-agent-does', 'time-needed', 'who-fits']);

  const platitude = outputs.assistPeopleAgents();
  platitude.intervention.why = 'Break it down into smaller steps and stay motivated.';
  assert.ok(validateAssistance(platitude, ctx).errors.includes('generic advice'));
  const venue = outputs.assistPeopleAgents();
  venue.intervention.why = 'The venue is available Saturday, so a short role brief and a ready invitation come first.';
  assert.equal(validateAssistance(venue, ctx).ok, true, 'facts about things are not claims about people');
  const personClaim = outputs.assistPeopleAgents();
  personClaim.intervention.why = 'P1 is available all weekend. Start there.';
  assert.ok(validateAssistance(personClaim, { ...ctx, refs: { P1: { kind: 'person', name: 'X' } } }).errors.includes('unsupported claim about people'));
  const unsupported = outputs.assistPeopleAgents();
  unsupported.intervention.blocks = [{ type: 'diagram', label: 'x' }];
  assert.equal(validateAssistance(unsupported, ctx).ok, false);
  const echo = outputs.assistPeopleAgents();
  echo.intervention.blocks = [{ type: 'checklist', label: 'Supply Agents', items: [{ text: 'Supply Agents' }, { text: 'Supply Agents' }, { text: 'Supply Agents' }] }];
  assert.ok(validateAssistance(echo, ctx).errors.includes('too little substance beyond restating the objective'));
  const provisional = outputs.assistPeopleAgents();
  provisional.mode = 'provisional';
  assert.ok(validateAssistance(provisional, ctx).errors.includes('provisional mode must name the critical uncertainty'));
  provisional.uncertainties = [{ about: 'Which kind of agents', impact: 'high' }];
  assert.equal(validateAssistance(provisional, ctx).ok, true);
  const huge = outputs.assistPeopleAgents();
  huge.intervention.blocks[1].body = 'y'.repeat(10000);
  assert.ok(validateAssistance(huge, ctx).value.intervention.blocks[1].body.length <= 1500, 'strings are bounded');
  assert.equal(validateAssistance('{"mode":"assist"}', ctx).ok, false);
  assert.equal(validateAssistance(null, ctx).ok, false);
  console.log('✅ Contract: requests bounded; generic/duplicate/extra questions, worksheets, platitudes, echoes and unsupported blocks rejected');

  // Retrieval filters again even if a client returned rows it should not have.
  const { loadCommunity, communityForModel } = await lib('retrieval.mjs');
  const leakyRow = { id: 'p1', creator_id: 'someone-else', title: 'Agent vendor shortlist for hackathon', goal: 'agent vendors hackathon', summary: 'secret', steps: [], constraints: {}, permission_mode: 'private', evidence_status: 'untested' };
  const ownRow = { ...leakyRow, id: 'p2', creator_id: 'me', summary: 'mine' };
  const leakyDb = {
    from: table => {
      const q = { select: () => q, or: () => q, order: () => q, limit: () => q, eq: () => q, in: () => q,
        then: resolve => resolve(table === 'capability_packages' ? { data: [leakyRow, ownRow], error: null } : table === 'connections' ? { data: [{ from_user_id: 'x', to_user_id: 'y', status: 'accepted' }, { from_user_id: 'me', to_user_id: 'z', status: 'pending' }], error: null } : { data: [{ id: 'y', name: 'Not connected', skills: ['agent hackathon'] }, { id: 'z', name: 'Pending', skills: ['agent hackathon'] }], error: null }) };
      return q;
    },
    rpc: async () => ({ data: [], error: null }),
  };
  const found = await loadCommunity(leakyDb, 'me', 'agent vendors for the hackathon');
  assert.deepEqual(found.methods.map(m => m.id), ['p2'], 'another member’s private package is dropped even if returned');
  assert.deepEqual(found.people, [], 'non-accepted or unrelated connections are dropped even if returned');
  assert.ok(!JSON.stringify(communityForModel(found)).includes('p2'), 'ids are not sent to the model');
  console.log('✅ Retrieval: server-side permission and connection filters hold even if a query over-returns');

  console.log('assistance contract tests passed');
})().catch(error => { console.error(error); process.exit(1); });
