#!/usr/bin/env node
// Home's "Pick up where you left off" (home-view.js): which task comes first,
// and the member's projects however old they are. Runs the real module.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('assets/js/home-view.js', 'utf8');
assert.match(source, /from\('project_tasks'\)/);
assert.match(source, /from\('capability_attempts'\)/);
assert.match(source, /viewProjectDetails/);
assert.match(source, /viewProjectTask/);
assert.match(source, /Record what happened/);

const page = { addEventListener() {}, setTimeout, console, Promise, Date, Map, Set, Number, String, document: { body: { dataset: {} } } };
page.window = page;
vm.createContext(page);
vm.runInContext(source, page);
const { chooseNextTask, loadWork } = page.HomeViewTesting;

const now = Date.parse('2026-10-22T12:00:00Z');
const open = { id: 'a', status: 'open', created_at: '2026-10-01' };
const going = { id: 'b', status: 'in_progress', created_at: '2026-10-10' };
const overdue = { id: 'c', status: 'open', due_date: '2026-10-20', created_at: '2026-10-15' };
assert.equal(chooseNextTask([open, going], now).id, 'b', 'work in progress comes first');
assert.equal(chooseNextTask([open, going, overdue], now).id, 'b', 'in progress outranks overdue alone');
assert.equal(chooseNextTask([open, overdue], now).id, 'c', 'overdue outranks not started');
assert.equal(chooseNextTask([{ id: 'x', status: 'open', created_at: '2026-10-05' }, open], now).id, 'a', 'equal tasks: the one waiting longest');
assert.equal(chooseNextTask([], now), null);

// A project the member joined long ago (beyond the 50 newest in the whole
// community) is still theirs; a pending membership is not.
function fakeClient(rows) {
  const queries = [];
  const from = (table) => {
    const query = { table, filters: [] };
    queries.push(query);
    const builder = {
      select() { return builder; },
      eq(column, value) { query.filters.push(['eq', column, value]); return builder; },
      in(column, values) { query.filters.push(['in', column, values]); return builder; },
      order() { return builder; },
      limit() { return builder; },
      then(resolve) {
        let data = rows[table] || [];
        for (const [kind, column, value] of query.filters) {
          data = data.filter(row => kind === 'eq' ? row[column] === value : value.includes(row[column]));
        }
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return builder;
  };
  return { from, queries };
}

(async () => {
  const projects = [{ id: 'mine', creator_id: 'me', title: 'Mine', created_at: '2026-10-01' }, { id: 'old', creator_id: 'x', title: 'Old', created_at: '2020-01-01' }, { id: 'asked', creator_id: 'y', title: 'Asked', created_at: '2026-09-01' }];
  for (let i = 0; i < 60; i++) projects.push({ id: `new-${i}`, creator_id: 'z', title: `New ${i}`, created_at: '2026-10-20' });
  page.supabase = fakeClient({
    projects,
    project_members: [{ project_id: 'old', user_id: 'me', role: 'member' }, { project_id: 'asked', user_id: 'me', role: 'pending' }],
    project_tasks: [{ id: 't1', project_id: 'old', title: 'Old task', status: 'open' }],
    capability_attempts: [],
  });
  const work = await loadWork('me');
  assert.equal(JSON.stringify(work.projects.map(p => p.id)), '["mine","old"]', 'created and accepted projects, however old; not pending ones');
  assert.equal(work.tasks[0].project.title, 'Old', 'tasks carry their project');
  console.log('Home continuity (next task and your projects) checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
