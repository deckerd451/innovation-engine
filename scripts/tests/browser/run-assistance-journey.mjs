// Rendered mobile journey for the accomplishment experience.
//
//   node scripts/tests/browser/run-assistance-journey.mjs [outDir]
//
// Serves this repository locally, opens the real index.html in headless
// Google Chrome at iPhone dimensions, and replaces only supabaseClient.js with
// a stub backed by the test-only fake client and fixtures in
// scripts/tests/fixtures. Taps are dispatched at element coordinates, so a
// control hidden behind another surface fails the run. Screenshots are
// written to outDir for human inspection. Requires Google Chrome; it is not
// part of `npm test` because it needs a browser.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'buildspace-journey'));
fs.mkdirSync(outDir, { recursive: true });
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };

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

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((resolve, reject) => {
  let buffer = '';
  chrome.stderr.on('data', chunk => { buffer += chunk; const m = buffer.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
  setTimeout(() => reject(new Error('Chrome did not start')), 15000);
});
const targets = await (await fetch(wsUrl.replace('ws://', 'http://').replace(/\/devtools\/browser\/.*/, '/json/list'))).json();
const socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve));
let seq = 0;
const pending = new Map();
const consoleErrors = [];
socket.addEventListener('message', event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
  if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
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
  while (Date.now() - start < timeout) { if (await evaluate(`!!(${expression})`).catch(() => false)) return; await sleep(100); }
  throw new Error(`Timed out waiting for ${label}`);
}
const results = [];
function check(ok, label, detail = '') { results.push({ ok: Boolean(ok), label, detail }); console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`); }
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}
// Tap at the element's centre after scrolling it into view. Fails if a
// different surface owns that point (ghost screens, tab bar overlap).
// Home's "Have an idea?" finds people and projects and no longer opens the
// objective worksheet; the worksheet is kept (and still tested here), opened
// directly the way it is for a typed objective.
async function openObjective(text) {
  await evaluate(`window.MobileTaskAssistance.openObjective(${JSON.stringify(text)}); true`);
}

// Home lists the member's projects (Your community) rather than picking a
// task; a task opens assistance from its project's Work: the project, Work,
// the task, then "Work on this or report progress".
const MINE = '#mobile-you-content [data-home="mine"] [data-project-id]';
async function openSpeakerTask() {
  await tap('#mobile-you-content [data-home="mine"] [data-project-id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]', 'Harborhack in Your community');
  await waitFor(`document.querySelector('#pd-tabs [data-tab="work"]')`, 'project');
  await sleep(600);
  await tap('#pd-tabs [data-tab="work"]', 'Work');
  await waitFor(`document.querySelector('.pt-task[data-task-id="dddddddd-dddd-4ddd-8ddd-dddddddddddd"] .pt-row')`, 'tasks');
  await tap('.pt-task[data-task-id="dddddddd-dddd-4ddd-8ddd-dddddddddddd"] .pt-row', 'select speaker(s)');
  await waitFor(`document.querySelector('.pt-task[data-task-id="dddddddd-dddd-4ddd-8ddd-dddddddddddd"] [data-action="work"]')?.getClientRects().length`, 'task actions');
  await tap('.pt-task[data-task-id="dddddddd-dddd-4ddd-8ddd-dddddddddddd"] [data-action="work"]', 'Work on this or report progress');
}

async function tap(selector, label = selector) {
  const info = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { missing: true };
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const bar = document.getElementById('app-nav');
    const barTop = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : innerHeight;
    return { x, y, owns: !!hit && (hit === el || el.contains(hit)), hit: hit ? (hit.id || hit.className || hit.tagName) : null, clear: el.closest('#app-nav') ? true : r.bottom <= barTop + 1 };
  })()`);
  if (info.missing) throw new Error(`Missing ${label}`);
  if (!info.owns || !info.clear) throw new Error(`${label} is obscured (hit: ${info.hit}, clear of tab bar: ${info.clear})`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: info.x, y: info.y }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(250);
}
async function type(selector, text) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await send('Input.insertText', { text });
  await sleep(100);
}
async function select(selector, value) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}
const surfaceReport = () => evaluate(`(() => {
  const visible = el => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
  const centre = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  return {
    overlays: document.querySelectorAll('#mobile-task-assistance').length,
    youVisible: visible(document.getElementById('mobile-you-screen')) && !document.getElementById('mobile-you-screen').hidden,
    centreOwner: centre?.closest('#mobile-task-assistance') ? 'assistance' : centre?.closest('#mobile-you-screen') ? 'my-space' : centre?.closest('#command-dashboard') ? 'dashboard' : centre?.closest('#synapse-main-view') ? 'graph' : (centre?.id || centre?.tagName),
    goalForms: document.querySelectorAll('.home-idea-form').length,
    bodyScroll: document.scrollingElement.scrollHeight > innerHeight + 2 && getComputedStyle(document.body).overflow !== 'hidden',
  };
})()`);

