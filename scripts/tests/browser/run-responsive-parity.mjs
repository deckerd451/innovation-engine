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
//   - scrolling: with a mouse wheel (and touch drags on touch screens) the
//     last item of Home, Explore, Network, Inbox and You can be reached,
//     clear of the navigation, at phone, tablet, short and desktop sizes,
//     after switching pages, closing a panel and resizing
//   - closing dialogs: with iOS-sized safe areas, the You (profile) close
//     button sits below the status bar / Dynamic Island, is at least 44px,
//     clear of the profile header, stays put while the profile scrolls, and
//     a real tap closes it back to the same page; Messages, Settings, Actions
//     and goal assistance close the same way
//   - Messages: a real tap on a conversation opens its chat, which can be
//     written in, from phones through iPads and 769–1023px windows to desktop;
//     rotating an iPad with a conversation open keeps that conversation
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
// Served as buildspace.test (mapped to this server): realtimeManager.js has a
// dev-only guard on localhost/127.0.0.1 that stops Messages from loading.
const base = `http://buildspace.test:${server.address().port}`;

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-parity-chrome-'));
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
  // A full-screen dialog over the bar (Messages below 1024px) is not covered by it.
  const barHit = barRect && document.elementFromPoint(barRect.left + barRect.width / 2, barRect.top + barRect.height / 2);
  const bottomBar = barRect && barRect.top > 0 && barRect.width >= innerWidth - 1 && !!barHit && bar.contains(barHit);
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
  // Long lists for the scrolling checks: a member with many skills (Skills
  // shows 15) and 20 conversations in Inbox.
  seed.community.push({ id: '50000000-0000-4000-8000-0000000000a1', user_id: 'auth-morgan', name: 'Morgan (fixture)', interests: [],
    skills: Array.from({ length: 40 }, (_, i) => 'Skill ' + String(i + 1).padStart(2, '0')) });
  const meRow = seed.community[0];
  seed.conversations = Array.from({ length: 20 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const other = { id: '51000000-0000-4000-8000-0000000000' + n, user_id: 'auth-contact-' + n, name: 'Contact ' + n, email: '' };
    return { id: '52000000-0000-4000-8000-0000000000' + n, participant_1_id: me, participant_2_id: other.id,
      participant_1: { ...meRow }, participant_2: other, last_message_at: new Date(Date.UTC(2026, 9, 16, 12, 60 - i)).toISOString(),
      last_message_preview: 'Message ' + n, created_at: '2026-10-01T00:00:00Z' };
  });
  seed.community_with_last_seen = seed.community.map(row => ({ ...row }));
  const session = signedOut ? null : { access_token: 'fixture', user: { id: 'auth-me', email: 'member@example.test' } };
  window.supabase = window.createFakeSupabase(seed, { session });
  const rpc = window.supabase.rpc;
  window.__promoted = [];
  window.__eventPeerLoads = 0;
  window.supabase.rpc = async (name, args) => {
    if (name === 'get_nearify_event_peers') { window.__eventPeerLoads += 1; return { data: eventPeers, error: null }; }
    if (name === 'get_unread_count') return { data: window.__unreadCount ?? 3, error: null };
    if (name === 'promote_edge_to_connection') { window.__promoted.push(args.p_edge_id); return { data: { success: true, status: 'pending' }, error: null }; }
    return rpc(name, args);
  };
  window.__fixtureProfile = seed.community[0];
  // The map cannot load against the fake client, so the network module shows
  // a "critical error" toast that would cover controls (such as the
  // Messages close button); remove it. Production loads the map.
  const toast = 'A critical error occurred. Please reload the page.';
  new MutationObserver(() => {
    document.querySelectorAll('body *').forEach(el => {
      if ((el.textContent || '').trim() === toast && (el.parentElement?.textContent || '').trim() !== toast) el.remove();
    });
  }).observe(document, { childList: true, subtree: true });
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
  // Network is the only home of People you met: opening You over Network
  // adds no second copy and no second load of the event data.
  await step(`${P}: You over Network adds no second People you met`, async () => {
    const before = await evaluate(`window.__eventPeerLoads`);
    await press(NAV('you'), 'You');
    await waitFor(`(() => { const m = document.getElementById('profile-modal'); return m && getComputedStyle(m).display !== 'none' && m.getClientRects().length; })()`, 'profile', 6000);
    await sleep(1500);
    const state = await evaluate(`({
      inYou: document.querySelectorAll('#profile-modal .ch-nearify-events-panel').length,
      copies: document.querySelectorAll('.ch-nearify-events-panel').length,
      network: /Charleston Founders Meetup/.test(document.getElementById('cd-network-history')?.innerText || ''),
      ids: document.querySelectorAll('[id^="nearify-events"]').length,
      loads: window.__eventPeerLoads,
    })`);
    await evaluate(`window.closeProfileModal?.(); true`);
    await sleep(400);
    const after = await evaluate(`({ dest: document.body.dataset.destination, copies: document.querySelectorAll('.ch-nearify-events-panel').length, loads: window.__eventPeerLoads })`);
    check(state.inYou === 0 && state.copies === 1 && state.network && state.ids === 0 && state.loads === before
      && after.dest === 'network' && after.copies === 1 && after.loads === before,
      `${P}: You over Network adds no second People you met`, JSON.stringify({ before, state, after }));
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

// ── Scrolling ────────────────────────────────────────────────────────────
// Where the element is now, without scrolling it into view (locate() does).
const reach = (selector) => callInPage(function (sel) {
  const el = document.querySelector(sel);
  if (!el) return { missing: true };
  const r = el.getBoundingClientRect();
  const bar = document.getElementById('app-nav');
  const br = bar && !bar.hidden ? bar.getBoundingClientRect() : null;
  // The bottom bar limits what can be seen unless a full-screen window
  // (Messages, the profile) is on top of it.
  const barShown = br && br.top > 0 && br.width >= innerWidth - 1 && bar.contains(document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2));
  const limit = barShown ? br.top : innerHeight;
  const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 20);
  const hit = y >= 0 && y < innerHeight ? document.elementFromPoint(x, y) : null;
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), limit: Math.round(limit), navTop: br ? Math.round(br.top) : null,
    ok: r.height > 0 && r.top >= -1 && r.bottom <= limit + 1 && !!hit && (hit === el || el.contains(hit)),
    hit: hit ? (hit.id || String(hit.className).slice(0, 30) || hit.tagName) : null };
}, selector);

