// Buildspace's discovery-first Home, as members see it: real index.html in
// headless Google Chrome against a synthetic community (the test-only fake
// client; supabaseClient.js is replaced by a stub, nothing reaches a
// database). Scenarios:
//   - established: a member with something to reply to, someone new with
//     shared interests (HCD = human-centered design), a project two of their
//     connections are on, a matching opportunity, and their own projects and
//     tasks
//   - no-people: nobody new qualifies, so a way to find people instead
//   - newcomer: nothing listed, no connections or projects
//   - quiet-community: the member's own work and nothing open in the community
// It checks what is shown and why, the privacy rules (never yourself, a
// connection, a pending request or a hidden member; initials, not photos; no
// skill fewer than five visible members list; never a theme: themes were
// replaced by skills), that every visible action works (Explore's own search,
// the one Browse Explore link, skill views and panels; no category pills and
// no link to existing connections), and the
// layout on small, standard and large iPhones, tablet and desktop.
//
//   node scripts/tests/browser/run-discovery-home.mjs [outDir]
//
// CHROME_PATH overrides the browser; HOME_TEST_ROOT serves another checkout.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const root = path.resolve(process.env.HOME_TEST_ROOT || here);
const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'buildspace-discovery-home'));
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

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-disc-chrome-'));
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

// Home as shown: visible sections in order, and the text of each part.
const home = () => callInPage(function (root) {
  const visible = el => !!el && !el.hidden && el.getClientRects().length > 0;
  const text = sel => { const el = document.querySelector(`${root} ${sel}`); return visible(el) ? el.innerText : ''; };
  const all = [...document.querySelectorAll(`${root} [data-home]`)].filter(visible).map(el => el.dataset.home);
  const meet = document.querySelector(`${root} [data-home="meet"]`);
  return {
    sections: all.filter(name => ['attention', 'picked', 'happening', 'profile', 'quiet', 'work', 'goal'].includes(name)),
    parts: all,
    header: (document.querySelector(`${root} .home-header`)?.textContent || '').replace(/\s+/g, ' ').trim(),
    heading: (() => { const h = document.querySelector(`${root} #home-happening-title`); return visible(h) ? h.textContent.trim() : ''; })(),
    headerLayout: (() => {
      const name = document.querySelector(`${root} .home-name`);
      const intro = document.querySelector(`${root} .home-intro`);
      const buttons = [...document.querySelectorAll('#mobile-header-actions > *')].filter(visible).map(el => el.getBoundingClientRect());
      if (!name || !intro) return null;
      const n = name.getBoundingClientRect(), i = intro.getBoundingClientRect();
      const overlaps = r => buttons.some(b => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top);
      return { nameOneLine: n.height <= parseFloat(getComputedStyle(name).lineHeight || '0') * 1.2 + 2 || n.height < 40, nameUnderButtons: overlaps(n), introUnderButtons: overlaps(i) };
    })(),
    attention: text('[data-home="attention"]'),
    meet: text('[data-home="meet"]'),
    meetTitle: visible(meet) ? meet.querySelector('.network-reflection-concierge-title')?.textContent.trim() || '' : '',
    meetReasons: visible(meet) ? [...meet.querySelectorAll('.network-reflection-concierge-reasons li')].map(li => li.textContent.trim()) : [],
    meetImages: meet ? meet.querySelectorAll('img').length : 0,
    meetInitials: visible(meet) ? meet.querySelector('.network-reflection-concierge-initials')?.textContent.trim() || '' : '',
    pickActions: [...document.querySelectorAll(`${root} [data-home="join"] .home-pick`)].filter(visible).map(li => [...li.querySelectorAll('button')].filter(visible).map(b => b.textContent.trim()).join('|')),
    join: [...document.querySelectorAll(`${root} [data-home="join"] .home-pick`)].filter(visible).map(li => ({
      kind: li.querySelector('.home-kind')?.textContent.trim(), name: li.querySelector('strong')?.textContent.trim(),
      reasons: [...li.querySelectorAll('.home-reasons li')].map(x => x.textContent.trim()),
    })),
    connectionsLinks: [...document.querySelectorAll(`${root} button, ${root} a`)].filter(visible).map(b => b.textContent.trim()).filter(t => /Find people in Explore|People$/.test(t)),
    exploreLink: (() => { const b = document.querySelector(`${root} .home-explore button`); return visible(b) ? b.textContent.trim() : ''; })(),
    themes: [...document.querySelectorAll(`${root} .home-theme, ${root} [data-theme]`)].filter(visible).map(b => b.innerText.replace(/\s+/g, ' ').trim()),
    openRows: [...document.querySelectorAll(`${root} [data-home="happening"] .home-open-row`)].filter(visible).map(b => b.innerText.replace(/\s+/g, ' ').trim()),
    topics: [...document.querySelectorAll(`${root} .home-topic`)].filter(visible).map(b => b.textContent.trim()),
    happening: text('[data-home="happening"]'),
    profile: text('[data-home="profile"]'),
    quiet: text('[data-home="quiet"]'),
    work: text('[data-home="work"]'),
    all: document.querySelector(root)?.innerText || '',
    pills: document.querySelectorAll(`${root} .home-lens, ${root} [data-lens]`).length,
    search: visible(document.querySelector(`${root} .home-search`)),
  };
}, rootSel());

