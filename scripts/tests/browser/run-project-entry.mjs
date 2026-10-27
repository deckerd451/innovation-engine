// Opening and returning to a project, as members see it: real index.html in
// headless Google Chrome against the synthetic community of
// run-explore-people.mjs (test-only fake client; nothing reaches a database),
// on iPhone and desktop:
//   - a returning member (creator of Harborhack, with work in progress, to do
//     and done) sees what the project is, who is involved and one next step
//     from their real tasks, with honest progress; "Open task" opens exactly
//     that task
//   - Work lists in progress, then to do, as compact rows that open their
//     details and actions; finished work is folded away and one tap shows it
//   - task assistance's working notes never show, and an edit keeps them as
//     stored; status changes, filters and permissions still work
//   - on iPhone a task opens task assistance ("Work on this or report
//     progress"), and the project screen clears the bottom bar
//   - someone exploring a project sees what it needs (and what of it they
//     list) and asks to join from the top; a pending request says so
//
//   node scripts/tests/browser/run-project-entry.mjs [outDir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const root = path.resolve(process.env.HOME_TEST_ROOT || here);
const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'buildspace-project-entry'));
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

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-project-chrome-'));
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


// A returning member's project: Harborhack (created by the member) with work
// in progress, to do and done, one task carrying task assistance's working
// notes, and two teammates. Startup lab (the member is a member, not the
// creator) gets one task; Community fridge has the member's pending request.
const NOTES = '── Buildspace working notes ──\nWorking on: Compare options\noption: Dana (fixture) (7 pts)\nstate: {"step":"compare","values":{"matrix.rows":[{"name":"Dana (fixture)","scores":{"fit":4,"reach":3}}]}}\n── end of working notes ──';
const SPEAKER_DESCRIPTION = `Pick two speakers for the opening.\n\n${NOTES}`;
const seedProject = `(() => {
  const { ID } = window.AssistanceFixtures; const db = window.supabase.__db; const day = 86400000;
  const iso = d => new Date(Date.now() + d * day).toISOString();
  const speaker = db.project_tasks.find(t => t.id === ID.speakerTask);
  Object.assign(speaker, { description: ${JSON.stringify(SPEAKER_DESCRIPTION)}, status: 'in_progress', owner_id: ID.me, updated_at: iso(-1) });
  db.project_tasks.push(
    { id: 'task-sponsors', project_id: ID.harbor, title: 'Email last year’s sponsors', description: 'Ask about returning as sponsors', status: 'open', priority: 'medium', due_date: iso(9).slice(0, 10), owner_id: ID.dana, created_at: iso(-6), updated_at: iso(-6) },
    { id: 'task-done-1', project_id: ID.harbor, title: 'Set the date', description: 'Saturday, March 14', status: 'done', priority: 'high', completed_at: iso(-3), created_at: iso(-20), updated_at: iso(-3) },
    { id: 'task-done-2', project_id: ID.harbor, title: 'Create the sign-up form', description: null, status: 'done', priority: 'medium', completed_at: iso(-5), created_at: iso(-19), updated_at: iso(-5) },
    { id: 'task-done-3', project_id: ID.harbor, title: 'Draft the budget', description: null, status: 'done', priority: 'low', completed_at: iso(-8), created_at: iso(-18), updated_at: iso(-8) },
    { id: 'task-lab', project_id: ID.lab, title: 'Book the next founder session', description: null, status: 'open', priority: 'medium', created_at: iso(-2), updated_at: iso(-2) },
  );
  db.project_members.push({ project_id: ID.harbor, user_id: ID.dana, role: 'member' }, { project_id: ID.harbor, user_id: ID.sam, role: 'member' }, { project_id: 'p-fridge', user_id: ID.me, role: 'pending' });
  Object.assign(db.projects.find(p => p.id === ID.harbor), { description: 'Planning Charleston’s annual student hackathon: speakers, venue, sponsors and sign-ups.', required_skills: ['Event Planning', 'Public Speaking'] });
  // Record joins and leaves instead of changing anything.
  window.__joined = []; window.joinProjectFromPanel = id => { window.__joined.push(id); };
  return true;
})()`;