// A point inside the element's scroll area (or the page, if none scrolls),
// clear of the navigation, and every scroll area back at the top.
const scrollPoint = (selector, reset) => callInPage(function (sel, resetAll) {
  const el = document.querySelector(sel);
  const scrollers = [];
  for (let a = el?.parentElement; a; a = a.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(a).overflowY) && a.scrollHeight > a.clientHeight + 1) scrollers.push(a);
  }
  if (resetAll) scrollers.forEach(a => { a.scrollTop = 0; });
  const bar = document.getElementById('app-nav');
  const br = bar && !bar.hidden ? bar.getBoundingClientRect() : null;
  const barShown = br && br.top > 0 && br.width >= innerWidth - 1 && bar.contains(document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2));
  const limit = barShown ? br.top : innerHeight;
  const box = scrollers[0]?.getBoundingClientRect() || { left: 0, right: innerWidth, top: 0, bottom: innerHeight };
  const top = Math.max(box.top, 0), bottom = Math.min(box.bottom, limit);
  const r = el.getBoundingClientRect();
  return { x: Math.round((Math.max(box.left, 0) + Math.min(box.right, innerWidth)) / 2), y: Math.round(top + (bottom - top) / 2), down: r.top >= top, scrollers: scrollers.length };
}, selector, reset);

// Scroll as a person would until the element can be seen and pressed: mouse
// wheel, or a touch drag. Fails if the content cannot be scrolled to it.
async function scrollToReach(selector, mode) {
  const start = await reach(selector);
  if (start.missing) return { ok: false, why: 'missing' };
  await scrollPoint(selector, true);
  await sleep(150);
  const first = await reach(selector);
  let last = first;
  let still = 0;
  for (let i = 0; i < 40 && !last.ok; i++) {
    const at = await scrollPoint(selector, false);
    if (mode === 'touch') {
      await send('Input.synthesizeScrollGesture', { x: at.x, y: at.y, yDistance: at.down ? -250 : 250, gestureSourceType: 'touch', speed: 1500, repeatCount: 0 });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: at.down ? 250 : -250 });
    }
    await sleep(120);
    const now = await reach(selector);
    still = now.top === last.top ? still + 1 : 0;
    last = now;
    if (still >= 4) break;
  }
  return { ok: last.ok, scrolled: first.top !== last.top, navStill: first.navTop === last.navTop, first, last };
}

async function expectReach(label, selector, { mustScroll = false } = {}) {
  const modes = current.mobile ? ['touch', 'wheel'] : ['wheel'];
  for (const mode of modes) {
    const r = await scrollToReach(selector, mode);
    check(r.ok && r.navStill && (!mustScroll || r.scrolled), `${label} (${mode})`,
      JSON.stringify({ ok: r.ok, scrolled: r.scrolled, navStill: r.navStill, why: r.why, first: r.first, last: r.last }));
  }
}

const LAST = {
  explore: '#udc-resource-list .udc-resource-item:last-child',
  network: '#cd-network-history .ch-peer-card:last-child .ch-btn-peer-connect',
  inbox: '#conversations-list .conversation-item:last-child',
  you: '#btn-open-profile-editor',
};
const phoneLayout = () => current.width < 1024;

async function scrollChecks(P) {
  await step(`${P}: Home scrolls to its last item`, async () => {
    await go('home');
    await expectReach(`${P}: Home scrolls to its last item`, phoneLayout() ? '#mobile-you-content > :last-child' : '#cd-focus-welcome');
  });
  await step(`${P}: Explore scrolls to the last Skill`, async () => {
    await go('explore');
    await press('#udc-resource-tabs [data-resource="themes"]', 'Skills tab');
    await waitFor(`document.querySelectorAll('#udc-resource-list .udc-resource-item').length === 15`, 'Skills', 6000);
    await expectReach(`${P}: Explore scrolls to the last Skill`, LAST.explore, { mustScroll: phoneLayout() });
  });
  await step(`${P}: Network scrolls to the last person you met`, async () => {
    await go('network');
    await waitFor(`/HCD Event/.test(document.getElementById('cd-network-history')?.innerText || '')`, 'People you met', 8000);
    await expectReach(`${P}: Network scrolls to the last person you met`, LAST.network);
  });
  await step(`${P}: Inbox scrolls to the last conversation`, async () => {
    await press(NAV('inbox'), 'Inbox');
    await waitFor(`document.querySelectorAll('#conversations-list .conversation-item').length === 20`, 'conversations', 8000);
    await expectReach(`${P}: Inbox scrolls to the last conversation`, LAST.inbox, { mustScroll: true });
    await closeMessages();
  });
  await step(`${P}: You scrolls to its last action`, async () => {
    await press(NAV('you'), 'You');
    await waitFor(`document.getElementById('btn-open-profile-editor')?.getClientRects().length`, 'profile', 6000);
    await expectReach(`${P}: You scrolls to its last action`, LAST.you);
    await evaluate(`window.closeProfileModal?.(); true`);
    await sleep(300);
  });
}

