// Responsive feature parity: one navigation and the same functions at phone,
// tablet and desktop widths.
//
//   node scripts/tests/browser/run-responsive-parity.mjs [outDir]
//
// Serves this repository locally and opens the real index.html in headless
// Google Chrome, replacing only supabaseClient.js with a stub backed by the
// test-only fake client (scripts/tests/fixtures). At each width it drives the
// app with real touch or mouse input at element coordinates, so a control
// that is hidden, off-screen or covered by another surface fails the run:
//   - the shared navigation (#app-nav): Home · Explore · Network · Inbox ·
//     You, in that order, as a bottom bar or side bar; no other navigation
//   - each destination, its active state, and history left untouched
//   - Inbox (Messages) and You (profile) from every page
//   - Actions, Settings and Admin entry points
//   - Explore: Organizations and Opportunities, organization management,
//     and notification links opening panels over any page
//   - what Home, Explore and Network each show (and do not show), including
//     after resizing across the breakpoint
//   - Network: people, requests, search, the map and "People you met"
//     (event names and dates, consented photos at card size, Connect)
//   - search from Network: people stay in Network, anything else opens in
//     Explore
//   - Explore search: keyboard-safe input, suggestions on screen, opening a
//     result, and Enter for full results
//   - goal assistance on phones and tablets, closed by navigating away
//   - resizing across the desktop breakpoint, signed-out boot
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
  // The bottom navigation must not cover the element (the desktop side bar
  // is checked by hit-testing like everything else).
  const bar = document.getElementById('app-nav');
  const barRect = bar && !bar.hidden ? bar.getBoundingClientRect() : null;
  const bottomBar = barRect && barRect.top > 0 && barRect.width >= innerWidth - 1;
  const barTop = bottomBar ? barRect.top : innerHeight;
  const onScreen = r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
  const clear = el.closest('#app-nav') ? true : r.bottom <= barTop + 1;
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
  const signedOut = (() => { try { return localStorage.getItem('__paritySignedOut') === '1'; } catch (_) { return false; } })();
  const seed = window.AssistanceFixtures.seed();
  const me = seed.community[0].id;
  seed.organizations = [{ id: '30000000-0000-4000-8000-0000000000a1', name: 'Harbor Builders', description: 'Fixture organization', status: 'active', created_by: me, created_at: '2026-09-01T00:00:00Z' }];
  seed.organization_members = [{ id: '31000000-0000-4000-8000-0000000000a1', organization_id: '30000000-0000-4000-8000-0000000000a1', community_id: me, role: 'owner', status: 'active' }];
  seed.opportunities = [{ id: '40000000-0000-4000-8000-0000000000a1', title: 'Mentor first-time founders', description: 'Fixture opportunity', status: 'open', is_public: true, application_deadline: null, organization_id: '30000000-0000-4000-8000-0000000000a1', created_at: '2026-09-02T00:00:00Z' }];
  // People you met: two events. Sam shared a large photo with consent (a full
  // size upload, 1067px); Riley's photo has no consent, so initials show;
  // Dana is already connected.
  const [, dana, sam, riley] = seed.community;
  Object.assign(sam, { image_url: '/images/bubbleh512.png', photo_visible: true, photo_consent_at: '2026-09-01T00:00:00Z' });
  Object.assign(riley, { image_url: '/images/bubbleh.png', photo_visible: true, photo_consent_at: null });
  const eventPeers = { success: true, events: [
    { event_name: 'Charleston Founders Meetup', occurred_at: '2026-10-10T22:00:00Z', peers: [
      { edge_id: 'e1000000-0000-4000-8000-000000000001', community_id: sam.id, name: sam.name, headline: 'Frontend engineer', signal_type: 'qr_confirmed', status: 'suggested' },
      { edge_id: 'e1000000-0000-4000-8000-000000000002', community_id: dana.id, name: dana.name, headline: 'Event planner', signal_type: 'ble', status: 'promoted' },
    ] },
    { event_name: 'HCD Event', occurred_at: '2026-09-18T17:00:00Z', peers: [
      { edge_id: 'e1000000-0000-4000-8000-000000000003', community_id: riley.id, name: riley.name, headline: 'Speaker coach', signal_type: 'ble', status: 'suggested' },
    ] },
  ] };
  // The person panel reads this view.
  seed.community_with_last_seen = seed.community.map(row => ({ ...row }));
  const session = signedOut ? null : { access_token: 'fixture', user: { id: 'auth-me', email: 'member@example.test' } };
  window.supabase = window.createFakeSupabase(seed, { session });
  const rpc = window.supabase.rpc;
  window.__promoted = [];
  window.supabase.rpc = async (name, args) => {
    if (name === 'get_nearify_event_peers') return { data: eventPeers, error: null };
    if (name === 'promote_edge_to_connection') { window.__promoted.push(args.p_edge_id); return { data: { success: true, status: 'pending' }, error: null }; }
    return rpc(name, args);
  };
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
    // With unread actions both header buttons show; neither may cover the
    // search field or its submit button.
    if (current.mobile) {
      await evaluate(`document.getElementById('btn-actions-mobile').dataset.empty = 'false'; true`);
      const overlap = await evaluate(`(() => {
        const box = document.getElementById('search-container').getBoundingClientRect();
        const hits = (r) => r.width && r.height && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top;
        return ['btn-actions-mobile'].filter(id => hits(document.getElementById(id).getBoundingClientRect()));
      })()`);
      check(overlap.length === 0 && await usable('#search-button') && await usable('#btn-actions-mobile'),
        `${prefix}: with Actions showing, the search field and button stay uncovered`, `overlapping: ${overlap.join(', ')}`);
      await evaluate(`document.getElementById('btn-actions-mobile').dataset.empty = 'true'; document.getElementById('global-search').focus(); true`);
    }
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

