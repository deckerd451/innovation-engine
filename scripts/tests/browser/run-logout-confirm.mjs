// Logout regression: every Log out button must show a usable "Log out?"
// confirmation and, once confirmed, sign out.
//
//   node scripts/tests/browser/run-logout-confirm.mjs
//
// Serves this repository locally and opens a harness page in headless Google
// Chrome built from the real index.html: every stylesheet and inline style it
// loads, the shared confirmation dialog, window.dsConfirm, window.doLogout and
// You, the profile (profile.js), where Log out lives. Supabase is a stub and
// window.handleLogout is a recorder, so nothing leaves the machine.
//
// Clicks are real mouse events at screen coordinates (CDP Input), so a dialog
// that opens underneath another layer cannot be clicked and the run fails.
//
// CHROME_PATH overrides the browser; LOGOUT_TEST_ROOT serves another checkout
// (used to confirm the test fails against unfixed code).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.env.LOGOUT_TEST_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..'));
const CHROME = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome');

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const nodePanel = fs.readFileSync(path.join(root, 'assets/js/node-panel.js'), 'utf8');
function extract(re, label) {
  const m = index.match(re);
  if (!m) throw new Error(`index.html: could not find ${label}`);
  return m[0];
}
const stylesheets = [...index.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"[^>]*>/g)]
  .map(m => m[1]).filter(href => !/^(https?:)?\/\//.test(href))
  .map(href => `<link rel="stylesheet" href="/${href}">`).join('\n');
const inlineStyles = [...index.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(m => m[0]).join('\n');
const confirmDialog = extract(/<!-- Reusable confirmation dialog[\s\S]*?<\/script>/, 'the confirmation dialog and window.dsConfirm');
const doLogout = extract(/<script>\s*window\.doLogout = [\s\S]*?<\/script>/, 'window.doLogout');
const youScreen = extract(/<div class="modal" id="profile-modal"[\s\S]*?<div id="modal-profile-content"><\/div>\s*<\/div>\s*<\/div>/, 'You (the profile)');
// The profile side panel's container styles, taken from node-panel.js.
const panelStyle = (nodePanel.match(/panelElement\.id = 'node-side-panel';\s*panelElement\.style\.cssText = `([\s\S]*?)`;/) || [])[1];
if (!panelStyle) throw new Error('node-panel.js: could not find the side panel styles');

const harness = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${stylesheets}
${inlineStyles}
</head>
<body>
<script>
  window.__errors = [];
  window.addEventListener('error', e => window.__errors.push(String(e.message)));
  // Survives the reload doLogout performs; doLogout clears sessionStorage.
  window.handleLogout = async () => {
    localStorage.setItem('__logoutCalls', String(Number(localStorage.getItem('__logoutCalls') || 0) + 1));
  };
  const rows = () => {
    const q = new Proxy({}, { get(_, key) {
      if (key === 'then') return (ok, fail) => Promise.resolve({ data: [], error: null }).then(ok, fail);
      return () => q;
    } });
    return q;
  };
  window.supabase = { from: rows, rpc: async () => ({ data: null, error: null }), auth: { signOut: async () => ({ error: null }) } };
  window.currentUserProfile = { id: '10000000-0000-4000-8000-0000000000ff', name: 'Tester' };
</script>
${confirmDialog}
${doLogout}
${youScreen}
<template id="node-side-panel-template">
  <div id="node-side-panel" style="${panelStyle.replace(/"/g, '&quot;').replace(/\s+/g, ' ')} right: 0;">
    <div style="padding: 1.5rem;">
      <button id="profile-logout-btn" type="button" onclick="window.doLogout?.();">Log out</button>
    </div>
  </div>
</template>
<script src="/profile.js"></script>
</body>
</html>`;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__logout-harness.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(harness); }
  const file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-logout-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((resolve, reject) => {
  let buffer = '';
  chrome.stderr.on('data', chunk => { buffer += chunk; const m = buffer.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
  chrome.on('error', reject);
  setTimeout(() => reject(new Error(`Chrome did not start (${CHROME})`)), 15000);
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
async function waitFor(expression, label, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression).catch(() => false)) return true;
    await sleep(100);
  }
  return false;
}
// Runs fn in the page with args passed as CDP values, not spliced into source.
async function callInPage(fn, ...args) {
  const { result: global } = await send('Runtime.evaluate', { expression: 'globalThis' });
  const result = await send('Runtime.callFunctionOn', { functionDeclaration: fn.toString(), objectId: global.objectId, arguments: args.map(value => ({ value })), awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
// A real mouse click at the centre of the element; whatever is on top there
// receives it, exactly as for a person tapping the screen.
async function clickAt(selector) {
  const box = await callInPage(sel => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    return r && r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  }, selector);
  if (!box) return false;
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  return true;
}
const topmost = selector => callInPage(sel => {
  const el = document.querySelector(sel);
  const r = el?.getBoundingClientRect();
  if (!r || !r.width) return 'not rendered';
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return hit === el || el.contains(hit) ? 'ok' : (hit ? (hit.id ? '#' + hit.id : hit.className || hit.tagName) : 'nothing');
}, selector);

const failures = [];
const check = (ok, label, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${!ok && detail ? ` (${detail})` : ''}`); if (!ok) failures.push(label); };