const destination = () => evaluate(`document.body.dataset.destination || ''`);
const activeTab = () => evaluate(`document.querySelector('#udc-resource-tabs .udc-resource-tab.active')?.dataset.resource || ''`);
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
// Layout facts: the first screenful, Home's length, overflow, the bottom.
const layout = () => callInPage(function (root, phone) {
  const scroller = phone ? document.querySelector('#mobile-you-screen .mobile-you-scroll') : null;
  if (scroller) scroller.scrollTop = 0;
  const nav = document.getElementById('app-nav').getBoundingClientRect();
  const viewBottom = phone ? nav.top : innerHeight;
  const top = sel => { const el = document.querySelector(`${root} ${sel}`); return el && !el.hidden && el.getClientRects().length ? Math.round(el.getBoundingClientRect().top) : null; };
  const result = {
    viewBottom: Math.round(viewBottom),
    searchTop: top('.home-search'), exploreLinkTop: top('.home-explore'),
    pickedTop: top('[data-home="picked"]'), happeningTop: top('[data-home="happening"]'), workTop: top('[data-home="work"]'),
    homeHeight: scroller ? scroller.scrollHeight : Math.round(document.querySelector(root).scrollHeight),
    overflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
  };
  if (scroller) {
    scroller.scrollTop = scroller.scrollHeight;
    const items = [...document.querySelectorAll(`${root} .home-view [data-home]`)].filter(el => !el.hidden && el.getClientRects().length);
    const last = Math.max(...items.map(el => el.getBoundingClientRect().bottom));
    result.bottomClearance = Math.round(nav.top - last);
    scroller.scrollTop = 0;
  }
  const main = document.querySelector(`${root} .home-main`)?.getBoundingClientRect();
  const side = document.querySelector(`${root} .home-side`)?.getBoundingClientRect();
  result.columns = main && side ? { mainWidth: Math.round(main.width), sideWidth: Math.round(side.width), sideBeside: side.left >= main.right - 1 } : null;
  return result;
}, rootSel(), view.width < 1024);

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: boot });

  // ------------------------------------------------------------ established
  console.log('\nEstablished member (iPhone 390×844, Dynamic Island)');
  await loadHome('established');
  let h = await home();
  await phoneShot('established-iphone-top');
  check(/Welcome, Test Member/.test(h.header) && /Discover what we could do together\./.test(h.header), 'a warm welcome by name, with one short invitation', h.header);
  check(h.headerLayout?.nameOneLine && !h.headerLayout.nameUnderButtons && !h.headerLayout.introUnderButtons, 'the name sits on one line and nothing in the welcome runs under the header buttons', JSON.stringify(h.headerLayout));
  check(h.heading === 'Happening in the community', 'an established member’s community section is “Happening in the community”', h.heading);
  check(JSON.stringify(h.sections) === '["attention","picked","happening","work","goal"]', 'sections: waiting on you, picked for you, happening, your work, goal help', JSON.stringify(h.sections));
  check(/1 person wants to connect with you/.test(h.attention), 'Waiting on you shows the genuine pending request', h.attention);
  check(h.search && h.exploreLink === 'Browse Explore' && h.pills === 0, 'search and one quiet Browse Explore link; no category pills duplicating Explore', JSON.stringify({ link: h.exploreLink, pills: h.pills }));
  check(h.meetTitle === 'Meet Riley (fixture)', 'a person worth meeting: someone new with something in common', h.meetTitle);
  check(h.meetReasons.includes('Shared interest: Human-Centered Design') && h.meetReasons.includes('Shared skill: Python'), 'the introduction says why, from real shared terms (HCD = human-centered design)', JSON.stringify(h.meetReasons));
  check(h.meetImages === 0 && h.meetInitials === 'RF', 'initials, not a photo', JSON.stringify({ images: h.meetImages, initials: h.meetInitials }));
  check(!/Meet (Dana|Sam|Jordan|Eli|Test Member|Quinn)/.test(h.all), 'never yourself, a connection, a pending request (either way) or a hidden member as an introduction');
  check(!/Quinn/.test(h.all), 'a member hidden from discovery appears nowhere on Home');
  check(h.join.length === 2 && h.join[0].kind === 'Project you could join' && /HCD Event/.test(h.join[0].name) && h.join[0].reasons.includes('2 people you’re connected to are on this project'),
    'a project worth joining comes first, with its reason', JSON.stringify(h.join));
  check(h.join[1]?.kind === 'Opportunity' && /Python mentor/.test(h.join[1].name) && h.join[1].reasons.some(r => /^Matches what you listed: python/.test(r)) && h.join[1].reasons.some(r => /^Closes /.test(r)),
    'then an opportunity worth exploring, with its match and real deadline', JSON.stringify(h.join[1]));
  check(!h.themes.length && !/Themes people are exploring|Climate resilience|Food access|Civic tech|General Projects|\btheme/i.test(h.all), 'no themes on Home: themes were replaced by skills', JSON.stringify(h.themes));
  check(h.openRows.some(r => /^Flood map for West Ashley Needs GIS, Python/.test(r)) && h.openRows.some(r => /^Community fridge network/.test(r)) && !h.openRows.some(r => /HCD Event|Finished archive|Harborhack/.test(r)),
    'projects open to collaborators, with what they need; never one already picked, finished or your own', JSON.stringify(h.openRows));
  check(h.openRows.some(r => /^Judge the spring pitch night Tidewater Schools · Closes /.test(r)) && !h.openRows.some(r => /Expired grant|My own posting|Python mentor/.test(r)),
    'open opportunities with their organization and deadline; never expired, your own, or one already picked', JSON.stringify(h.openRows));
  check(!h.topics.length && !h.connectionsLinks.length, 'with someone to meet, no people-finding fallback is needed', JSON.stringify({ topics: h.topics, links: h.connectionsLinks }));
  check(/^YOUR WORK\s*Next: select speaker\(s\)/i.test(h.work) && /2 projects · 1 more open task/.test(h.work), 'your work: the next task and a one-line summary', h.work);
  let L = await layout();
  check(L.searchTop != null && L.exploreLinkTop < L.viewBottom && L.pickedTop != null && L.pickedTop < L.viewBottom - 120, 'the first screenful shows search, Browse Explore and Picked for you', JSON.stringify(L));
  check(L.workTop > L.happeningTop && L.happeningTop > L.pickedTop, 'discovery comes before your work', JSON.stringify(L));
  check(L.homeHeight <= 2400, `Home stays focused (${L.homeHeight}px of scrolling at iPhone size)`, String(L.homeHeight));
  check(L.overflowX <= 0 && L.bottomClearance >= 32, 'no sideways scrolling; the end of Home clears the navigation', JSON.stringify(L));
  await evaluate(`(() => { const s = document.querySelector('#mobile-you-screen .mobile-you-scroll'); s.scrollTop = 700; return true; })()`);
  await sleep(200);
  await phoneShot('established-iphone-scrolled');

  // Actions on Home
  await evaluate(`(() => { window.__calls = []; const vt = window.viewProjectTask; window.viewProjectTask = (...a) => { window.__calls.push(['task', ...a]); }; return true; })()`);
  await press(`${rootSel()} [data-home="work"] [data-next-task]`, 'Continue');
  check(JSON.stringify(await evaluate('window.__calls')) === JSON.stringify([['task', '${PROJECT}', '${TASK}']]).replace('${PROJECT}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa').replace('${TASK}', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
    'Continue opens the next task', JSON.stringify(await evaluate('window.__calls')));
  await press(`${rootSel()} [data-home="work"] details > summary`, 'work summary');
  const expanded = await evaluate(`document.querySelector('${rootSel()} [data-home="work"]').innerText`);
  check(/Your other open tasks/.test(expanded) && /Your projects/.test(expanded) && /Book the venue/.test(expanded), 'Your work expands to other tasks and projects', expanded);
  await press(`${rootSel()} [data-join="0"]`, 'Take a look');
  await waitFor(`/HCD Event/.test(document.getElementById('node-side-panel')?.innerText || '')`, 'project panel', 6000).catch(() => {});
  check(/HCD Event/.test(await panelText()), 'Take a look opens the project', (await panelText()).slice(0, 120));
  await backHome();
  await press(`${rootSel()} [data-home="meet"] .network-reflection-concierge-profile`, 'View profile');
  await waitFor(`/Riley/.test(document.getElementById('node-side-panel')?.innerText || '')`, 'person panel', 6000).catch(() => {});
  check(/Riley/.test(await panelText()), 'View profile opens their profile', (await panelText()).slice(0, 120));
  await backHome();
  await press(`${rootSel()} [data-home="happening"] [data-project="0"]`, 'Flood map row');
  await waitFor(`/Flood map/.test(document.getElementById('node-side-panel')?.innerText || '')`, 'project panel', 6000).catch(() => {});
  check(/Flood map for West Ashley/.test(await panelText()), 'a community project opens its details', (await panelText()).slice(0, 120));
  await backHome();
  await press(`${rootSel()} [data-home="happening"] [data-opportunity="0"]`, 'Judge row');
  await waitFor(`/Judge the spring/.test(document.getElementById('node-side-panel')?.innerText || '')`, 'opportunity panel', 6000).catch(() => {});
  check(/Judge the spring pitch night/.test(await panelText()), 'an open opportunity opens its details', (await panelText()).slice(0, 120));
  await backHome();
  // Not now: set aside for today, and the next one moves up.
  await press(`${rootSel()} [data-skip="1"]`, 'Not now on the opportunity');
  h = await home();
  check(!h.join.some(item => /Python mentor/.test(item.name)), 'Not now sets a way to join in aside', JSON.stringify(h.join));
  check(!h.openRows.some(row => /Python mentor/.test(row)), 'an opportunity set aside does not reappear in Happening in the community', JSON.stringify(h.openRows));
  await press(`${rootSel()} [data-skip="0"]`, 'Not now on the project');
  h = await home();
  check(!h.join.some(item => /HCD Event/.test(item.name)) && !h.openRows.some(row => /HCD Event/.test(row)), 'a project set aside leaves Picked for you and does not reappear in the community', JSON.stringify({ join: h.join, rows: h.openRows }));
  check(h.openRows.some(row => /^Community fridge network/.test(row)) && h.openRows.some(row => /^Judge the spring pitch night/.test(row)), 'the rest of the community stays', JSON.stringify(h.openRows));
  await press(`${rootSel()} [data-home="meet"] .network-reflection-concierge-link`, 'Not now on the introduction');
  h = await home();
  check(!/Meet Riley/.test(h.meet), 'Not now sets the introduction aside', h.meet);

  // Navigation from Home: Explore's own search, and one way into Explore.
  await backHome();
  await evaluate(`(() => { const i = document.getElementById('home-search-input'); i.value = 'Python'; i.form.requestSubmit(); return true; })()`);
  await sleep(900);
  const searched = await evaluate(`({ dest: document.body.dataset.destination, value: document.getElementById('global-search')?.value, suggestions: [...document.querySelectorAll('#search-suggestions .search-suggestion-item')].map(i => i.innerText.trim()).slice(0, 6) })`);
  check(searched.dest === 'explore' && searched.value === 'Python' && searched.suggestions.length > 0, 'search hands the words to Explore’s search, with suggestions', JSON.stringify(searched));
  await backHome();
  await press(`${rootSel()} .home-explore [data-home-action="explore"]`, 'Browse Explore');
  check((await destination()) === 'explore', '“Browse Explore” opens Explore', await destination());
  await backHome();
  await evaluate(`(() => { window.__requests = 0; window.toggleConnectionsPanel = () => { window.__requests += 1; }; return true; })()`);
  await press(`${rootSel()} [data-home="attention"] [data-attention="openConnectionRequests"]`, 'See who');
  await waitFor(`window.__requests > 0`, 'connection requests', 4000).catch(() => {});
  check((await evaluate('window.__requests')) === 1, '“See who” opens the connection requests', String(await evaluate('window.__requests')));

  // ------------------------------------------------------------ no people
  console.log('\nEstablished member with no one eligible to meet');
  await loadHome('no-people');
  h = await home();
  check(!h.meet && !h.connectionsLinks.length, 'no introduction card, and no link that leads to existing connections', JSON.stringify({ meet: h.meet, links: h.connectionsLinks }));
  check(h.join.length >= 1 && /HCD Event/.test(h.join[0].name), 'connections still bring a credible invitation', JSON.stringify(h.join));
  check(!h.attention, 'nothing waiting: no Waiting on you', h.attention);
  const topics = h.topics.map(t => t.toLowerCase());
  check(['design', 'python'].every(skill => topics.includes(skill)), 'people can be found by skills enough members share', JSON.stringify(h.topics));
  check(!topics.includes('beekeeping') && !topics.includes('welding'), 'never a skill only one or two members list', JSON.stringify(h.topics));
  check(!topics.includes('woodworking'), 'a hidden member never counts toward a skill (4 visible + 1 hidden stays below five)', JSON.stringify(h.topics));
  await phoneShot('no-people-iphone');
  await press(`${rootSel()} .home-topic`, 'a skill');
  await sleep(600);
  check((await destination()) === 'explore' && /Design/.test(await panelText()), 'a skill opens Explore’s skill view', (await panelText()).slice(0, 120));
  await backHome();
  await press(`${rootSel()} [data-home-action="topics"]`, 'See all skills');
  check((await destination()) === 'explore' && (await activeTab()) === 'themes', '“See all skills” opens Explore → Skills', JSON.stringify({ dest: await destination(), tab: await activeTab() }));
  // Explore's own Skills list and skill view: hidden members never count or show.
  await waitFor(`/Woodworking/.test(document.getElementById('udc-resource-list')?.innerText || '')`, 'Explore skills', 8000).catch(() => {});
  const exploreSkills = await evaluate(`[...document.querySelectorAll('#udc-resource-list .udc-resource-item')].map(row => row.innerText.replace(/\\s+/g, ' ').trim())`);
  check(exploreSkills.some(row => /^Woodworking 4 members/.test(row)), 'Explore counts a skill without hidden members (Woodworking: 4, not 5)', JSON.stringify(exploreSkills));
  check(!exploreSkills.some(row => /Climate resilience|Food access|Civic tech|General Projects/.test(row)), 'Explore → Skills lists member skills, never theme titles', JSON.stringify(exploreSkills));
  check(!exploreSkills.some(row => /Taxidermy/.test(row)), 'a skill only a hidden member lists never appears in Explore', JSON.stringify(exploreSkills));
  await evaluate(`window.openNodePanel({ id: 'skill:Woodworking', type: 'skill', name: 'Woodworking', skillName: 'Woodworking', isSkillLens: true }); true`);
  await waitFor(`/list Woodworking/.test(document.getElementById('node-side-panel')?.innerText || '')`, 'skill view', 6000).catch(() => {});
  const lens = await panelText();
  check(/4 members list Woodworking\./.test(lens) && !/Quinn/.test(lens), 'the skill view never lists or counts a hidden member', lens.slice(0, 200));

  // ------------------------------------------------------------ newcomer
  console.log('\nNewcomer (nothing listed, no connections, no projects)');
  await loadHome('newcomer');
  h = await home();
  await phoneShot('newcomer-iphone-top');
  check(JSON.stringify(h.sections) === '["happening","profile","goal"]', 'what is happening first; no picks, no work, nothing waiting', JSON.stringify(h.sections));
  check(h.heading === 'Start anywhere' && /What’s open in your community right now\. Nothing to set up first\./.test(h.happening), 'a newcomer is welcomed with “Start anywhere”', h.happening.slice(0, 160));
  check(!h.themes.length && h.openRows.length >= 3 && !/Themes people are exploring|General Projects/.test(h.all), 'real projects and opportunities to explore right away; no themes', JSON.stringify({ themes: h.themes, rows: h.openRows }));
  check(['design', 'python'].every(skill => h.topics.map(t => t.toLowerCase()).includes(skill)) && !h.topics.some(t => /beekeeping|woodworking/i.test(t)), 'a way to browse people by shared skills, never a one-person or hidden-inflated skill', JSON.stringify(h.topics));
  check(/What are you curious about\?/.test(h.profile) && /optional/.test(h.profile), 'an optional invitation to personalize, below discovery', h.profile);
  check(!/Meet /.test(h.all), 'no individual introductions without real evidence');
  L = await layout();
  check(L.happeningTop != null && L.happeningTop < L.viewBottom - 160, 'the first screenful already shows what is happening', JSON.stringify(L));
  check(L.overflowX <= 0 && L.bottomClearance >= 32, 'no sideways scrolling; the end of Home clears the navigation', JSON.stringify(L));
  await evaluate(`(() => { const s = document.querySelector('#mobile-you-screen .mobile-you-scroll'); s.scrollTop = 600; return true; })()`);
  await sleep(200);
  await phoneShot('newcomer-iphone-scrolled');
  const before = await evaluate(`JSON.stringify(window.currentUserProfile.interests)`);
  await press(`${rootSel()} .home-topic`, 'browse a skill');
  await backHome();
  check((await evaluate(`JSON.stringify(window.currentUserProfile.interests)`)) === before && (await evaluate(`JSON.stringify(window.supabase.__db.community[0].interests)`)) === before,
    'browsing a topic never changes the member’s interests', before);
  await press(`${rootSel()} [data-home="profile"] [data-home-action="later"]`, 'Not now');
  h = await home();
  check(!h.profile, 'the invitation can be set aside', h.profile);

  // ------------------------------------------------------------ quiet community
  console.log('\nMember with work, and nothing open in the community');
  await loadHome('quiet-community');
  h = await home();
  check(/Nothing new is open in the community right now\./.test(h.happening) && !h.themes.length && !h.openRows.length && !h.topics.length,
    'says so plainly: no invented counts or activity', h.happening);
  check(h.exploreLink === 'Browse Explore' && /Next: select speaker/.test(h.work), 'Explore is one tap away, and the member’s work is still there', JSON.stringify({ link: h.exploreLink, work: h.work }));

  // ------------------------------------------------------------ other sizes
  for (const name of ['small-phone', 'large-phone', 'tablet', 'desktop']) {
    console.log(`\nEstablished member, ${name} (${VIEWPORTS[name].width}×${VIEWPORTS[name].height})`);
    await loadHome('established', VIEWPORTS[name]);
    h = await home();
    L = await layout();
    check(h.sections[0] === 'attention' && h.sections.indexOf('picked') < h.sections.indexOf('work') && h.sections.indexOf('happening') < h.sections.indexOf('work'), `${name}: discovery before your work`, JSON.stringify(h.sections));
    if (view.width < 1024) check(h.headerLayout?.nameOneLine && !h.headerLayout.nameUnderButtons && !h.headerLayout.introUnderButtons, `${name}: the welcome fits, clear of the header buttons`, JSON.stringify(h.headerLayout));
    check(h.meetReasons.length === 2 && h.join.every(item => item.reasons.length) && h.pickActions.every(a => a === 'Take a look|Not now'), `${name}: every reason and action is still on each pick`, JSON.stringify({ reasons: h.meetReasons, join: h.join, actions: h.pickActions }));
    if (name === 'small-phone') await phoneShot('established-small-phone');
    check(L.overflowX <= 0, `${name}: no sideways scrolling`, JSON.stringify(L));
    if (view.width < 1024) check(L.bottomClearance >= 32, `${name}: the end of Home clears the navigation`, JSON.stringify(L));
    if (name === 'desktop') check(L.columns?.sideBeside && L.columns.mainWidth > L.columns.sideWidth, 'desktop: discovery in the wider column, your work beside it', JSON.stringify(L.columns));
    if (name === 'desktop') check(!h.search && (await evaluate(`!!document.getElementById('global-search')?.getClientRects().length`)), 'desktop: one search box (the dashboard’s), not two', String(h.search));
    await shot(`established-${name}`);
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
  console.log(`\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} discovery Home checks passed. Screenshots: ${outDir}`);
  process.exit(failed.length ? 1 : 0);
}
