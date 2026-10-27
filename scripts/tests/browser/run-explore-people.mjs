// Explore → People is the community directory; Network → People stays the
// member's relationships. Real index.html in headless Google Chrome against
// the synthetic community of run-discovery-home.mjs (test-only fake client;
// nothing reaches a database), on iPhone and desktop:
//   - Explore lists discoverable members beyond the member's connections
//     (full names only for accepted connections; anyone else "First L."),
//     each with how they relate (Connected, Connection request, what you
//     share, or what they list); never the member themselves and never a
//     member hidden from discovery; the People count is the directory's
//   - a stranger opens their profile, with Connect
//   - Network lists exactly the member's connections and requests, as before
//   - Explore → Skills lists the skills discoverable members list (themes and
//     theme circles were replaced by skills, so never a theme title, though
//     the fixture still holds theme rows), each counted once per member other
//     than the member themselves; a skill opens exactly those members, full
//     names only for accepted connections and "First L." for anyone else
//   - search never offers themes
//
//   node scripts/tests/browser/run-explore-people.mjs [outDir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const root = path.resolve(process.env.HOME_TEST_ROOT || here);
const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'buildspace-explore-people'));
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

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-people-chrome-'));
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
  // Historical theme rows stay in the database; none of them is ever shown.
  seed.theme_circles = [
    { id: 'th-civic', title: 'Civic tech', description: 'Civic tech theme', status: 'active', created_at: soon(-2), expires_at: soon(30) },
    { id: 'th-climate', title: 'Climate resilience', description: 'Climate theme', status: 'active', created_at: soon(-1), expires_at: soon(30) },
  ];
  seed.theme_participants = ['m-ana', 'm-bo', 'm-cy', me].map(id => ({ theme_id: 'th-civic', community_id: id }));
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