const NAV = (destination) => `#app-nav [data-destination="${destination}"]`;
const destination = () => evaluate(`document.body.dataset.destination || ''`);
const current_ = () => evaluate(`document.querySelector('#app-nav [aria-current="page"]')?.dataset.destination || ''`);

async function waitForPage(page, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await callInPage(function (p) { return document.body.dataset.destination === p; }, page).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${page} destination`);
}

async function go(page) {
  await press(NAV(page), page);
  await waitForPage(page);
  await sleep(300);
}

// What the page shows. "Shown" means rendered, not hidden by CSS and not
// inert; it may be below the fold.
const contentState = () => callInPage(function () {
  const $ = (sel) => document.querySelector(sel);
  const shown = (el) => !!el && el.getClientRects().length > 0 && el.checkVisibility({ visibilityProperty: true }) && !el.closest('[inert]');
  const rect = (el) => el.getBoundingClientRect();
  const history = $('#cd-network-history');
  const photos = history ? [...history.querySelectorAll('img.ch-peer-avatar')] : [];
  const cards = history ? [...history.querySelectorAll('.ch-peer-card')] : [];
  return {
    homeScreen: shown($('#mobile-you-screen')),
    focus: shown($('#cd-focus')),
    explore: shown($('#cd-explore')),
    search: shown($('#global-search')),
    tabs: [...document.querySelectorAll('#udc-resource-tabs .udc-resource-tab')].filter(shown).map(t => t.dataset.resource),
    activeTab: $('#udc-resource-tabs .udc-resource-tab.active')?.dataset.resource || '',
    listLabel: $('#udc-resource-list .udc-resource-section-label')?.textContent || '',
    heading: $('#cd-explore-toggle span')?.textContent || '',
    listText: shown($('#udc-resource-list')) ? $('#udc-resource-list').innerText : '',
    histories: document.querySelectorAll('#cd-network-history').length,
    history: shown(history),
    historyText: history ? history.innerText : '',
    photos: photos.map(img => ({ w: Math.round(rect(img).width), h: Math.round(rect(img).height), src: img.getAttribute('src') })),
    initials: history ? history.querySelectorAll('.ch-peer-avatar-placeholder').length : 0,
    fits: history ? history.scrollWidth <= history.clientWidth + 1 && rect(history).left >= -1 && rect(history).right <= innerWidth + 1 : null,
    tallestCard: cards.length ? Math.round(Math.max(...cards.map(c => rect(c).height))) : 0,
    map: shown($('#synapse-main-view')),
    mobileState: [...document.body.classList].filter(c => /^mobile-surface-|^mobile-network-list$/.test(c)).join(' '),
    dashboardInert: !!$('#command-dashboard')?.closest('[inert]'),
  };
});

// Each destination has one purpose: Home its own content, Explore the
// categories, Network your people with "People you met" (and the map on
// desktop). Nothing from one leaks into another.
async function expectPage(P, page, label = `${P}: ${page} shows only its own content`) {
  await waitForPage(page);
  if (page === 'network') {
    await waitFor(`/Charleston Founders Meetup/.test(document.getElementById('cd-network-history')?.innerText || '')`, 'People you met', 8000);
  } else {
    await sleep(300);
  }
  const c = await contentState();
  const desktop = !current.mobile;
  const problems = [];
  const want = (ok, what) => { if (!ok) problems.push(what); };
  if (page === 'home') {
    want(desktop ? c.focus : c.homeScreen, 'Home content');
    want(!c.explore, 'no Explore list');
    want(!c.map, 'no map');
  } else if (page === 'explore') {
    want(c.search && c.explore, 'search and Explore list');
    want(c.tabs.join() === 'people,projects,themes,organizations,opportunities', `all five categories (${c.tabs})`);
    want(c.heading === 'Explore', `headed Explore (${c.heading})`);
    want(!c.focus && !c.homeScreen, 'no Home content');
    want(!c.map, 'no map');
  } else {
    want(c.search && c.explore, 'people search and list');
    want(c.heading === 'Network', `headed Network (${c.heading})`);
    want(c.tabs.join() === 'people' && c.activeTab === 'people' && /People/.test(c.listLabel), `only people (${c.tabs}; ${c.activeTab}; ${c.listLabel})`);
    want(/Dana \(fixture\)/.test(c.listText) && /Jordan \(fixture\)[\s\S]*Connection request/.test(c.listText), 'connections and requests');
    want(!c.focus && !c.homeScreen, 'no Home content');
    want(desktop ? c.map : !c.map, desktop ? 'the map beside the list' : 'the list (map behind View map)');
  }
  if (page === 'network') {
    want(c.histories === 1 && c.history, 'People you met, once');
    for (const text of ['PEOPLE YOU MET', 'Charleston Founders Meetup', 'Oct 10, 2026', 'HCD Event', 'Sam (fixture)', 'Frontend engineer', 'Riley (fixture)', 'Dana (fixture)', 'Connected']) {
      want(c.historyText.toUpperCase().includes(text.toUpperCase()), `People you met: ${text}`);
    }
    // Sam consented to a photo; Riley did not and Dana has none: initials.
    want(c.photos.length === 1 && c.photos[0].src === '/images/bubbleh512.png' && c.initials === 2, `consented photo only (${JSON.stringify(c.photos)}, ${c.initials} initials)`);
    want(c.photos.every(p => p.w > 0 && p.w <= 40 && p.h <= 40), `avatar at card size (${JSON.stringify(c.photos)})`);
    want(c.fits && c.tallestCard <= 80, `cards fit the width (fits ${c.fits}, tallest ${c.tallestCard}px)`);
  } else {
    want(c.histories === 0, 'no People you met');
  }
  if (desktop) want(!c.mobileState && !c.dashboardInert, `no phone layout state (${c.mobileState}${c.dashboardInert ? ' inert' : ''})`);
  check(problems.length === 0, label, problems.join('; '));
  return c;
}

async function contentChecks(P) {
  for (const page of ['home', 'explore', 'network', 'explore', 'home']) {
    await step(`${P}: ${page} content`, async () => {
      await go(page);
      await expectPage(P, page);
    });
  }
  // Explore's last category must not follow you into Network.
  await step(`${P}: Network lists people after another Explore category`, async () => {
    await go('explore');
    await press('#udc-resource-tabs [data-resource="opportunities"]', 'Opportunities tab');
    await go('network');
    await expectPage(P, 'network', `${P}: Network lists people after another Explore category`);
    await shot(`${P}-network-people-you-met`);
  });
  // You (the profile) has its own copy of People you met; with Network open
  // both load into their own containers, with no repeated element ids.
  await step(`${P}: People you met in Network and in You load separately`, async () => {
    await press(NAV('you'), 'You');
    await waitFor(`/Charleston Founders Meetup/.test(document.querySelector('#profile-modal .ch-nearify-events-panel')?.textContent || '')`, 'You copy', 8000);
    const state = await evaluate(`({
      network: /Charleston Founders Meetup/.test(document.getElementById('cd-network-history')?.innerText || ''),
      copies: document.querySelectorAll('.ch-nearify-events-panel').length,
      ids: document.querySelectorAll('[id^="nearify-events"]').length,
    })`);
    check(state.network && state.copies === 2 && state.ids === 0, `${P}: People you met in Network and in You load separately`, JSON.stringify(state));
    await evaluate(`window.closeProfileModal?.(); true`);
    await sleep(300);
  });
  await step(`${P}: People you met → Connect sends a request`, async () => {
    await press('#cd-network-history .ch-btn-peer-connect[data-edge-id="e1000000-0000-4000-8000-000000000001"]', 'Connect (Sam)');
    await waitFor(`/Request sent/.test(document.querySelector('#cd-network-history .ch-peer-card[data-edge-id="e1000000-0000-4000-8000-000000000001"]')?.innerText || '')`, 'request sent', 4000);
    check(await evaluate(`window.__promoted.join() === 'e1000000-0000-4000-8000-000000000001'`), `${P}: People you met → Connect sends a request`);
  });
  if (current.mobile) {
    await step(`${P}: Network → View map opens the map`, async () => {
      await go('network');
      await press('#cd-mobile-view-map', 'View map');
      await waitFor(`document.body.classList.contains('buildspace-view-network')`, 'map view', 4000);
      const c = await contentState();
      check(c.map && !c.explore && (await current_()) === 'network', `${P}: Network → View map opens the map`, JSON.stringify({ map: c.map, list: c.explore }));
      await shot(`${P}-network-map`);
      await go('network');
      await expectPage(P, 'network', `${P}: Network returns to the list from the map`);
    });
    // The fake client has no graph data, so the map reports an error toast;
    // start the next checks from a fresh page.
    await load(current);
  }
}

// Search from Network: a person stays in Network; anything else opens in
// Explore with its category selected.
async function networkSearchChecks(P) {
  const choose = async (text, pattern) => {
    await press('#global-search', 'search box');
    await evaluate(`(() => { const i = document.getElementById('global-search'); i.select(); return true; })()`);
    await send('Input.insertText', { text });
    await waitFor(`[...document.querySelectorAll('#search-suggestions .search-suggestion-item')].some(i => ${pattern}.test(i.innerText))`, `${text} suggestion`, 6000);
    const index = await evaluate(`[...document.querySelectorAll('#search-suggestions .search-suggestion-item')].findIndex(i => ${pattern}.test(i.innerText))`);
    await press(`#search-suggestions .search-suggestion-item[data-index="${index}"]`, `${text} suggestion`);
  };
  await step(`${P}: Network search → a person opens in Network`, async () => {
    await go('network');
    await choose('Sam', '/Sam \\(fixture\\)/');
    await waitFor(`${isOpen.panel} && /Sam/.test(document.getElementById('node-side-panel').innerText)`, 'person panel', 6000);
    check((await destination()) === 'network' && (await current_()) === 'network', `${P}: Network search → a person opens in Network`);
    await closePanel();
    await expectPage(P, 'network', `${P}: Network keeps its people after a person search`);
  });
  for (const [kind, text, pattern, tab, panelText] of [
    ['an opportunity', 'Mentor', '/Mentor first-time founders/', 'opportunities', /Mentor first-time founders/],
    ['an organization', 'Harbor', '/Harbor Builders/', 'organizations', /Harbor Builders/],
  ]) {
    await step(`${P}: Network search → ${kind} opens in Explore`, async () => {
      await go('network');
      await choose(text, pattern);
      await waitForPage('explore');
      await waitFor(`${isOpen.panel} && ${panelText}.test(document.getElementById('node-side-panel').innerText)`, `${kind} panel`, 6000);
      const c = await contentState();
      check((await current_()) === 'explore' && c.activeTab === tab && c.tabs.length === 5 && c.histories === 0 && c.explore,
        `${P}: Network search → ${kind} opens in Explore`, JSON.stringify({ tab: c.activeTab, tabs: c.tabs, histories: c.histories }));
      await shot(`${P}-network-search-${tab}`);
      await closePanel();
    });
  }
  await evaluate(`(() => { const i = document.getElementById('global-search'); i.value = ''; i.blur(); document.getElementById('search-suggestions')?.replaceChildren(); return true; })()`);
}

