#!/usr/bin/env node
// Client module for the intelligence layer: feature flag, transport error
// handling, defensive normalization, and the routing rule that familiar
// objectives keep their deterministic guide (no model call, no question).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const outputs = require('./fixtures/assist-model-outputs.js');

function load({ meta = 'off', stored = null, invoke } = {}) {
  const timers = [];
  const window = {
    localStorage: { getItem: key => (key === 'buildspace:intelligence' ? stored : null) },
    supabase: invoke ? { functions: { invoke } } : {},
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; },
    clearTimeout: t => clearTimeout(t),
  };
  const document = { querySelector: selector => (selector.includes('buildspace-intelligence') ? { getAttribute: () => meta } : null) };
  const context = { window, document, console };
  vm.runInNewContext(fs.readFileSync('assets/js/assistance-interventions.js', 'utf8'), context);
  vm.runInNewContext(fs.readFileSync('assets/js/assistance-intelligence.js', 'utf8'), context);
  return { AI: window.AssistanceIntelligence, engine: window.AssistanceEngine };
}

const plain = value => JSON.parse(JSON.stringify(value));

(async () => {
  const okInvoke = async () => ({ data: null, error: null });
  assert.equal(load({ meta: 'off', invoke: okInvoke }).AI.enabled(), false, 'off by default');
  assert.equal(load({ meta: 'on', invoke: okInvoke }).AI.enabled(), true);
  assert.equal(load({ meta: 'off', stored: 'on', invoke: okInvoke }).AI.enabled(), true, 'a tester can opt in on one device');
  assert.equal(load({ meta: 'on', stored: 'off', invoke: okInvoke }).AI.enabled(), false, 'and opt out');
  assert.equal(load({ meta: 'on' }).AI.enabled(), false, 'needs a Supabase client with functions');

  // Routing: familiar objectives keep the deterministic guide; unfamiliar ones are eligible.
  const { engine } = load();
  assert.ok(engine.decide({ objective: 'Select speakers for Harborhack 2026', source: 'member', state: {} }).playbook, 'speakers → deterministic guide, no question, no model call');
  const agents = engine.decide({ objective: 'Supply Agents', source: 'task', projectTitle: 'Harborhack 2026 prep', state: {} });
  assert.equal(agents.playbook, null);
  assert.equal(agents.clarify.question, 'What’s in the way right now?', 'baseline: the deployed engine asks the generic question this layer replaces');
  const src = fs.readFileSync('assets/js/mobile-task-assistance.js', 'utf8');
  assert.match(src, /if \(!AI \|\| base\.playbook \|\| session\.state\.obstacle\) return base;/, 'tailored help never overrides a matched guide or a chosen obstacle');
  assert.match(src, /window\.AssistanceIntelligence\?\.enabled\(\) && !decision\.playbook/);

  // Transport: success, structured failure, timeout, thrown error.
  const response = { version: 1, status: 'ok', assistance: { ...outputs.clarifyAgents(), intervention: null }, communityUsed: [], provenance: { provider: 'anthropic', model: 'm', generatedAt: 'now', retrieved: { methods: 0, people: 0 } } };
  let sent;
  const good = load({ meta: 'on', invoke: async (name, options) => { sent = { name, options }; return { data: response, error: null }; } }).AI;
  const ok = await good.request({ mode: 'task', projectId: 'p', taskId: 't', clarifications: [] });
  assert.equal(ok.status, 'ok');
  assert.equal(sent.name, 'buildspace-assist');
  assert.equal(sent.options.body.version, 1);
  assert.equal(sent.options.body.providerPreference, 'automatic', 'members never have to choose a provider');
  const failing = load({ meta: 'on', invoke: async () => ({ data: null, error: { context: { json: async () => ({ status: 'budget_exhausted', message: 'Tailored help has reached its limit for today.' }) } } }) }).AI;
  const budget = await failing.request({ mode: 'objective', objective: 'x' });
  assert.equal(budget.status, 'budget_exhausted');
  assert.equal(budget.retryable, false);
  assert.match(budget.message, /limit for today/);
  const slow = load({ meta: 'on', invoke: () => new Promise(() => {}) }).AI;
  const timedOut = await slow.request({ mode: 'objective', objective: 'x' }, { timeoutMs: 30 });
  assert.equal(timedOut.status, 'timeout');
  assert.equal(timedOut.retryable, true);
  const thrown = await load({ meta: 'on', invoke: async () => { throw new Error('offline'); } }).AI.request({ mode: 'objective', objective: 'x' });
  assert.equal(thrown.status, 'network_error');
  assert.equal((await load({ meta: 'off', invoke: okInvoke }).AI.request({})).status, 'disabled', 'no call while switched off');

  // Normalization rejects shapes the UI cannot render honestly.
  assert.equal(good.normalizeResponse({ ...response, version: 2 }).status, 'invalid_output');
  assert.equal(good.normalizeResponse({ ...response, assistance: { mode: 'assist', interpretation: {} } }).status, 'invalid_output', 'assist without a work product is not shown');
  const mixed = good.normalizeAssistance({ mode: 'assist', interpretation: { objective: 'o' }, intervention: { title: 't', blocks: [{ type: 'script', id: 'b1', label: '<img onerror>' }, { type: 'list', id: 'b2', label: 'L', items: ['a'] }] } });
  assert.deepEqual(plain(mixed.intervention.blocks.map(block => block.type)), ['list'], 'unknown block types are dropped');

  // Contract → decision shape the overlay renders.
  const base = engine.decide({ objective: 'Supply Agents', source: 'task', state: {} });
  const clarifyDecision = good.decisionFrom({ assistance: good.normalizeAssistance(outputs.clarifyAgents()), communityUsed: [], provenance: {} }, 1, base);
  assert.equal(clarifyDecision.intervention, null);
  assert.equal(clarifyDecision.clarify, null, 'the generic question is replaced');
  assert.match(clarifyDecision.aiClarify.question, /Harborhack/);
  const validated = (await import('../../supabase/functions/_shared/assist/contract.mjs')).validateAssistance(outputs.assistPeopleAgents(), { refs: {}, contextTerms: [] }).value;
  const assistDecision = good.decisionFrom({ assistance: good.normalizeAssistance(validated), communityUsed: [], provenance: {} }, 3, base);
  assert.equal(assistDecision.intervention.kind, 'ai');
  assert.deepEqual(plain(assistDecision.intervention.blocks.map(block => block.id)), ['ai3-b1', 'ai3-b2'], 'block ids are namespaced per generation');
  assert.equal(assistDecision.outcome.inferred, true, 'outcome is labelled as inferred');
  assert.ok(engine.isMeaningful(assistDecision.intervention, 'Supply Agents').ok, 'tailored work also passes the existing meaningful-help gate');
  const notes = engine.writeNotes('Agent Heights? What other Agents?', { values: { 'ai3-b1.what-an-agent-does': 'Looks after teams' }, ai: { gen: 3 } }, assistDecision.step.title);
  const parsed = engine.parseNotes(notes);
  assert.equal(parsed.purpose, 'Agent Heights? What other Agents?', 'the member’s description is preserved');
  assert.equal(parsed.state.ai.gen, 3, 'tailored state survives in the task notes');

  console.log('assistance intelligence client tests passed');
})().catch(error => { console.error(error); process.exit(1); });
