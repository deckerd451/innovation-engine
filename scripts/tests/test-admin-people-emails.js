#!/usr/bin/env node
// The admin People panel gets members' emails only through the admin-only
// database functions (admin_member_emails, admin_find_members_by_email),
// never from the community table, which members -- admins included -- can't
// read email from (docs/SECURITY_MEMBER_EMAIL_PRIVACY.md). Runs
// assets/js/adminPeopleService.js against a recording stand-in client;
// synthetic profiles only.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const os = require('node:os');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const columnsWindow = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/profile-columns.js'), 'utf8'), { window: columnsWindow });

const people = [
  { id: 'p1', name: 'Ada', email: 'ada@example.test', user_role: 'Member' },
  { id: 'p2', name: 'Grace', email: 'grace@example.test', user_role: 'Admin' },
  { id: 'p3', name: 'Linus', email: 'linus@example.test', user_role: 'Member' },
];

function client({ rpcError = null } = {}) {
  const calls = [];
  const strip = (row) => { const { email, ...rest } = row; return rest; };
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      if (rpcError) return { data: null, error: rpcError };
      if (name === 'admin_member_emails') return { data: people.filter((p) => args.p_ids.includes(p.id)).map(({ id, email }) => ({ id, email })), error: null };
      if (name === 'admin_find_members_by_email') {
        const q = args.p_query.toLowerCase();
        return { data: people.filter((p) => (args.p_exact ? p.email === q : p.email.includes(q))).map(({ id, name, email }) => ({ id, name, email })), error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    from(table) {
      const q = { table, select: null, ops: [] };
      calls.push(q);
      const api = {};
      for (const op of ['eq', 'or', 'ilike', 'in', 'is', 'not', 'order', 'range', 'update', 'insert', 'delete', 'limit']) {
        api[op] = (...args) => { q.ops.push([op, ...args]); return api; };
      }
      api.select = (cols) => { q.select = cols; return api; };
      api.single = () => { q.single = true; return api; };
      api.maybeSingle = () => { q.single = true; return api; };
      api.then = (resolve) => {
        let rows = people.map(strip);
        const ins = q.ops.find(([op]) => op === 'insert');
        if (ins) rows = [{ id: 'new', ...strip(ins[1]) }];
        const idIn = q.ops.find(([op, c]) => op === 'in' && c === 'id');
        if (idIn) rows = rows.filter((r) => idIn[2].includes(r.id));
        const idEq = q.ops.find(([op, c]) => op === 'eq' && c === 'id');
        if (idEq) rows = rows.filter((r) => r.id === idEq[2]);
        resolve({ data: q.single ? rows[0] || null : rows, count: rows.length, error: null });
      };
      return api;
    },
  };
}

function noEmailFromTable(calls) {
  for (const q of calls.filter((c) => c.table)) {
    assert.doesNotMatch(String(q.select), /email/, 'no email in a table select');
    for (const [op, ...args] of q.ops) {
      if (['eq', 'or', 'ilike', 'order'].includes(op)) assert.doesNotMatch(JSON.stringify(args), /email/, `no email in .${op}()`);
    }
  }
}

(async () => {
  global.window = { BuildspaceProfileColumns: columnsWindow.BuildspaceProfileColumns };
  // Imported as a .mjs copy (the repository's package.json has no "type").
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-people-'));
  const copy = path.join(dir, 'adminPeopleService.mjs');
  fs.copyFileSync(path.join(root, 'assets/js/adminPeopleService.js'), copy);
  const realConsole = global.console;
  global.console = { ...realConsole, log() {}, warn() {}, error() {} };
  const service = await import(pathToFileURL(copy).href);
  fs.rmSync(dir, { recursive: true, force: true });

  // List: emails merged from admin_member_emails for the page's rows.
  {
    window.supabase = client();
    const { data, error } = await service.listPeople();
    assert.equal(error, null);
    assert.deepEqual(data.map((p) => p.email), ['ada@example.test', 'grace@example.test', 'linus@example.test']);
    assert.deepEqual(window.supabase.calls.find((c) => c.rpc === 'admin_member_emails').args, { p_ids: ['p1', 'p2', 'p3'] });
    noEmailFromTable(window.supabase.calls);
  }
  // Search: names in the table, emails through admin_find_members_by_email.
  {
    window.supabase = client();
    await service.listPeople({ search: 'grace@' });
    const find = window.supabase.calls.find((c) => c.rpc === 'admin_find_members_by_email');
    assert.deepEqual(find.args, { p_query: 'grace@', p_exact: false });
    const or = window.supabase.calls.find((c) => c.table)?.ops.find(([op]) => op === 'or');
    assert.deepEqual(or, ['or', 'name.ilike.%grace@%,id.in.(p2)'], 'matches by name, or by the ids the email search found');
    noEmailFromTable(window.supabase.calls);
  }
  // Sorting on email falls back to name.
  {
    window.supabase = client();
    await service.listPeople({ sortKey: 'email' });
    assert.deepEqual(window.supabase.calls.find((c) => c.table).ops.find(([op]) => op === 'order').slice(0, 2), ['order', 'name']);
  }
  // Details and update: email from the admin function.
  {
    window.supabase = client();
    assert.equal((await service.getPerson('p3')).data.email, 'linus@example.test');
    assert.equal((await service.updatePerson('p3', { bio: 'x' })).data.email, 'linus@example.test');
    noEmailFromTable(window.supabase.calls);
  }
  // Adding a person: the "already exists" check is an exact email search.
  {
    window.supabase = client();
    const { error } = await service.createPerson({ email: 'ada@example.test' });
    assert.match(String(error?.message), /User already exists: Ada/);
    assert.deepEqual(window.supabase.calls[0], { rpc: 'admin_find_members_by_email', args: { p_query: 'ada@example.test', p_exact: true } });
    window.supabase = client();
    const created = await service.createPerson({ email: 'new@example.test' });
    assert.equal(created.data.email, 'new@example.test');
    noEmailFromTable(window.supabase.calls);
  }
  // Export for the claim email.
  {
    window.supabase = client();
    const { data } = await service.getEmailsForPeople(['p1', 'p3']);
    assert.deepEqual(data.map((p) => `${p.name} <${p.email}>`), ['Ada <ada@example.test>', 'Linus <linus@example.test>']);
    noEmailFromTable(window.supabase.calls);
  }
  // The function unavailable or refusing: the list still loads, without
  // emails.
  {
    window.supabase = client({ rpcError: { message: 'not_authorized: admin required' } });
    const { data, error } = await service.listPeople();
    assert.equal(error, null);
    assert.deepEqual(data.map((p) => p.email ?? null), [null, null, null]);
    const search = await service.listPeople({ search: 'ada' });
    assert.equal(search.error, null, 'search still works, by name');
    assert.deepEqual(window.supabase.calls.filter((c) => c.table).pop().ops.find(([op]) => op === 'ilike'), ['ilike', 'name', '%ada%']);
  }
  global.console = realConsole;
  console.log('Admin people emails: list, search, details, add and export use the admin-only functions, never the email column');
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
