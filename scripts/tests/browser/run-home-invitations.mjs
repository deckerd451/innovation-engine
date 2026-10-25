// Home on an iPhone: every "Ways to join in" invitation is credible, and Home
// stays clear of the status bar.
//
//   node scripts/tests/browser/run-home-invitations.mjs [outDir]
//
// Serves a checkout and opens the real index.html in headless Google Chrome
// at iPhone size with iPhone safe areas (Dynamic Island: 59px top, 34px
// bottom; earlier notch: 47px), replacing only supabaseClient.js with a stub
// backed by the test-only fake client (scripts/tests/fixtures, always from
// this checkout). Two members:
//   - a member with projects and connections: Ways to join in never offers a
//     project they created, joined or asked to join, a completed project, an
//     opportunity from an organization they run, or one past its deadline;
//     each invitation that is shown says why, in terms of the member
//   - a newcomer with no skills, interests, projects or connections: nothing
//     matches, so Home shows its quiet state instead of recent activity
// and at the top of Home: the heading sits below the status bar, and Home's
// content never scrolls underneath the status bar.
//
// CHROME_PATH overrides the browser; HOME_TEST_ROOT serves another checkout
// (used for the "before" run against unfixed code). Screenshots go to outDir.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const root = path.resolve(process.env.HOME_TEST_ROOT || here);
const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'buildspace-home-invitations'));
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

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-home-chrome-'));
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

// The fixture community, with recent activity on every project so that
// "recently active" alone would surface each of them.
const fixtures = fs.readFileSync(path.join(here, 'scripts/tests/fixtures/assistance-fixtures.js'), 'utf8');
const fake = fs.readFileSync(path.join(here, 'scripts/tests/fixtures/fake-supabase.js'), 'utf8');
const boot = `${fixtures}\n${fake}\n(() => {
  const scenario = new URLSearchParams(location.search).get('scenario') || 'member';
  const { ID } = window.AssistanceFixtures;
  const seed = window.AssistanceFixtures.seed();
  const me = ID.me;
  const now = new Date().toISOString();
  const soon = new Date(Date.now() + 14 * 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();
  seed.community[0].interests = ['Climate'];
  seed.organizations = [
    { id: 'org-mine', name: 'Harbor Builders', status: 'active', created_by: me, created_at: '2026-09-01T00:00:00Z' },
    { id: 'org-schools', name: 'Tidewater Schools', status: 'active', created_by: ID.riley, created_at: '2026-09-01T00:00:00Z' },
  ];
  seed.organization_members = [{ id: 'om-1', organization_id: 'org-mine', community_id: me, role: 'owner', status: 'active' }];
  seed.projects.forEach(project => { project.updated_at = now; });
  seed.projects.push(
    { id: 'p-closed', title: 'Climate data archive', description: 'Python scripts for old sensor data', status: 'completed', creator_id: ID.riley, created_at: now, updated_at: now },
    { id: 'p-requested', title: 'Python study group', description: 'Weekly Python practice', status: 'open', creator_id: ID.riley, created_at: now, updated_at: now },
    { id: 'p-match', title: 'Climate dashboard for Charleston', description: 'Mapping flood data with Python', status: 'open', creator_id: ID.riley, created_at: now, updated_at: now },
    { id: 'p-friend', title: 'Neighborhood tool library', description: 'Lending tools between neighbors', status: 'active', creator_id: ID.dana, created_at: now, updated_at: now },
  );
  seed.project_members.push({ project_id: 'p-requested', user_id: me, role: 'pending' });
  seed.opportunities = [
    { id: 'o-mine', title: 'Mentor first-time founders', description: 'Python office hours', status: 'open', is_public: true, application_deadline: null, organization_id: 'org-mine', posted_by: me, created_at: now, updated_at: now },
    { id: 'o-expired', title: 'Climate grant reviewer', description: 'Review Python climate grants', status: 'open', is_public: true, application_deadline: past, organization_id: 'org-schools', posted_by: ID.riley, created_at: now, updated_at: now },
    { id: 'o-match', title: 'Python mentor for a coding club', description: 'Help students with Python', status: 'open', is_public: true, application_deadline: soon, organization_id: 'org-schools', posted_by: ID.riley, created_at: now, updated_at: now },
  ];
  if (scenario === 'newcomer') {
    // No skills, interests, projects or connections yet.
    Object.assign(seed.community[0], { skills: [], interests: [] });
    seed.projects.forEach(project => { if (project.creator_id === me) project.creator_id = ID.sam; });
    seed.project_members = seed.project_members.filter(row => row.user_id !== me);
    seed.organization_members = [];
    seed.connections = [];
    window.__unreadCount = 0;
  }
  seed.community_with_last_seen = seed.community.map(row => ({ ...row }));
  window.supabase = window.createFakeSupabase(seed, { session: { access_token: 'fixture', user: { id: 'auth-me', email: 'member@example.test' } } });
  const rpc = window.supabase.rpc;
  window.supabase.rpc = async (name, args) => {
    if (name === 'get_unread_count') return { data: window.__unreadCount ?? 0, error: null };
    return rpc(name, args);
  };
  window.__fixtureProfile = seed.community[0];
  // The map cannot load against the fake client; its error toast is removed
  // (production loads the map), as in the parity run.
  const toast = 'A critical error occurred. Please reload the page.';
  new MutationObserver(() => {
    document.querySelectorAll('body *').forEach(el => {
      if ((el.textContent || '').trim() === toast && (el.parentElement?.textContent || '').trim() !== toast) el.remove();
    });
  }).observe(document, { childList: true, subtree: true });
})();`;

