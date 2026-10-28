// Settings as members see it: real index.html in headless Google Chrome
// against the synthetic community of run-home-community.mjs (test-only fake
// client; nothing reaches a database), on iPhone (notched and small) and
// desktop, with real taps and clicks.
//   - Only what works is shown: Map suggestions and Privacy. No Quiet Mode,
//     language, email or push; what they stored is left alone.
//   - Debug Mode only while debugging is on (?debug=1 or DEBUG=1).
//   - Close discards, Save stores and confirms, and it survives a reload.
//   - Privacy goes to the existing choices in You (photo visibility in Edit
//     Profile, the Nearify connection) and changes nothing by itself.
//   - The dialog fits the screen, clear of the notch and home indicator.
//
//   node scripts/tests/browser/run-settings.mjs [outDir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const root = path.resolve(process.env.HOME_TEST_ROOT || here);
const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'buildspace-settings'));
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

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-settings-chrome-'));
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

async function loadHome(scenario, viewport = VIEWPORTS.phone, query = "", keep = false) {
  view = viewport;
  await send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: 2, mobile: view.mobile });
  await send('Emulation.setTouchEmulationEnabled', view.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await send('Emulation.setUserAgentOverride', { userAgent: view.mobile ? PHONE.ua : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
  await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: view.top, bottom: view.bottom, left: 0, right: 0 } });
  // Each scenario starts clean (no "Not now", drafts or settings from an
  // earlier one) unless it is a reload that keeps what was saved.
  if (!keep) await evaluate(`(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (_) {} return true; })()`).catch(() => {});
  await send('Page.navigate', { url: `${base}/index.html?scenario=${scenario}${query}` });
  await waitFor(`document.readyState === 'complete'`, 'page load', 20000);
  await sleep(2500);
  if (!(await evaluate(`!!window.currentUserProfile?.id`))) {
    await evaluate(`(() => { window.currentUserProfile = window.__fixtureProfile; document.querySelectorAll('#login-section, .login-overlay, #auth-container').forEach(el => el.style.display = 'none'); window.dispatchEvent(new CustomEvent('profile-loaded', { detail: { user: { id: 'auth-me' }, profile: window.__fixtureProfile } })); })()`);
  }
  await waitFor(`document.querySelector('${rootSel()} .home-view')`, 'Home', 15000);
  await waitFor(`window.StartDailyDigest?.homeSuggestions?.().status === 'ready'`, 'the brief', 15000);
  await sleep(1500);
}

// A real tap (touch on phones) or click at the middle of the control, which
// must be on screen and not covered.
async function press(selector, label) {
  const info = await callInPage(function (sel) {
    const el = document.querySelector(sel);
    if (!el) return { missing: true };
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const label = el.closest('label');
    return { x, y, owns: !!hit && (hit === el || el.contains(hit) || (label && label.contains(hit))), onScreen: r.width > 0 && r.top >= 0 && r.bottom <= innerHeight };
  }, selector);
  if (info.missing) throw new Error(`Missing: ${label}`);
  if (!info.onScreen || !info.owns) throw new Error(`${label} is not usable ${JSON.stringify(info)}`);
  if (view.mobile) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: info.x, y: info.y }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: info.x, y: info.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: info.x, y: info.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: info.x, y: info.y, button: 'left', clickCount: 1 });
  }
  await sleep(450);
}
async function key(name, code) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code });
  await sleep(300);
}

const isOpen = `!!document.getElementById('settings-modal-overlay')`;
const toastGone = `![...document.querySelectorAll('body *')].some(el => el.childElementCount === 0 && el.textContent.trim() === 'Settings saved' && el.getClientRects().length)`;
async function openYou() {
  await evaluate(`(() => { window.closeNodePanel?.(); return true; })()`);
  await press('#app-nav [data-destination="you"]', 'You');
  await waitFor(`document.getElementById('btn-profile-settings')?.getClientRects().length`, 'You', 8000);
  await sleep(300);
}
async function openSettings() {
  await waitFor(toastGone, 'the Settings saved notice to go', 10000);
  await openYou();
  await press('#btn-profile-settings', 'Settings');
  await waitFor(isOpen, 'Settings', 4000);
  await sleep(250);
}
async function closeWith(selector, label) {
  await press(selector, label);
  await waitFor(`!${isOpen}`, 'Settings to close', 3000);
}