// Scrolling keeps working after switching pages, closing a panel and
// resizing across the breakpoint.
async function scrollScenarioChecks() {
  await load(WIDTHS[0]);
  await step('scroll: after switching pages', async () => {
    for (const page of ['network', 'home', 'explore', 'network', 'explore']) await go(page);
    await press('#udc-resource-tabs [data-resource="themes"]', 'Skills tab');
    await waitFor(`document.querySelectorAll('#udc-resource-list .udc-resource-item').length === 15`, 'Skills', 6000);
    await expectReach('scroll: Explore after switching pages', LAST.explore, { mustScroll: true });
  });
  await step('scroll: after opening and closing a panel', async () => {
    await press('#udc-resource-tabs [data-resource="organizations"]', 'Organizations tab');
    await waitFor(`/Harbor Builders/.test(document.getElementById('udc-resource-list')?.innerText || '')`, 'organizations', 6000);
    await press('#udc-resource-list .udc-resource-item[data-id="30000000-0000-4000-8000-0000000000a1"] .udc-resource-show-btn', 'Harbor Builders');
    await waitFor(isOpen.panel, 'panel', 6000);
    await closePanel();
    await press('#udc-resource-tabs [data-resource="themes"]', 'Skills tab');
    await waitFor(`document.querySelectorAll('#udc-resource-list .udc-resource-item').length === 15`, 'Skills', 6000);
    await expectReach('scroll: Explore after closing a panel', LAST.explore, { mustScroll: true });
    await go('network');
    await waitFor(`/HCD Event/.test(document.getElementById('cd-network-history')?.innerText || '')`, 'People you met', 8000);
    await press(NAV('you'), 'You');
    await sleep(800);
    await evaluate(`window.closeProfileModal?.(); true`);
    await sleep(400);
    await expectReach('scroll: Network after closing You', LAST.network, { mustScroll: true });
  });
  await step('scroll: after resizing', async () => {
    for (const w of [WIDTHS[2], { ...WIDTHS[0], name: 'phone-again' }, { ...WIDTHS[2], name: 'desktop-chrome-820', width: 820, height: 700, mobile: false }]) {
      current = w;
      await send('Emulation.setDeviceMetricsOverride', { width: w.width, height: w.height, deviceScaleFactor: 1, mobile: w.mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: w.mobile, maxTouchPoints: w.mobile ? 5 : 1 });
      await sleep(900);
      await go('explore');
      await press('#udc-resource-tabs [data-resource="themes"]', 'Skills tab');
      await waitFor(`document.querySelectorAll('#udc-resource-list .udc-resource-item').length === 15`, 'Skills', 6000);
      await expectReach(`scroll: Explore after resizing to ${w.name} (${w.width}×${w.height})`, LAST.explore, { mustScroll: w.width < 1024 || w.height < 1000 });
    }
  });
  // A phone with a home indicator (34px bottom safe area): the bar grows by
  // the safe area and every surface ends at its top edge, so the last item
  // can still be reached above it.
  await load(WIDTHS[0]);
  await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
  await sleep(600);
  try {
    const edges = () => callInPage(function () {
      const bottom = (sel) => { const e = document.querySelector(sel); return e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().bottom) : null; };
      return { navTop: Math.round(document.getElementById('app-nav').getBoundingClientRect().top), home: bottom('#mobile-you-screen'), dashboard: bottom('#command-dashboard') };
    });
    await step('safe area: Home ends at the bottom bar', async () => {
      await go('home');
      const e = await edges();
      check(e.navTop === 844 - 60 - 34 && e.home === e.navTop, 'safe area: Home ends at the bottom bar', JSON.stringify(e));
      await expectReach('safe area: Home scrolls to its last item', '#mobile-you-content > :last-child');
    });
    await step('safe area: Explore ends at the bottom bar', async () => {
      await go('explore');
      const e = await edges();
      check(e.dashboard === e.navTop, 'safe area: Explore ends at the bottom bar', JSON.stringify(e));
      await press('#udc-resource-tabs [data-resource="themes"]', 'Skills tab');
      await waitFor(`document.querySelectorAll('#udc-resource-list .udc-resource-item').length === 15`, 'Skills', 6000);
      await expectReach('safe area: Explore scrolls to the last Skill', LAST.explore, { mustScroll: true });
    });
  } finally {
    await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } });
  }

  // Sizes beyond the three full runs: a desktop Chrome window showing the
  // phone/tablet layout (mouse, no touch), a short phone, narrow desktop.
  for (const w of [
    { ...WIDTHS[2], name: 'desktop-chrome-820', width: 820, height: 700, mobile: false },
    { ...WIDTHS[0], name: 'short-phone', width: 390, height: 600 },
    { ...WIDTHS[2], name: 'narrow-desktop', width: 1200, height: 760 },
  ]) {
    await load(w);
    console.log(`\n${w.name} (${w.width}×${w.height})`);
    await scrollChecks(w.name);
  }
}