async function load(width, height, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
  await send('Page.navigate', { url: `${base}/__logout-harness.html` });
  if (!await waitFor(`document.readyState === 'complete' && !!window.openProfileModal && !!window.doLogout`, 'harness')) throw new Error('harness did not load');
  await evaluate(`localStorage.removeItem('__logoutCalls'); true`);
}
const calls = () => evaluate(`Number(localStorage.getItem('__logoutCalls') || 0)`);

// Opens the dialog from a Log out button, checks it is on top and clickable,
// then confirms (or cancels) it with real clicks.
async function scenario(label, open, trigger) {
  console.log(label);
  await open();
  check(await clickAt(trigger), 'Log out button is visible and clickable');
  const opened = await waitFor(`document.getElementById('ds-confirm-modal')?.classList.contains('active')`, 'dialog');
  check(opened, 'clicking Log out opens the "Log out?" confirmation');
  if (!opened) return;
  check(await evaluate(`document.getElementById('ds-confirm-title').textContent`) === 'Log out?', 'dialog asks "Log out?"');
  for (const button of ['#ds-confirm-ok', '#ds-confirm-cancel']) {
    const where = await topmost(button);
    check(where === 'ok', `${button === '#ds-confirm-ok' ? '"Log out"' : '"Stay signed in"'} button is on top, not hidden behind another layer`, `covered by ${where}`);
  }
  return true;
}

try {
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.enable');
  await send('Runtime.enable');

  const openYou = async () => {
    await evaluate(`window.openProfileModal(); true`);
    await waitFor(`!!document.querySelector('#profile-modal.active #btn-profile-logout')`, 'You');
  };
  const openProfilePanel = () => evaluate(`document.body.append(document.getElementById('node-side-panel-template').content.cloneNode(true)); true`);

  // 1. Mobile You → Log out → "Log out" signs out and reloads.
  await load(390, 844, true);
  if (await scenario('Mobile: You → Log out → confirm', openYou, '#btn-profile-logout')) {
    await evaluate(`window.__marker = 1`);
    await clickAt('#ds-confirm-ok');
    const signedOut = await waitFor(`Number(localStorage.getItem('__logoutCalls') || 0) === 1`, 'sign-out');
    check(signedOut, 'confirming calls the Buildspace sign-out (handleLogout) exactly once');
    check(await waitFor(`window.__marker === undefined && document.readyState === 'complete'`, 'reload'), 'page reloads to the sign-in screen afterwards');
  }

  // 2. Same button, "Stay signed in" keeps the session.
  await load(390, 844, true);
  if (await scenario('Mobile: You → Log out → cancel', openYou, '#btn-profile-logout')) {
    await clickAt('#ds-confirm-cancel');
    check(await waitFor(`!document.getElementById('ds-confirm-modal').classList.contains('active')`, 'close'), 'cancelling closes the dialog');
    await sleep(300);
    check(await calls() === 0, 'cancelling does not sign out');
  }

  // 3. Profile side panel → Log out (same doLogout path; the panel is z-index 2000).
  await load(1280, 800, false);
  if (await scenario('Desktop: profile panel → Log out → confirm', openProfilePanel, '#profile-logout-btn')) {
    await clickAt('#ds-confirm-ok');
    check(await waitFor(`Number(localStorage.getItem('__logoutCalls') || 0) === 1`, 'sign-out'), 'confirming calls the Buildspace sign-out (handleLogout) exactly once');
  }

  // 4. Mobile profile panel → Log out.
  await load(390, 844, true);
  if (await scenario('Mobile: profile panel → Log out → confirm', openProfilePanel, '#profile-logout-btn')) {
    await clickAt('#ds-confirm-ok');
    check(await waitFor(`Number(localStorage.getItem('__logoutCalls') || 0) === 1`, 'sign-out'), 'confirming calls the Buildspace sign-out (handleLogout) exactly once');
  }

  const errors = await evaluate('window.__errors.slice()').catch(() => []);
  if (errors.length) console.log(`  page errors (not failures): ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
} catch (error) {
  failures.push(String(error?.message || error));
  console.error(error);
} finally {
  socket.close();
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  server.close();
  fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

if (failures.length) {
  console.error(`\n❌ ${failures.length} logout check(s) failed`);
  process.exit(1);
}
console.log('\n✅ logout checks passed');
