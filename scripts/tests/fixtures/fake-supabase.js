// Test-only in-memory stand-in for the Supabase client. It is used by the
// offline Node tests and the rendered browser journey; it is never loaded by
// the app. Row visibility mirrors the repository's RLS policies for the
// tables the assistance journey touches, so a client that forgets to filter
// still cannot see what the database would hide. Real RLS is exercised
// separately against PostgreSQL (scripts/tests/assistance-rls-db.sql).
(function (root) {
  'use strict';

  function createFakeSupabase(seed, options = {}) {
    const db = JSON.parse(JSON.stringify(seed));
    const me = () => options.currentMemberId?.() ?? db.__me;
    const log = [];
    let idCounter = 1;
    const newId = () => `00000000-0000-4000-8000-${String(idCounter++).padStart(12, '0')}`;

    const isTeam = (projectId) => {
      const project = (db.projects || []).find(p => p.id === projectId);
      if (!project) return false;
      if (project.creator_id === me()) return true;
      return (db.project_members || []).some(m => m.project_id === projectId && m.user_id === me() && m.role !== 'pending');
    };
    const visible = {
      capability_packages: row => row.permission_mode === 'community' || row.creator_id === me(),
      capability_attempts: row => row.member_id === me() || (db.capability_packages || []).some(p => p.id === row.capability_id && p.creator_id === me()),
      project_tasks: row => isTeam(row.project_id),
      connections: row => row.from_user_id === me() || row.to_user_id === me(),
    };
    const writable = {
      project_tasks: row => isTeam(row.project_id),
      capability_packages: row => row.creator_id === me(),
      capability_attempts: row => row.member_id === me() && (db.capability_packages || []).some(p => p.id === row.capability_id && (p.permission_mode === 'community' || p.creator_id === row.member_id)),
    };

    // PostgREST filter operators used by the app's queries (eq, is.null, gt,
    // ilike with % wildcards, case-insensitive).
    const ilike = (value, pattern) => new RegExp(`^${String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i')
      .test(Array.isArray(value) ? value.join(', ') : String(value ?? ''));
    function matches(row, { column, op, value }) {
      if (op === 'eq') return String(row[column]) === value;
      if (op === 'is') return value === 'null' ? row[column] == null : String(row[column]) === value;
      if (op === 'gt') return row[column] != null && String(row[column]) > value;
      if (op === 'ilike') return ilike(row[column], value);
      return false;
    }

    function parseOr(expression) {
      return String(expression).split(',').map(part => {
        const [column, op, ...rest] = part.split('.');
        return { column, op, value: rest.join('.') };
      });
    }

    function builder(table) {
      const filters = [];
      let mode = 'select';
      let payload = null;
      let single = null;
      let limitN = null;
      let order = null;
      const api = {
        select() { if (mode === 'select') mode = 'select'; return api; },
        eq(column, value) { filters.push(row => row[column] === value); return api; },
        neq(column, value) { filters.push(row => row[column] !== value); return api; },
        is(column, value) { filters.push(row => (value === null ? row[column] == null : row[column] === value)); return api; },
        gt(column, value) { filters.push(row => row[column] != null && String(row[column]) > String(value)); return api; },
        gte(column, value) { filters.push(row => row[column] != null && String(row[column]) >= String(value)); return api; },
        in(column, values) { filters.push(row => values.includes(row[column])); return api; },
        contains(column, values) { filters.push(row => values.every(v => (row[column] || []).includes(v))); return api; },
        or(expression) { const parts = parseOr(expression); filters.push(row => parts.some(p => matches(row, p))); return api; },
        ilike(column, pattern) { filters.push(row => ilike(row[column], pattern)); return api; },
        order(column, opts = {}) { order = { column, asc: opts.ascending !== false }; return api; },
        limit(n) { limitN = n; return api; },
        maybeSingle() { single = 'maybe'; return api; },
        single() { single = 'one'; return api; },
        insert(row) { mode = 'insert'; payload = row; return api; },
        update(row) { mode = 'update'; payload = row; return api; },
        delete() { mode = 'delete'; return api; },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
      async function run() {
        log.push({ table, mode, payload });
        const rows = db[table] = db[table] || [];
        const canSee = visible[table] || (() => true);
        if (mode === 'insert') {
          const row = { id: newId(), created_at: new Date().toISOString(), ...payload };
          if (table === 'capability_packages') row.evidence_status = 'untested';
          if (writable[table] && !writable[table](row)) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
          rows.push(row);
          return { data: single ? row : [row], error: null };
        }
        let matched = rows.filter(canSee).filter(row => filters.every(f => f(row)));
        if (mode === 'update') {
          const allowed = matched.filter(row => !writable[table] || writable[table](row));
          if (!allowed.length && single) return { data: null, error: { code: 'PGRST116', message: 'no rows updated' } };
          allowed.forEach(row => {
            // project_tasks' trigger (PROJECT_TASKS_SCHEMA.sql): completed_at
            // is set when a task becomes done and cleared when it is reopened.
            const stamp = table === 'project_tasks' && 'status' in payload && payload.status !== row.status
              ? { completed_at: payload.status === 'done' ? new Date().toISOString() : null } : {};
            Object.assign(row, payload, stamp, { updated_at: new Date().toISOString() });
          });
          return { data: single ? allowed[0] : allowed, error: null };
        }
        if (order) matched = matched.slice().sort((a, b) => (a[order.column] > b[order.column] ? 1 : -1) * (order.asc ? 1 : -1));
        if (limitN != null) matched = matched.slice(0, limitN);
        if (table === 'capability_packages') matched = matched.map(row => ({ ...row, creator: (db.community || []).find(c => c.id === row.creator_id) ? { id: row.creator_id, name: db.community.find(c => c.id === row.creator_id).name } : null, project: (db.projects || []).find(p => p.id === row.project_id) ? { id: row.project_id, title: db.projects.find(p => p.id === row.project_id).title } : null }));
        // The embedded rows the project overlay and task list ask for
        // (projects: creator and project_members with their community row;
        // project_tasks: owner), as PostgREST returns them.
        const person = id => { const c = (db.community || []).find(row => row.id === id); return c ? { id: c.id, name: c.name, image_url: c.image_url || null, skills: c.skills || [], user_id: c.user_id } : null; };
        if (table === 'projects') matched = matched.map(row => ({ ...row, creator: person(row.creator_id), project_members: (db.project_members || []).filter(m => m.project_id === row.id).map(m => ({ user_id: m.user_id, role: m.role, user: person(m.user_id) })) }));
        if (table === 'project_tasks') matched = matched.map(row => ({ ...row, owner: row.owner_id ? person(row.owner_id) : null }));
        if (single === 'maybe') return { data: matched[0] || null, error: null };
        if (single === 'one') return matched[0] ? { data: matched[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not found' } };
        return { data: matched, error: null };
      }
      return api;
    }

    return {
      __db: db,
      __log: log,
      from: builder,
      rpc: async (name, args) => {
        if (name !== 'get_capability_attempt_stats') return { data: [], error: null };
        const ids = args?.capability_ids || [];
        const data = ids.filter(id => (db.capability_packages || []).some(p => p.id === id && visible.capability_packages(p))).map(id => {
          const attempts = (db.capability_attempts || []).filter(a => a.capability_id === id);
          const done = attempts.filter(a => ['succeeded', 'not_succeeded'].includes(a.outcome_status));
          return { capability_id: id, completed_attempts: done.length, successful_attempts: done.filter(a => a.outcome_status === 'succeeded').length, verified_successes: done.filter(a => a.outcome_status === 'succeeded' && a.verification_status === 'verified').length, hours_saved_values: [], cost_saved_values: [] };
        }).filter(row => row.completed_attempts || true);
        return { data, error: null };
      },
      channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
      removeChannel() {},
      auth: {
        getSession: async () => ({ data: { session: options.session || null }, error: null }),
        getUser: async () => ({ data: { user: options.session?.user || null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createFakeSupabase };
  else root.createFakeSupabase = createFakeSupabase;
})(typeof window !== 'undefined' ? window : globalThis);