async function navChecks(P) {
  const nav = await evaluate(`(() => {
    const bar = document.getElementById('app-nav');
    const r = bar.getBoundingClientRect();
    return {
      labels: [...bar.querySelectorAll('[data-destination]')].map(b => b.querySelector('span').textContent.trim()).join(' | '),
      bottom: r.top > 0 && r.width >= innerWidth - 1, side: r.left === 0 && r.height >= innerHeight - 1 && r.width < 120,
      old: [...document.querySelectorAll('#mobile-tab-bar, .buildspace-view-switcher, #cd-mobile-discover-mode, #btn-messages-mobile, #cd-messages-btn, [data-workspace-view]')].length,
      navs: document.querySelectorAll('nav[aria-label="Main navigation"]').length,
    };
  })()`);
  check(nav.labels === 'Home | Explore | Network | Inbox | You', `${P}: one navigation reads Home | Explore | Network | Inbox | You`, nav.labels);
  check(current.mobile ? nav.bottom : nav.side, `${P}: the navigation is a ${current.mobile ? 'bottom bar' : 'side bar'}`, JSON.stringify(nav));
  check(nav.old === 0 && nav.navs === 1, `${P}: no other navigation or Messages button remains`, JSON.stringify(nav));
}

async function pageChecks(P) {
  const historyBefore = await evaluate(`history.length + ' ' + location.href`);
  await step(`${P}: Home`, async () => {
    await go('home');
    const ok = current.mobile
      ? await evaluate(`!document.getElementById('mobile-you-screen').hidden && document.body.classList.contains('mobile-surface-you')`)
      : await evaluate(`document.body.classList.contains('buildspace-view-today') && getComputedStyle(document.getElementById('cd-focus')).display !== 'none'`);
    check(ok && (await current_()) === 'home', `${P}: Home shows the Home content and is marked current`);
    await shot(`${P}-home`);
  });
  await step(`${P}: Explore`, async () => {
    await go('explore');
    const ok = current.mobile
      ? await evaluate(`document.body.classList.contains('mobile-surface-discover')`)
      : await evaluate(`getComputedStyle(document.getElementById('cd-focus')).display === 'none' && getComputedStyle(document.getElementById('cd-explore')).display !== 'none'`);
    check(ok && (await current_()) === 'explore' && await usable('#global-search'), `${P}: Explore shows search and the Explore list and is marked current`);
    await shot(`${P}-explore`);
  });
  await step(`${P}: Network`, async () => {
    await go('network');
    const ok = current.mobile
      ? await evaluate(`document.body.classList.contains('mobile-surface-community') && document.querySelector('#cd-explore-toggle span')?.textContent === 'Network'`)
      : await evaluate(`document.body.classList.contains('buildspace-view-network') && getComputedStyle(document.getElementById('synapse-main-view')).display !== 'none'`);
    check(ok && (await current_()) === 'network', `${P}: Network shows your network and is marked current`);
    await shot(`${P}-network`);
  });
  check((await evaluate(`history.length + ' ' + location.href`)) === historyBefore, `${P}: navigating adds no history entries and keeps the URL (Back behaves as before)`);
}