// ── Messages header under iOS safe areas ─────────────────────────────────
// Heading, unread badge, New and X: below the top safe area, in one row, not
// overlapping, the buttons at least 44px and clickable; the search below.
const messagesHeader = () => callInPage(function () {
  const q = (sel) => document.querySelector(sel);
  const box = (el) => { if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }; };
  const owns = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (hit === el || el.contains(hit)); };
  const parts = { heading: q('#messages-container .conversations-header h3'), badge: q('#messages-container .conversations-header .unread-badge'), add: q('#messages-container .new-message-btn'), close: q('#messages-modal .modal-close'), search: q('#conv-search-input') };
  const g = Object.fromEntries(Object.entries(parts).map(([k, el]) => [k, box(el)]));
  const hit = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const names = ['heading', 'add', 'close', 'search'];
  const overlaps = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (hit(g[names[i]], g[names[j]])) overlaps.push(names[i] + '/' + names[j]);
  if (g.badge && (hit(g.badge, g.add) || hit(g.badge, g.close))) overlaps.push('badge');
  const p = document.createElement('div'); p.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px)'; document.body.appendChild(p); const safe = Math.round(p.getBoundingClientRect().height); p.remove();
  return { safe, ...g, headingFont: parts.heading ? parseFloat(getComputedStyle(parts.heading).fontSize) : 0, overlaps, addOwns: owns(parts.add), closeOwns: owns(parts.close), addLabel: parts.add?.getAttribute('aria-label') || parts.add?.textContent.trim() || '', closeLabel: parts.close?.getAttribute('aria-label') || '', vw: innerWidth };
});

const msgsLabel = { add: 'New message', close: 'Close messages' };
function headerProblems(g, safeTop, { aligned = false, oneLine = false } = {}) {
  const bad = [];
  if (!g.heading || !g.add || !g.close || !g.search) return ['missing'];
  if (Math.min(g.heading.top, g.add.top, g.close.top, g.badge ? g.badge.top : Infinity) < safeTop) bad.push('under the safe area');
  if (g.add.w < 44 || g.add.h < 44 || g.close.w < 44 || g.close.h < 44) bad.push('target under 44px');
  if (!g.addOwns || !g.closeOwns) bad.push('not clickable');
  if (g.overlaps.length) bad.push('overlap ' + g.overlaps.join(','));
  if (g.search.top < Math.max(g.heading.bottom, g.add.bottom, g.close.bottom)) bad.push('search not below the header');
  if (g.close.right > g.vw || g.add.right > g.vw) bad.push('off screen');
  if (g.addLabel !== msgsLabel.add || g.closeLabel !== msgsLabel.close) bad.push('labels');
  // Full screen (below 1024px): the X shares the header row with New.
  if (aligned && Math.abs(g.close.top - g.add.top) > 1) bad.push('X not in the header row');
  // "💬 Messages 3" stays on one line (New moves down instead of squeezing it).
  if (oneLine && g.heading.h > 1.8 * g.headingFont) bad.push('heading squeezed onto several lines');
  return bad;
}
const headerSummary = (g) => JSON.stringify({ safe: g.safe, heading: g.heading, badge: g.badge, add: g.add, close: g.close, search: g.search, overlaps: g.overlaps });

