#!/usr/bin/env node
// Organization and project membership management from the side panel:
// pending join requests (approve / decline), role changes, member removal,
// leaving an organization or project, and the project creator's Manage
// Requests button. Every write must target exactly one named row and report
// failure when row-level security skipped it; the database rules themselves
// are covered by membership-authz-db.sql.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const panel = read('assets/js/node-panel.js');
const index = read('index.html');

// ---------------------------------------------------------------------------
// organization-manager.js against a recording Supabase stub
// ---------------------------------------------------------------------------
function fakeSupabase(respond) {
  const calls = [];
  const client = {
    calls,
    auth: { getSession: async () => ({ data: { session: { user: { id: 'auth-doug' } } }, error: null }) },
    from(table) {
      const call = { table, op: 'select', payload: null, filters: [], select: null };
      calls.push(call);
      const builder = {
        update(payload) { call.op = 'update'; call.payload = payload; return builder; },
        delete() { call.op = 'delete'; return builder; },
        insert(payload) { call.op = 'insert'; call.payload = payload; return builder; },
        select(columns) { call.select = columns || '*'; return builder; },
        eq(column, value) { call.filters.push(['eq', column, value]); return builder; },
        neq(column, value) { call.filters.push(['neq', column, value]); return builder; },
        in(column, value) { call.filters.push(['in', column, value]); return builder; },
        single() { call.single = true; return builder; },
        maybeSingle() { call.single = true; return builder; },
        then(resolve, reject) { return Promise.resolve(respond(call)).then(resolve, reject); },
      };
      return builder;
    },
  };
  return client;
}

const has = (call, op, column, value) =>
  call.filters.some(([o, c, v]) => o === op && c === column && JSON.stringify(v) === JSON.stringify(value));

