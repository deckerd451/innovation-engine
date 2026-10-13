#!/usr/bin/env node
// LIVE model-quality evaluation for buildspace-assist. NOT part of npm test.
//
// It runs the real service (handler, retrieval, prompt, validator) with the
// real Anthropic adapter against the fixture community, for a set of varied
// unfamiliar objectives, and records effort measures per case. It costs money
// and sends the fixture text (no real member data) to the provider, so it
// refuses to run unless explicitly invoked with --live and a key:
//
//   ANTHROPIC_API_KEY=… node scripts/eval/assist-eval.mjs --live [--model claude-sonnet-5-5] [--out report.json]
//
// Automated measures cannot judge usefulness. The report includes a blank
// rubric per case for a human reviewer: would this save the member work?
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { createFakeSupabase } = require(path.join(root, 'scripts/tests/fixtures/fake-supabase.js'));
const { ID, seed } = require(path.join(root, 'scripts/tests/fixtures/assistance-fixtures.js'));
const { createHandler } = await import(path.join(root, 'supabase/functions/_shared/assist/handler.mjs'));
const { anthropicProvider } = await import(path.join(root, 'supabase/functions/_shared/assist/providers.mjs'));
const { distinctiveTerms } = await import(path.join(root, 'supabase/functions/_shared/assist/contract.mjs'));

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
if (!args.includes('--live') || !process.env.ANTHROPIC_API_KEY) {
  console.error('Refusing to run: this calls a paid model provider. Pass --live and set ANTHROPIC_API_KEY (authorized key only).');
  process.exit(2);
}

const data = seed();
const extraTask = (id, title, description) => { data.project_tasks.push({ id, project_id: ID.harbor, title, description, status: 'open', priority: 'medium', due_date: null, created_at: '2026-09-10T00:00:00Z' }); return id; };
const CASES = [
  { name: 'Ambiguous: Supply Agents', expect: 'clarify', body: { mode: 'task', projectId: ID.harbor, taskId: ID.agentsTask } },
  { name: 'Supply Agents → AI agents', expect: 'assist', body: { mode: 'task', projectId: ID.harbor, taskId: ID.agentsTask, clarifications: [{ question: 'For Harborhack, what kind of agents are you trying to supply?', answer: 'AI agents for hackathon teams to build with' }] } },
  { name: 'Supply Agents → people', expect: 'assist', body: { mode: 'task', projectId: ID.harbor, taskId: ID.agentsTask, clarifications: [{ question: 'For Harborhack, what kind of agents are you trying to supply?', answer: 'People acting as team agents/liaisons' }] } },
  { name: 'Shuttle schedule', expect: 'assist|provisional', body: { mode: 'task', projectId: ID.harbor, taskId: extraTask('e0000000-0000-4000-8000-000000000001', 'Shuttle bus schedule', 'Venue is 20 min from campus. Two buses?') } },
  { name: 'Wifi for 300', expect: 'assist|provisional|clarify', body: { mode: 'task', projectId: ID.harbor, taskId: extraTask('e0000000-0000-4000-8000-000000000002', 'Wifi for 300 people', 'Venue says "should be fine"') } },
  { name: 'Code of conduct', expect: 'assist', body: { mode: 'task', projectId: ID.harbor, taskId: extraTask('e0000000-0000-4000-8000-000000000003', 'Code of conduct', '') } },
  { name: 'Objective: meetup platform move', expect: 'assist|clarify', body: { mode: 'objective', objective: 'Move our meetup group from Discord to something with better threads' } },
  { name: 'Objective: grant budget mismatch', expect: 'assist|provisional', body: { mode: 'objective', objective: 'Grant budget says $4,200 but our quotes add up to $5,100 — fix before Friday' } },
];

const ledger = { rpc: async name => (name === 'claim_assistance_ai_request' ? { data: { allowed: true, id: 'eval' }, error: null } : { data: null, error: null }) };
const provider = anthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY, model: flag('--model') || 'claude-sonnet-5-5', fetchImpl: fetch });
const handler = createHandler({
  env: { BUILDSPACE_AI_APPROVED_PROVIDERS: 'anthropic', BUILDSPACE_AI_TIMEOUT_MS: '45000' },
  createUserClient: () => createFakeSupabase(data, { session: { user: { id: 'auth-me' } } }),
  createLedgerClient: () => ledger,
  providers: { anthropic: provider },
  log: entry => process.stderr.write(`${JSON.stringify(entry)}\n`),
});

const report = { model: provider.model, ranAt: new Date().toISOString(), cases: [] };
for (const testCase of CASES) {
  const started = Date.now();
  const response = await handler(new Request('https://eval.local/buildspace-assist', { method: 'POST', headers: { authorization: 'Bearer eval', 'content-type': 'application/json' }, body: JSON.stringify({ version: 1, ...testCase.body }) }));
  const json = await response.json();
  const a = json.assistance;
  const blocks = a?.intervention?.blocks || [];
  const fields = blocks.filter(block => block.type === 'fields').flatMap(block => block.items);
  const context = [testCase.body.objective, ...(testCase.body.clarifications || []).map(item => item.answer), data.project_tasks.find(task => task.id === testCase.body.taskId)?.title, data.project_tasks.find(task => task.id === testCase.body.taskId)?.description].filter(Boolean).join(' ');
  const workText = JSON.stringify(blocks).toLowerCase();
  const terms = distinctiveTerms(context);
  report.cases.push({
    name: testCase.name,
    expectedMode: testCase.expect,
    status: json.status,
    mode: a?.mode || null,
    modeAsExpected: Boolean(a && testCase.expect.split('|').includes(a.mode)),
    questionsBeforeHelp: a?.mode === 'clarify' ? 1 : 0,
    question: a?.clarification?.question || null,
    blocks: blocks.map(block => block.type),
    emptyFields: fields.filter(item => !item.value).length,
    contextTermsReused: terms.length ? `${terms.filter(term => workText.includes(term)).length}/${terms.length}` : 'n/a',
    communityUsed: (json.communityUsed || []).length,
    latencyMs: Date.now() - started,
    output: json,
    humanRubric: { savesMemberWork: null, specificToObjective: null, factualOrLabelledAsAssumption: null, wouldActOnIt: null, notes: '' },
  });
  console.log(`${testCase.name}: ${json.status}${a ? ` · ${a.mode}` : ''} · ${Date.now() - started}ms`);
}
const out = flag('--out') || path.join(process.cwd(), `assist-eval-${Date.now()}.json`);
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\nReport: ${out}\nAutomated measures only. Fill in humanRubric for each case before drawing conclusions about quality.`);