async function messagesHeaderChecks(P, safeTop) {
  const fullScreen = current.width < 1024;
  for (const page of ['network', 'explore']) {
    await step(`${P}: Inbox → Messages header, then X returns to ${page}`, async () => {
      await go(page);
      await press(NAV('inbox'), 'Inbox');
      await waitFor(`${isOpen.messages} && document.querySelector('#messages-container .conversations-header .unread-badge')`, 'messages', 6000);
      await sleep(400);
      const g = await messagesHeader();
      const bad = headerProblems(g, safeTop, { aligned: fullScreen, oneLine: true });
      check(!bad.length, `${P}: Messages header (from ${page}) is below the safe area in one row; New and X are 44px, clickable and clear of the search`, bad.join('; ') + ' ' + headerSummary(g));
      // New opens the new-message picker.
      await press('#messages-container .new-message-btn', 'New');
      await waitFor(`document.getElementById('new-message-modal')?.classList.contains('active')`, 'new message', 4000);
      await evaluate(`window.MessagingModule.hideNewMessageModal(); true`);
      // Search filters the conversations, and clearing it restores them.
      await press('#conv-search-input', 'search conversations');
      await send('Input.insertText', { text: 'Contact 07' });
      await waitFor(`document.querySelectorAll('#conversations-list .conversation-item').length === 1`, 'filtered', 4000);
      await evaluate(`(() => { const i = document.getElementById('conv-search-input'); i.value = ''; window.MessagingModule.filterConversations(''); i.blur(); return true; })()`);
      await waitFor(`document.querySelectorAll('#conversations-list .conversation-item').length === 20`, 'all conversations', 4000);
      // The list scrolls under a header that stays put.
      const r = await scrollToReach(LAST.inbox, current.mobile ? 'touch' : 'wheel');
      const after = await messagesHeader();
      check(r.ok && r.scrolled && after.close.top === g.close.top && after.add.top === g.add.top && after.closeOwns && after.addOwns,
        `${P}: New works, search filters, and the list scrolls with the header in place (${page})`, JSON.stringify({ reached: r.ok, scrolled: r.scrolled, before: [g.add.top, g.close.top], after: [after.add.top, after.close.top] }));
      await press('#messages-modal .modal-close', 'Messages X');
      await waitFor(`!${isOpen.messages}`, 'messages to close', 4000);
      check((await destination()) === page && (await current_()) === page, `${P}: Messages X returns to ${page}`, await destination());
      // Reopen: the header and X are where they were, and X closes again.
      await press(NAV('inbox'), 'Inbox');
      await waitFor(`${isOpen.messages} && document.querySelector('#messages-container .new-message-btn')`, 'messages', 6000);
      await sleep(400);
      const again = await messagesHeader();
      check(!headerProblems(again, safeTop, { aligned: fullScreen }).length && again.close.top === g.close.top && again.close.left === g.close.left && again.add.top === g.add.top,
        `${P}: reopened Messages has the same header (${page})`, headerSummary(again));
      await press('#messages-modal .modal-close', 'Messages X');
      await waitFor(`!${isOpen.messages}`, 'messages to close', 4000);
      check((await destination()) === page, `${P}: reopened Messages X returns to ${page}`);
    });
  }
  // Large text, a long heading and long unread counts: still no overlap.
  await step(`${P}: Messages header with large text, a long heading and unread counts`, async () => {
    await go('home');
    await evaluate(`window.openMessagesModal(); true`);
    await waitFor(`${isOpen.messages} && document.querySelector('#messages-container .conversations-header .unread-badge')`, 'messages', 6000);
    await sleep(400);
    const variants = [
      ['large text', `document.documentElement.style.fontSize = '150%'`],
      ['a long heading', `document.querySelector('#messages-container .conversations-header h3').firstChild.textContent = '💬 Messages from your community collaborators '`],
      ...['1', '12', '99+', '1234'].map(n => [`${n} unread`, `document.querySelector('#messages-container .conversations-header .unread-badge').textContent = '${n}'`]),
    ];
    try {
      for (const [name, js] of variants) {
        await evaluate(`${js}; true`);
        await sleep(250);
        const g = await messagesHeader();
        const bad = headerProblems(g, safeTop, { oneLine: name === 'large text' });
        check(!bad.length, `${P}: Messages header with ${name} (and the variants before it) stays clear and clickable`, bad.join('; ') + ' ' + headerSummary(g));
      }
    } finally {
      await evaluate(`document.documentElement.style.fontSize = ''; true`);
      await closeMessages();
    }
  });
  // Inside a conversation (phones: the chat replaces the list) the chat
  // header is the top row; a long name, email or context stays clear of the X.
  if (current.width <= 768) {
    await step(`${P}: in a conversation, a long name, email and context stay clear of the X`, async () => {
      await go('home');
      await evaluate(`window.openMessagesModal(); true`);
      await waitFor(`${isOpen.messages} && document.querySelector('#conversations-list .conversation-item')`, 'messages', 6000);
      await sleep(400);
      await press('#conversations-list .conversation-item', 'conversation');
      await waitFor(`document.querySelector('#chat-panel .chat-header')?.getClientRects().length`, 'chat', 6000);
      await evaluate(`(() => {
        const h = document.querySelector('#chat-panel .chat-header');
        h.querySelector('.chat-header-name').textContent = 'Alexandria Montgomery-Fitzgerald of the Charleston Builders';
        h.querySelector('.chat-header-status').textContent = 'alexandria.montgomery.fitzgerald.community@example-collaborators.test';
        if (!h.querySelector('.chat-context')) { const c = document.createElement('div'); c.className = 'chat-context'; c.textContent = 'About: Waterfront sensor network for the Charleston harbor resilience project'; h.appendChild(c); }
        return true;
      })()`);
      try {
        for (const size of ['', '150%']) {
          await evaluate(`document.documentElement.style.fontSize = '${size}'; true`);
          await sleep(250);
          const g = await callInPage(function () {
            const x = document.querySelector('#messages-modal .modal-close');
            const r = x.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            const under = [...document.querySelectorAll('#chat-panel .chat-header > *, #chat-panel .chat-header-name, #chat-panel .chat-header-status')].filter(e => {
              const q = e.getBoundingClientRect();
              return q.width && q.height && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top;
            }).map(e => String(e.className));
            const head = document.querySelector('#chat-panel .chat-header').getBoundingClientRect();
            return { top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), owns: !!hit && (hit === x || x.contains(hit)), under, fits: head.right <= innerWidth + 1 };
          });
          check(g.top >= safeTop && g.w >= 44 && g.h >= 44 && g.owns && !g.under.length && g.fits,
            `${P}: in a conversation${size ? ' with large text' : ''}, nothing in the chat header runs under the X`, JSON.stringify({ safeTop, ...g }));
        }
      } finally {
        await evaluate(`document.documentElement.style.fontSize = ''; true`);
      }
      await press('#messages-modal .modal-close', 'Messages X');
      await waitFor(`!${isOpen.messages}`, 'messages to close', 4000);
      check((await destination()) === 'home', `${P}: the X closes Messages from a conversation and returns to home`, await destination());
    });
  }
}

// ── Closing dialogs under iOS safe areas ─────────────────────────────────
const safeTopNow = () => evaluate(`(() => { const p = document.createElement('div'); p.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px)'; document.body.appendChild(p); const h = p.getBoundingClientRect().height; p.remove(); return Math.round(h); })()`);
const closeGeometry = (selector) => callInPage(function (sel) {
  const el = document.querySelector(sel);
  if (!el || !el.getClientRects().length) return { missing: true };
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const overlaps = [...document.querySelectorAll('#profile-modal .ch-profile-header *')].filter(o => { const q = o.getBoundingClientRect(); return q.width && q.height && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; }).length;
  return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), owns: !!hit && (hit === el || el.contains(hit)), label: el.getAttribute('aria-label') || '', overlaps, onScreen: r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
}, selector);
const profileOpen = `(() => { const m = document.getElementById('profile-modal'); return !!m && getComputedStyle(m).display !== 'none' && m.getClientRects().length > 0; })()`;

