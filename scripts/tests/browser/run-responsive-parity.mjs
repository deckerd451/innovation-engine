// Responsive feature parity: the same functions work at phone, tablet and
// desktop widths.
//
//   node scripts/tests/browser/run-responsive-parity.mjs [outDir]
//
// Serves this repository locally and opens the real index.html in headless
// Google Chrome, replacing only supabaseClient.js with a stub backed by the
// test-only fake client (scripts/tests/fixtures). At each width it drives the
// app with real touch or mouse input at element coordinates, so a control
// that is hidden, off-screen or covered by another surface fails the run:
//   - navigation (Home / Explore / Network) and the labels it shows
//   - Explore: Organizations and Opportunities tabs, opening an organization
//   - Explore search: keyboard-safe input, suggestions on screen, opening a
//     result, and Enter for full results
//   - Messages from every destination
//   - Settings (the shared settings modal)
//   - Log out (cancel keeps you signed in; confirm signs out)
// Screenshots are written to outDir. Requires Google Chrome.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.env.PARITY_TEST_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..'));
const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'buildspace-responsive'));
fs.mkdirSync(outDir, { recursive: true });
const CHROME = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome');

const WIDTHS = [
  { name: 'phone', width: 390, height: 844, mobile: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  { name: 'tablet', width: 820, height: 1180, mobile: true, ua: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  { name: 'desktop', width: 1366, height: 900, mobile: false, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36' },
];

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
const base = `http://127.0.0.1:${server.address().port}`;

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-parity-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
const pageErrors = [];
socket.addEventListener('message', event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    pageErrors.push(`${d?.exception?.description || d?.text} @ ${d?.url || ''}`);
  }
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
  while (Date.now() - start < timeout) { if (await evaluate(`!!(${expression})`).catch(() => false)) return true; await sleep(100); }
  throw new Error(`Timed out waiting for ${label}`);
}
const results = [];
function check(ok, label, detail = '') { results.push({ ok: Boolean(ok), label }); console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`); }
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}

let current = WIDTHS[0];
// Where would a real finger or pointer land? The element must be visible,
// on screen, clear of the tab bar (unless it is in it) and own that point.
// Selectors are passed as arguments, never spliced into evaluated code.
async function callInPage(fn, ...args) {
  const global = (await send('Runtime.evaluate', { expression: 'globalThis' })).result;
  const result = await send('Runtime.callFunctionOn', { functionDeclaration: fn.toString(), objectId: global.objectId, arguments: args.map(value => ({ value })), awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
const locate = (selector) => callInPage(function (sel) {
  const el = document.querySelector(sel);
  if (!el) return { missing: true };
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  const bar = document.getElementById('mobile-tab-bar');
  const barTop = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : innerHeight;
  const onScreen = r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
  const clear = el.closest('#mobile-tab-bar') ? true : r.bottom <= barTop + 1;
  return { x, y, onScreen, clear, owns: !!hit && (hit === el || el.contains(hit)), hit: hit ? (hit.id || String(hit.className).slice(0, 40) || hit.tagName) : null };
}, selector);
async function usable(selector) {
  const info = await locate(selector);
  return !info.missing && info.onScreen && info.clear && info.owns;
}
async function press(selector, label = selector) {
  const info = await locate(selector);
  if (info.missing) throw new Error(`Missing: ${label}`);
  if (!info.onScreen || !info.clear || !info.owns) throw new Error(`${label} is not usable (on screen: ${info.onScreen}, clear of tab bar: ${info.clear}, hit: ${info.hit})`);
  if (current.mobile) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: info.x, y: info.y }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: info.x, y: info.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: info.x, y: info.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: info.x, y: info.y, button: 'left', clickCount: 1 });
  }
  await sleep(350);
}
async function step(label, fn) {
  try { await fn(); } catch (error) { check(false, label, error.message.split('\n')[0]); await shot(`${current.name}-failed-${results.length}`).catch(() => {}); }
}
const visibleText = (selector) => callInPage(function (sel) {
  const el = document.querySelector(sel);
  return el && el.getClientRects().length ? el.innerText : '';
}, selector);
const isOpen = {
  messages: `(() => { const m = document.getElementById('messages-modal'); return m && getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().height > 0; })()`,
  settings: `!!document.getElementById('settings-modal-overlay')`,
  panel: `document.getElementById('node-side-panel')?.classList.contains('open')`,
  confirm: `document.getElementById('ds-confirm-modal')?.classList.contains('active')`,
};
async function closeMessages() {
  await evaluate(`window.closeMessagesModal?.(); true`);
  await waitFor(`!${isOpen.messages}`, 'messages to close', 4000).catch(() => {});
}
async function closePanel() {
  await evaluate(`window.closeNodePanel?.(); true`);
  await sleep(400);
}

// Fixture community: the assistance fixtures plus one organization the
// member owns and one open public opportunity, so Explore has something in
// every tab.
const fixtures = fs.readFileSync(path.join(root, 'scripts/tests/fixtures/assistance-fixtures.js'), 'utf8');
const fake = fs.readFileSync(path.join(root, 'scripts/tests/fixtures/fake-supabase.js'), 'utf8');
const boot = `${fixtures}\n${fake}\n(() => {
  const seed = window.AssistanceFixtures.seed();
  const me = seed.community[0].id;
  seed.organizations = [{ id: '30000000-0000-4000-8000-0000000000a1', name: 'Harbor Builders', description: 'Fixture organization', status: 'active', created_by: me, created_at: '2026-09-01T00:00:00Z' }];
  seed.organization_members = [{ id: '31000000-0000-4000-8000-0000000000a1', organization_id: '30000000-0000-4000-8000-0000000000a1', community_id: me, role: 'owner', status: 'active' }];
  seed.opportunities = [{ id: '40000000-0000-4000-8000-0000000000a1', title: 'Mentor first-time founders', description: 'Fixture opportunity', status: 'open', is_public: true, application_deadline: null, organization_id: '30000000-0000-4000-8000-0000000000a1', created_at: '2026-09-02T00:00:00Z' }];
  // The person panel reads this view.
  seed.community_with_last_seen = seed.community.map(row => ({ ...row }));
  const session = { access_token: 'fixture', user: { id: 'auth-me', email: 'member@example.test' } };
  window.supabase = window.createFakeSupabase(seed, { session });
  window.__fixtureProfile = seed.community[0];
})();`;

async function load(w) {
  current = w;
  await send('Emulation.setDeviceMetricsOverride', { width: w.width, height: w.height, deviceScaleFactor: 1, mobile: w.mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: w.mobile, maxTouchPoints: w.mobile ? 5 : 1 });
  await send('Emulation.setUserAgentOverride', { userAgent: w.ua });
  await send('Page.navigate', { url: `${base}/index.html` });
  await waitFor(`document.readyState === 'complete'`, 'page load', 20000);
  await sleep(2500);
  if (!(await evaluate(`!!window.currentUserProfile?.id`))) {
    await evaluate(`(() => { window.currentUserProfile = window.__fixtureProfile; document.querySelectorAll('#login-section, .login-overlay, #auth-container').forEach(el => el.style.display = 'none'); window.dispatchEvent(new CustomEvent('profile-loaded', { detail: { user: { id: 'auth-me' }, profile: window.__fixtureProfile } })); })()`);
  }
  await waitFor(`window.CommandDashboard && document.querySelector('#udc-resource-tabs [data-resource="organizations"]')`, 'dashboard', 15000);
  await sleep(1200);
}

async function exploreChecks(prefix) {
  await step(`${prefix}: Organizations tab is visible and opens the organization list`, async () => {
    await press('#udc-resource-tabs [data-resource="organizations"]', 'Organizations tab');
    await waitFor(`/Harbor Builders/.test(document.getElementById('udc-resource-list')?.innerText || '')`, 'organization list', 6000);
    check(true, `${prefix}: Organizations tab is visible and opens the organization list`);
  });
  await step(`${prefix}: an organization opens its panel`, async () => {
    await press('#udc-resource-list .udc-resource-item[data-id="30000000-0000-4000-8000-0000000000a1"] .udc-resource-show-btn', 'Harbor Builders details');
    await waitFor(`${isOpen.panel} && /Harbor Builders/.test(document.getElementById('node-side-panel').innerText)`, 'organization panel', 6000);
    check(await usable('#node-side-panel [data-org-management]') || /Join requests/.test(await visibleText('#node-side-panel')), `${prefix}: an organization opens its panel`);
    await shot(`${current.name}-org-panel`);
    await closePanel();
  });
  await step(`${prefix}: Opportunities tab is visible and lists open opportunities`, async () => {
    await press('#udc-resource-tabs [data-resource="opportunities"]', 'Opportunities tab');
    await waitFor(`/Mentor first-time founders/.test(document.getElementById('udc-resource-list')?.innerText || '')`, 'opportunity list', 6000);
    check(true, `${prefix}: Opportunities tab is visible and lists open opportunities`);
  });
}

async function searchChecks(prefix) {
  await step(`${prefix}: search box is usable`, async () => {
    await evaluate(`document.getElementById('cd-explore-body')?.scrollTo?.(0, 0); document.querySelector('#command-dashboard .cd-scroll-area')?.scrollTo?.(0, 0); true`);
    await press('#global-search', 'search box');
    check(await evaluate(`document.activeElement?.id === 'global-search'`), `${prefix}: search box is usable`);
    const size = await evaluate(`parseFloat(getComputedStyle(document.getElementById('global-search')).fontSize)`);
    if (current.mobile) check(size >= 16, `${prefix}: search text is at least 16px (no iOS zoom on focus)`, `${size}px`);
    const hints = await evaluate(`(() => { const i = document.getElementById('global-search'); return [i.getAttribute('enterkeyhint'), i.getAttribute('autocapitalize'), i.getAttribute('autocomplete')].join(','); })()`);
    check(hints === 'search,off,off', `${prefix}: keyboard shows Search and does not autocapitalize`, hints);
  });
  await step(`${prefix}: typing shows suggestions on screen, below the box`, async () => {
    await send('Input.insertText', { text: 'Dana' });
    await waitFor(`(() => { const b = document.getElementById('search-suggestions'); return b && getComputedStyle(b).display !== 'none' && /Dana/.test(b.innerText); })()`, 'suggestions', 6000);
    const geo = await evaluate(`(() => { const b = document.getElementById('search-suggestions').getBoundingClientRect(); const i = document.getElementById('global-search').getBoundingClientRect(); return { below: b.top >= i.bottom - 1, onScreen: b.top >= 0 && b.top < innerHeight - 40 }; })()`);
    check(geo.below && geo.onScreen, `${prefix}: typing shows suggestions on screen, below the box`, JSON.stringify(geo));
    await shot(`${current.name}-search-suggestions`);
  });
  await step(`${prefix}: choosing a suggestion opens that person`, async () => {
    await press('#search-suggestions .search-suggestion-item', 'Dana suggestion');
    await waitFor(`${isOpen.panel}`, 'person panel', 6000);
    check(/Dana/.test(await visibleText('#node-side-panel')), `${prefix}: choosing a suggestion opens that person`);
    await closePanel();
  });
  await step(`${prefix}: Enter shows full search results`, async () => {
    await press('#global-search', 'search box');
    await evaluate(`(() => { const i = document.getElementById('global-search'); i.select(); return true; })()`);
    await send('Input.insertText', { text: 'Sam' });
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitFor(`(() => { const m = document.getElementById('quick-connect-modal'); return m && getComputedStyle(m).display !== 'none' && /Sam/.test(m.innerText); })()`, 'search results', 6000);
    check(true, `${prefix}: Enter shows full search results`);
    await shot(`${current.name}-search-results`);
    await evaluate(`window.closeQuickConnectModal?.(); true`);
    await sleep(300);
  });
}

async function messagesCheck(prefix, opener) {
  await step(`${prefix}: Messages opens`, async () => {
    await press(opener, 'Messages button');
    await waitFor(isOpen.messages, 'messages', 6000);
    check(true, `${prefix}: Messages opens`);
    await closeMessages();
  });
}

async function settingsCheck(prefix, open) {
  await step(`${prefix}: Settings opens the shared settings and closes`, async () => {
    await open();
    await waitFor(isOpen.settings, 'settings', 5000);
    check(await usable('#settings-close-btn'), `${prefix}: Settings opens the shared settings and closes`);
    await press('#settings-close-btn', 'Close settings');
    await waitFor(`!${isOpen.settings}`, 'settings to close', 3000);
  });
}

async function logoutChecks(prefix, openButton) {
  await step(`${prefix}: Log out → Cancel keeps you signed in`, async () => {
    await evaluate(`window.__logoutCalls = 0; window.handleLogout = async () => { window.__logoutCalls += 1; localStorage.setItem('__parityLogout', '1'); }; true`);
    await openButton();
    await waitFor(isOpen.confirm, 'logout confirmation', 4000);
    check(await usable('#ds-confirm-ok') && await usable('#ds-confirm-cancel'), `${prefix}: Log out asks first, above every surface`);
    await press('#ds-confirm-cancel', 'Cancel');
    await waitFor(`!${isOpen.confirm}`, 'confirmation to close', 3000);
    check(await evaluate(`window.__logoutCalls === 0`), `${prefix}: Log out → Cancel keeps you signed in`);
  });
  await step(`${prefix}: Log out → Confirm signs out`, async () => {
    await evaluate(`localStorage.removeItem('__parityLogout'); true`);
    await openButton();
    await waitFor(isOpen.confirm, 'logout confirmation', 4000);
    await press('#ds-confirm-ok', 'Log out');
    await waitFor(`localStorage.getItem('__parityLogout') === '1'`, 'sign-out', 6000);
    check(true, `${prefix}: Log out → Confirm signs out`);
  });
}

async function mobileRun(w) {
  const P = w.name;
  await load(w);
  console.log(`\n${P} (${w.width}×${w.height})`);
  const labels = await evaluate(`[...document.querySelectorAll('#mobile-tab-bar .mob-tab span')].map(s => s.textContent.trim()).join(' | ')`);
  check(labels === 'Home | Explore | Network', `${P}: tab bar reads Home | Explore | Network`, labels);
  check(await evaluate(`(() => { const b = document.getElementById('cd-settings-btn'); return !b || !b.getClientRects().length || getComputedStyle(b).display === 'none'; })()`), `${P}: no second Settings control (Settings lives in Home → Account)`);

  // Home
  await step(`${P}: Home opens`, async () => {
    await press('#mob-tab-home', 'Home tab');
    await waitFor(`!document.getElementById('mobile-you-screen').hidden && /Home/.test(document.querySelector('#mobile-you-content .mobile-you-eyebrow')?.textContent || '')`, 'Home', 8000);
    check(true, `${P}: Home opens`);
    await shot(`${P}-home`);
  });
  await messagesCheck(`${P} Home`, '#btn-messages-mobile');

  // Explore
  await step(`${P}: Explore opens`, async () => {
    await press('#mob-tab-discover', 'Explore tab');
    await waitFor(`document.body.classList.contains('mobile-surface-discover')`, 'Explore', 5000);
    const heading = await evaluate(`document.querySelector('#cd-explore-toggle span')?.textContent`);
    const modes = await evaluate(`[...document.querySelectorAll('#cd-mobile-discover-mode button')].map(b => b.textContent).join(' | ')`);
    check(heading === 'Explore' && modes === 'Explore | Network', `${P}: Explore opens with the same labels`, `${heading}; ${modes}`);
    await shot(`${P}-explore`);
  });
  await messagesCheck(`${P} Explore`, '#btn-messages-mobile');
  await exploreChecks(P);
  await searchChecks(P);

  // Network
  await step(`${P}: Network opens the member list`, async () => {
    await press('#mob-tab-profile', 'Network tab');
    await waitFor(`document.body.classList.contains('mobile-surface-community')`, 'Network', 5000);
    check(await evaluate(`document.querySelector('#cd-explore-toggle span')?.textContent === 'Network'`), `${P}: Network opens the member list`);
    await shot(`${P}-network`);
  });
  await messagesCheck(`${P} Network`, '#btn-messages-mobile');

  // Settings and Log out live in Home → Account.
  const openAccount = async () => {
    if (!(await evaluate(`!document.getElementById('mobile-you-screen').hidden`))) await press('#mob-tab-home', 'Home tab');
    await waitFor(`document.querySelector('#mobile-you-content details.mobile-you-secondary:last-of-type summary')`, 'Account', 6000);
    if (!(await evaluate(`document.querySelector('#mobile-you-content details.mobile-you-secondary:last-of-type').open`))) {
      await press('#mobile-you-content details.mobile-you-secondary:last-of-type summary', 'Account');
    }
  };
  await settingsCheck(P, async () => { await openAccount(); await press('[data-profile-action="settings"]', 'Settings'); });
  await logoutChecks(P, async () => { await openAccount(); await press('[data-profile-action="logout"]', 'Log out'); });
}

async function desktopRun(w) {
  const P = w.name;
  await load(w);
  console.log(`\n${P} (${w.width}×${w.height})`);
  check(await evaluate(`getComputedStyle(document.getElementById('mobile-tab-bar')).display === 'none'`), `${P}: the mobile tab bar stays hidden`);
  const views = await evaluate(`[...document.querySelectorAll('.buildspace-view-btn')].map(b => b.textContent.trim()).join(' | ')`);
  check(views === 'Home | Network', `${P}: view switcher reads Home | Network`, views);
  await step(`${P}: Network shows the map; Home returns`, async () => {
    await press('.buildspace-view-btn[data-workspace-view="network"]', 'Network');
    await waitFor(`getComputedStyle(document.getElementById('synapse-main-view')).display !== 'none' && document.body.classList.contains('buildspace-view-network')`, 'Network view', 4000);
    await shot(`${P}-network`);
    await press('.buildspace-view-btn[data-workspace-view="today"]', 'Home');
    await waitFor(`document.body.classList.contains('buildspace-view-today')`, 'Home view', 4000);
    check(true, `${P}: Network shows the map; Home returns`);
    await shot(`${P}-home`);
  });
  await messagesCheck(P, '#cd-messages-btn');
  await settingsCheck(P, () => press('#cd-settings-btn', 'Settings'));
  await exploreChecks(P);
  await searchChecks(P);
  await logoutChecks(P, () => press('#cd-logout-btn', 'Log out'));
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: boot });
  for (const w of WIDTHS) {
    if (w.mobile) await mobileRun(w); else await desktopRun(w);
  }
  // The network map is never initialized against the fake client (it has no
  // graph data), so Network-view calls into UnifiedNetworkAPI report that.
  // Production initializes the map; that message is a harness limitation.
  const harnessOnly = /UnifiedNetworkAPI not initialized/;
  const ours = pageErrors.filter(text => !harnessOnly.test(text) && /command-dashboard|mobile-nav|mobile-you|settings-modal|dashboardPane|node-panel|explorer-coordinator/.test(text));
  if (pageErrors.length) console.log(`\n  page errors (${pageErrors.length}): ${[...new Set(pageErrors)].slice(0, 4).join(' | ').slice(0, 600)}`);
  check(ours.length === 0, 'No uncaught errors from the navigation, Explore, search, settings or panel modules', ours.join(' | ').slice(0, 400));
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
  console.log(`\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} responsive parity checks passed. Screenshots: ${outDir}`);
  process.exit(failed.length ? 1 : 0);
}