async function inboxAndYou(P) {
  for (const page of ['home', 'explore', 'network']) {
    await step(`${P} ${page}: Inbox opens Messages`, async () => {
      await go(page);
      await press(NAV('inbox'), 'Inbox');
      await waitFor(isOpen.messages, 'messages', 6000);
      check((await destination()) === page, `${P} ${page}: Inbox opens Messages over the current page`);
      // Messages is a modal over the page (full screen on phones): its own
      // close button must work.
      await press('#messages-modal .modal-close', 'close Messages');
      await waitFor(`!${isOpen.messages}`, 'messages to close', 4000);
    });
  }
  await step(`${P}: You opens the profile`, async () => {
    await press(NAV('you'), 'You');
    await waitFor(`(() => { const m = document.getElementById('profile-modal'); return m && getComputedStyle(m).display !== 'none' && m.getClientRects().length; })()`, 'profile', 6000);
    check(true, `${P}: You opens the profile`);
    await shot(`${P}-you`);
    await evaluate(`window.closeProfileModal?.(); true`);
    await sleep(300);
  });
  await step(`${P}: switching pages closes Messages left open`, async () => {
    await evaluate(`window.openMessagesModal(); true`);
    await waitFor(isOpen.messages, 'messages', 6000);
    // Messages covers the navigation (it is a modal), so the switch comes from
    // code paths such as the welcome guide or a keyboard user.
    await callInPage(function (sel) { document.querySelector(sel).click(); return true; }, NAV('home'));
    await waitFor(`!${isOpen.messages}`, 'messages to close', 4000);
    check(true, `${P}: switching pages closes Messages left open`);
  });
  await step(`${P}: the Inbox badge shows unread messages`, async () => {
    await evaluate(`window.dispatchEvent(new CustomEvent('total-unread-messages-updated', { detail: { count: 3 } })); true`);
    const badge = await callInPage(function (sel) { const b = document.getElementById('app-nav-inbox-badge'); return [b.hidden, b.textContent, document.querySelector(sel).getAttribute('aria-label')].join('|'); }, NAV('inbox'));
    check(badge === 'false|3|Inbox, 3 unread', `${P}: the Inbox badge shows unread messages`, badge);
    await evaluate(`window.dispatchEvent(new CustomEvent('total-unread-messages-updated', { detail: { count: 0 } })); true`);
  });
}

