// Stored-XSS regression for member-supplied names, skills, project titles and
// photo URLs.
//
//   node scripts/tests/browser/run-member-content-xss.mjs
//
// Serves this repository locally and opens a harness page in headless Google
// Chrome that loads the real modules (node-panel.js, realtime-collaboration.js,
// dashboardPane.js, dashboard-actions.js, connections.js, daily-engagement.js)
// against a stub Supabase client whose rows are hostile: every text field
// tries to break out of element text, quoted attributes and inline handler
// strings. Each surface is rendered, then every element is hovered, focused
// and clicked. The run fails if any injected script executes, if hostile text
// is not shown literally, or if a handler receives anything but the raw value.
//
// CHROME_PATH overrides the browser; XSS_TEST_ROOT serves another checkout
// (used to confirm the test fails against unfixed code).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.env.XSS_TEST_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..'));
const CHROME = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome');

// One value that attacks every context: element text, a double-quoted
// attribute (with and without quotes in the injected handler, since some call
// sites escape ' to \\'), and a single-quoted JavaScript string inside an
// inline handler.
const HOSTILE = `Mal<img src=x onerror="__xss.push('tag')">" onmouseover="__xss.push('attr')" onmouseenter=__xss.push(/unquoted/.source) autofocus onfocus="__xss.push('focus')" x="');__xss.push('js');//\\');__xss.push('backslash');//`;
const HOSTILE_PHOTO = `https://example.test/a.png" onerror="__xss.push('photo')" x="`;

const harness = `<!doctype html>
<meta charset="utf-8">
<body>
<div id="projects-list"></div>
<div id="quick-connect-list"></div>
<input id="admin-add-email"><div id="admin-add-status"></div>
<div id="admin-people-list"></div>
<script>
  window.__xss = [];
  window.__calls = [];
  window.__errors = [];
  window.addEventListener('error', e => window.__errors.push(String(e.message)));
  const H = ${JSON.stringify(HOSTILE)};
  const PHOTO = ${JSON.stringify(HOSTILE_PHOTO)};
  const member = { id: '10000000-0000-4000-8000-0000000000aa', user_id: 'a0000000-0000-4000-8000-0000000000aa', name: H, email: 'mallory@example.test', skills: [H], image_url: PHOTO, photo_visible: true, photo_consent_at: '2026-01-01T00:00:00Z', user_role: H, is_hidden: false };
  window.__rows = {
    community: [member],
    projects: [{ id: '20000000-0000-4000-8000-0000000000aa', title: H, name: H, description: H, status: 'active', creator_id: member.id, skills: [H], created_at: '2026-10-01T00:00:00Z' }],
    project_members: [],
  };
  // Any query resolves to the table's rows; single() to its first row.
  function query(table) {
    let one = false;
    const result = () => ({ data: one ? (window.__rows[table] || [])[0] ?? null : (window.__rows[table] || []), error: null });
    const q = new Proxy({}, { get(_, key) {
      if (key === 'then') return (ok, fail) => Promise.resolve(result()).then(ok, fail);
      if (key === 'single' || key === 'maybeSingle') return () => { one = true; return q; };
      return () => q;
    } });
    return q;
  }
  const chain = new Proxy(function () {}, { get(_, key) { return key === 'then' ? undefined : () => chain; }, apply() { return chain; } });
  window.supabase = {
    from: query,
    rpc: async () => ({ data: null, error: null }),
    channel: () => chain,
    removeChannel: async () => {},
    auth: { getUser: async () => ({ data: { user: { id: 'a0000000-0000-4000-8000-0000000000ff' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  };
  window.currentAuthUser = { id: 'a0000000-0000-4000-8000-0000000000ff' };
  window.currentUserProfile = { id: '10000000-0000-4000-8000-0000000000ff', user_id: 'a0000000-0000-4000-8000-0000000000ff', name: 'Viewer' };
  window.bootstrapSession = { getAuthUser: async () => window.currentAuthUser };
  window.dsConfirm = async () => true;
</script>
<script src="/assets/js/photo-privacy.js"></script>
<script src="/assets/js/dashboard-actions.js"></script>
<script type="module">
  import { initRealtimeCollaboration } from '/assets/js/realtime-collaboration.js';
  import { initNodePanel } from '/assets/js/node-panel.js';
  import * as connections from '/assets/js/connections.js';
  import '/assets/js/dashboardPane.js';
  import '/assets/js/daily-engagement.js';
  window.__modules = { initRealtimeCollaboration, initNodePanel, connections };
  window.__ready = true;
</script>
`;