const destination = () => evaluate(`document.body.dataset.destination || ''`);
const peopleList = () => callInPage(function () {
  const visible = el => !!el && el.getClientRects().length > 0;
  const tab = document.querySelector('#udc-resource-tabs .udc-resource-tab.active');
  const count = document.querySelector('[data-count-for="people"]');
  return {
    tab: tab?.dataset.resource || '',
    label: document.querySelector('#udc-resource-list .udc-resource-section-label')?.textContent.trim() || '',
    count: count ? count.textContent.trim() : '',
    countLabel: count?.getAttribute('aria-label') || '',
    rows: [...document.querySelectorAll('#udc-resource-list .udc-resource-item')].filter(visible).map(row => ({
      name: row.querySelector('.udc-resource-name')?.textContent.trim() || '',
      meta: row.querySelector('.udc-resource-meta')?.textContent.trim() || '',
    })),
  };
});
async function openPage(page) {
  await evaluate(`window.AppNav.go('${page}'); true`);
  await sleep(900);
  await evaluate(`document.querySelector('#udc-resource-tabs [data-resource="people"]').click(); true`);
  await sleep(1200);
}
const NETWORK_BEFORE = [
  ['Dana (fixture)', 'Direct connection'], ['Sam (fixture)', 'Direct connection'],
  ['Eli (fixture)', 'Connection request'], ['Jordan (fixture)', 'Connection request'],
];

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: boot });

  for (const name of ['phone', 'desktop']) {
    console.log(`\nExplore and Network people, ${name} (${VIEWPORTS[name].width}×${VIEWPORTS[name].height})`);
    await loadHome('established', VIEWPORTS[name]);
    await openPage('explore');
    await waitFor(`[...document.querySelectorAll('#udc-resource-list .udc-resource-name')].some(n => /^Ana /.test(n.textContent))`, 'directory', 10000).catch(() => {});
    const explore = await peopleList();
    const byName = new Map(explore.rows.map(row => [row.name, row.meta]));
    const names = explore.rows.map(row => row.name);
    check(explore.tab === 'people' && ['Riley (.', 'Ana (.', 'Bo (.', 'Fay (.'].every(n => names.includes(n)),
      `${name}: Explore → People lists discoverable members beyond the member's connections`, JSON.stringify(names));
    check(!names.some(n => /Quinn/.test(n)), `${name}: a member hidden from discovery never appears in Explore`, JSON.stringify(names));
    check(!names.includes('Test Member'), `${name}: never the member themselves`, JSON.stringify(names));
    check(explore.label === 'People in the community', `${name}: the directory is labelled as the community, not "your" people`, explore.label);
    check(byName.get('Dana (fixture)') === 'Connected' && byName.get('Sam (fixture)') === 'Connected' && byName.get('Jordan (.') === 'Connection request' && byName.get('Eli (.') === 'Connection request',
      `${name}: connections and requests say so in the directory`, JSON.stringify([...byName]));
    // The same identity rule as search and the profile panel: full names only
    // for accepted connections; anyone else is "First L." everywhere.
    const strangers = explore.rows.filter(row => row.meta !== 'Connected');
    check(strangers.length >= 6 && strangers.every(row => /^\S+ \S\.$/.test(row.name) && !/fixture\)/.test(row.name)),
      `${name}: anyone not connected shows as “First L.”, never a full surname`, JSON.stringify(strangers.map(r => r.name)));
    const titles = await callInPage(function () {
      return [...document.querySelectorAll('#udc-resource-list [title]')].map(el => el.getAttribute('title'))
        .filter(t => t.includes('(fixture)') && !t.startsWith('Dana ') && !t.startsWith('Sam '));
    });
    check(!titles.length, `${name}: no full surname of anyone not connected in tooltips either`, JSON.stringify(titles));
    check(byName.get('Riley (.') === 'Shares Python' && byName.get('Fay (.') === 'Design, Beekeeping',
      `${name}: a stranger shows what you share, or what they list (from what their limited profile shows)`, JSON.stringify([...byName]));
    check(explore.count === String(explore.rows.length) && /members$/.test(explore.countLabel) && !explore.rows.some(r => /Quinn/.test(r.name)),
      `${name}: the People count is the directory's, with no hidden member counted`, JSON.stringify({ count: explore.count, label: explore.countLabel, rows: explore.rows.length }));
    await (name === 'phone' ? phoneShot : shot)(`explore-people-${name}`);

    // A stranger opens their profile, with Connect.
    const index = explore.rows.findIndex(row => row.name === 'Ana (.');
    await evaluate(`(() => { const row = document.querySelectorAll('#udc-resource-list .udc-resource-item')[${index}]; row.scrollIntoView({ block: 'center' }); row.click(); return true; })()`);
    await waitFor(`/Ana/.test(document.getElementById('node-side-panel')?.innerText || '')`, 'profile', 8000).catch(() => {});
    const profile = await evaluate(`(() => { const p = document.getElementById('node-side-panel'); return p && p.getClientRects().length ? { text: p.innerText.slice(0, 600), connect: [...p.querySelectorAll('button')].some(b => /^\\s*(Connect|Send connection request)/i.test(b.textContent)) } : null; })()`);
    // A stranger's profile is the existing limited preview (first name and
    // last initial until connected), with Connect.
    check(/\bAna\b/.test(profile?.text || '') && /Limited preview/.test(profile?.text || '') && profile?.connect, `${name}: a stranger opens their (limited) profile, with Connect`, JSON.stringify(profile));
    await evaluate(`window.closeNodePanel?.(); true`);
    await sleep(400);

    // Network keeps the member's relationships, exactly as before.
    await openPage('network');
    const network = await peopleList();
    check(JSON.stringify(network.rows.map(r => [r.name, r.meta])) === JSON.stringify(NETWORK_BEFORE),
      `${name}: Network → People is unchanged: connections and requests only`, JSON.stringify(network.rows));
    check(/connected people$/.test(network.countLabel), `${name}: Network's count is still its connections`, network.countLabel);
    check(network.label === 'Your People', `${name}: Network keeps its “Your People” label`, network.label);
    await (name === 'phone' ? phoneShot : shot)(`network-people-${name}`);

    // And back: Explore shows the directory again.
    await openPage('explore');
    const again = await peopleList();
    check(again.rows.length === explore.rows.length && again.rows.some(r => r.name === 'Riley (.'), `${name}: back in Explore, the directory again`, JSON.stringify(again.rows.map(r => r.name)));

    // Explore → Skills: the skills members list, never themes.
    await evaluate(`document.querySelector('#udc-resource-tabs [data-resource="themes"]').click(); true`);
    await waitFor(`/Woodworking/.test(document.getElementById('udc-resource-list')?.innerText || '')`, 'skills', 8000).catch(() => {});
    const skills = await peopleList();
    const skillMeta = new Map(skills.rows.map(row => [row.name, row.meta]));
    check(skills.tab === 'themes' && skills.label === 'Skills in the community', `${name}: Explore → Skills is the community's skills`, JSON.stringify({ tab: skills.tab, label: skills.label }));
    check(!skills.rows.some(row => /Civic tech|Climate resilience/.test(row.name)) && !/theme/i.test(JSON.stringify([skills.label, skills.rows])),
      `${name}: never a theme or theme circle, though theme rows exist`, JSON.stringify(skills.rows.map(r => r.name)));
    // Python: Riley, Ana, Bo, Cy, Dee; never the member (who lists Python) or
    // hidden Quinn. Woodworking: four visible members, Quinn hidden. Taxidermy
    // only Quinn lists. Public Speaking: Dana and Riley, two spellings.
    check(skillMeta.get('Python') === '5 members' && skillMeta.get('Woodworking') === '4 members' && skillMeta.get('Beekeeping') === '1 member' && !skillMeta.has('Taxidermy'),
      `${name}: each skill counts discoverable members other than you, once each`, JSON.stringify([...skillMeta]));
    check(skillMeta.get('Public Speaking') === '2 members' && !skills.rows.some(row => row.name === 'Public speaking'),
      `${name}: one skill however members capitalize it`, JSON.stringify([...skillMeta]));
    check(skills.rows[0]?.meta === '6 members' && skills.rows[0]?.name === 'Design', `${name}: the most-listed skill first`, JSON.stringify(skills.rows.slice(0, 3)));
    const addVisible = await evaluate(`(() => { const b = document.getElementById('udc-add-resource-btn'); return !!b && b.getClientRects().length > 0 && getComputedStyle(b).display !== 'none'; })()`);
    check(!addVisible, `${name}: no way to add a theme from Skills`);
    await (name === 'phone' ? phoneShot : shot)(`explore-skills-${name}`);

    // A skill opens exactly the members it counts, as the directory names them.
    const skillIndex = skills.rows.findIndex(row => row.name === 'Public Speaking');
    await evaluate(`(() => { const row = document.querySelectorAll('#udc-resource-list .udc-resource-item')[${skillIndex}]; row.scrollIntoView({ block: 'center' }); row.click(); return true; })()`);
    await waitFor(`/list Public Speaking/.test(document.getElementById('node-side-panel')?.innerText || '')`, 'skill view', 8000).catch(() => {});
    const lensPeople = await callInPage(function () {
      const panel = document.getElementById('node-side-panel');
      return {
        status: panel?.querySelector('[data-skill-lens-status]')?.textContent.trim() || '',
        names: [...(panel?.querySelectorAll('.node-panel-body button strong') || [])].map(el => el.textContent.trim()),
      };
    });
    check(lensPeople.status === '2 members list Public Speaking.' && JSON.stringify(lensPeople.names.slice().sort()) === '["Dana (fixture)","Riley (."]',
      `${name}: a skill lists its members: a connection by name, anyone else “First L.”`, JSON.stringify(lensPeople));
    await sleep(900); // the panel finishes sliding in before the screenshot
    await (name === 'phone' ? phoneShot : shot)(`explore-skill-people-${name}`);
    await evaluate(`document.querySelector('#node-side-panel button strong:not(:empty)') && [...document.querySelectorAll('#node-side-panel .node-panel-body button')].find(b => /Riley/.test(b.textContent)).click(); true`);
    await waitFor(`/Limited preview/.test(document.getElementById('node-side-panel')?.innerText || '')`, 'profile', 8000).catch(() => {});
    check(/Limited preview/.test(await evaluate(`document.getElementById('node-side-panel')?.innerText || ''`)), `${name}: a stranger from a skill opens their limited profile`);
    await evaluate(`window.closeNodePanel?.(); true`);
    const python = await evaluate(`(async () => { await window.openNodePanel({ id: 'skill:Python', type: 'skill', name: 'Python', skillName: 'Python', isSkillLens: true }); return document.getElementById('node-side-panel')?.innerText || ''; })()`);
    check(/5 members list Python\./.test(python) && !/Quinn|Test Member/.test(python), `${name}: the skill view matches the count: never you or a hidden member`, python.slice(0, 300));
    await evaluate(`window.closeNodePanel?.(); true`);
    await sleep(300);

    // Search offers people, projects, organizations and opportunities; never themes.
    await evaluate(`(() => { const i = document.getElementById('global-search'); i.focus(); i.value = 'civic'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); i.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true })); return true; })()`);
    await sleep(2500);
    const searchText = await callInPage(function () {
      return [...document.querySelectorAll('body *')].filter(el => el.getClientRects().length && el.children.length === 0).map(el => el.textContent.trim()).filter(Boolean).join(' | ');
    });
    check(/No results for "civic"|Search Results/.test(searchText) && !/Themes|Discover Themes|My Themes|Civic tech/.test(searchText),
      `${name}: search never offers themes`, searchText.slice(0, 300));
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
    await sleep(400);
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
  console.log(`\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} Explore people checks passed. Screenshots: ${outDir}`);
  process.exit(failed.length ? 1 : 0);
}