async function accessChecks(P) {
  // Actions (notifications that need a response) keeps its own button until
  // the Inbox screen exists. Make it show as it does with pending actions.
  await step(`${P}: Actions opens the action panel`, async () => {
    await go('home');
    const id = current.mobile ? '#btn-actions-mobile' : '#cd-actions-btn';
    await callInPage(function (sel) { window.__actions = 0; const n = window.UnifiedNotifications; const show = n.showPanel; n.showPanel = (...a) => { window.__actions += 1; return show.apply(n, a); }; const b = document.querySelector(sel); b.dataset.empty = 'false'; b.style.display = ''; return true; }, id);
    await press(id, 'Actions');
    check(await evaluate(`window.__actions === 1`), `${P}: Actions opens the action panel`);
    await callInPage(function (sel) { document.getElementById('unified-notification-panel')?.remove(); document.querySelector(sel).dataset.empty = 'true'; return true; }, id);
    await load(current); // leave no split view behind
  });
  await step(`${P}: Admin is reachable for admins`, async () => {
    const id = current.mobile ? '#btn-admin-mobile' : '#cd-admin-btn';
    await callInPage(function (sel) { window.__admin = 0; window.openAdminPanel = () => { window.__admin += 1; }; document.querySelector(sel).style.display = 'flex'; return true; }, id);
    await press(id, 'Admin');
    // Either the stub or dashboard-actions.js's own openAdminPanel runs.
    await waitFor(`window.__admin === 1 || document.getElementById('admin-panel')`, 'admin panel', 4000);
    check(true, `${P}: Admin is reachable for admins`);
    await callInPage(function (sel) { document.getElementById('admin-panel')?.remove(); document.querySelector(sel).style.display = 'none'; return true; }, id);
  });
  await step(`${P}: a notification link opens the organization over the current page`, async () => {
    await go('network');
    await evaluate(`window.UnifiedNotifications.navigateNotification('?org=30000000-0000-4000-8000-0000000000a1', 'org_join_request', 'n1'); true`);
    await waitFor(`${isOpen.panel} && /Harbor Builders/.test(document.getElementById('node-side-panel').innerText)`, 'organization panel', 6000);
    check((await destination()) === 'network', `${P}: a notification link opens the organization over the current page`);
    await closePanel();
  });
}