async function closeDialogChecks(P, safeTop, safeBottom) {
  const safe = await safeTopNow();
  check(safe === safeTop, `${P}: safe area applied (${safeTop}px)`, `${safe}`);
  for (const page of ['network', 'explore']) {
    await step(`${P}: You → tap X returns to ${page}`, async () => {
      await go(page);
      await press(NAV('you'), 'You');
      await waitFor(profileOpen, 'profile', 6000);
      await sleep(400);
      const g = await closeGeometry('#profile-modal .modal-close');
      // The whole window sits inside the safe areas on phones.
      const win = await evaluate(`(() => { const r = document.querySelector('#profile-modal .modal-content').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(innerHeight - r.bottom) }; })()`);
      check(win.top >= safeTop && win.bottom >= safeBottom, `${P}: the profile window sits inside the safe areas`, JSON.stringify({ safeTop, safeBottom, ...win }));
      check(!g.missing && g.top >= safeTop && g.w >= 44 && g.h >= 44 && g.owns && g.onScreen && g.overlaps === 0 && g.label === 'Close profile',
        `${P}: the profile X is below the top safe area, at least 44px and clear of the header`, JSON.stringify({ safeTop, ...g }));
      // Scroll the profile; the X stays where it is and still works.
      // The last section shown at every width ("Right now" is hidden on phones).
      const target = '#profile-modal #nearify-experience-row';
      const r = await scrollToReach(target, current.mobile ? 'touch' : 'wheel');
      const after = await closeGeometry('#profile-modal .modal-close');
      check(r.ok && after.top === g.top && after.owns, `${P}: the profile scrolls and the X stays in place`, JSON.stringify({ reached: r.ok, before: g.top, after: after.top, owns: after.owns }));
      await press('#profile-modal .modal-close', 'profile X');
      await waitFor(`!${profileOpen}`, 'profile to close', 4000);
      check((await destination()) === page && (await current_()) === page && await usable(NAV(page)),
        `${P}: You → tap X returns to ${page}`, `${await destination()}`);
    });
  }
  // The other full-screen dialogs: their close control is below the top
  // safe area and a real tap closes them.
  const others = [
    ['Messages', `window.openMessagesModal(); true`, '#messages-modal .modal-close', isOpen.messages],
    ['Settings', `window.SettingsModal.open(); true`, '#settings-close-btn', isOpen.settings],
    ['Actions', `window.UnifiedNotifications.showPanel('actions'); true`, '#close-unified-panel', `!!document.getElementById('close-unified-panel')?.getClientRects().length`],
  ];
  if (current.width < 1024) others.push(['goal assistance', `(() => { document.querySelector('#mobile-you-content [data-next-task]')?.click(); return true; })()`, '#mobile-task-assistance .mta-close', `!!document.querySelector('#mobile-task-assistance .mta-close')`]);
  for (const [name, open, selector, isShown] of others) {
    await step(`${P}: ${name} closes with its X below the safe area`, async () => {
      await go('home');
      if (name === 'goal assistance') await waitFor(`document.querySelector('#mobile-you-content [data-next-task]')`, 'next task', 8000);
      // Twice: a tap must not move the X for next time (a click effect once
      // made clicked buttons position: relative).
      const seen = [];
      for (let round = 0; round < 2; round++) {
        if (name === 'goal assistance' && round) await waitFor(`document.querySelector('#mobile-you-content [data-next-task]')`, 'next task', 8000);
        await evaluate(open);
        await waitFor(isShown, name, 8000);
        await sleep(400);
        seen.push(await closeGeometry(selector));
        await press(selector, `${name} close`);
        await waitFor(`!(${isShown})`, `${name} to close`, 4000);
      }
      const [g, again] = seen;
      check(!g.missing && g.top >= safeTop && g.owns && again.top === g.top && again.left === g.left && again.owns,
        `${P}: ${name} closes with its X below the safe area, in the same place every time`, JSON.stringify({ safeTop, first: g, again }));
    });
  }
}

async function closeDialogRuns() {
  for (const [w, insets] of [
    [WIDTHS[0], { top: 59, bottom: 34 }],
    [{ ...WIDTHS[0], name: 'short-phone', height: 600 }, { top: 59, bottom: 34 }],
    [{ ...WIDTHS[0], name: 'phone-notch', width: 375, height: 812 }, { top: 44, bottom: 34 }],
    [WIDTHS[1], { top: 24, bottom: 20 }],
    [{ ...WIDTHS[2], name: 'desktop-chrome-820', width: 820, height: 700, mobile: false }, { top: 0, bottom: 0 }],
    [{ ...WIDTHS[2], name: 'narrow-desktop', width: 1200, height: 760 }, { top: 0, bottom: 0 }],
    [WIDTHS[2], { top: 0, bottom: 0 }],
  ]) {
    await load(w);
    await send('Emulation.setSafeAreaInsetsOverride', { insets: { ...insets, left: 0, right: 0 } });
    await sleep(500);
    console.log(`\nclose: ${w.name} (${w.width}×${w.height}, safe top ${insets.top})`);
    try {
      await closeDialogChecks(`close ${w.name}`, insets.top, insets.bottom);
      await messagesHeaderChecks(`messages ${w.name}`, insets.top);
    }
    finally { await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0 } }); }
  }
}

// ── Opening a conversation ───────────────────────────────────────────────
// Below 1024px Messages is full screen and shows either the list or the
// chat; from 1024px both sit side by side. A real tap on a conversation
// always shows its chat, which can be written in, at every width (iPads and
// browser windows of 769–1023px once showed nothing).
const msgPane = () => callInPage(function () {
  const shown = (sel) => { const el = document.querySelector(sel); if (!el || !el.getClientRects().length) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth; };
  return { list: shown('#messages-container .conversations-sidebar'), chat: shown('#chat-panel .chat-header'), name: shown('#chat-panel .chat-header-name') ? document.querySelector('#chat-panel .chat-header-name').textContent.trim() : '', back: shown('#chat-panel .mobile-back-btn') };
});
const conversationRow = (n) => `#conversations-list .conversation-item:nth-child(${n})`;

