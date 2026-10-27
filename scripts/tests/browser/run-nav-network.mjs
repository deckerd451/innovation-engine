// Four tabs -- Home · Explore · Inbox · You -- with Network in You, as members
// see it: real index.html in headless Google Chrome against the synthetic
// community of run-home-community.mjs (test-only fake client; nothing
// reaches a database), on iPhone and desktop. You → Your Network opens the
// existing Network page (connections and pending requests) with "‹ You" back;
// You → View Network Map opens the existing map; Home's connections row,
// Explore → person → Connect and Inbox work as before.
//
//   node scripts/tests/browser/run-nav-network.mjs [outDir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const root = path.resolve(process.env.HOME_TEST_ROOT || here);
const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'buildspace-nav-network'));
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

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-nav-chrome-'));
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
  await evaluate(`(() => { try { localStorage.clear(); } catch (_) {} return true; })()`).catch(() => {});
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

// The main navigation as shown: tab labels, which is marked, and each tab's
// box (balanced, comfortable to tap).
const navState = () => callInPage(function () {
  const bar = document.getElementById('app-nav');
  const tabs = [...bar.querySelectorAll('.app-nav-btn')];
  const r = bar.getBoundingClientRect();
  return {
    labels: tabs.map(b => b.querySelector('span').textContent.trim()).join(' | '),
    current: bar.querySelector('[aria-current="page"]')?.dataset.destination || '',
    widths: tabs.map(b => Math.round(b.getBoundingClientRect().width)),
    heights: tabs.map(b => Math.round(b.getBoundingClientRect().height)),
    bottom: r.top > 0 && r.width >= innerWidth - 1, side: r.left === 0 && r.height >= innerHeight - 1 && r.width < 120,
    destination: document.body.dataset.destination || '',
  };
});
const shown = (sel) => callInPage(function (s) {
  const el = document.querySelector(s);
  return !!el && el.getClientRects().length > 0 && el.checkVisibility({ visibilityProperty: true }) && !el.closest('[inert]');
}, sel);
// Your Network's list: heading and the people in it, each with how they relate.
const networkList = () => callInPage(function () {
  return {
    heading: document.querySelector('#cd-explore-toggle span')?.textContent.trim() || '',
    rows: [...document.querySelectorAll('#udc-resource-list .udc-resource-item')].filter(el => el.getClientRects().length).map(el => el.innerText.replace(/\s+/g, ' ').trim()),
    back: (() => { const b = document.getElementById('cd-network-back'); return !!b && b.getClientRects().length > 0 && !b.closest('[inert]'); })(),
    map: document.body.classList.contains('buildspace-view-network') && getComputedStyle(document.getElementById('synapse-main-view')).display !== 'none',
  };
});
const tab = (destination) => press(`#app-nav [data-destination="${destination}"]`, destination);
const youShown = () => shown('#profile-modal .modal-content');

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: boot });

  for (const name of ['phone', 'desktop']) {
    const snap = name === 'phone' ? phoneShot : shot;
    const phone = name === 'phone';
    console.log(`\nNavigation, ${name}`);
    await loadHome('established', VIEWPORTS[name]);
    const historyBefore = await evaluate(`history.length + ' ' + location.href`);

    // Four tabs, in order; balanced and at least 44px on the bottom bar.
    let n = await navState();
    check(n.labels === 'Home | Explore | Inbox | You' && !(await evaluate(`!!document.querySelector('#app-nav [data-destination="network"]')`)),
      `${name}: four tabs, Home | Explore | Inbox | You`, n.labels);
    check(phone ? n.bottom && Math.max(...n.widths) - Math.min(...n.widths) <= 1 && Math.min(...n.widths) >= 88 && Math.min(...n.heights) >= 44 : n.side && Math.min(...n.heights) >= 44,
      `${name}: ${phone ? 'a balanced bottom bar, each tab a comfortable target' : 'the same four tabs in the side bar'}`, JSON.stringify(n));
    check(n.current === 'home', `${name}: Home is marked current`, n.current);
    await snap(`nav-${name}-home`);

    // You → Your Network, prominent, near the top of You.
    await tab('you');
    await waitFor(`document.getElementById('btn-open-your-network')`, 'Your Network entry', 8000);
    const entry = await callInPage(function () {
      const b = document.getElementById('btn-open-your-network');
      const m = document.getElementById('btn-view-network-map');
      const r = b.getBoundingClientRect();
      return { text: b.innerText.replace(/\s+/g, ' ').trim(), map: m?.innerText.trim(), top: Math.round(r.top), height: Math.round(r.height), vh: innerHeight, edit: !!document.getElementById('btn-open-profile-editor'), settings: !!document.getElementById('btn-profile-settings'), logout: !!document.getElementById('btn-profile-logout'), intents: !!document.getElementById('community-intent-card') };
    });
    check(/^Your Network Your connections and pending requests$/.test(entry.text) && entry.map === 'View Network Map' && entry.top < entry.vh / 2 && entry.height >= 44,
      `${name}: You shows “Your Network” and “View Network Map” in the first screenful`, JSON.stringify(entry));
    check(entry.edit && entry.settings && entry.logout && entry.intents, `${name}: You keeps Edit Profile, Settings, Log out and Right now`, JSON.stringify(entry));
    await snap(`nav-${name}-you`);

    await press('#btn-open-your-network', 'Your Network');
    await waitFor(`document.body.dataset.destination === 'network'`, 'Network', 6000);
    await sleep(1200);
    let list = await networkList();
    n = await navState();
    check(!(await youShown()) && n.current === 'you' && list.heading === 'Your Network' && list.back,
      `${name}: Your Network opens the Network page, You stays marked, “‹ You” above it`, JSON.stringify({ n, list }));
    check(list.rows.some(r => /^Dana \(fixture\)/.test(r)) && list.rows.some(r => /^Sam \(fixture\)/.test(r)),
      `${name}: your connections are listed`, JSON.stringify(list.rows));
    check(list.rows.filter(r => /Connection request/.test(r)).length >= 1,
      `${name}: pending requests are listed`, JSON.stringify(list.rows));
    if (!phone) check(list.map, `${name}: the map shows beside the list, as before`, JSON.stringify(list));
    await snap(`nav-${name}-network`);

    // Profile navigation and connection management, as before.
    await evaluate(`[...document.querySelectorAll('#udc-resource-list .udc-resource-item')].find(el => /^Dana/.test(el.innerText.trim()))?.click(); true`);
    await waitFor(`/Dana/.test(document.getElementById('node-side-panel')?.innerText || '')`, 'Dana’s profile', 8000).catch(() => {});
    let panel = await panelText();
    check(/Dana/.test(panel), `${name}: a connection opens their profile`, panel.slice(0, 200));
    await evaluate(`window.closeNodePanel?.(); true`);
    await sleep(500);

    // ‹ You goes back to You; You again is where Your Network was opened.
    await press('#cd-network-back', '‹ You');
    await sleep(500);
    n = await navState();
    check((await youShown()) && n.current === 'you' && n.destination === 'you', `${name}: “‹ You” goes back to You`, JSON.stringify(n));

    // View Network Map: the existing map.
    await press('#btn-view-network-map', 'View Network Map');
    await waitFor(`document.body.dataset.destination === 'network'`, 'Network', 6000);
    await sleep(1200);
    const map = await callInPage(function () {
      const graph = document.getElementById('synapse-main-view');
      const back = document.getElementById('network-map-back');
      return {
        network: document.body.classList.contains('buildspace-view-network'), graph: !!graph && getComputedStyle(graph).display !== 'none' && graph.getBoundingClientRect().height > 0,
        surface: document.body.classList.contains('mobile-surface-map'),
        back: !!back && !back.hidden && back.getClientRects().length > 0, title: getComputedStyle(document.querySelector('.synapse-workspace-title')).display,
      };
    });
    check(map.network && map.graph && (phone ? map.surface && map.back : !map.back), `${name}: View Network Map opens the existing map${phone ? ', with “‹ Your Network”' : ''}`, JSON.stringify(map));
    await snap(`nav-${name}-map`);
    if (phone) {
      await press('#network-map-back', '‹ Your Network');
      await sleep(1000);
      list = await networkList();
      check(list.heading === 'Your Network' && list.rows.some(r => /^Dana/.test(r)) && !(await evaluate(`document.body.classList.contains('mobile-surface-map')`)) && (await evaluate(`document.getElementById('network-map-back').hidden`)),
        `${name}: “‹ Your Network” returns from the map to the list`, JSON.stringify(list));
      // Your Network from You shows the list, even when the map was left open.
      await tab('you');
      await press('#btn-view-network-map', 'View Network Map');
      await sleep(800);
      await tab('you');
      await press('#btn-open-your-network', 'Your Network');
      await sleep(1000);
      list = await networkList();
      check(list.heading === 'Your Network' && list.rows.length > 0 && !(await evaluate(`document.body.classList.contains('mobile-surface-map')`)),
        `${name}: Your Network shows the list after the map was left open`, JSON.stringify(list));
    }

    // Home → your connections opens Your Network (the list).
    await tab('home');
    await waitFor(`document.querySelector('${rootSel()} [data-mine="people"]')`, 'Your community', 10000);
    await press(`${rootSel()} [data-mine="people"]`, 'connections row');
    await waitFor(`document.body.dataset.destination === 'network'`, 'Network', 6000);
    await sleep(1000);
    list = await networkList();
    check(list.heading === 'Your Network' && list.rows.some(r => /^Sam/.test(r)) && (!phone || !(await evaluate(`document.body.classList.contains('mobile-surface-map')`))),
      `${name}: Home → your connections opens Your Network`, JSON.stringify(list));

    // Explore → person → Connect.
    await tab('explore');
    await sleep(800);
    await press('[data-resource="people"]', 'People');
    await sleep(800);
    await evaluate(`[...document.querySelectorAll('#udc-resource-list .udc-resource-item')].find(el => /^Riley/.test(el.innerText.trim()))?.click(); true`);
    await waitFor(`/Riley/.test(document.getElementById('node-side-panel')?.innerText || '')`, 'Riley’s profile', 8000).catch(() => {});
    panel = await panelText();
    const connect = await evaluate(`[...document.querySelectorAll('#node-side-panel button')].some(b => /^(Connect|Send connection request)/i.test(b.textContent.trim()))`);
    n = await navState();
    check(/Riley/.test(panel) && connect && n.current === 'explore', `${name}: Explore → person → Connect`, panel.slice(0, 200));
    await evaluate(`window.closeNodePanel?.(); true`);
    await sleep(400);

    // Inbox, and back to Home.
    await tab('inbox');
    await sleep(800);
    n = await navState();
    check((await shown('#messages-modal .modal-content')) && n.current === 'inbox' && n.destination === 'inbox', `${name}: Inbox opens and is marked`, JSON.stringify(n));
    await tab('home');
    await sleep(800);
    n = await navState();
    check(n.current === 'home' && !(await shown('#messages-modal .modal-content')) && (await shown(`${rootSel()} .home-view`)), `${name}: Home again`, JSON.stringify(n));
    check((await evaluate(`history.length + ' ' + location.href`)) === historyBefore, `${name}: no history entries added and the URL kept (Back behaves as before)`);
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
  console.log(`\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} navigation checks passed. Screenshots: ${outDir}`);
  process.exit(failed.length ? 1 : 0);
}