async function assistanceChecks(P) {
  if (!current.mobile) {
    await step(`${P}: a task link still opens the project's tasks`, async () => {
      await evaluate(`window.viewProjectTask('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'); true`);
      await waitFor(`document.getElementById('project-detail-overlay')`, 'project details', 6000);
      check(await evaluate(`!document.getElementById('mobile-task-assistance')`), `${P}: a task link still opens the project's tasks`);
      await evaluate(`document.getElementById('project-detail-overlay')?.remove(); true`);
    });
    return;
  }
  await step(`${P}: goal assistance opens from Home and closes when navigating away`, async () => {
    await go('home');
    await waitFor(`document.querySelector('#mobile-you-content [data-next-task]')`, 'next task', 8000);
    await press('#mobile-you-content [data-next-task]', 'Get help with this');
    await waitFor(`document.querySelector('#mobile-task-assistance #mta-title')`, 'assistance', 8000);
    check(await usable(NAV('explore')), `${P}: the navigation stays reachable during assistance`);
    await press(NAV('explore'), 'Explore');
    await waitFor(`!document.getElementById('mobile-task-assistance')`, 'assistance to close', 4000);
    check((await destination()) === 'explore', `${P}: goal assistance opens from Home and closes when navigating away`);
  });
}

async function run(w) {
  const P = w.name;
  await load(w);
  console.log(`\n${P} (${w.width}×${w.height})`);
  await navChecks(P);
  await pageChecks(P);
  await inboxAndYou(P);
  await accessChecks(P);
  await assistanceChecks(P);
  await contentChecks(P);
  await networkSearchChecks(P);

  // Phase 1 regressions: Explore categories, organization management and
  // search at this width.
  await go('explore');
  await exploreChecks(P);
  await searchChecks(P);

  // Settings and Log out: Home → Account on phones and tablets, the identity
  // bar on desktop (both move to You in a later change).
  const openAccount = async () => {
    await go('home');
    await waitFor(`document.querySelector('#mobile-you-content details.mobile-you-secondary:last-of-type summary')`, 'Account', 6000);
    if (!(await evaluate(`document.querySelector('#mobile-you-content details.mobile-you-secondary:last-of-type').open`))) {
      await press('#mobile-you-content details.mobile-you-secondary:last-of-type summary', 'Account');
    }
  };
  if (current.mobile) {
    await settingsCheck(P, async () => { await openAccount(); await press('[data-profile-action="settings"]', 'Settings'); });
    await logoutChecks(P, async () => { await openAccount(); await press('[data-profile-action="logout"]', 'Log out'); });
  } else {
    await settingsCheck(P, async () => { await go('home'); await press('#cd-settings-btn', 'Settings'); });
    await logoutChecks(P, async () => { await go('home'); await press('#cd-logout-btn', 'Log out'); });
  }
}

