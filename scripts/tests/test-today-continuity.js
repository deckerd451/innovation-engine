#!/usr/bin/env node
// The next-task rule a project's overview uses (home-view.js chooseNextTask,
// node-panel.js), and Home's "Your community": the member's projects however
// old they are, and the people they are connected to. Home itself no longer
// picks or ranks a task. Runs the real module.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('assets/js/home-view.js', 'utf8');
assert.doesNotMatch(source, /from\('project_tasks'\)/, 'Home reads no tasks');
assert.match(source, /viewProjectDetails/);
assert.match(source, /AppNav\?\.go\?\.\('network'\)/, 'the people row opens Network');

const page = { addEventListener() {}, setTimeout, console, Promise, Date, Map, Set, Number, String, document: { body: { dataset: {} } } };
page.window = page;
vm.createContext(page);
vm.runInContext(source, page);
const { chooseNextTask, loadMine } = page.HomeViewTesting;

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
      or(expression) { query.filters.push(['or', expression]); return builder; },
      in(column, values) { query.filters.push(['in', column, values]); return builder; },
      order() { return builder; },
      limit() { return builder; },
      then(resolve) {
        let data = rows[table] || [];
        for (const [kind, column, value] of query.filters) {
          if (kind === 'or') {
            const me = /from_user_id\.eq\.([^,]+)/.exec(column)?.[1];
            data = data.filter(row => row.from_user_id === me || row.to_user_id === me);
            continue;
          }
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
    connections: [
      { from_user_id: 'me', to_user_id: 'dana', status: 'accepted' }, { from_user_id: 'sam', to_user_id: 'me', status: 'accepted' },
      { from_user_id: 'me', to_user_id: 'jordan', status: 'pending' }, { from_user_id: 'x', to_user_id: 'y', status: 'accepted' },
    ],
    community: [{ id: 'dana', name: 'Dana' }, { id: 'sam', name: 'Sam' }, { id: 'jordan', name: 'Jordan' }],
  });
  const mine = await loadMine('me');
  assert.equal(JSON.stringify(mine.projects.map(p => [p.id, !!p.started])), '[["mine",true],["old",false]]', 'created and accepted projects, however old; not pending ones; which the member started');
  assert.equal(JSON.stringify(mine.connections.map(p => p.name)), '["Dana","Sam"]', 'accepted connections in either direction; not a pending request or anyone else’s');
  assert.ok(!('tasks' in mine), 'no tasks are read for Home');
  console.log('Home continuity (next-task rule, your projects and connections) checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