async function loadHome(scenario, insets) {
  await send('Emulation.setDeviceMetricsOverride', { width: PHONE.width, height: PHONE.height, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent: PHONE.ua });
  await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: insets.top, bottom: insets.bottom, left: 0, right: 0 } });
  await send('Page.navigate', { url: `${base}/index.html?scenario=${scenario}` });
  await waitFor(`document.readyState === 'complete'`, 'page load', 20000);
  await sleep(2500);
  if (!(await evaluate(`!!window.currentUserProfile?.id`))) {
    await evaluate(`(() => { window.currentUserProfile = window.__fixtureProfile; document.querySelectorAll('#login-section, .login-overlay, #auth-container').forEach(el => el.style.display = 'none'); window.dispatchEvent(new CustomEvent('profile-loaded', { detail: { user: { id: 'auth-me' }, profile: window.__fixtureProfile } })); })()`);
  }
  await waitFor(`document.querySelector('#mobile-you-content .home-view')`, 'Home', 15000);
  await waitFor(`window.StartDailyDigest?.homeSuggestions?.().status === 'ready'`, 'the brief', 15000);
  await sleep(1500);
}

// Ways to join in, as shown.
const joinIn = () => callInPage(function () {
  const section = document.querySelector('#mobile-you-content [data-home="join"]');
  const quiet = document.querySelector('#mobile-you-content [data-home="quiet"]');
  return {
    shown: !!section && !section.hidden,
    items: section && !section.hidden ? [...section.querySelectorAll('.home-item')].map(item => ({
      name: item.querySelector('strong')?.textContent.trim() || '',
      reason: item.querySelector('p')?.textContent.trim() || '',
    })) : [],
    quiet: !!quiet && !quiet.hidden ? quiet.innerText : '',
    text: document.getElementById('mobile-you-content')?.innerText || '',
  };
});