// dashboardPane.js passes its recommendations renderer to the pathways module;
// this stand-in hands it to the test.
const pathwaysStub = `export function initIlluminatedPathways(options = {}) {
  window.__pathwaysOptions = options;
  return { showAnimatedPathways() {}, stopAnimatedPathways() {} };
}
export async function showAnimatedPathways() {}
export function stopAnimatedPathways() {}`;
const supabaseClientStub = `const s = window.supabase; export const supabase = s; export const supabaseClient = s; export default s;`;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__xss-harness.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(harness); }
  if (url.pathname.endsWith('/supabaseClient.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(supabaseClientStub); }
  if (url.pathname.endsWith('/illuminatePathways.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(pathwaysStub); }
  const file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-xss-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((resolve, reject) => {
  let buffer = '';
  chrome.stderr.on('data', chunk => { buffer += chunk; const m = buffer.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
  chrome.on('error', reject);
  setTimeout(() => reject(new Error(`Chrome did not start (${CHROME})`)), 15000);
});
const targets = await (await fetch(wsUrl.replace('ws://', 'http://').replace(/\/devtools\/browser\/.*/, '/json/list'))).json();
const socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve));
let seq = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
  if (msg.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
  if (msg.method === 'Fetch.requestPaused') {
    const local = msg.params.request.url.startsWith(base);
    send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId: msg.params.requestId } : { requestId: msg.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(`${expression.slice(0, 80)} → ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
  return result.result.value;
}
async function waitFor(expression, label, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

// Hover, focus and click everything under a surface, with app handlers
// replaced by recorders so clicks stay local.
const exercise = selector => evaluate(`(async () => {
  for (const name of ['confirmEndorsement', 'confirmProjectInvitation', 'joinProject', 'sendConnectionRequest', 'adminTogglePersonVisibility', 'createNewMessage']) {
    window[name] = (...args) => { window.__calls.push({ name, args: args.filter(a => typeof a === 'string') }); };
  }
  const els = [...document.querySelectorAll(${JSON.stringify(selector)} + ', ' + ${JSON.stringify(selector)} + ' *')];
  for (const el of els) {
    for (const type of ['mouseover', 'mouseenter', 'focus', 'focusin']) el.dispatchEvent(new Event(type, { bubbles: true }));
    el.focus?.();
  }
  for (const el of els) if (el.matches('button, [onclick], [style*="cursor: pointer"]') && el.isConnected) el.click();
  await new Promise(r => setTimeout(r, 300));
  return els.length;
})()`);

const failures = [];
const check = (ok, label) => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}`); if (!ok) failures.push(label); };
async function surface(label, render, selector, expectArgs = []) {
  await evaluate('window.__xss = []; window.__calls = []; true');
  try {
    await render();
  } catch (error) {
    check(false, `${label}: render failed (${String(error.message).split('\n')[0]})`);
    return;
  }
  await sleep(400);
  const text = await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(e => e.textContent).join(' ')`);
  const count = await exercise(selector);
  const injected = await evaluate('window.__xss.slice()');
  const calls = await evaluate('window.__calls.slice()');
  check(count > 0, `${label}: rendered`);
  check(injected.length === 0, `${label}: no injected script ran${injected.length ? ` (ran: ${[...new Set(injected)].join(', ')})` : ''}`);
  check(text.includes(HOSTILE), `${label}: hostile text shown literally`);
  for (const name of expectArgs) {
    const call = calls.find(c => c.name === name);
    check(!!call && call.args.includes(HOSTILE), `${label}: ${name} receives the raw value`);
  }
}

try {
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `${base}/__xss-harness.html` });
  await waitFor('window.__ready === true && !!window.__pathwaysOptions && typeof window.loadProjects === "function"', 'modules');
  await evaluate('window.__modules.initRealtimeCollaboration(); window.__modules.initNodePanel?.(); true');

  await surface('Endorse modal (member name and skills)',
    () => evaluate(`window.endorseSkill('10000000-0000-4000-8000-0000000000aa')`),
    'div[style*="position: fixed"]', ['confirmEndorsement']);
  await evaluate(`document.querySelectorAll('div[style*="position: fixed"]').forEach(e => e.remove()); true`);

  await surface('Invite modal (member name and project title)',
    () => evaluate(`window.inviteToProject('10000000-0000-4000-8000-0000000000aa')`),
    'div[style*="position: fixed"]', ['confirmProjectInvitation']);
  await evaluate(`document.querySelectorAll('div[style*="position: fixed"]').forEach(e => e.remove()); true`);

  await surface('Message recipient search (member name, role, photo)',
    async () => {
      await evaluate('window.showNewMessageDialog(); true');
      await evaluate(`(() => { const i = document.getElementById('user-search-input'); i.value = 'Mal'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await sleep(600);
    },
    '#user-search-results');
  await evaluate(`document.getElementById('new-message-modal')?.remove(); true`);

  await surface('Browse Projects (project title)',
    () => evaluate('window.loadProjects()'),
    '#projects-list', ['joinProject']);

  await surface('Recommendations (member name and photo)',
    () => evaluate(`window.__pathwaysOptions.renderRecommendationsList([{ type: 'person', userId: '10000000-0000-4000-8000-0000000000aa', name: ${JSON.stringify(HOSTILE)}, reason: 'Shared skills', matchedSkills: [], score: 9, node: window.__rows.community[0] }])`),
    '#quick-connect-list', ['sendConnectionRequest']);

  // adminSearchPeople/adminAddPerson are async functions declared inside
  // dashboard-actions.js's top-level else block, so nothing can call them;
  // the row and status helpers they use are exercised directly.
  await surface('Legacy admin people row (member name, email, photo)',
    () => evaluate(`document.getElementById('admin-people-list').replaceChildren(renderAdminPersonRow(window.__rows.community[0])); true`),
    '#admin-people-list');

  await surface('Legacy admin status (existing member name)',
    () => evaluate(`setAdminStatus(document.getElementById('admin-add-status'), '#ffaa00', 'fa-info-circle', 'User already exists: ' + ${JSON.stringify(HOSTILE)}); true`),
    '#admin-add-status');

  await surface('Connection toast (member name)',
    async () => {
      await evaluate('window.__modules.connections.initConnections(window.supabase).catch(() => {})');
      await evaluate(`window.__modules.connections.sendConnectionRequest('10000000-0000-4000-8000-0000000000aa', ${JSON.stringify(HOSTILE)}).catch(() => {})`);
    },
    '.connection-toast');

  await surface('XP notification (endorsed skill)',
    async () => {
      await evaluate(`(async () => {
        const de = window.DailyEngagement;
        await de.init?.().catch?.(() => {});
        await de.awardXP(10, 'Endorsed ' + ${JSON.stringify(HOSTILE)});
      })()`);
    },
    '.xp-notification');

  const errors = await evaluate('window.__errors.slice()');
  if (errors.length) console.log(`  page errors (not failures): ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
} catch (error) {
  failures.push(String(error?.message || error));
  console.error(error);
} finally {
  socket.close();
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  server.close();
  fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

if (failures.length) {
  console.error(`\n❌ ${failures.length} member-content XSS check(s) failed`);
  process.exit(1);
}
console.log('\n✅ member-content XSS checks passed');