async function resizeChecks() {
  await load(WIDTHS[2]);
  await step('resize: the current page survives crossing the desktop breakpoint', async () => {
    await go('network');
    current = WIDTHS[0];
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await waitFor(`document.body.classList.contains('mobile-surface-community')`, 'mobile Network', 5000);
    const phone = await evaluate(`(() => { const r = document.getElementById('app-nav').getBoundingClientRect(); return r.top > 0 && r.width >= innerWidth - 1; })()`);
    current = WIDTHS[2];
    await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await waitFor(`document.body.classList.contains('buildspace-view-network')`, 'desktop Network', 5000);
    check(phone && (await destination()) === 'network' && (await current_()) === 'network', 'resize: the current page survives crossing the desktop breakpoint');
  });
  // Every page keeps only its own content through phone, tablet, iPad
  // landscape (1180px, the desktop layout) and back.
  const resizeTo = async (w) => {
    current = w;
    await send('Emulation.setDeviceMetricsOverride', { width: w.width, height: w.height, deviceScaleFactor: 1, mobile: w.mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: w.mobile, maxTouchPoints: w.mobile ? 5 : 1 });
    await sleep(900);
  };
  const landscape = { ...WIDTHS[1], name: 'tablet-landscape', width: 1180, height: 820, mobile: false };
  for (const page of ['home', 'explore', 'network']) {
    await load(WIDTHS[2]);
    await go(page);
    for (const w of [WIDTHS[0], WIDTHS[1], landscape, WIDTHS[0], WIDTHS[2]]) {
      await step(`resize: ${page} at ${w.name}`, async () => {
        await resizeTo(w);
        await expectPage('resize', page, `resize: ${page} keeps only its own content at ${w.name} (${w.width}px)`);
        if (page === 'network') await shot(`resize-network-${w.name}`);
      });
    }
    // The page still works after the round trip: its controls respond.
    await step(`resize: ${page} still responds after resizing`, async () => {
      const next = page === 'home' ? 'explore' : 'home';
      await go(next);
      await go(page);
      await expectPage('resize', page, `resize: ${page} still responds after resizing`);
    });
  }
}

async function signedOutChecks() {
  for (const w of [WIDTHS[0], WIDTHS[2]]) {
    await step(`${w.name}: signed out, only the sign-in screen shows`, async () => {
      current = w;
      await evaluate(`localStorage.setItem('__paritySignedOut', '1'); true`);
      await send('Emulation.setDeviceMetricsOverride', { width: w.width, height: w.height, deviceScaleFactor: 1, mobile: w.mobile });
      await send('Page.navigate', { url: `${base}/index.html` });
      await waitFor(`document.readyState === 'complete'`, 'page load', 20000);
      await sleep(3000);
      const state = await evaluate(`({ nav: document.getElementById('app-nav').hidden, login: !document.getElementById('login-section')?.classList.contains('hidden') })`);
      check(state.nav && state.login, `${w.name}: signed out, only the sign-in screen shows`, JSON.stringify(state));
      await evaluate(`localStorage.removeItem('__paritySignedOut'); true`);
    });
  }
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: boot });
  for (const w of WIDTHS) await run(w);
  await resizeChecks();
  await signedOutChecks();
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