// What Settings shows, where, and whether each control is usable.
const settings = () => callInPage(function () {
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }; };
  const owns = el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (hit === el || el.contains(hit) || !!el.closest('label')?.contains(hit)); };
  const modal = document.getElementById('settings-modal');
  const body = document.getElementById('settings-modal-body');
  const controls = [...modal.querySelectorAll('button, input')].map(el => ({ id: el.id, box: box(el.closest('label') || el), usable: owns(el) }));
  return {
    sections: [...body.querySelectorAll('section')].map(s => s.firstElementChild.textContent.trim()),
    text: modal.innerText.replace(/\s+/g, ' ').trim(),
    modal: box(modal), bodyScrolls: body.scrollHeight > body.clientHeight + 1, controls,
    discovery: document.getElementById('settings-discovery-suggestions')?.checked,
    debug: document.getElementById('settings-debug-mode')?.checked ?? null,
    focusInside: modal.contains(document.activeElement),
  };
});
// Values go in as arguments, never into generated code.
const stored = keys => callInPage(function (keys) { return JSON.stringify(Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]))); }, keys);

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: boot });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__discoveryEvents = []; window.addEventListener('discovery-suggestions-changed', e => window.__discoveryEvents.push(e.detail && e.detail.enabled));` });

  for (const name of ['phone', 'small-phone', 'desktop']) {
    const vp = VIEWPORTS[name];
    const snap = vp.mobile ? phoneShot : shot;
    console.log(`\nSettings, ${name}`);
    await loadHome('established', vp);

    // 1. Only what works, in a dialog that fits the screen.
    await openSettings();
    let s = await settings();
    check(JSON.stringify(s.sections) === '["Network","Privacy"]' && !/Quiet Mode|Coming soon|Language|Notifications|Email|Push|Debug/.test(s.text),
      `${name}: Settings shows Network and Privacy only (no Quiet Mode, language, email, push or Debug Mode)`, JSON.stringify(s.sections) + ' ' + s.text);
    check(/Map suggestions Now and then, the Network Map highlights up to 3 people or projects outside your network you might want to meet\. Turn off to stop these\./.test(s.text) && s.discovery === true,
      `${name}: Map suggestions says what it does and is on by default`, s.text);
    check(/Who sees your photo/.test(s.text) && /Nearify/.test(s.text), `${name}: Privacy names the photo and Nearify choices`, s.text);
    const safeTop = Math.max(16, vp.top), safeBottom = vp.height - Math.max(16, vp.bottom);
    check(s.modal.top >= safeTop - 1 && s.modal.bottom <= safeBottom + 1 && s.modal.left >= 0 && s.modal.right <= vp.width && !s.bodyScrolls,
      `${name}: the whole dialog fits, clear of the status bar and home indicator, with nothing to scroll`, JSON.stringify({ modal: s.modal, safeTop, safeBottom, bodyScrolls: s.bodyScrolls }));
    const small = s.controls.filter(c => !c.usable || c.box.h < (vp.mobile ? 43.5 : 30) || (vp.mobile && c.id === 'settings-close-btn' && c.box.w < 43.5));
    check(JSON.stringify(s.controls.map(c => c.id)) === '["settings-close-btn","settings-discovery-suggestions","settings-privacy-photo","settings-privacy-nearify","settings-save-btn"]' && !small.length && s.focusInside,
      `${name}: every control is usable${vp.mobile ? ' and at least 44px' : ''}, and focus moves into Settings`, JSON.stringify(s.controls));
    await snap(`settings-${name}`);

    // 2. Close discards; Save stores, confirms, tells the map and survives a reload.
    await press('#settings-discovery-suggestions', 'Map suggestions');
    await closeWith('#settings-close-btn', 'Close');
    const discarded = await stored(['discovery-suggestions-enabled']);
    await openSettings();
    s = await settings();
    check(discarded === '{"discovery-suggestions-enabled":null}' && s.discovery === true && (await evaluate('window.__discoveryEvents.length')) === 0,
      `${name}: Close discards a change`, JSON.stringify({ discarded, reopened: s.discovery }));
    await press('#settings-discovery-suggestions', 'Map suggestions');
    await closeWith('#settings-save-btn', 'Save');
    const toast = await evaluate(`!(${toastGone})`);
    check((await stored(['discovery-suggestions-enabled'])) === '{"discovery-suggestions-enabled":"false"}' && toast && JSON.stringify(await evaluate('window.__discoveryEvents')) === '[false]',
      `${name}: Save stores the change, says "Settings saved" and tells the map`, JSON.stringify({ toast, events: await evaluate('window.__discoveryEvents') }));
    await loadHome('established', vp, '', true);
    await openSettings();
    s = await settings();
    check(s.discovery === false, `${name}: the saved choice is kept after a reload`, String(s.discovery));
    await press('#settings-discovery-suggestions', 'Map suggestions');
    await closeWith('#settings-save-btn', 'Save');
    check((await stored(['discovery-suggestions-enabled'])) === '{"discovery-suggestions-enabled":"true"}', `${name}: turning it back on saves it`);

    // Escape and a tap outside close without saving.
    await openSettings();
    await press('#settings-discovery-suggestions', 'Map suggestions');
    if (!vp.mobile) { await key('Escape', 27); } else {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 8, y: vp.height / 2 }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(400);
    }
    check(!(await evaluate(isOpen)) && (await stored(['discovery-suggestions-enabled'])) === '{"discovery-suggestions-enabled":"true"}',
      `${name}: ${vp.mobile ? 'a tap outside' : 'Escape'} closes Settings without saving`);
    if (!vp.mobile) check(await evaluate(`document.activeElement?.id === 'btn-profile-settings'`), `${name}: focus returns to the Settings button`);

    // 3. Removed controls: Save leaves what they stored.
    const kept = { 'quiet-mode-enabled': 'true', 'email-notifications-enabled': 'false', 'push-notifications-enabled': 'true', preferred_language: 'es' };
    await callInPage(function (kept) { Object.entries(kept).forEach(([k, v]) => localStorage.setItem(k, v)); }, kept);
    await openSettings();
    await closeWith('#settings-save-btn', 'Save');
    check((await stored(Object.keys(kept))) === JSON.stringify(kept), `${name}: Save leaves the stored Quiet Mode, language, email and push values alone`, await stored(Object.keys(kept)));

    // 4. Privacy → photo: Edit Profile, at "Show my photo…", unchanged.
    const photoBefore = await evaluate(`window.__fixtureProfile.photo_visible === true`);
    await openSettings();
    await press('#settings-privacy-photo', 'Who sees your photo');
    await waitFor(`document.getElementById('edit-photo-visible')?.getClientRects().length`, 'Edit Profile', 6000);
    await sleep(700);
    const photo = await callInPage(function () {
      // On screen and not covered (on phones, You's actions are pinned along the bottom).
      const uncovered = el => { const r = el.getBoundingClientRect(); const x = r.left + Math.min(24, r.width / 2); return [r.top + 4, r.bottom - 4].every(y => { const hit = document.elementFromPoint(x, y); return y >= 0 && y <= innerHeight && !!hit && (hit === el || el.contains(hit)); }); };
      const box = document.getElementById('edit-photo-visible');
      return { settings: !!document.getElementById('settings-modal-overlay'), focused: document.activeElement === box, inView: uncovered(box.closest('.ch-form-group')), checked: box.checked, label: box.closest('label').textContent.trim(), hint: box.closest('.ch-form-group').querySelector('.ch-uploader-hint')?.textContent.trim() };
    });
    check(!photo.settings && photo.focused && photo.inView && photo.checked === photoBefore && photo.label === 'Show my photo to other signed-in members',
      `${name}: "Who sees your photo" opens Edit Profile at the existing photo choice, changing nothing`, JSON.stringify(photo));
    await snap(`settings-${name}-photo`);
    await press('#edit-cancel', 'Cancel');
    await sleep(500);

    // 5. Privacy → Nearify: the existing Nearify row in You.
    await openSettings();
    await press('#settings-privacy-nearify', 'Nearify');
    await sleep(1300);
    const nearify = await callInPage(function () {
      // On screen and not covered (on phones, You's actions are pinned along the bottom).
      const uncovered = el => { const r = el.getBoundingClientRect(); const x = r.left + Math.min(24, r.width / 2); return [r.top + 4, r.bottom - 4].every(y => { const hit = document.elementFromPoint(x, y); return y >= 0 && y <= innerHeight && !!hit && (hit === el || el.contains(hit)); }); };
      const row = document.getElementById('nearify-experience-row');
      return { settings: !!document.getElementById('settings-modal-overlay'), focused: document.activeElement === row, inView: uncovered(row), text: row.innerText.replace(/\s+/g, ' ') };
    });
    check(!nearify.settings && nearify.focused && nearify.inView && /^Nearify/.test(nearify.text),
      `${name}: "Nearify" shows the existing Nearify choice in You`, JSON.stringify(nearify));
    await snap(`settings-${name}-nearify`);

    // 6. Debug Mode is for developers: only while debugging is on.
    await loadHome('established', vp, '&debug=1');
    await openSettings();
    s = await settings();
    check(JSON.stringify(s.sections) === '["Network","Privacy","Developer"]' && s.debug === false && !s.bodyScrolls || (vp.height < 700 && s.debug === false),
      `${name}: with ?debug=1, Debug Mode is offered (off)`, JSON.stringify({ sections: s.sections, debug: s.debug }));
    if (name === 'desktop') await shot('settings-desktop-debug');
    await press('#settings-debug-mode', 'Debug Mode');
    await closeWith('#settings-save-btn', 'Save');
    check((await stored(['DEBUG'])) === '{"DEBUG":"1"}', `${name}: Debug Mode saves as before`);
    await loadHome('established', vp, '', true);
    await openSettings();
    s = await settings();
    check(s.debug === true, `${name}: while it is on, Debug Mode stays in Settings so it can be turned off`, String(s.debug));
    await press('#settings-debug-mode', 'Debug Mode');
    await closeWith('#settings-save-btn', 'Save');
    await loadHome('established', vp, '', true);
    await openSettings();
    s = await settings();
    check((await stored(['DEBUG'])) === '{"DEBUG":null}' && s.debug === null, `${name}: turned off, it is gone from Settings again`, JSON.stringify(s.sections));
    await closeWith('#settings-close-btn', 'Close');

    // Navigation unchanged.
    const nav = await evaluate(`[...document.querySelectorAll('#app-nav .app-nav-btn > span:not(.app-nav-badge)')].map(s => s.textContent.trim()).join(' | ')`);
    check(nav === 'Home | Explore | Inbox | You', `${name}: four tabs as before`, nav);
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
  console.log(`\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} Settings checks passed. Screenshots: ${outDir}`);
  process.exit(failed.length ? 1 : 0);
}