// The top of Home under the status bar: where the heading sits, and what a
// finger (or eye) at the status bar meets once Home has scrolled.
const topEdge = () => callInPage(function () {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px)';
  document.body.appendChild(probe);
  const safeTop = Math.round(probe.getBoundingClientRect().height);
  probe.remove();
  const heading = document.querySelector('#mobile-you-content .home-header');
  const scroller = document.querySelector('#mobile-you-screen .mobile-you-scroll');
  const content = document.getElementById('mobile-you-content');
  const under = (y) => [40, 195, 300].map(x => document.elementsFromPoint(x, y).find(el => content.contains(el)) ? 1 : 0).reduce((a, b) => a + b, 0);
  return { safeTop, headingTop: heading ? Math.round(heading.getBoundingClientRect().top) : null, scrollTop: scroller ? Math.round(scroller.scrollTop) : null,
    contentUnderStatusBar: safeTop ? under(Math.max(1, Math.floor(safeTop / 2))) + under(safeTop - 1) : 0 };
});
const scrollHome = (y) => callInPage(function (top) {
  const scroller = document.querySelector('#mobile-you-screen .mobile-you-scroll');
  scroller.scrollTop = top;
  return Math.round(scroller.scrollTop);
}, y);

const EXCLUDED = ['Harborhack 2026 prep', 'Startup lab', 'Investor day', 'Climate data archive', 'Python study group', 'Mentor first-time founders', 'Climate grant reviewer'];
const CREDIBLE = ['Climate dashboard for Charleston', 'Neighborhood tool library', 'Python mentor for a coding club'];
const REASON = /^(Matches what you listed: |Someone you’re connected to |From .+ you belong to|Part of a theme you’re in|\d+ people you’re connected to )/;

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: boot });

  for (const device of [{ name: 'dynamic-island', top: 59, bottom: 34 }, { name: 'notch', top: 47, bottom: 34 }]) {
    console.log(`\nMember with projects (${device.name}, ${device.top}px top safe area)`);
    await loadHome('member', device);
    const join = await joinIn();
    if (device.name === 'dynamic-island') await phoneShot(`member-${device.name}-top`);
    const offered = join.items.map(item => item.name);
    const wrong = offered.filter(name => EXCLUDED.includes(name));
    check(!wrong.length, `${device.name}: Ways to join in never offers my own, joined, requested or closed projects, my organization's or expired opportunities`, JSON.stringify(offered));
    check(join.items.length === 2 && offered.every(name => CREDIBLE.includes(name)), `${device.name}: Ways to join in keeps two credible invitations`, JSON.stringify(offered));
    check(join.items.every(item => REASON.test(item.reason)), `${device.name}: each invitation says why, in terms of the member`, JSON.stringify(join.items));

    const top = await topEdge();
    check(top.safeTop === device.top, `${device.name}: safe area applied`, JSON.stringify(top));
    check(top.headingTop >= top.safeTop + 8, `${device.name}: Home's heading sits below the status bar with room to breathe`, JSON.stringify(top));
    check(top.contentUnderStatusBar === 0, `${device.name}: nothing from Home is under the status bar at rest`, JSON.stringify(top));
    const scrolled = await scrollHome(240);
    await sleep(200);
    const afterScroll = await topEdge();
    if (device.name === 'dynamic-island') await phoneShot(`member-${device.name}-scrolled`);
    check(scrolled > 0 && afterScroll.contentUnderStatusBar === 0, `${device.name}: scrolled Home stays out from under the status bar`, JSON.stringify(afterScroll));
    await scrollHome(0);
  }

  console.log('\nNewcomer (no skills, interests, projects or connections)');
  await loadHome('newcomer', { top: 59, bottom: 34 });
  const newcomer = await joinIn();
  await phoneShot('newcomer-dynamic-island-top');
  check(!newcomer.shown && !newcomer.items.length, 'newcomer: no generic recent activity in Ways to join in', JSON.stringify(newcomer.items));
  check(/It’s quiet around you right now/.test(newcomer.quiet), 'newcomer: Home shows its honest quiet state', newcomer.text.slice(0, 300));
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
  console.log(`\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} Home invitation checks passed. Screenshots: ${outDir}`);
  process.exit(failed.length ? 1 : 0);
}
