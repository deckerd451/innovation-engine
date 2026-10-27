// "People you met" in Your Network, and Bluetooth messages, as members see
// them: real index.html in headless Google Chrome against the synthetic
// community of run-home-community.mjs plus synthetic Nearify encounters
// (test-only fake client; nothing reaches a database), on iPhone and
// desktop, in a browser without Web Bluetooth (as Safari).
//   - Home shows no Bluetooth notice; Event Mode explains it when opened.
//   - Each person met appears once, with the events they were met at.
//   - Their status comes from the member's own connections: Connected,
//     Request sent, Wants to connect (Respond), or Connect.
//   - Names open profiles under the usual rules (limited for strangers).
//
//   node scripts/tests/browser/run-people-you-met.mjs [outDir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const root = path.resolve(process.env.HOME_TEST_ROOT || here);
const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'buildspace-people-you-met'));
fs.mkdirSync(outDir, { recursive: true });
const CHROME = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome');
const PHONE = { width: 390, height: 844, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };

const stubClient = `const s = window.supabase;
export const supabase = s; export const supabaseClient = s; export default s;
export async function signInWithGitHub() {} export async function signInWithGoogle() {}
export async function ensureCommunityUser() { return window.__fixtureProfile; }
export async function isAuthenticated() { return true; }
export async function getCurrentUser() { return (await s.auth.getUser()).data.user; }
export async function getUserProfile() { return window.__fixtureProfile; }
export async function getCYNQCards() { return []; } export async function createCYNQCard() { return null; }
export async function updateCYNQCard() { return null; } export async function deleteCYNQCard() { return null; }
export async function getCYNQCardsByStage() { return []; } export async function getCYNQCardCounts() { return {}; }
export async function moveCYNQCard() { return null; }`;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.endsWith('/supabaseClient.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(stubClient); }
  if (url.pathname === '/sw.js') { res.writeHead(404); return res.end(); }
  const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
// Served as buildspace.test (mapped to this server), as the parity run does.
const base = `http://buildspace.test:${server.address().port}`;

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-met-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--no-first-run', '--host-resolver-rules=MAP buildspace.test 127.0.0.1', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((resolve, reject) => {
  let buffer = '';
  chrome.stderr.on('data', chunk => { buffer += chunk; const m = buffer.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
  chrome.on('error', reject);
  setTimeout(() => reject(new Error(`Chrome did not start (${CHROME})`)), 30000);
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
async function callInPage(fn, ...args) {
  const global = (await send('Runtime.evaluate', { expression: 'globalThis' })).result;
  const result = await send('Runtime.callFunctionOn', { functionDeclaration: fn.toString(), objectId: global.objectId, arguments: args.map(value => ({ value })), awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, label, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(`!!(${expression})`).catch(() => false)) return true; await sleep(100); }
  throw new Error(`Timed out waiting for ${label}`);
}
const results = [];
function check(ok, label, detail = '') { results.push({ ok: Boolean(ok), label }); console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`); }
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}
// Headless Chrome draws no status bar. For screenshots only, a see-through
// stand-in (clock, Dynamic Island, battery) is laid over the top safe area so
// anything that scrolls under the real one shows; it is removed afterwards.
async function phoneShot(name) {
  await evaluate(`(() => {
    const bar = document.createElement('div');
    bar.id = '__simulated-status-bar';
    bar.style.cssText = 'position:fixed;inset:0 0 auto 0;height:env(safe-area-inset-top,0px);z-index:2147483647;pointer-events:none;display:flex;align-items:center;justify-content:space-between;padding:0 34px;box-sizing:border-box;font:600 16px -apple-system,system-ui,sans-serif;color:#fff';
    bar.innerHTML = '<span>9:41</span><span style="position:absolute;left:50%;top:11px;transform:translateX(-50%);width:124px;height:36px;border-radius:18px;background:#000"></span><span style="width:26px;height:12px;border:1.5px solid #fff;border-radius:4px"></span>';
    document.body.appendChild(bar);
  })()`);
  await shot(name);
  await evaluate(`document.getElementById('__simulated-status-bar')?.remove()`);
}


// ---------------------------------------------------------------- fixtures
// A synthetic community, one seed per scenario (?scenario=…). Nothing here is
// production data. Names are placeholders.
const fixtures = fs.readFileSync(path.join(here, 'scripts/tests/fixtures/assistance-fixtures.js'), 'utf8');
const fake = fs.readFileSync(path.join(here, 'scripts/tests/fixtures/fake-supabase.js'), 'utf8');
const boot = `${fixtures}\n${fake}\n(() => {
  const scenario = new URLSearchParams(location.search).get('scenario') || 'established';
  const { ID } = window.AssistanceFixtures;
  const seed = window.AssistanceFixtures.seed();
  const me = ID.me;
  const day = 86400000;
  const now = new Date().toISOString();
  const soon = d => new Date(Date.now() + d * day).toISOString();
  const person = (id, name, skills, interests = [], extra = {}) => ({ id, user_id: 'auth-' + id, name, skills, interests, ...extra });
  const [, dana, sam, riley] = seed.community;
  Object.assign(riley, { skills: ['Public speaking', 'Python'], interests: ['HCD'] });
  // Members for "Find people by what they do": Design (6), Python (5 with
  // Riley), Woodworking (4 visible + 1 hidden, so below the threshold),
  // Beekeeping (1), Taxidermy (only Quinn). Quinn is hidden from discovery.
  seed.community.push(
    person('m-ana', 'Ana (fixture)', ['Design', 'Python', 'Woodworking']),
    person('m-bo', 'Bo (fixture)', ['Design', 'Python', 'Woodworking']),
    person('m-cy', 'Cy (fixture)', ['Design', 'Python', 'Woodworking']),
    person('m-dee', 'Dee (fixture)', ['Design', 'Python', 'Woodworking']),
    person('m-eli', 'Eli (fixture)', ['Design']),
    person('m-fay', 'Fay (fixture)', ['Design', 'Beekeeping']),
    person('m-quinn', 'Quinn (hidden fixture)', ['Woodworking', 'Python', 'Taxidermy'], ['HCD'], { is_hidden: true }),
  );
  seed.organizations = [{ id: 'org-schools', name: 'Tidewater Schools', status: 'active', created_by: riley.id, created_at: '2026-09-01T00:00:00Z' }];
  seed.organization_members = [];
  seed.active_themes_summary = [
    { id: 'th-climate', title: 'Climate resilience', participant_count: 14, created_at: soon(-1), expires_at: soon(30) },
    { id: 'th-civic', title: 'Civic tech', participant_count: 22, created_at: soon(-2), expires_at: soon(30) },
    { id: 'th-food', title: 'Food access', participant_count: 9, created_at: soon(-3), expires_at: soon(30) },
    { id: 'th-gone', title: 'Expired theme', participant_count: 40, created_at: soon(-4), expires_at: soon(-1) },
    // An administrator's bucket for unsorted projects, not a theme.
    { id: 'th-general', title: 'General Projects', participant_count: 6, origin_type: 'admin', created_at: soon(-1), expires_at: soon(300) },
  ];
  seed.theme_circles = seed.active_themes_summary.map(theme => ({ ...theme, status: 'active' }));
  // Historical theme rows stay in the database, but themes were replaced by
  // skills: none of these ever reaches Home or Explore.
  seed.theme_participants = [
    ...['m-ana', 'm-bo', 'm-cy', 'm-dee'].map(id => ({ theme_id: 'th-climate', community_id: id })),
    ...['m-ana', 'm-bo', riley.id].map(id => ({ theme_id: 'th-food', community_id: id })),
    ...['m-eli', 'm-fay', 'm-quinn'].map(id => ({ theme_id: 'th-civic', community_id: id })),
    ...['m-ana', 'm-bo', 'm-cy', 'm-dee', 'm-eli', 'm-fay'].map(id => ({ theme_id: 'th-general', community_id: id })),
    ...['m-ana', 'm-bo', 'm-cy', 'm-dee'].map(id => ({ theme_id: 'th-gone', community_id: id })),
  ];
  seed.projects.push(
    { id: 'p-hcd', title: 'HCD Event: redesigning the library card', description: 'A Saturday workshop', status: 'open', creator_id: dana.id, required_skills: ['Facilitation'], created_at: soon(-1), updated_at: now },
    { id: 'p-flood', title: 'Flood map for West Ashley', description: 'Mapping flood data', status: 'recruiting', creator_id: 'm-ana', required_skills: ['GIS', 'Python'], created_at: soon(-2), updated_at: now },
    { id: 'p-fridge', title: 'Community fridge network', description: 'Stocking neighborhood fridges', status: 'open', creator_id: 'm-bo', required_skills: ['Driving', 'Outreach'], created_at: soon(-3), updated_at: now },
    { id: 'p-done', title: 'Finished archive project', description: 'Done', status: 'completed', creator_id: 'm-cy', created_at: now, updated_at: now },
  );
  seed.project_members.push({ project_id: 'p-hcd', user_id: sam.id, role: 'member' });
  seed.opportunities = [
    { id: 'o-python', title: 'Python mentor for a coding club', description: 'Help students with Python', status: 'open', is_public: true, application_deadline: soon(14), organization_id: 'org-schools', posted_by: riley.id, created_at: now },
    { id: 'o-judge', title: 'Judge the spring pitch night', description: 'One evening', status: 'open', is_public: true, application_deadline: soon(18), organization_id: 'org-schools', posted_by: 'm-ana', created_at: now },
    { id: 'o-expired', title: 'Expired grant reviewer', description: 'Past deadline', status: 'open', is_public: true, application_deadline: soon(-1), organization_id: 'org-schools', posted_by: 'm-ana', created_at: now },
    { id: 'o-mine', title: 'My own posting', description: 'Posted by me', status: 'open', is_public: true, application_deadline: null, posted_by: me, created_at: now },
  ];
  Object.assign(seed.community[0], { skills: ['Python'], interests: ['Human-centered design', 'Civic tech'] });
  // Something genuinely waiting: Eli asked to connect (the real
  // get_start_sequence_data shape, and the pending row itself).
  seed.connections.push({ from_user_id: 'm-eli', to_user_id: me, status: 'pending' });
  window.__immediate = { pending_requests: { count: 1, items: [{ from_user_id: 'm-eli', name: 'Eli (fixture)' }] } };
  if (scenario === 'no-people') {
    // Nothing listed in common with anyone new; connections still bring an invitation.
    Object.assign(seed.community[0], { skills: ['Welding'], interests: ['Sailing'] });
    window.__immediate = {};
  }
  if (scenario === 'newcomer') {
    Object.assign(seed.community[0], { skills: [], interests: [] });
    seed.projects.forEach(project => { if (project.creator_id === me) project.creator_id = sam.id; });
    seed.project_members = seed.project_members.filter(row => row.user_id !== me);
    seed.connections = [];
    window.__immediate = {};
  }
  if (scenario === 'quiet-community') {
    // The member's own work and connections, and nothing open in the community.
    seed.community = seed.community.slice(0, 5);
    seed.active_themes_summary = [];
    seed.projects = seed.projects.filter(project => project.creator_id === me || project.id === ID.lab);
    seed.opportunities = [];
    Object.assign(seed.community[0], { skills: ['Welding'], interests: ['Sailing'] });
    window.__immediate = {};
  }
  seed.community_with_last_seen = seed.community.map(row => ({ ...row }));
  window.supabase = window.createFakeSupabase(seed, { session: { access_token: 'fixture', user: { id: 'auth-me', email: 'member@example.test' } } });
  const rpc = window.supabase.rpc;
  window.supabase.rpc = async (name, args) => {
    if (name === 'get_unread_count') return { data: Number(window.__immediate?.unread_messages?.count || 0), error: null };
    if (name === 'get_start_sequence_data') return { data: { has_profile: true, immediate_actions: window.__immediate || {} }, error: null };
    return rpc(name, args);
  };
  window.__fixtureProfile = seed.community[0];
  const toast = 'A critical error occurred. Please reload the page.';
  new MutationObserver(() => {
    document.querySelectorAll('body *').forEach(el => {
      if ((el.textContent || '').trim() === toast && (el.parentElement?.textContent || '').trim() !== toast) el.remove();
    });
  }).observe(document, { childList: true, subtree: true });
})();`;

const VIEWPORTS = {
  phone: { width: 390, height: 844, mobile: true, top: 59, bottom: 34 },
  'small-phone': { width: 375, height: 667, mobile: true, top: 20, bottom: 0 },
  'large-phone': { width: 430, height: 932, mobile: true, top: 59, bottom: 34 },
  tablet: { width: 820, height: 1180, mobile: true, top: 24, bottom: 20 },
  desktop: { width: 1366, height: 900, mobile: false, top: 0, bottom: 0 },
};
let view = VIEWPORTS.phone;
const rootSel = () => (view.width >= 1024 ? '#cd-home' : '#mobile-you-content');

async function loadHome(scenario, viewport = VIEWPORTS.phone) {
  view = viewport;
  await send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: 2, mobile: view.mobile });
  await send('Emulation.setTouchEmulationEnabled', view.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await send('Emulation.setUserAgentOverride', { userAgent: view.mobile ? PHONE.ua : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
  await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: view.top, bottom: view.bottom, left: 0, right: 0 } });
  // Each scenario starts clean: no "Not now" or drafts from an earlier one.
  await evaluate(`(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (_) {} return true; })()`).catch(() => {});
  await send('Page.navigate', { url: `${base}/index.html?scenario=${scenario}` });
  await waitFor(`document.readyState === 'complete'`, 'page load', 20000);
  await sleep(2500);
  if (!(await evaluate(`!!window.currentUserProfile?.id`))) {
    await evaluate(`(() => { window.currentUserProfile = window.__fixtureProfile; document.querySelectorAll('#login-section, .login-overlay, #auth-container').forEach(el => el.style.display = 'none'); window.dispatchEvent(new CustomEvent('profile-loaded', { detail: { user: { id: 'auth-me' }, profile: window.__fixtureProfile } })); })()`);
  }
  await waitFor(`document.querySelector('${rootSel()} .home-view')`, 'Home', 15000);
  await waitFor(`window.StartDailyDigest?.homeSuggestions?.().status === 'ready'`, 'the brief', 15000);
  await sleep(1500);
}

const panelText = () => evaluate(`(() => { const p = document.getElementById('node-side-panel'); return p && getComputedStyle(p).display !== 'none' && p.getClientRects().length ? p.innerText : ''; })()`);
// The selector goes in as an argument, never into generated code.
async function press(selector, label) {
  const ok = await callInPage(function (sel) {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }, selector);
  if (!ok) throw new Error(`Missing: ${label}`);
  await sleep(500);
}
async function backHome() {
  await evaluate(`(() => { window.closeNodePanel?.(); window.AppNav?.go?.('home'); return true; })()`);
  await waitFor(`document.querySelector('${rootSel()} .home-view')`, 'Home again', 8000);
  await sleep(600);
}


// Synthetic Nearify encounters (the get_nearify_event_peers shape: one row
// per event and person). The member is connected to Dana and Sam, sent
// Jordan a request, and Eli asked them (run-home-community's fixtures).
//   - Riley: met at three events (BLE, a QR scan, BLE), not connected.
//   - Dana: one event, connected (encounter promoted).
//   - Sam: one event, connected, but the encounter is still "suggested".
//   - Jordan: request sent. Eli: wants to connect. Ana: one event, new.
// Quinn (hidden from discovery) is not in the encounters, and is never shown.
// Web Bluetooth is removed (as Safari), and every Bluetooth notice that
// reaches the page is recorded. A stand-in for the old desktop anchor
// (#btn-refresh-network) lets Event Mode's button be created and opened.
const extra = `(() => {
  try { Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => undefined, configurable: true }); } catch (_) {}
  window.__bleNotices = [];
  // Each notice is recorded when it appears (not again while it stays up).
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (!/BLE scanning|Web Bluetooth/.test(node.textContent || '')) return;
      window.__bleNotices.push({ at: document.body.dataset.destination || 'none', mode: window.__eventModeOpened ? 'opened' : 'unprompted' });
    }));
  }).observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => {
    if (innerWidth < 1024) return;
    const holder = document.createElement('div');
    holder.id = '__event-mode-anchor';
    holder.style.cssText = 'position:fixed;left:90px;bottom:12px;z-index:5;display:flex;gap:8px';
    holder.innerHTML = '<button type="button" id="btn-refresh-network">Refresh</button>';
    document.body.appendChild(holder);
  });
  const ID = window.AssistanceFixtures.ID;
  const peer = (edge, id, name, signal, status) => ({ edge_id: edge, community_id: id, name, headline: name.split(' ')[0] + ' (headline)', signal_type: signal, status });
  const peers = { success: true, community_id: ID.me, events: [
    { event_id: 'ev-founders', event_name: 'Charleston Founders Meetup', occurred_at: '2026-10-10T22:00:00Z', peers: [
      peer('e1', ID.riley, 'Riley (fixture)', 'ble', 'suggested'),
      peer('e2', ID.dana, 'Dana (fixture)', 'ble', 'promoted'),
      peer('e3', ID.jordan, 'Jordan (fixture)', 'ble', 'suggested'),
      peer('e4', 'm-eli', 'Eli (fixture)', 'ble', 'suggested'),
    ] },
    { event_id: 'ev-hcd', event_name: 'HCD Event', occurred_at: '2026-09-18T17:00:00Z', peers: [
      { ...peer('e5', ID.riley, 'Riley (fixture)', 'qr_confirmed', 'suggested'), occurred_at: '2026-09-20T18:00:00Z' },
      peer('e6', ID.sam, 'Sam (fixture)', 'ble', 'suggested'),
      { ...peer('e8', 'm-ana', 'Ana (fixture)', 'ble', 'suggested'), name: 'Ana "A" <b>x</b> (fixture)' },
    ] },
    { event_id: 'ev-harbor', event_name: 'Harbor Demo Night', occurred_at: '2026-08-01T23:00:00Z', peers: [
      peer('e7', ID.riley, 'Riley (fixture)', 'ble', 'suggested'),
    ] },
  ] };
  window.__promoted = [];
  window.__connectionReads = [];
  const install = () => {
    const client = window.supabase;
    if (!client || client.__metWrapped) return;
    client.__metWrapped = true;
    const rpc = client.rpc.bind(client);
    client.rpc = async (name, args) => {
      if (name === 'get_nearify_event_peers') return { data: JSON.parse(JSON.stringify(peers)), error: null };
      if (name === 'promote_edge_to_connection') { window.__promoted.push(args.p_edge_id); return { data: { success: true, status: 'pending' }, error: null }; }
      return rpc(name, args);
    };
    const from = client.from.bind(client);
    client.from = (table) => {
      const query = from(table);
      if (table !== 'connections') return query;
      const or = query.or?.bind(query);
      if (or) query.or = (filter) => { window.__connectionReads.push(filter); return or(filter); };
      return query;
    };
  };
  install();
})();`;

// People you met as shown: one entry per card, with its name, status,
// encounter line, the events listed under it, and its action.
const metCards = () => callInPage(function () {
  return [...document.querySelectorAll('#cd-network-history .ch-peer-card')].map(card => {
    const details = card.querySelector('details.ch-peer-met');
    return {
      name: card.querySelector('.ch-peer-name')?.textContent.trim() || '',
      id: card.dataset.communityId || '',
      edge: card.dataset.edgeId || '',
      status: card.querySelector('.ch-peer-status')?.textContent.trim() || '',
      met: (details ? details.querySelector('summary') : card.querySelector('.ch-peer-met'))?.textContent.replace(/\s+/g, ' ').trim() || '',
      events: details ? [...details.querySelectorAll('li')].map(li => li.textContent.replace(/\s+/g, ' ').trim()) : [],
      action: card.querySelector('.ch-peer-action')?.innerText.replace(/\s+/g, ' ').trim() || '',
      connectEdge: card.querySelector('.ch-btn-peer-connect')?.dataset.edgeId || '',
    };
  });
});
const card = (cards, first) => cards.find(c => c.name.startsWith(first));
const openYourNetwork = async () => {
  await press('#app-nav [data-destination="you"]', 'You');
  await waitFor(`document.getElementById('btn-open-your-network')`, 'Your Network entry', 8000);
  await press('#btn-open-your-network', 'Your Network');
  await waitFor(`document.querySelectorAll('#cd-network-history .ch-peer-card').length > 0`, 'People you met', 10000);
  await sleep(500);
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: boot });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: extra });

  for (const name of ['phone', 'desktop']) {
    const snap = name === 'phone' ? phoneShot : shot;
    const phone = name === 'phone';
    console.log(`\nPeople you met, ${name}`);
    await loadHome('established', VIEWPORTS[name]);

    // 1. Home: no Bluetooth notice nobody asked for (the old one came 2s
    // after sign-in).
    await sleep(3500);
    const notices = await evaluate(`JSON.stringify(window.__bleNotices)`);
    check(notices === '[]' && !/BLE scanning|Web Bluetooth/.test(await evaluate(`document.body.innerText`)) && (await evaluate(`navigator.bluetooth === undefined`)),
      `${name}: Home shows no Bluetooth notice in a browser without Web Bluetooth`, notices);
    await snap(`met-${name}-home`);

    // Event Mode (the Bluetooth feature; desktop) explains it when opened.
    if (!phone) {
      const button = await evaluate(`!!document.getElementById('btn-event-mode')`);
      await evaluate(`window.__eventModeOpened = true; document.getElementById('btn-event-mode')?.click(); true`);
      await sleep(800);
      const opened = await evaluate(`JSON.stringify(window.__bleNotices)`);
      check(button && /"mode":"opened"/.test(opened) && !(await evaluate(`!!document.querySelector('.ble-privacy-modal, #ble-privacy-modal')`)),
        `${name}: opening Event Mode says Bluetooth scanning isn’t available here, before any privacy prompt`, JSON.stringify({ button, opened }));
      await shot(`met-${name}-event-mode`);
      await evaluate(`window.__eventModeOpened = false; document.getElementById('__event-mode-anchor')?.remove(); document.getElementById('btn-event-mode')?.remove(); true`);
    }

    // 2. Your Network → People you met: each person once.
    await openYourNetwork();
    let cards = await metCards();
    const names = cards.map(c => c.name);
    check(JSON.stringify(names) === JSON.stringify(['Riley (fixture)', 'Dana (fixture)', 'Jordan (fixture)', 'Eli (fixture)', 'Sam (fixture)', 'Ana "A" <b>x</b> (fixture)']),
      `${name}: each person appears once, most recently met first`, JSON.stringify(names));
    check((await evaluate(`document.querySelector('#cd-network-history .ch-nearify-events-status')?.textContent.trim()`)) === '6 people',
      `${name}: the count is of people, not encounters`);

    // Encounter history from the encounters only.
    const riley = card(cards, 'Riley');
    check(riley.met === 'Met at 3 events' && JSON.stringify(riley.events) === JSON.stringify(['Charleston Founders Meetup · Oct 10, 2026', 'HCD Event · Sep 20, 2026', 'Harbor Demo Night · Aug 1, 2026']),
      `${name}: someone met at three events shows “Met at 3 events” and lists them, newest first`, JSON.stringify(riley));
    const ana = card(cards, 'Ana');
    check(ana.met === 'Met at HCD Event · Sep 18, 2026' && !ana.events.length, `${name}: someone met once names the event`, JSON.stringify(ana));
    // A name with quotes and markup stays text, in the row and its attributes.
    const unsafe = await callInPage(function () {
      const row = document.querySelector('#cd-network-history .ch-peer-card[data-community-id="m-ana"]');
      const button = row?.querySelector('.ch-peer-profile');
      return { text: button?.textContent || '', attr: button?.dataset.peerName || '', bold: !!row?.querySelector('b'), attrs: [...(button?.attributes || [])].map(a => a.name) };
    });
    check(unsafe.text === 'Ana "A" <b>x</b> (fixture)' && unsafe.attr === unsafe.text && !unsafe.bold && JSON.stringify(unsafe.attrs) === '["type","class","data-profile-id","data-peer-name"]',
      `${name}: a name with quotes and markup stays text`, JSON.stringify(unsafe));

    // 3. Status and actions, from the member's own connections.
    const dana = card(cards, 'Dana'), sam = card(cards, 'Sam'), jordan = card(cards, 'Jordan'), eli = card(cards, 'Eli');
    check(riley.action === 'Connect' && riley.connectEdge === 'e5', `${name}: not connected → one Connect (for the QR encounter)`, JSON.stringify(riley));
    check(dana.action === 'Connected' && !dana.connectEdge, `${name}: connected → Connected, no Connect`, JSON.stringify(dana));
    check(sam.action === 'Connected' && !sam.connectEdge, `${name}: connected with a stale suggested encounter → Connected, no Connect`, JSON.stringify(sam));
    check(jordan.action === 'Request sent' && !jordan.connectEdge, `${name}: request sent → Request sent, no Connect`, JSON.stringify(jordan));
    check(eli.status === 'Wants to connect' && eli.action === 'Respond' && !eli.connectEdge, `${name}: they asked → Wants to connect, Respond`, JSON.stringify(eli));
    check(ana.action === 'Connect' && ana.connectEdge === 'e8', `${name}: new → Connect`, JSON.stringify(ana));

    // Privacy: no one beyond the encounters, nobody hidden, no IDs shown;
    // only the member's own connections are read.
    const text = await evaluate(`document.getElementById('cd-network-history').innerText`);
    const reads = await evaluate(`JSON.stringify(window.__connectionReads)`);
    check(!/Quinn|m-quinn|m-ana|m-eli|e1000|00000000-/.test(text), `${name}: no hidden member and no internal IDs shown`, text.slice(0, 200));
    check(JSON.parse(reads).length > 0 && JSON.parse(reads).every(f => /from_user_id\.eq\.[^,]+,to_user_id\.eq\./.test(f) && f.includes(JSON.parse(reads)[0].split('.eq.')[1].split(',')[0])), `${name}: status is read from the member’s own connections`, reads);

    // Expand Riley's events (phone screenshot).
    await evaluate(`[...document.querySelectorAll('#cd-network-history .ch-peer-card')].find(c => /^Riley/.test(c.querySelector('.ch-peer-name').textContent.trim())).querySelector('details').open = true; document.getElementById('cd-network-history').scrollIntoView({ block: 'start' }); true`);
    await sleep(400);
    await snap(`met-${name}-people`);

    // Connect sends a request through the existing promotion.
    await press('#cd-network-history .ch-btn-peer-connect[data-edge-id="e5"]', 'Connect Riley');
    await waitFor(`/Request sent/.test([...document.querySelectorAll('#cd-network-history .ch-peer-card')].find(c => /^Riley/.test(c.querySelector('.ch-peer-name').textContent.trim()))?.innerText || '')`, 'request sent', 4000);
    check((await evaluate(`JSON.stringify(window.__promoted)`)) === '["e5"]', `${name}: Connect promotes that one encounter and shows Request sent`);

    // 4. Profiles open as before: a stranger's is limited, with Connect.
    await press('#cd-network-history .ch-peer-card[data-community-id="m-ana"] .ch-peer-profile', 'Ana');
    await waitFor(`/Ana/.test(document.getElementById('node-side-panel')?.innerText || '')`, 'Ana’s profile', 8000).catch(() => {});
    let panel = await panelText();
    check(/Ana/.test(panel) && /Limited preview/.test(panel) && !/Ana \(fixture\)/.test(panel), `${name}: a name opens their profile (limited for someone not connected)`, panel.slice(0, 200));
    await evaluate(`window.closeNodePanel?.(); true`);
    await sleep(400);
    await press('#cd-network-history .ch-btn-peer-respond', 'Respond');
    await waitFor(`/Accept/i.test(document.getElementById('node-side-panel')?.innerText || '')`, 'Eli’s profile', 8000).catch(() => {});
    panel = await panelText();
    await snap(`met-${name}-respond`);
    check(/Eli/.test(panel) && /Accept/i.test(panel), `${name}: Respond opens their profile, with Accept`, panel.slice(0, 240));
    await evaluate(`window.closeNodePanel?.(); true`);
    await sleep(400);

    // 5. Navigation and the map unchanged.
    const nav = await evaluate(`[...document.querySelectorAll('#app-nav .app-nav-btn > span:not(.app-nav-badge)')].map(s => s.textContent.trim()).join(' | ')`);
    check(nav === 'Home | Explore | Inbox | You', `${name}: four tabs as before`, nav);
    await press('#app-nav [data-destination="you"]', 'You');
    await press('#btn-view-network-map', 'View Network Map');
    await sleep(1000);
    check(await evaluate(`document.body.classList.contains('buildspace-view-network') && getComputedStyle(document.getElementById('synapse-main-view')).display !== 'none'`),
      `${name}: View Network Map works as before`);
    check(!(await evaluate(`JSON.stringify(window.__bleNotices)`)).includes('unprompted'), `${name}: no Bluetooth notice anywhere unprompted`, await evaluate(`JSON.stringify(window.__bleNotices)`));
  }
} catch (error) {
  check(false, 'Run aborted', error.message);
  await shot('zz-failure').catch(() => {});
} finally {
  socket.close();
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  server.close();
  try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (_) { /* temp profile */ }
  const failed = results.filter(r => !r.ok);
  console.log(`\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} People you met checks passed. Screenshots: ${outDir}`);
  process.exit(failed.length ? 1 : 0);
}