const fixtures = fs.readFileSync(path.join(root, 'scripts/tests/fixtures/assistance-fixtures.js'), 'utf8');
const fake = fs.readFileSync(path.join(root, 'scripts/tests/fixtures/fake-supabase.js'), 'utf8');

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', VIEWPORT);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `${fixtures}\n${fake}\n(() => {
    const seed = window.AssistanceFixtures.seed();
    const session = { access_token: 'fixture', user: { id: 'auth-me', email: 'member@example.test' } };
    window.supabase = window.createFakeSupabase(seed, { session });
    window.__fixtureProfile = seed.community[0];
    try { localStorage.clear(); } catch (_) {}
  })();` });
  await send('Page.navigate', { url: `${base}/index.html` });
  await waitFor(`document.readyState === 'complete'`, 'page load', 20000);
  // If the auth bootstrap does not adopt the fixture session on its own, sign
  // the fixture member in the way auth.js does once a profile is loaded.
  await sleep(2500);
  const adopted = await evaluate(`!!window.currentUserProfile?.id`);
  if (!adopted) {
    await evaluate(`(() => { window.currentUserProfile = window.__fixtureProfile; document.querySelectorAll('#login-section, .login-overlay, #auth-container').forEach(el => el.style.display = 'none'); window.dispatchEvent(new CustomEvent('profile-loaded', { detail: { user: { id: 'auth-me' }, profile: window.__fixtureProfile } })); })()`);
  }
  check(true, `Fixture member ${adopted ? 'signed in through the app’s own auth bootstrap' : 'injected after auth bootstrap (login screen bypassed for the test)'}`);
  await evaluate(`document.querySelector('#app-nav [data-destination="home"]')?.click()`);
  await waitFor(`document.querySelector('${MINE}')`, 'My Space: Your community', 15000);
  await sleep(400);
  await shot('01-my-space');
  let s = await surfaceReport();
  check(s.youVisible && s.centreOwner === 'my-space', 'My Space owns the viewport', JSON.stringify(s));
  check(s.goalForms === 1, 'Exactly one objective entry is mounted', `forms=${s.goalForms}`);
  const mine = await evaluate(`document.querySelector('#mobile-you-content [data-home="mine"]')?.textContent || ''`);
  check(/Harborhack 2026 prep/.test(mine) && !(await evaluate(`!!document.querySelector('#mobile-you-content [data-next-task]')`)), 'Scenario A: My Space lists the member’s projects, without ranking a task', mine);
  check(!(await evaluate(`/Python/.test(document.getElementById('mobile-you-content').textContent)`)), 'Profile details are not shown as the objective');

  // Scenario A: from the project's Work to substantive help.
  await openSpeakerTask();
  await waitFor(`document.querySelector('#mobile-task-assistance #mta-title')`, 'assistance');
  await waitFor(`!/Checking shared methods/.test(document.querySelector('[data-mta-community-body]')?.textContent || '')`, 'community help');
  await shot('02-speaker-assistance-top');
  check((await evaluate(`document.querySelector('#mta-title').textContent`)) === 'select speaker(s)', 'Opens that exact task (from the project’s Work)');
  check(await evaluate(`/choosing speakers/.test(document.querySelector('.mta-interpretation').textContent)`), 'Interprets the objective as speaker selection, labelled and correctable');
  check(await evaluate(`!!document.querySelector('[data-ai-matrix-block="shortlist"]') && document.querySelectorAll('[data-ai-check="criteria"]').length >= 5`), 'Substantive intervention: criteria checklist + scoring shortlist');
  const community = await evaluate(`document.querySelector('[data-mta-community-body]').textContent`);
  check(!/customer interviews/i.test(community), 'Customer-interview demo method is not recommended for speakers');
  check(/Recruit hackathon speakers through sponsors/.test(community) && /Also about choosing speakers/.test(community), 'Relevant authorized community method shown with its reason');
  check(/Dana/.test(community) && !/Riley|Jordan|Sam/.test(community), 'Only the accepted connection with a relevant listed skill is suggested');
  check(/doesn’t mean they’re available/.test(community), 'Connection is not presented as availability or expertise');
  check(!/Keynote speaker shortlist for investor day/.test(community), 'Private package of another member never appears');
  check(await evaluate(`!/Check connected people/.test(document.getElementById('mobile-task-assistance').textContent)`), 'No directory-only primary action');

  await type('[data-ai-matrix="shortlist"][data-row="0"][data-name]', 'Candidate A');
  for (const [c, v] of [['fit', '3'], ['delivery', '2'], ['available', '3'], ['cost', '3']]) await select(`[data-ai-matrix="shortlist"][data-row="0"][data-criterion="${c}"]`, v);
  await type('[data-ai-matrix="shortlist"][data-row="1"][data-name]', 'Candidate B');
  for (const [c, v] of [['fit', '2'], ['delivery', '1']]) await select(`[data-ai-matrix="shortlist"][data-row="1"][data-criterion="${c}"]`, v);
  const ranking = await evaluate(`document.querySelector('[data-ai-matrix-result="shortlist"]').textContent`);
  check(/Leading: Candidate A \(11\/12\)/.test(ranking), 'Shortlist ranks the member’s own candidates live', ranking);
  await shot('03-shortlist-ranked');
  await tap('[data-mta-save]', 'Save to this task');
  await waitFor(`document.querySelector('[data-mta-go-report]')`, 'save confirmation');
  check(await evaluate(`document.activeElement?.matches('[data-mta-go-report]')`), 'After saving, the primary action becomes reporting what happened (focused)');
  await tap('[data-mta-go-report]', 'Report what happened');
  const savedDescription = await evaluate(`window.supabase.__db.project_tasks.find(t => t.title === 'select speaker(s)').description`);
  check(/Buildspace working notes/.test(savedDescription) && /Candidate A/.test(savedDescription), 'Work is saved into the existing task record');

  await tap('[data-mta-kind="Took this step"]', 'I did this step');
  await type('[data-mta-report-note]', 'Shortlist agreed with co-organizers');
  await tap('[data-mta-report]', 'Save update');
  await waitFor(`document.querySelector('#mta-next-title')?.textContent === 'Invite your top choices'`, 'next step');
  const invite = await evaluate(`document.querySelector('[data-ai-message="invitation"]').value`);
  check(/^Hi Candidate A/.test(invite) && /Harborhack 2026/.test(invite), 'Next step prepares an invitation to the top candidate for this event');
  const task = await evaluate(`window.supabase.__db.project_tasks.find(t => t.title === 'select speaker(s)')`);
  check(task.status === 'in_progress', 'Reported progress marks the task started, not complete', task.status);
  check(await evaluate(`/Last update/.test(document.querySelector('.mta-last')?.textContent || '')`), 'Progress is reflected immediately');
  check(await evaluate(`/Save what worked/.test(document.querySelector('.mta-share summary')?.textContent || '')`), 'Learning capture offered after a reported step');
  await shot('04-invite-step');
  await type('[data-ai-key="invite.date"]', 'Nov 14, Charleston Tech Center');
  check(/on Nov 14, Charleston Tech Center/.test(await evaluate(`document.querySelector('[data-ai-message="invitation"]').value`)), 'Typing into the brief updates the prepared invitation');
  const primary = await evaluate(`(() => { const b = document.querySelector('.mta-primary'); b.scrollIntoView({ block: 'end' }); const r = b.getBoundingClientRect(); const bar = document.getElementById('app-nav').getBoundingClientRect(); return { bottom: r.bottom, barTop: bar.top }; })()`);
  check(primary.bottom <= primary.barTop, 'Primary action is fully above the bottom navigation', JSON.stringify(primary));
  await shot('05-primary-above-tabbar');

  // Return to My Space without losing context.
  await tap('[data-mta-back]', 'Back to My Space');
  await waitFor(`!document.getElementById('mobile-task-assistance') && document.querySelector('${MINE}')`, 'My Space');
  s = await surfaceReport();
  check(s.overlays === 0 && s.centreOwner === 'my-space', 'Back returns to My Space; no leftover overlay', JSON.stringify(s));
  await shot('06-my-space-after-progress');
  await openSpeakerTask();
  await waitFor(`document.querySelector('#mta-next-title')?.textContent === 'Invite your top choices'`, 'resumed step');
  check(true, 'Scenario D: returning resumes at the next unresolved step with no re-entry');

  // Tab switching while assistance is open must not leave a ghost surface.
  await tap('#app-nav [data-destination="explore"]', 'Explore');
  await sleep(700);
  s = await surfaceReport();
  check(s.overlays === 0 && !s.youVisible && s.centreOwner !== 'my-space' && s.centreOwner !== 'assistance', 'Explore owns the viewport after switching from open assistance', JSON.stringify(s));
  check(await evaluate(`!document.querySelector('.buildspace-view-switcher, #cd-mobile-discover-mode, #mobile-tab-bar')`), 'No second navigation on mobile Explore');
  await shot('07-explore');
  // Network has no tab: You → Your Network.
  await tap('#app-nav [data-destination="you"]', 'You');
  await sleep(700);
  await tap('#btn-open-your-network', 'Your Network');
  await sleep(700);
  s = await surfaceReport();
  check(s.overlays === 0 && !s.youVisible, 'Community owns the viewport', JSON.stringify(s));
  await shot('08-community');
  for (let round = 0; round < 2; round++) {
    await tap('#app-nav [data-destination="home"]', 'Home');
    await waitFor(`document.querySelector('${MINE}')`, 'My Space');
    await openSpeakerTask();
    await waitFor(`document.querySelector('#mta-title')`, 'assistance');
    await evaluate(`document.querySelector('.mta-panel').scrollTop = 99999`);
    await tap('#app-nav [data-destination="explore"]', 'Explore');
    await sleep(400);
  }
  await tap('#app-nav [data-destination="home"]', 'Home');
  await waitFor(`document.querySelector('${MINE}')`, 'My Space');
  s = await surfaceReport();
  check(s.overlays === 0 && s.goalForms === 1 && s.centreOwner === 'my-space', 'Repeated navigation leaves exactly one surface and one objective entry', JSON.stringify(s));

  // Scenario H / C: unfamiliar objective, no community knowledge.
  await openObjective('Learn conversational Spanish before my trip in May');
  await waitFor(`document.querySelector('#mta-title')`, 'objective assistance');
  await sleep(500);
  check(await evaluate(`/What’s in the way right now/.test(document.getElementById('mobile-task-assistance').textContent) && /doesn’t have a guide/.test(document.getElementById('mobile-task-assistance').textContent)`), 'Unfamiliar objective: one clarifying question with an honest limitation');
  await shot('09-unfamiliar-objective');
  await tap('[data-mta-obstacle="decide"]', 'I have to choose between options');
  check(await evaluate(`!!document.querySelector('[data-ai-matrix-block="options"]')`), 'Answer produces a usable decision matrix (no project required)');
  await waitFor(`!/Checking shared methods/.test(document.querySelector('[data-mta-community-body]')?.textContent || '')`, 'community help');
  check(await evaluate(`/No shared method, connected member, or project of yours matches this yet/.test(document.querySelector('[data-mta-community-body]').textContent)`), 'Scenario C: honest empty community state, no weak matches');
  await shot('10-decision-matrix');
  await tap('.mta-else summary', 'Something else in the way?');
  await tap('.mta-else [data-mta-obstacle="people"]', 'I need someone with specific skills');
  await type('[data-ai-key="need.skill"]', 'React');
  await waitFor(`/Sam/.test(document.querySelector('[data-mta-community-body]')?.textContent || '')`, 'people matched on typed skill');
  check(await evaluate(`/Their profile skills include “React”/.test(document.querySelector('[data-mta-community-body]').textContent)`), 'A typed skill finds the matching accepted connection, with its reason');
  await shot('10b-help-request-people');
  await tap('[data-mta-close]', 'Close');

  // Scenario B: business idea validation, demo method labelled.
  await openObjective('Validate my business idea for a campus food app');
  await waitFor(`/validating an idea/.test(document.querySelector('.mta-interpretation')?.textContent || '')`, 'validation assistance');
  await waitFor(`!/Checking shared methods/.test(document.querySelector('[data-mta-community-body]')?.textContent || '')`, 'community help');
  const validationCommunity = await evaluate(`document.querySelector('[data-mta-community-body]').textContent`);
  check(/customer interviews/i.test(validationCommunity) && /Demonstration example · untested/.test(validationCommunity), 'Scenario B: demo interview method shown only here, labelled demonstration/untested');
  check(await evaluate(`document.querySelectorAll('[data-ai-key^="assumption."]').length >= 5`), 'Concrete validation brief rendered before any project setup');
  await shot('11-validation');
  await tap('[data-mta-save-objective]', 'Save to a project');
  await waitFor(`document.querySelector('[data-pick-project]')`, 'project choice');
  const options = await evaluate(`[...document.querySelectorAll('[data-pick-project] strong')].map(n => n.textContent)`);
  check(options.includes('Harborhack 2026 prep') && options.includes('Startup lab') && !options.includes('Investor day'), 'Only the member’s own projects are offered', options.join(', '));
  await tap('[data-pick-project]', 'Pick project');
  await waitFor(`document.querySelector('[data-mta-go-report]') && document.querySelector('.mta-context')?.textContent.includes('Harborhack')`, 'converted to task');
  const created = await evaluate(`window.supabase.__db.project_tasks.find(t => t.title === 'Validate my business idea for a campus food app')`);
  check(created && /idea-validation/.test(created.description || ''), 'Saving creates one task in an existing project, carrying the brief');
  await shot('12-validation-saved');
  await tap('[data-mta-close]', 'Close');

  // Scenario E: another team's task is not reachable from the client.
  await evaluate(`window.viewProjectTask('${'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}', '${'ffffffff-ffff-4fff-8fff-ffffffffffff'}')`);
  await waitFor(`/isn’t available to you/.test(document.getElementById('mobile-task-assistance')?.textContent || '')`, 'denied state');
  check(!(await evaluate(`/Private shortlist|investor day/i.test(document.getElementById('mobile-task-assistance').textContent)`)), 'Scenario E: unauthorized task content never renders');
  await shot('13-permission-denied');
  await tap('[data-mta-own-objective]', 'Safe alternative');
  await sleep(500);
  s = await surfaceReport();
  check(s.overlays === 0 && s.centreOwner === 'my-space' && await evaluate(`document.activeElement?.id === 'home-idea-input'`), 'Denied task offers a safe alternative: Home’s idea entry, focused', JSON.stringify(s));
  // Desktop regression smoke: the mobile surfaces stay out of the way and
  // the existing project-task path is still what a task link opens.
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36' });
  await send('Page.reload');
  await waitFor(`document.readyState === 'complete' && window.CapabilityMemory && window.AssistanceEngine`, 'desktop load', 20000);
  await sleep(2000);
  const desktop = await evaluate(`(() => { const nav = document.getElementById('app-nav').getBoundingClientRect(); return { you: getComputedStyle(document.getElementById('mobile-you-screen')).display, navLeft: nav.left, navTall: nav.height >= innerHeight - 1 }; })()`);
  check(desktop.you === 'none' && desktop.navLeft === 0 && desktop.navTall, 'Desktop: the mobile Home screen stays hidden and the navigation is the side bar', JSON.stringify(desktop));
  await evaluate(`window.viewProjectTask('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')`);
  await sleep(1500);
  check(await evaluate(`!document.getElementById('mobile-task-assistance')`), 'Desktop: task links keep using the existing project view');
  await shot('14-desktop');
  const appErrors = consoleErrors.filter(text => /assistance|MobileYou|mobile-nav|capability|mobile-goal/i.test(text || ''));
  check(appErrors.length === 0, 'No uncaught errors from the journey modules', appErrors.join(' | '));
} catch (error) {
  check(false, 'Journey aborted', error.message);
  await shot('zz-failure').catch(() => {});
} finally {
  socket.close();
  chrome.kill();
  server.close();
  await new Promise(resolve => { chrome.once('exit', resolve); setTimeout(resolve, 3000); });
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) { /* temp profile; OS cleans it */ }
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} rendered checks passed. Screenshots: ${outDir}`);
  process.exit(failed.length ? 1 : 0);
}