async function conversationChecks(P) {
  const fullScreen = current.width < 1024;
  const openChat = async (n) => {
    await press(conversationRow(n), `conversation ${n}`);
    const name = `Contact ${String(n).padStart(2, '0')}`;
    await waitFor(`document.querySelector('#chat-panel .chat-header-name')?.textContent.trim() === ${JSON.stringify(name)}`, name, 6000);
    await sleep(300);
    return name;
  };
  await step(`${P}: tapping a conversation opens its chat`, async () => {
    await go('home');
    await press(NAV('inbox'), 'Inbox');
    await waitFor(`${isOpen.messages} && document.querySelectorAll('#conversations-list .conversation-item').length === 20`, 'messages', 6000);
    await sleep(400);
    const name = await openChat(2);
    const v = await msgPane();
    // Full screen: the chat replaces the list and has a back button.
    // Side by side: the list stays and there is no back button.
    const layoutOk = fullScreen ? (v.chat && !v.list && v.back) : (v.chat && v.list && !v.back);
    // The composer can be tapped once the chat has settled (allow a moment
    // for anything still animating over it).
    let composer, composerOk = false;
    for (let i = 0; i < 10 && !composerOk; i++) {
      if (i) await sleep(300);
      composer = { input: await locate('#chat-panel .message-input'), send: await locate('#chat-panel .send-button') };
      composerOk = Object.values(composer).every(c => !c.missing && c.onScreen && c.clear && c.owns);
    }
    check(layoutOk && v.name === name && composerOk,
      `${P}: tapping a conversation shows its chat (${fullScreen ? 'full screen, with back' : 'beside the list'}) with the composer usable`, JSON.stringify({ ...v, composer }));
    await shot(`${current.name}-conversation`);

    // Write and send a message with real input.
    const text = `Hello from ${current.name}`;
    await press('#chat-panel .message-input', 'message input');
    await send('Input.insertText', { text });
    await press('#chat-panel .send-button', 'Send');
    await waitFor(`[...document.querySelectorAll('#messages-area .message.sent .message-bubble')].some(b => b.textContent.includes(${JSON.stringify(text)}) && b.getClientRects().length)`, 'sent message', 6000);
    check(true, `${P}: a message can be written and sent in the chat`);

    // Then another conversation: back to the list first when full screen.
    if (fullScreen) {
      await press('#chat-panel .mobile-back-btn', 'Back to conversations');
      const list = await msgPane();
      check(list.list && !list.chat && await usable(conversationRow(3)), `${P}: back returns to the conversation list`, JSON.stringify(list));
    }
    const other = await openChat(3);
    const v2 = await msgPane();
    check(v2.chat && v2.name === other && (fullScreen ? !v2.list : v2.list), `${P}: tapping another conversation switches the chat`, JSON.stringify(v2));

    await press('#messages-modal .modal-close', 'Messages X');
    await waitFor(`!${isOpen.messages}`, 'messages to close', 4000);
    check((await destination()) === 'home', `${P}: the X closes Messages from a chat and returns to home`, await destination());
  });
}