async function main() {
  // The manager is an ES module in a CommonJS package; load a private copy.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'org-manager-'));
  const copy = path.join(dir, 'organization-manager.mjs');
  fs.copyFileSync(path.join(root, 'assets/js/organizations/organization-manager.js'), copy);
  globalThis.window = {};
  const quiet = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  let M;
  let rowsFor = () => [{ id: 'm1' }];
  let failWith = null;
  const db = fakeSupabase((call) => {
    if (call.table === 'community') return { data: { id: 'doug' }, error: null };
    if (call.op === 'select' && call.table === 'organization_members') {
      return { data: { role: 'owner', status: 'active' }, error: null }; // isUserMember
    }
    if (failWith) return { data: null, error: { message: failWith } };
    return { data: rowsFor(call), error: null };
  });
  try {
    M = await import(pathToFileURL(copy).href);
    await M.initOrganizationManager(db);

    const lastWrite = () => db.calls.filter((c) => c.op !== 'select').at(-1);
    // Supabase reports database errors as plain objects; check the message.
    const rejects = (fn, pattern) => assert.rejects(fn, (error) => pattern.test(error?.message));

    // Approve: one pending plain-member row becomes active with no extra permissions.
    await M.approveMemberRequest('org1', 'm1');
    let call = lastWrite();
    assert.equal(call.table, 'organization_members');
    assert.equal(call.op, 'update');
    assert.deepEqual(
      { status: call.payload.status, post: call.payload.can_post_opportunities, manage: call.payload.can_manage_members, edit: call.payload.can_edit_profile, role: call.payload.role },
      { status: 'active', post: false, manage: false, edit: false, role: undefined },
      'approval grants plain membership only and never changes the role',
    );
    for (const [c, v] of [['id', 'm1'], ['organization_id', 'org1'], ['role', 'member'], ['status', 'pending']]) {
      assert.ok(has(call, 'eq', c, v), `approval filters on ${c}`);
    }
    assert.ok(call.select, 'approval reads back the changed row');

    // Decline: deletes only that pending row.
    await M.declineMemberRequest('org1', 'm1');
    call = lastWrite();
    assert.equal(call.op, 'delete');
    for (const [c, v] of [['id', 'm1'], ['organization_id', 'org1'], ['status', 'pending']]) {
      assert.ok(has(call, 'eq', c, v), `decline filters on ${c}`);
    }

    // Role change: exact active row; a plain member keeps no extra permissions.
    await M.updateMemberRole('org1', 'tester', 'member', {}, 'm1');
    call = lastWrite();
    assert.equal(call.op, 'update');
    assert.equal(call.payload.role, 'member');
    assert.deepEqual([call.payload.can_post_opportunities, call.payload.can_manage_members, call.payload.can_edit_profile], [false, false, false]);
    for (const [c, v] of [['id', 'm1'], ['organization_id', 'org1'], ['community_id', 'tester'], ['status', 'active']]) {
      assert.ok(has(call, 'eq', c, v), `role change filters on ${c}`);
    }
    // Promotion changes the role only. It never grants permission flags: an
    // admin's member-management and profile powers come from the role (in the
    // database and in the UI); posting opportunities still needs
    // can_post_opportunities, which only an explicit grant sets.
    const FLAGS = ['can_post_opportunities', 'can_manage_members', 'can_edit_profile'];
    for (const role of ['admin', 'owner']) {
      await M.updateMemberRole('org1', 'tester', role, {}, 'm1');
      call = lastWrite();
      assert.equal(call.payload.role, role);
      for (const flag of FLAGS) assert.ok(!(flag in call.payload), `promotion to ${role} leaves ${flag} unchanged`);
    }
    await M.updateMemberRole('org1', 'tester', 'admin', { can_post_opportunities: true }, 'm1');
    call = lastWrite();
    assert.equal(call.payload.can_post_opportunities, true, 'only an explicit grant sets a flag');
    assert.ok(!('can_manage_members' in call.payload) && !('can_edit_profile' in call.payload));

    // Join request: the caller's own plain, pending, permissionless row.
    await M.requestToJoin('org1');
    call = lastWrite();
    assert.equal(call.op, 'insert');
    assert.deepEqual(call.payload, { organization_id: 'org1', community_id: 'doug', role: 'member', status: 'pending' });
    assert.ok(call.select, 'join request reads back the new row');

    // Remove: exact row.
    await M.removeMember('org1', 'tester', 'm1');
    call = lastWrite();
    assert.equal(call.op, 'delete');
    for (const [c, v] of [['id', 'm1'], ['organization_id', 'org1'], ['community_id', 'tester']]) {
      assert.ok(has(call, 'eq', c, v), `removal filters on ${c}`);
    }

    // Leave: the caller's own row only.
    await M.leaveOrganization('org1');
    call = lastWrite();
    assert.equal(call.op, 'delete');
    assert.ok(has(call, 'eq', 'organization_id', 'org1') && has(call, 'eq', 'community_id', 'doug'), 'leave deletes only the caller\'s own row');
    assert.ok(!has(call, 'eq', 'status', 'pending'), 'leaving covers an active membership');

    // Withdraw: the caller's own pending request only, never an active membership.
    await M.leaveOrganization('org1', { pendingOnly: true });
    call = lastWrite();
    assert.equal(call.op, 'delete');
    for (const [c, v] of [['organization_id', 'org1'], ['community_id', 'doug'], ['status', 'pending']]) {
      assert.ok(has(call, 'eq', c, v), `withdraw filters on ${c}`);
    }

    // Nothing changed (row-level security skipped the row): report failure, never success.
    rowsFor = () => [];
    await rejects(() => M.approveMemberRequest('org1', 'm1'), /no longer pending/);
    await rejects(() => M.declineMemberRequest('org1', 'm1'), /no longer pending/);
    await rejects(() => M.updateMemberRole('org1', 'tester', 'admin', {}, 'm1'), /could not be changed/);
    await rejects(() => M.removeMember('org1', 'tester', 'm1'), /could not be removed/);
    await rejects(() => M.leaveOrganization('org1'), /not a member/);
    await rejects(() => M.leaveOrganization('org1', { pendingOnly: true }), /no pending request/);
    await rejects(() => M.requestToJoin('org1'), /could not be sent/);
    rowsFor = () => [{ id: 'a' }, { id: 'b' }];
    await rejects(() => M.removeMember('org1', 'tester'), /could not be removed/);

    // Database refusals reach the caller unchanged (e.g. the last-owner rule).
    rowsFor = () => [{ id: 'm1' }];
    failWith = 'An organization must keep at least one active owner';
    await rejects(() => M.leaveOrganization('org1'), /at least one active owner/);
    failWith = null;

    for (const name of ['requestToJoin', 'approveMemberRequest', 'declineMemberRequest', 'leaveOrganization', 'removeMember', 'updateMemberRole']) {
      assert.equal(typeof window.OrganizationManager[name], 'function', `OrganizationManager.${name} is exposed`);
    }
  } finally {
    Object.assign(console, quiet);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // -------------------------------------------------------------------------
  // Organization panel (node-panel.js)
  // -------------------------------------------------------------------------
  assert.match(panel, /\.from\('organization_members'\)[\s\S]{0,400}\.in\('status', \['active', 'pending'\]\)/,
    'the panel loads pending requests as well as active members');
  assert.match(panel, /const members = allMembers\.filter\(m => m\.status === 'active'\);/, 'member list and roles use active rows only');
  assert.match(panel, /myPendingRequest \? `[\s\S]{0,300}Join request pending approval/, 'a requester sees their pending request instead of Join');
  assert.match(panel, /\$\{isOwnerOrAdmin \? renderOrganizationMemberManagement\(/, 'only owners and admins get member management');
  assert.match(panel, /\$\{isSoleOwner \? `[\s\S]{0,300}only owner[\s\S]{0,400}data-org-action="leave"/, 'the sole owner is not offered Leave');

  // Destructive actions confirm first; approval does not.
  for (const action of ['decline', 'remove', 'leave']) {
    assert.match(panel, new RegExp(`${action}: \`[^\`]+\`,`), `${action} asks for confirmation`);
  }
  assert.match(panel, /approve: null,/, 'approve needs no confirmation');
  assert.match(panel, /if \(!window\.confirm\(`Change \$\{memberName\}'s role to \$\{role\}\?/, 'role changes ask for confirmation');
  assert.match(panel, /approve: \(\) => m\.approveMemberRequest\(org\.id, membershipId\)/);
  assert.match(panel, /decline: \(\) => m\.declineMemberRequest\(org\.id, membershipId\)/);
  assert.match(panel, /remove: \(\) => m\.removeMember\(org\.id, communityId, membershipId\)/);
  assert.match(panel, /leave: \(\) => m\.leaveOrganization\(org\.id\)/);
  assert.match(panel, /m\.updateMemberRole\(org\.id, communityId, role, \{\}, membershipId\)/);

  // Render the management section itself.
  const source = panel.match(/function renderOrganizationMemberManagement\([\s\S]*?\n}\n/)[0];
  const sandbox = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  vm.runInNewContext(`${source}; this.render = renderOrganizationMemberManagement;`, sandbox);
  const people = [
    { id: 'm-doug', community_id: 'doug', role: 'owner', status: 'active', community: { name: 'Doug' } },
    { id: 'm-co', community_id: 'co', role: 'owner', status: 'active', community: { name: 'Co-owner' } },
    { id: 'm-ann', community_id: 'ann', role: 'admin', status: 'active', community: { name: 'Ann' } },
    { id: 'm-tess', community_id: 'tess', role: 'member', status: 'active', community: { name: '<b>Tess</b>' } },
  ];
  const pending = [{ id: 'm-req', community_id: 'req', role: 'member', status: 'pending', community: { name: 'Requester' } }];

  const asOwner = sandbox.render(people, pending, 'doug', true);
  assert.match(asOwner, /Join requests \(1\)/);
  assert.match(asOwner, /data-org-action="approve" data-membership-id="m-req"/);
  assert.match(asOwner, /data-org-action="decline" data-membership-id="m-req"/);
  assert.doesNotMatch(asOwner, /data-membership-id="m-doug"/, 'nobody manages their own row here');
  assert.match(asOwner, /data-org-action="role" data-membership-id="m-co"/, 'owners manage other owners');
  assert.match(asOwner, /<option value="owner"/, 'owners can grant ownership');
  assert.doesNotMatch(asOwner, /<b>Tess<\/b>/, 'member names are escaped');

  const asAdmin = sandbox.render(people, [], 'ann', false);
  assert.match(asAdmin, /No pending requests/);
  assert.doesNotMatch(asAdmin, /data-membership-id="m-doug"|data-membership-id="m-co"/, 'admins do not see controls for owners');
  assert.doesNotMatch(asAdmin, /<option value="owner"/, 'admins cannot grant ownership');
  assert.match(asAdmin, /data-org-action="remove" data-membership-id="m-tess"/);

  // -------------------------------------------------------------------------
  // Panel wiring: only success reloads; failure and cancel leave the panel
  // as it was, re-enable the control and put the role menu back.
  // -------------------------------------------------------------------------
  const wiring = panel.match(/function wireOrganizationMembershipControls\(org\)[\s\S]*?\n}\n/)[0];
  const flush = async () => { for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r)); };
  function mountPanel({ outcome = 'ok', confirmAnswer = true, withManager = true } = {}) {
    const control = (dataset, value) => ({
      dataset, value, disabled: false, handlers: {},
      addEventListener(type, fn) { this.handlers[type] = fn; },
    });
    const controls = {
      join: control({ orgAction: 'join' }),
      approve: control({ orgAction: 'approve', membershipId: 'm-req', memberName: 'Req' }),
      decline: control({ orgAction: 'decline', membershipId: 'm-req', memberName: 'Req' }),
      remove: control({ orgAction: 'remove', membershipId: 'm-t', communityId: 't', memberName: 'Tess' }),
      leave: control({ orgAction: 'leave' }),
      withdraw: control({ orgAction: 'withdraw' }),
      role: control({ orgAction: 'role', membershipId: 'm-t', communityId: 't', memberName: 'Tess', currentRole: 'member' }, 'member'),
    };
    const log = { calls: [], reloads: 0, refreshes: 0, toasts: [], confirms: 0 };
    const act = (name) => (...args) => {
      log.calls.push([name, ...args]);
      return outcome === 'ok' ? Promise.resolve({}) : Promise.reject(new Error('refused'));
    };
    const ctx = {
      panelElement: { querySelectorAll: () => Object.values(controls) },
      currentNodeData: { id: 'org1', type: 'organization' },
      loadNodeDetails: async () => { log.reloads += 1; },
      showToastNotification: (msg, type) => log.toasts.push([type, msg]),
      window: {
        confirm: () => { log.confirms += 1; return confirmAnswer; },
        refreshSynapseConnections: () => { log.refreshes += 1; },
        OrganizationManager: withManager ? {
          requestToJoin: act('requestToJoin'), approveMemberRequest: act('approveMemberRequest'),
          declineMemberRequest: act('declineMemberRequest'), removeMember: act('removeMember'),
          leaveOrganization: act('leaveOrganization'), updateMemberRole: act('updateMemberRole'),
        } : undefined,
      },
    };
    vm.runInNewContext(`${wiring}; wireOrganizationMembershipControls({ id: 'org1', name: 'Nearify' });`, ctx);
    return { controls, log };
  }
  const click = (c) => c.handlers.click();
  const pickRole = (c, role) => { c.value = role; c.handlers.change(); };

  for (const name of ['join', 'approve', 'decline', 'remove', 'leave', 'withdraw']) {
    let { controls, log } = mountPanel({ outcome: 'fail' });
    click(controls[name]); await flush();
    assert.equal(log.calls.length, 1, `${name}: the action ran`);
    assert.equal(log.reloads + log.refreshes, 0, `${name}: a failed action does not refresh the panel or graph`);
    assert.equal(controls[name].disabled, false, `${name}: the control is usable again after failure`);

    ({ controls, log } = mountPanel());
    click(controls[name]); await flush();
    assert.equal(log.reloads, 1, `${name}: success reloads the panel`);
  }
  for (const name of ['decline', 'remove', 'leave', 'withdraw']) {
    const { controls, log } = mountPanel({ confirmAnswer: false });
    click(controls[name]); await flush();
    assert.equal(log.confirms, 1, `${name}: asks first`);
    assert.equal(log.calls.length + log.reloads, 0, `${name}: cancelling does nothing`);
    assert.equal(controls[name].disabled, false);
  }
  {
    const { controls, log } = mountPanel();
    click(controls.approve); click(controls.join); await flush();
    assert.equal(log.confirms, 0, 'approve and join need no confirmation');
  }
  {
    const { controls, log } = mountPanel();
    click(controls.withdraw); await flush();
    assert.equal(JSON.stringify(log.calls[0]), JSON.stringify(['leaveOrganization', 'org1', { pendingOnly: true }]),
      'Withdraw Request uses leaveOrganization limited to the pending request');
  }
  assert.match(panel, /Join request pending approval\s*<\/div>\s*<button type="button" data-org-action="withdraw"/,
    'a requester can withdraw their pending request');

  // Role menu.
  {
    let { controls, log } = mountPanel({ outcome: 'fail' });
    pickRole(controls.role, 'admin'); await flush();
    assert.equal(JSON.stringify(log.calls[0]), JSON.stringify(['updateMemberRole', 'org1', 't', 'admin', {}, 'm-t']), 'role change passes no permission flags');
    assert.equal(controls.role.value, 'member', 'failed role change puts the menu back');
    assert.equal(controls.role.disabled, false);
    assert.equal(log.reloads, 0);
    // A second failure after the first still returns to the stored role.
    pickRole(controls.role, 'owner'); await flush();
    assert.equal(controls.role.value, 'member');

    ({ controls, log } = mountPanel({ confirmAnswer: false }));
    pickRole(controls.role, 'admin'); await flush();
    assert.equal(controls.role.value, 'member', 'cancelled role change puts the menu back');
    assert.equal(log.calls.length + log.reloads, 0);

    ({ controls, log } = mountPanel({ withManager: false }));
    pickRole(controls.role, 'admin'); await flush();
    assert.equal(controls.role.value, 'member', 'role menu goes back when organization tools are not loaded');
    assert.equal(log.toasts[0][0], 'error');
    click(controls.approve); await flush();
    assert.equal(log.reloads, 0);

    ({ controls, log } = mountPanel());
    pickRole(controls.role, 'admin'); await flush();
    assert.equal(log.reloads, 1, 'successful role change reloads the panel');
  }

  // -------------------------------------------------------------------------
  // Projects (node-panel.js)
  // -------------------------------------------------------------------------
  const leave = panel.match(/window\.leaveProjectFromPanel = async function[\s\S]*?\n};\n/)[0];
  assert.match(leave, /if \(!window\.confirm\(/, 'leaving a project asks for confirmation');
  assert.match(leave, /\.delete\(\)\s*\.eq\('project_id', projectId\)\s*\.eq\('user_id', myId\)\s*\.neq\('role', 'creator'\)\s*\.neq\('role', 'pending'\)\s*\.select\('user_id'\)/,
    'leaving deletes only the caller\'s own team row');
  assert.match(leave, /data\.length !== 1/, 'leaving reports failure when nothing was deleted');
  assert.doesNotMatch(panel, /\.remove\(\); leaveProjectFromPanel\(/, 'the details screen is not closed before the confirmation');

  // The details screen closes only after a confirmed, successful leave.
  async function leaveProject({ confirmAnswer = true, result = { data: [{ user_id: 'tess' }], error: null } } = {}) {
    const log = { overlayRemoved: 0, deletes: 0, toasts: [], reloads: 0 };
    const q = { delete() { log.deletes += 1; return q; }, eq: () => q, neq: () => q, select: () => Promise.resolve(result) };
    const ctx = {
      currentUserProfile: { id: 'tess' },
      currentNodeData: { id: 'p1' },
      supabase: { from: () => q },
      loadNodeDetails: async () => { log.reloads += 1; },
      showToastNotification: (msg, type) => log.toasts.push(type),
      console: { error() {} },
      document: { getElementById: (id) => (id === 'project-detail-overlay' ? { remove: () => { log.overlayRemoved += 1; } } : null) },
      window: { confirm: () => confirmAnswer },
    };
    vm.runInNewContext(`${leave}; this.outcome = window.leaveProjectFromPanel('p1');`, ctx);
    log.left = await ctx.outcome;
    return log;
  }
  let outcome = await leaveProject({ confirmAnswer: false });
  assert.deepEqual([outcome.left, outcome.deletes, outcome.overlayRemoved], [false, 0, 0], 'cancel keeps the details screen open and deletes nothing');
  outcome = await leaveProject({ result: { data: null, error: { message: 'refused' } } });
  assert.deepEqual([outcome.left, outcome.overlayRemoved, outcome.toasts[0]], [false, 0, 'error'], 'a refused leave keeps the details screen open');
  outcome = await leaveProject({ result: { data: [], error: null } });
  assert.deepEqual([outcome.left, outcome.overlayRemoved, outcome.toasts[0]], [false, 0, 'error'], 'a leave that changed nothing keeps the details screen open');
  outcome = await leaveProject();
  assert.deepEqual([outcome.left, outcome.overlayRemoved, outcome.toasts[0], outcome.reloads], [true, 1, 'success', 1], 'a successful leave closes the details screen');
  assert.match(panel, /isMember \? `[\s\S]{0,400}leaveProjectFromPanel\('\$\{project\.id\}'\)/, 'project panel offers Leave Project to members');
  assert.match(panel, /rel\.state === 'member'\) \{[\s\S]{0,700}leaveProjectFromPanel\('\$\{project\.id\}'\)/, 'project details offer Leave Project to members');

  // Manage Requests is always visible to the creator, in both places.
  assert.doesNotMatch(panel, /pendingRequests\.length > 0 \? `\s*<button onclick="(?:this\.closest\('#project-detail-overlay'\)\.remove\(\); )?manageProjectRequests/,
    'Manage Requests no longer hides when nothing is pending');
  assert.equal((panel.match(/Manage Requests \(\$\{pendingRequests\.length\}\)/g) || []).length, 2);

  // Working paths stay as they are.
  assert.match(panel, /window\.approveJoinRequest = async function\(projectId, requestId, userId\)/);
  assert.match(panel, /\.update\(\{ role: 'member' \}\)\s*\.eq\('project_id', projectId\)\s*\.eq\('user_id', userId\)\s*\.eq\('role', 'pending'\)/);
  const notifications = read('assets/js/unified-notification-system.js');
  assert.match(notifications, /window\.openNodePanel\(\{ id: orgId, type: 'organization' \}\)/, 'org notifications still open the organization panel');
  assert.match(notifications, /window\.openNodePanel\(\{ id: projectId, type: 'project' \}\)/, 'project notifications still open the project panel');

  // Returning visitors get the new modules.
  assert.match(index, /assets\/js\/node-panel\.js\?v=[a-z0-9-]+/);
  assert.match(index, /organization-manager\.js\?v=[a-z0-9-]+/);

  console.log('membership management checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
