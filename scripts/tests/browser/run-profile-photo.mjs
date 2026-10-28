// A member's profile page and their photo choice, as members see it: real
// index.html in headless Google Chrome against the synthetic community of
// run-home-community.mjs (test-only fake client; nothing reaches a
// database), on iPhone and desktop. As in production, the presence view
// (community_with_last_seen) has no photo_visible or photo_consent_at, so
// the page reads the photo choice from the profile itself:
//   - Dana chose to show her photo: it is shown.
//   - Sam did not: initials, no photo.
//   - Neither page shows an email address, and the view is asked only for
//     columns it has.
//
//   node scripts/tests/browser/run-profile-photo.mjs [outDir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const root = path.resolve(process.env.HOME_TEST_ROOT || here);
const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'buildspace-profile-photo'));
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

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-photo-chrome-'));
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


// Synthetic photos and choices; the view without the photo columns; every
// select recorded (table and columns).
const extra = `(() => {
  const ID = window.AssistanceFixtures.ID;
  const db = window.supabase.__db;
  const set = (id, patch) => Object.assign(db.community.find(r => r.id === id), patch);
  set(ID.dana, { image_url: 'https://example.test/dana.png', photo_visible: true, photo_consent_at: '2026-01-01T00:00:00Z', email: 'dana@example.test' });
  set(ID.sam, { image_url: 'https://example.test/sam.png', photo_visible: false, photo_consent_at: null, email: 'sam@example.test' });
  db.community_with_last_seen = db.community.map(({ photo_visible, photo_consent_at, ...row }) => ({ ...row, presence_last_seen: null, presence_expires_at: null }));
  window.__selects = [];
  const from = window.supabase.from.bind(window.supabase);
  window.supabase.from = (table) => {
    const query = from(table);
    const select = query.select?.bind(query);
    if (select) query.select = (columns, ...rest) => { window.__selects.push({ table, columns: columns ?? null }); return select(columns, ...rest); };
    return query;
  };
})();`;

const panel = () => callInPage(function () {
  const p = document.getElementById('node-side-panel');
  if (!p || !p.getClientRects().length) return null;
  return { text: p.innerText, html: p.innerHTML, photos: [...p.querySelectorAll('img')].map(img => img.getAttribute('src') || '') };
});
async function openProfile(id, name) {
  await evaluate(`(() => { window.closeNodePanel?.(); window.__selects = []; return true; })()`);
  await sleep(300);
  await callInPage(function (id, name) { window.openNodePanel({ id, type: 'person', name }); }, id, name);
  await waitFor(`(document.getElementById('node-side-panel')?.innerText || '').includes(${JSON.stringify(name)})`, `${name}'s profile`, 8000);
  await sleep(800);
  return panel();
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: boot });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: extra });
  const ID = { dana: '22222222-2222-4222-8222-222222222222', sam: '33333333-3333-4333-8333-333333333333' };

  for (const name of ['phone', 'desktop']) {
    console.log(`\nProfile photo, ${name}`);
    await loadHome('established', VIEWPORTS[name]);
    if (!(await evaluate(`!!window.currentAuthUser?.id`))) await evaluate(`(() => { window.currentAuthUser = { id: 'auth-me', email: 'member@example.test' }; return true; })()`);

    const dana = await openProfile(ID.dana, 'Dana');
    check(dana && dana.photos.some(src => src.includes('dana.png')), `${name}: a member who chose to show their photo has it on their profile`, JSON.stringify(dana?.photos));
    await (name === 'phone' ? phoneShot : shot)(`photo-${name}-shown`);
    const selects = await evaluate(`JSON.stringify(window.__selects)`);
    const views = JSON.parse(selects).filter(s => s.table === 'community_with_last_seen');
    check(views.length > 0 && views.every(s => s.columns && !/photo_visible|photo_consent_at|email|\*/.test(s.columns)),
      `${name}: the presence view is asked only for columns it has`, selects);
    check(JSON.parse(selects).some(s => s.table === 'community' && s.columns === 'photo_visible, photo_consent_at'),
      `${name}: the photo choice comes from the profile`, selects);

    const sam = await openProfile(ID.sam, 'Sam');
    check(sam && !sam.photos.some(src => src.includes('sam.png')), `${name}: a member who didn't choose to show their photo shows initials`, JSON.stringify(sam?.photos));
    check(![dana, sam].some(p => /@example\.test|mailto:/.test(`${p?.text}${p?.html}`)), `${name}: no email address on either profile`);
    await evaluate(`window.closeNodePanel?.(); true`);
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
  console.log(`\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} profile photo checks passed. Screenshots: ${outDir}`);
  process.exit(failed.length ? 1 : 0);
}