async function conversationRuns() {
  const ipad = WIDTHS[1].ua;
  const mac = WIDTHS[2].ua;
  for (const w of [
    WIDTHS[0],                                                                                  // iPhone
    { ...WIDTHS[0], name: 'phone-small', width: 375, height: 667 },                             // iPhone SE
    { name: 'ipad-mini-portrait', width: 768, height: 1024, mobile: true, ua: ipad },           // the old breakpoint
    { ...WIDTHS[1], name: 'ipad-portrait' },                                                    // 820×1180
    { name: 'ipad-pro-portrait', width: 1000, height: 1366, mobile: true, ua: ipad },
    { name: 'ipad-landscape', width: 1180, height: 820, mobile: true, ua: ipad },
    { name: 'desktop-window-769', width: 769, height: 800, mobile: false, ua: mac },
    { name: 'desktop-window-900', width: 900, height: 760, mobile: false, ua: mac },
    { name: 'desktop-window-1023', width: 1023, height: 760, mobile: false, ua: mac },
    { name: 'desktop-window-1024', width: 1024, height: 760, mobile: false, ua: mac },
    WIDTHS[2],                                                                                  // 1366×900
  ]) {
    await load(w);
    console.log(`\nconversation: ${w.name} (${w.width}×${w.height}${w.mobile ? ', touch' : ''})`);
    await conversationChecks(`conversation ${w.name}`);
  }

  // Resizing across 1024px with a chat open (a desktop window, and an iPad
  // rotating): side by side with no back button from 1024px; below it,
  // exactly one of the list or the chat, never blank or both.
  for (const [name, start, sizes] of [
    ['desktop window', { name: 'desktop-window-900', width: 900, height: 760, mobile: false, ua: mac }, [[1366, 900], [900, 760], [1366, 900]]],
    ['iPad rotation', { name: 'ipad-portrait', width: 820, height: 1180, mobile: true, ua: ipad }, [[1180, 820], [820, 1180], [1180, 820]]],
  ]) {
    await step(`conversation resize (${name}): the chat stays usable across the breakpoint`, async () => {
      await load(start);
      await go('home');
      await press(NAV('inbox'), 'Inbox');
      await waitFor(`${isOpen.messages} && document.querySelector(${JSON.stringify(conversationRow(2))})`, 'messages', 6000);
      await sleep(400);
      await press(conversationRow(2), 'conversation 2');
      await waitFor(`document.querySelector('#chat-panel .chat-header-name')?.textContent.trim() === 'Contact 02'`, 'chat', 6000);
      const seen = [];
      for (const [width, height] of sizes) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: start.mobile });
        await sleep(600);
        seen.push({ width, ...(await msgPane()) });
      }
      const ok = seen.every(v => v.width >= 1024
        ? (v.list && v.chat && v.name === 'Contact 02' && !v.back)
        : (v.chat && !v.list && v.name === 'Contact 02' && v.back));
      check(ok, `conversation resize (${name}): both panes and no back button from 1024px, the same chat full screen below it`, JSON.stringify(seen));
      // Still works afterwards: back at full screen, a tap opens a chat.
      await send('Emulation.setDeviceMetricsOverride', { width: start.width, height: start.height, deviceScaleFactor: 1, mobile: start.mobile });
      current = start;
      await sleep(600);
      if ((await msgPane()).chat) await press('#chat-panel .mobile-back-btn', 'Back to conversations');
      await press(conversationRow(3), 'conversation 3');
      await waitFor(`document.querySelector('#chat-panel .chat-header-name')?.textContent.trim() === 'Contact 03'`, 'chat', 6000);
      const after = await msgPane();
      check(after.chat && !after.list && after.back, `conversation resize (${name}): after resizing back, tapping a conversation opens it full screen`, JSON.stringify(after));
      await closeMessages();
    });
  }

  // iPad portrait → landscape → portrait with a conversation open: the same
  // conversation is still open full screen, its back button and composer
  // work; and having gone back to the list, rotating keeps the list.
  const portrait = { name: 'ipad-portrait', width: 820, height: 1180, mobile: true, ua: ipad };
  const rotate = async (width, height) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await sleep(700);
    return { width, ...(await msgPane()) };
  };
  await step('conversation rotation: portrait → landscape → portrait keeps the open conversation', async () => {
    await load(portrait);
    await go('home');
    await press(NAV('inbox'), 'Inbox');
    await waitFor(`${isOpen.messages} && document.querySelectorAll('#conversations-list .conversation-item').length === 20`, 'messages', 6000);
    await sleep(400);
    await press(conversationRow(4), 'conversation 4');
    await waitFor(`document.querySelector('#chat-panel .chat-header-name')?.textContent.trim() === 'Contact 04'`, 'chat', 6000);
    const before = await msgPane();
    const landscape = await rotate(1180, 820);
    const back = await rotate(820, 1180);
    check(before.chat && !before.list && before.back
      && landscape.chat && landscape.list && landscape.name === 'Contact 04' && !landscape.back
      && back.chat && !back.list && back.name === 'Contact 04' && back.back,
      'conversation rotation: after portrait → landscape → portrait, the same conversation is open full screen with its back button', JSON.stringify({ before, landscape, back }));
    await shot('ipad-rotated-back-conversation');

    // The composer still works: write and send with real touch input.
    const text = 'Sent after rotating';
    await press('#chat-panel .message-input', 'message input');
    await send('Input.insertText', { text });
    await press('#chat-panel .send-button', 'Send');
    await waitFor(`[...document.querySelectorAll('#messages-area .message.sent .message-bubble')].some(b => b.textContent.includes(${JSON.stringify(text)}) && b.getClientRects().length)`, 'sent message', 6000);
    check((await msgPane()).name === 'Contact 04', 'conversation rotation: after rotating back, a message can be written and sent in that conversation');

    // The back button returns to the list; rotating then keeps the list.
    await press('#chat-panel .mobile-back-btn', 'Back to conversations');
    const list = await msgPane();
    const listLandscape = await rotate(1180, 820);
    const listBack = await rotate(820, 1180);
    check(list.list && !list.chat && listBack.list && !listBack.chat && listLandscape.list && await usable(conversationRow(5)),
      'conversation rotation: back returns to the list, and rotating there keeps the list', JSON.stringify({ list, listLandscape, listBack }));
    await press(conversationRow(5), 'conversation 5');
    await waitFor(`document.querySelector('#chat-panel .chat-header-name')?.textContent.trim() === 'Contact 05'`, 'chat', 6000);
    const next = await msgPane();
    check(next.chat && !next.list && next.back, 'conversation rotation: another conversation then opens full screen', JSON.stringify(next));

    await press('#messages-modal .modal-close', 'Messages X');
    await waitFor(`!${isOpen.messages}`, 'messages to close', 4000);
    check((await destination()) === 'home', 'conversation rotation: the X closes Messages and returns to home', await destination());
  });
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
  await scrollChecks(P);

  // Phase 1 regressions: Explore categories, organization management and
  // search at this width.
  await go('explore');
  await exploreChecks(P);
  await searchChecks(P);

  // Settings and Log out: Home → Account on phones and tablets, the identity
  // bar on desktop (both move to You in a later change).
  // Home renders again (asynchronously) each time it is shown, which closes
  // Account; open it on the settled page, and again if a render closed it.
  const openAccount = async () => {
    await go('home');
    await sleep(800);
    for (let i = 0; i < 3; i++) {
      await waitFor(`document.querySelector('#mobile-you-content details.mobile-you-secondary:last-of-type summary')`, 'Account', 6000);
      if (await evaluate(`document.querySelector('#mobile-you-content details.mobile-you-secondary:last-of-type').open`)) return;
      await press('#mobile-you-content details.mobile-you-secondary:last-of-type summary', 'Account');
      await sleep(300);
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
  await scrollScenarioChecks();
  await closeDialogRuns();
  await conversationRuns();
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
