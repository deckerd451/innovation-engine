#!/usr/bin/env node
// Behavioral acceptance tests for the unified assistance engine and its
// community/persistence integration. Modules run in a node:vm sandbox with a
// test-only fake Supabase client (scripts/tests/fixtures). These verify
// workflow behaviour; they cannot prove real-world usefulness.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createFakeSupabase } = require('./fixtures/fake-supabase.js');
const { ID, seed } = require('./fixtures/assistance-fixtures.js');

function load(db, me = ID.me) {
  const window = { escapeHtml: s => String(s ?? ''), dispatchEvent() {}, addEventListener() {}, CustomEvent: function () {}, matchMedia: () => ({ matches: true }), localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  window.currentUserProfile = { id: me };
  window.supabase = db;
  const context = { window, document: { getElementById: () => null, querySelector: () => null, body: { classList: { contains: () => false, add() {}, remove() {} } } }, console, CustomEvent: function () {}, CSS: { escape: s => s } };
  for (const file of ['assets/js/assistance-interventions.js', 'assets/js/project-tasks.js', 'assets/js/capability-memory.js', 'assets/js/mobile-goal-discovery.js', 'assets/js/mobile-task-assistance.js']) {
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return window;
}

(async () => {
  const fake = createFakeSupabase(seed());
  const w = load(fake);
  const E = w.AssistanceEngine;

  // ---- Meaningful-help gate holds for every intervention the engine can produce.
  for (const playbook of E.PLAYBOOKS) {
    playbook.steps.forEach((step, index) => {
      const verdict = E.isMeaningful({ blocks: step.blocks({ objective: 'x', shortObjective: 'x', event: '' }, {}, {}) }, 'x');
      assert.ok(verdict.ok, `${playbook.id} step ${index} must be meaningful: ${verdict.reasons}`);
    });
  }
  for (const [key, obstacle] of Object.entries(E.OBSTACLES)) {
    assert.ok(E.isMeaningful({ blocks: obstacle.blocks({ objective: 'x', shortObjective: 'x' }, {}) }, 'x').ok, `obstacle ${key} must be meaningful`);
  }
  // ...and rejects the known non-help patterns.
  assert.equal(E.isMeaningful({ blocks: [{ type: 'list', label: 'Next', items: ['Continue task', 'Mark complete'] }] }, 'select speakers').ok, false, 'task controls alone are not help');
  assert.equal(E.isMeaningful({ blocks: [{ type: 'message', label: 'select speakers', body: 'select speakers' }] }, 'select speakers').ok, false, 'restating the objective is not help');
  assert.equal(E.isMeaningful({ blocks: [{ type: 'fields', id: 'f', label: 'Plan', items: [{ label: 'a', value: 'Make a plan and stay motivated. '.repeat(10) }, { label: 'b' }, { label: 'c' }] }] }, 'x').ok, false, 'generic advice is rejected');

  // ---- Scenario A: HarborHack speaker selection from the task alone.
  const speaker = E.decide({ objective: 'select speaker(s)', source: 'task', projectTitle: 'Harborhack 2026 prep' });
  assert.equal(speaker.playbook.id, 'speaker-selection');
  assert.equal(speaker.objective, 'select speaker(s)', 'the member’s task title is preserved verbatim');
  assert.equal(speaker.outcome.inferred, true, 'the success definition is labelled as inferred');
  const kinds = speaker.intervention.blocks.map(b => b.type);
  assert.ok(kinds.includes('matrix') && kinds.includes('checklist'), 'speaker help includes criteria and a ranking aid');
  assert.match(JSON.stringify(speaker.intervention.blocks), /Harborhack 2026/, 'event name comes from the project, not invented');
  assert.doesNotMatch(JSON.stringify(speaker.intervention.blocks), /Check connected people/, 'the old directory-only action is gone');
  // Ranking is computed from the member’s scores, never from invented names.
  const shortlist = speaker.intervention.blocks.find(b => b.type === 'matrix');
  assert.equal(E.rankMatrix(shortlist, {}).length, 0, 'no candidates are invented');
  const values = { 'shortlist.rows': [{ name: 'Candidate A', scores: { fit: 3, delivery: 2, available: 3, cost: 3 } }, { name: 'Candidate B', scores: { fit: 2, delivery: 3, available: 1, cost: 2 } }] };
  assert.equal(E.rankMatrix(shortlist, values)[0].name, 'Candidate A');
  const step2 = E.decide({ objective: 'select speaker(s)', source: 'task', projectTitle: 'Harborhack 2026 prep', state: { step: 1, values } });
  const invitation = step2.intervention.blocks.find(b => b.type === 'message');
  assert.match(invitation.body, /Hi Candidate A/, 'the invitation is addressed to the member’s top-ranked candidate');
  assert.match(invitation.body, /20-minute talk/, 'prefilled brief values flow into the message');
  assert.equal(step2.stepIndex, 1);

  // The demonstration customer-interview method is rejected for speakers; a
  // relevant, community-shared speaker method is accepted with a reason; a
  // private package from someone else never reaches the client.
  const speakerMethods = await w.MobileTaskAssistanceTesting.findMethods('select speaker(s)');
  const speakerIds = speakerMethods.methods.map(m => m.id);
  assert.ok(!speakerIds.includes(ID.demoPkg), 'Scenario A: customer-interview demo must not be recommended for speakers');
  assert.ok(speakerIds.includes(ID.danaPkg), 'Gate 2: relevant authorized community method improves the result');
  assert.ok(!speakerIds.includes(ID.rileyPrivatePkg), 'Scenario E: private package of another member is never returned');
  assert.match(E.methodRelevance(speakerMethods.methods[0], 'select speaker(s)').reason, /choosing speakers/);
  // People: only accepted connections, matched on what their profile lists.
  const people = await w.MobileTaskAssistanceTesting.findPeople(E.searchTerms(speaker, {}), ID.me);
  assert.equal(JSON.stringify(people.map(p => p.person.id)), JSON.stringify([ID.dana]), 'only the accepted connection whose profile lists a relevant skill');
  assert.match(people[0].match.reason, /Public Speaking/);

  // ---- Scenario B: business idea validation without a project.
  const validation = E.decide({ objective: 'Validate my business idea before I quit my job', source: 'member' });
  assert.equal(validation.playbook.id, 'idea-validation');
  assert.ok(validation.intervention.blocks.find(b => b.id === 'assumption').items.length >= 4, 'a concrete validation brief');
  const validationMethods = await w.MobileTaskAssistanceTesting.findMethods('Validate my business idea before I quit my job');
  const demo = validationMethods.methods.find(m => m.id === ID.demoPkg);
  assert.ok(demo, 'Scenario B: demonstration interview method surfaces when genuinely relevant');
  const card = w.CapabilityMemory.renderPackageCard(demo, validationMethods.stats, 'Validate my business idea', { canUse: true, actionLabel: 'Use this method' });
  assert.match(card, /Demonstration example · untested/, 'demonstration status is labelled');
  assert.doesNotMatch(card, /Verified/, 'never presented as verified');

  // ---- Scenario C / H: no community knowledge, unfamiliar objective.
  for (const objective of ['Learn conversational Spanish before my trip in May', 'Buy a new bluetooth speaker for the office', 'Fix the event loop bug in our Node service']) {
    const decision = E.decide({ objective, source: 'member' });
    assert.equal(decision.playbook, null, `${objective}: no confident template`);
    assert.ok(decision.clarify && decision.clarify.options.length === 4, `${objective}: one clarifying question`);
    assert.match(decision.clarify.note, /doesn’t have a guide/, 'capability limitation stated transparently');
    const methods = await w.MobileTaskAssistanceTesting.findMethods(objective);
    assert.equal(methods.methods.length, 0, `${objective}: no weakly related methods`);
    const answered = E.decide({ objective, source: 'member', state: { obstacle: 'decide', values: {} } });
    assert.ok(answered.intervention && E.isMeaningful(answered.intervention, objective).ok, `${objective}: useful standalone intervention after one answer`);
  }
  // Generic words alone never establish relevance.
  assert.equal(E.methodRelevance({ title: 'Project work prep help', goal: 'Plan the work' }, 'Help me prep my project work').relevant, false);
  // "Not this?" overrides the inference and asks instead of insisting.
  assert.ok(E.decide({ objective: 'select speaker(s)', state: { overridden: true } }).clarify);

  // ---- Scenario D: continuity through the existing task description.
  const task = fake.__db.project_tasks.find(t => t.id === ID.speakerTask);
  let description = E.writeNotes('Keynote + 2 lightning talks', { playbook: 'speaker-selection', step: 1, values }, 'Choosing speakers — Invite');
  description = E.appendProgress(description, 'Took this step', 'Shortlist agreed with co-organizers', new Date('2026-10-12T12:00:00Z'));
  const parsed = E.parseNotes(description);
  assert.equal(parsed.purpose, 'Keynote + 2 lightning talks', 'member text is kept separate from working notes');
  assert.equal(parsed.state.step, 1);
  assert.equal(parsed.state.values['shortlist.rows'][0].name, 'Candidate A');
  assert.equal(JSON.stringify(parsed.progress.at(-1)), JSON.stringify({ date: '2026-10-12', kind: 'Took this step', note: 'Shortlist agreed with co-organizers' }));
  assert.match(description, /member-reported/, 'progress is labelled as member-reported');
  const rewritten = E.writeNotes(description, { step: 2, values: {} }, 'x');
  assert.equal((rewritten.match(/Buildspace working notes/g) || []).length, 1, 'rewriting never duplicates the notes block');
  assert.equal(E.parseNotes(rewritten).progress.length, 1, 'progress history survives rewrites');
  // Saving through the real task API persists for the team and resumes later.
  await w.ProjectTasks.updateTask(task, { description }, ID.me);
  const resumed = E.parseNotes(fake.__db.project_tasks.find(t => t.id === ID.speakerTask).description);
  const resumedDecision = E.decide({ objective: task.title, source: 'task', projectTitle: 'Harborhack 2026 prep', state: resumed.state });
  assert.equal(resumedDecision.step.title, 'Invite your top choices', 'returns to the next unresolved step');
  // Reporting progress never marks the task done.
  assert.notEqual(fake.__db.project_tasks.find(t => t.id === ID.speakerTask).status, 'done');

  // ---- Scenario E: authorization.
  const { canWorkOn } = w.MobileTaskAssistanceTesting;
  const harbor = fake.__db.projects.find(p => p.id === ID.harbor);
  const stealth = fake.__db.projects.find(p => p.id === ID.stealth);
  assert.equal(canWorkOn(harbor, null, ID.me), true, 'creator can work');
  assert.equal(canWorkOn(stealth, null, ID.me), false, 'no membership row means no work access (was a bug)');
  assert.equal(canWorkOn(stealth, { user_id: ID.me, role: 'pending' }, ID.me), false, 'pending members cannot work');
  assert.equal(canWorkOn(stealth, { user_id: ID.me, role: 'member' }, ID.me), true);
  const hiddenTask = await fake.from('project_tasks').select('*').eq('id', ID.stealthTask).maybeSingle();
  assert.equal(hiddenTask.data, null, 'another team’s task is not readable');
  await assert.rejects(w.ProjectTasks.updateTask({ id: ID.stealthTask, project_id: ID.stealth, status: 'open' }, { status: 'done' }, ID.me), 'writes to another team’s task are refused by the data layer');
  const unrelatedProjects = await w.MobileTaskAssistanceTesting.findProjects('Choose keynote speakers for investor day', ID.me, null);
  assert.ok(!unrelatedProjects.some(p => p.project.id === ID.stealth), 'projects the member does not belong to are not suggested');

  // ---- Scenario F: authorized learning reaches a later member, labelled untested.
  await assert.rejects(w.CapabilityMemory.savePackage({ title: 't', goal: 'g', steps: ['s'] }, ID.me), /project/, 'learning needs a project the member belongs to');
  const saved = await w.CapabilityMemory.savePackage({ project_id: ID.harbor, title: 'Choosing speakers: what worked for Harborhack', goal: 'Select speakers for a student hackathon', summary: 'Two of three sponsor engineers agreed.', steps: ['Agree criteria', 'Invite top three', 'Confirm logistics'], share: true }, ID.me);
  assert.equal(saved.permission_mode, 'community');
  assert.equal(saved.evidence_status, 'untested', 'new learning can never claim evidence');
  const privateSaved = await w.CapabilityMemory.savePackage({ project_id: ID.harbor, title: 'Private speaker notes', goal: 'Select keynote speakers', steps: ['x'] }, ID.me);
  assert.equal(privateSaved.permission_mode, 'private', 'sharing is opt-in');
  const later = load(fake, ID.sam);
  fake.__db.__me = ID.sam;
  const laterMethods = await later.MobileTaskAssistanceTesting.findMethods('Find keynote speakers for our community conference');
  const reused = laterMethods.methods.find(m => m.id === saved.id);
  assert.ok(reused, 'Gate 6: a later member’s relevant objective retrieves the shared learning');
  assert.ok(!laterMethods.methods.some(m => m.id === privateSaved.id), 'private learning stays private');
  const laterCard = later.CapabilityMemory.renderPackageCard(reused, laterMethods.stats, 'Find keynote speakers', { canUse: true });
  assert.match(laterCard, /Untested · no results yet/);
  assert.match(laterCard, /Why it may fit: Also about choosing speakers/);
  fake.__db.__me = ID.me;

  console.log('assistance engine acceptance scenarios A–F, H and meaningful-help gate passed');
})().catch(error => { console.error(error); process.exit(1); });