const ids = () => evaluate(`window.AssistanceFixtures.ID`);
const overlayText = () => evaluate(`document.getElementById('project-detail-overlay')?.innerText || ''`);
const scroller = `(() => { const o = document.getElementById('project-detail-overlay'); return getComputedStyle(o).overflowY === 'auto' ? o : o.querySelector('.project-detail-panel'); })()`;
async function openProject(id, ...rest) {
  await evaluate(`document.getElementById('project-detail-overlay')?.remove(); window.viewProjectDetails(${JSON.stringify(id)}${rest.map(r => `, ${JSON.stringify(r)}`).join('')}); true`);
  await waitFor(`document.getElementById('project-detail-overlay')`, 'project', 8000);
  await sleep(1500);
}
async function tab(name) {
  await evaluate(`document.querySelector('#pd-tabs [data-tab="${name}"]').click(); true`);
  await sleep(1200);
}
const taskList = () => callInPage(function () {
  // Content of a closed <details> can still report boxes in Chrome; it is
  // not shown, so it does not count as visible.
  const folded = el => { for (let d = el.closest('details'); d; d = d.parentElement?.closest('details')) { if (!d.open && !el.closest('summary')) return true; } return false; };
  const visible = el => !!el && el.getClientRects().length > 0 && !folded(el);
  const root = [...document.querySelectorAll('#project-detail-overlay .pt-panel')].find(visible);
  if (!root) return null;
  return {
    groups: [...root.querySelectorAll('.pt-group-title, .pt-done > summary')].filter(visible).map(el => el.textContent.replace(/\s+/g, ' ').trim()),
    doneOpen: !!root.querySelector('.pt-done')?.open,
    rows: [...root.querySelectorAll('.pt-task')].filter(visible).map(li => ({
      id: li.dataset.taskId,
      title: li.querySelector('.pt-task-title')?.textContent.trim(),
      meta: li.querySelector('.pt-row-meta')?.textContent.trim() || '',
      height: Math.round(li.querySelector('.pt-row').getBoundingClientRect().height),
      expanded: li.querySelector('.pt-row').getAttribute('aria-expanded') === 'true',
      detail: visible(li.querySelector('.pt-detail')) ? li.querySelector('.pt-detail').innerText : '',
      buttons: visible(li.querySelector('.pt-detail')) ? [...li.querySelectorAll('.pt-detail button')].filter(visible).map(b => b.textContent.trim() || b.getAttribute('aria-label')) : [],
    })),
  };
});

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: boot });

  for (const name of ['phone', 'desktop']) {
    const phone = name === 'phone';
    const snap = phone ? phoneShot : shot;
    const workTab = phone ? 'work' : 'tasks';
    console.log(`\nProject entry, ${name} (${VIEWPORTS[name].width}×${VIEWPORTS[name].height})`);
    await loadHome('established', VIEWPORTS[name]);
    await evaluate(seedProject);
    const ID = await ids();

    // ---------------------------------------------------- returning member
    await openProject(ID.harbor);
    const head = await callInPage(function () {
      const o = document.getElementById('project-detail-overlay');
      const next = o.querySelector('#pd-next');
      return {
        title: o.querySelector('.pd-title')?.textContent.trim(), byline: o.querySelector('.pd-byline')?.textContent.replace(/\s+/g, ' ').trim(),
        next: next && !next.hidden ? { kicker: next.querySelector('.pd-next-kicker')?.textContent.trim(), title: next.querySelector('.pd-next-title')?.textContent.trim(), meta: next.querySelector('.pd-next-meta')?.textContent.trim(), progress: next.querySelector('.pd-next-progress')?.textContent.trim(), button: next.querySelector('button')?.textContent.trim() } : null,
        nextTop: next ? Math.round(next.getBoundingClientRect().top) : null,
        involved: o.querySelector('.pd-involved-text')?.textContent.trim(), avatars: o.querySelectorAll('.pd-avatar').length,
        about: o.querySelector('.pd-description')?.textContent.trim(),
        close: (() => { const b = o.querySelector('#pd-close-btn'); const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), label: b.getAttribute('aria-label'), top: Math.round(r.top) }; })(),
        joinButtons: [...o.querySelectorAll('button')].filter(b => /Request to Join/.test(b.textContent)).length,
      };
    });
    check(head.title === 'Harborhack 2026 prep' && /Started by Test Member/.test(head.byline) && /3 people/.test(head.byline) && !/views/.test(head.byline),
      `${name}: the header says what it is, who started it and how many are involved`, JSON.stringify(head));
    check(/Planning Charleston’s annual student hackathon/.test(head.about) && head.avatars === 3 && head.involved === 'Test Member, Dana (fixture) and Sam (fixture)',
      `${name}: Overview says what it’s about and who is involved`, JSON.stringify(head));
    check(head.next?.kicker === 'Next step' && head.next.title === 'select speaker(s)' && head.next.meta === 'In progress · Assigned to you' && head.next.button === 'Open task',
      `${name}: a member sees one next step from their tasks (the one in progress, as Home picks it)`, JSON.stringify(head.next));
    check(head.next?.progress === '3 of 6 tasks done · Last finished: “Set the date”, 3 days ago',
      `${name}: progress is only what the tasks say`, head.next?.progress);
    check(head.joinButtons === 0 && !/You're a member/.test(await overlayText()), `${name}: no join button or membership banner competes for a member`);
    check(head.close.w >= 44 && head.close.h >= 44 && head.close.label === 'Close project' && (!phone || head.close.top >= 59),
      `${name}: a 44px labelled close button, below the iPhone status bar`, JSON.stringify(head.close));
    await snap(`member-overview-${name}`);

    // Work: in progress first, then to do; done folded away.
    await tab(workTab);
    let list = await taskList();
    check(JSON.stringify(list.groups) === '["In progress 1","To do 2","Done 3"]' && !list.doneOpen,
      `${name}: Work lists in progress, then to do; finished work is folded away`, JSON.stringify(list.groups));
    check(JSON.stringify(list.rows.map(r => r.title)) === '["select speaker(s)","Email last year’s sponsors","Book the venue"]',
      `${name}: only active work shows until Done is opened`, JSON.stringify(list.rows.map(r => r.title)));
    check(list.rows.every(r => r.height >= 44 && r.height <= 64 && !r.expanded && !r.detail),
      `${name}: each task is one compact row (44–64px) with its controls tucked away`, JSON.stringify(list.rows.map(r => r.height)));
    check(list.rows[0].meta === 'High priority · You' && list.rows[1].meta.startsWith('Dana (fixture) · Due '),
      `${name}: a row says what matters at a glance`, JSON.stringify(list.rows.map(r => r.meta)));
    check(!/working notes|state:|\{"step"/.test(await overlayText()), `${name}: working notes never show`);
    await snap(`member-work-${name}`);

    // Overview's next step opens exactly that task.
    await tab('overview');
    await evaluate(`document.querySelector('#pd-next [data-next-task]').click(); true`);
    await sleep(1500);
    list = await taskList();
    const opened = list?.rows.find(r => r.expanded);
    const selected = await evaluate(`document.querySelector('#pd-tabs [aria-selected="true"]')?.dataset.tab`);
    check(selected === workTab && opened?.title === 'select speaker(s)' && /^Pick two speakers for the opening\./.test(opened.detail) && !/working notes|state:/.test(opened.detail),
      `${name}: “Open task” opens that task, its description without the working notes`, JSON.stringify({ selected, opened }));
    check(opened?.buttons.join('|') === (phone ? 'Open|In Progress|Done|Work on this or report progress|Edit|Delete task: select speaker(s)' : 'Open|In Progress|Done|Edit|Delete task: select speaker(s)')
      || opened?.buttons.join('|') === (phone ? 'Open|In Progress|Done|Work on this or report progress|Edit|Delete' : 'Open|In Progress|Done|Edit|Delete'),
      `${name}: an open task has its status, ${phone ? 'task assistance, ' : ''}edit and delete`, JSON.stringify(opened?.buttons));
    await snap(`member-task-open-${name}`);

    // Editing keeps the stored working notes.
    await evaluate(`[...document.querySelectorAll('.pt-task')].find(li => /select speaker/.test(li.textContent)).querySelector('[data-action="edit"]').click(); true`);
    await sleep(400);
    const editing = await evaluate(`document.querySelector('.pt-edit-form [data-field="description"]')?.value`);
    check(editing === 'Pick two speakers for the opening.', `${name}: the editor shows only the readable text`, editing);
    await evaluate(`(() => { const f = document.querySelector('.pt-edit-form'); f.querySelector('[data-field="description"]').value = 'Pick three speakers for the opening.'; f.requestSubmit(); return true; })()`);
    await sleep(900);
    const storedAfter = await evaluate(`window.supabase.__db.project_tasks.find(t => t.id === window.AssistanceFixtures.ID.speakerTask).description`);
    check(storedAfter === `Pick three speakers for the opening.\n\n${NOTES}`, `${name}: saving an edit keeps the working notes exactly as stored`, JSON.stringify(storedAfter));

    // A status change moves the task and updates the next step and progress.
    await evaluate(`(() => { const li = [...document.querySelectorAll('.pt-task')].find(li => /Book the venue/.test(li.textContent)); li.querySelector('.pt-row').click(); return true; })()`);
    await sleep(300);
    await evaluate(`[...document.querySelectorAll('.pt-task')].find(li => /Book the venue/.test(li.textContent)).querySelector('[data-action="status"][data-status="done"]').click(); true`);
    await sleep(900);
    list = await taskList();
    const venue = await evaluate(`window.supabase.__db.project_tasks.find(t => t.id === window.AssistanceFixtures.ID.venueTask).status`);
    const said = await evaluate(`document.querySelector('.pt-sr-status')?.textContent`);
    check(venue === 'done' && JSON.stringify(list.groups) === '["In progress 1","To do 1","Done 4"]' && said === '“Book the venue” moved to Done.',
      `${name}: marking a task done moves it to Done and says so`, JSON.stringify({ venue, groups: list.groups, said }));
    await tab('overview');
    const progress = await evaluate(`document.querySelector('#pd-next .pd-next-progress')?.textContent.trim()`);
    check(/^4 of 6 tasks done · Last finished: “Book the venue”, today$/.test(progress), `${name}: the overview’s progress follows`, progress);

    // Done opens on one tap; filters still work.
    await tab(workTab);
    await evaluate(`document.querySelector('.pt-done > summary').click(); true`);
    await sleep(400);
    list = await taskList();
    check(list.doneOpen && ['Book the venue', 'Set the date', 'Create the sign-up form', 'Draft the budget'].every(t => list.rows.some(r => r.title === t)) && list.rows.filter(r => /^Done /.test(r.meta)).length === 4,
      `${name}: one tap shows finished work, newest first`, JSON.stringify(list.rows.map(r => [r.title, r.meta])));
    await evaluate(`(() => { const d = document.querySelector('.pt-done'); d.scrollIntoView({ block: 'start' }); return true; })()`);
    await sleep(300);
    await snap(`member-done-${name}`);
    await evaluate(`(() => { const box = document.querySelector('.pt-filter-box'); box.open = true; const s = document.getElementById('pt-filter-status'); s.value = 'open'; s.dispatchEvent(new Event('change')); return true; })()`);
    await sleep(300);
    list = await taskList();
    check(JSON.stringify(list.rows.map(r => r.title)) === '["Email last year’s sponsors"]' && (await evaluate(`document.querySelector('.pt-filter-box summary').textContent`)) === 'Filter (1)',
      `${name}: filters still narrow the list, and say they are on`, JSON.stringify(list.rows.map(r => r.title)));
    await evaluate(`(() => { const s = document.getElementById('pt-filter-status'); s.value = ''; s.dispatchEvent(new Event('change')); return true; })()`);

    if (phone) {
      // The end of the project clears the bottom bar.
      const end = await callInPage(function () {
        const o = document.getElementById('project-detail-overlay');
        o.scrollTop = o.scrollHeight;
        const panelBottom = o.querySelector('.project-detail-panel').getBoundingClientRect().bottom;
        const navTop = document.getElementById('app-nav').getBoundingClientRect().top;
        return { panelBottom: Math.round(panelBottom), navTop: Math.round(navTop), overflowX: document.documentElement.scrollWidth - innerWidth };
      });
      await sleep(300);
      check(end.panelBottom <= end.navTop && end.overflowX <= 0, `${name}: the end of the project clears the bottom bar; no sideways scrolling`, JSON.stringify(end));
      // A task opens task assistance to work on it or report progress.
      await evaluate(`(() => { const li = [...document.querySelectorAll('.pt-task')].find(li => /Email last year/.test(li.textContent)); li.querySelector('.pt-row').click(); li.querySelector('[data-action="work"]').click(); return true; })()`);
      await waitFor(`document.getElementById('mobile-task-assistance')`, 'task assistance', 8000).catch(() => {});
      await sleep(800);
      check(await evaluate(`!!document.getElementById('mobile-task-assistance') && !document.getElementById('project-detail-overlay') && /Email last year/.test(document.getElementById('mobile-task-assistance').innerText)`),
        `${name}: “Work on this or report progress” opens task assistance for that task`);
      await evaluate(`window.MobileTaskAssistance?.close?.(); document.getElementById('mobile-task-assistance')?.remove(); true`);
      await sleep(300);
    } else {
      // A task link (Home's Continue on desktop) opens that task.
      await evaluate(`document.getElementById('pd-close-btn')?.click(); true`);
      await sleep(300);
      await evaluate(`window.viewProjectTask(window.AssistanceFixtures.ID.harbor, 'task-sponsors'); true`);
      await sleep(2000);
      list = await taskList();
      check(list?.rows.find(r => r.expanded)?.title === 'Email last year’s sponsors' && !list.rows.some(r => /Work on this/.test(r.buttons.join())),
        `${name}: a task link opens that task in the list`, JSON.stringify(list?.rows.filter(r => r.expanded)));
    }
    await evaluate(`document.getElementById('pd-close-btn')?.click(); true`);
    await sleep(300);

    // A member who did not create the project: no delete; leave stays.
    await openProject(ID.lab);
    await tab(workTab);
    await evaluate(`(() => { const li = [...document.querySelectorAll('.pt-task')].find(li => /founder session/.test(li.textContent)); li?.querySelector('.pt-row').click(); return true; })()`);
    await sleep(300);
    list = await taskList();
    const labButtons = list?.rows[0]?.buttons || [];
    check(labButtons.some(b => /^Edit/.test(b)) && !labButtons.some(b => /Delete/.test(b)) && /Leave Project/.test(await overlayText()),
      `${name}: a member can edit but not delete, and can still leave`, JSON.stringify(labButtons));
    await evaluate(`document.getElementById('pd-close-btn')?.click(); true`);

    // ---------------------------------------------------- exploring
    await openProject('p-flood');
    const explore = await callInPage(function () {
      const o = document.getElementById('project-detail-overlay');
      const next = o.querySelector('#pd-next');
      return { kicker: next?.querySelector('.pd-next-kicker')?.textContent.trim(), title: next?.querySelector('.pd-next-title')?.textContent.trim(), match: next?.querySelector('.pd-next-match')?.textContent.trim(), joins: [...o.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Request to Join').length, tasks: !!o.querySelector('#pd-work-tasks, #pd-tab-tasks'), text: o.innerText };
    });
    check(explore.kicker === 'Want to work on this?' && explore.title === 'It needs GIS, Python' && explore.match === 'You list Python',
      `${name}: someone exploring sees what it needs, and what of that they list`, JSON.stringify(explore));
    check(explore.joins === 1 && !explore.tasks && !/Next step|tasks done/.test(explore.text), `${name}: one way to join, at the top; no member task list or progress`, JSON.stringify({ joins: explore.joins, tasks: explore.tasks }));
    await snap(`explorer-overview-${name}`);
    await evaluate(`[...document.querySelectorAll('#project-detail-overlay button')].find(b => b.textContent.trim() === 'Request to Join').click(); true`);
    check(JSON.stringify(await evaluate('window.__joined')) === '["p-flood"]', `${name}: Request to Join uses the existing join path`);
    await openProject('p-fridge');
    const pendingText = await evaluate(`document.querySelector('#pd-next')?.innerText || ''`);
    check(/Your request to join/i.test(pendingText) && /Waiting for Bo \(fixture\) to respond/.test(pendingText) && !(await overlayText()).includes('Request to Join'),
      `${name}: a pending request says so instead of offering to join again`, pendingText);
    await evaluate(`document.getElementById('pd-close-btn')?.click(); true`);
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
  console.log(`\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} project entry checks passed. Screenshots: ${outDir}`);
  process.exit(failed.length ? 1 : 0);
}
