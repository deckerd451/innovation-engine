// Local browser regression for the admin shell and visitor collector.
// Install Playwright separately, then: node scripts/tests/browser/run-admin-visitors.mjs [output-directory]
// Optional PLAYWRIGHT_MODULE and CHROME_PATH select locally installed test tools.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const output = path.resolve(process.argv[2] || '/tmp/ie-admin-visitors');
fs.mkdirSync(output, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/visitor-harness') {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><html><head><link rel="stylesheet" href="/assets/css/admin-panel.css"></head><body style="background:#0a0e27;color:white;font-family:Arial"></body></html>');
    return;
  }
  const file = path.resolve(root, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  for (const [width, height] of [[1280,720], [1024,600], [390,844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/visitor-harness');
    await page.evaluate(() => {
      window.calls = [];
      window.supabase = { rpc: async (name, args) => {
        window.calls.push({name, args});
        return window.failure ? { error: { code: window.failure } } : { data: {
          visits: 4, browsers: 3, guests: 3, members: 1,
          recent: [{ last_seen_at: '2026-11-12T12:00:00Z', signed_in: false }]
        }};
      }};
    });
    await page.addScriptTag({url: origin + '/assets/js/dashboard-actions.js'});
    await page.evaluate(() => window.openAdminPanel());
    await page.getByText('Estimated browsers', {exact: true}).waitFor();
    if (await page.locator('.visitor-metrics strong').first().textContent() !== '4') throw Error('Wrong total');
    if (!await page.evaluate(() => window.calls[0].args.p_exclude_self)) throw Error('Self not excluded');
    await page.getByLabel('Include my visits').check();
    await page.waitForFunction(() => window.calls.length === 2);
    if (await page.evaluate(() => window.calls[1].args.p_exclude_self)) throw Error('Self toggle ignored');
    await page.getByLabel('Period').selectOption('7');
    await page.waitForFunction(() => window.calls.some(call => call.args.p_days === 7));
    const clipped = await page.evaluate(() => {
      const panel = document.querySelector('#admin-panel');
      return panel.scrollWidth > panel.clientWidth + 1 || panel.getBoundingClientRect().right > innerWidth + 1;
    });
    if (clipped) throw Error('Panel clips content at ' + width);
    await page.screenshot({path: path.join(output, `visitors-${width}.png`)});
    await page.evaluate(() => window.failure = 'PGRST202');
    await page.getByRole('button', {name: 'Refresh', exact: true}).click();
    await page.getByText(/Visitor logging needs database setup/).waitFor();
    await page.evaluate(() => window.failure = '42501');
    await page.getByRole('button', {name: 'Refresh', exact: true}).click();
    await page.getByText(/Check your admin access/).waitFor();
    await page.getByRole('button', {name: 'Detailed member analytics'}).click();
    await page.getByText('Ecosystem Analytics', {exact: true}).waitFor();
    await page.route('**/adminPeopleService.js?*', route => route.fulfill({contentType:'text/javascript', body: `
      export async function listPeople({page=0,pageSize=50}={}){return {data:Array.from({length:Math.min(pageSize,85-page*pageSize)},(_,i)=>({id:'person-'+(page*pageSize+i),name:'Example Member '+(page*pageSize+i+1),email:'member'+i+'@example.com',user_role:'Member',created_at:'2026-11-01T12:00:00Z'})),count:85,error:null};}
      export async function getClaimStats(){return {total:85,claimed:23,unclaimed:62};}
      export const getPerson = async()=>({});
      export const updatePerson=getPerson,setRole=getPerson,setHidden=getPerson,setDisabled=getPerson,
      bulkUpdate=getPerson,deletePerson=getPerson,createPerson=getPerson,getEmailsForPeople=getPerson;
    `}));
    await page.route('**/supabaseClient.js*', route => route.fulfill({contentType:'text/javascript',body:'export const supabase=window.supabase;'}));
    await page.evaluate(url => import(url), origin + '/assets/js/adminPeoplePanel.js');
    await page.getByRole('button', {name:'People', exact:true}).click();
    await page.locator('.admin-people-filters').waitFor();
    if (await page.locator('.admin-people-filters').getAttribute('open') !== null) throw Error('Secondary filters expanded by default');
    await page.getByText('More filters', {exact:false}).click();
    await page.locator('#filter-role').selectOption('Admin');
    await page.getByText('Clear all', {exact:false}).click();
    if (await page.locator('#filter-role').inputValue() !== '') throw Error('Clear filters failed');
    await page.screenshot({path:path.join(output, `people-${width}.png`)});
    await page.getByText('More filters', {exact:false}).click();
    const row = page.locator(width > 768 ? '.person-row' : '.person-card').first();
    await row.scrollIntoViewIfNeeded();
    const readable = await row.evaluate(element => {
      const bounds=element.getBoundingClientRect();
      const content=document.querySelector('#admin-tab-content').getBoundingClientRect();
      const panel=document.querySelector('#admin-panel');
      return bounds.top>=content.top-1 && bounds.bottom<=content.bottom+1 && panel.scrollTop===0;
    });
    if (!readable) throw Error('Person row hidden by panel chrome at '+width);
    await page.screenshot({path:path.join(output, `readable-people-${width}.png`)});
    const next = page.getByRole('button', {name:'Next',exact:true});
    await next.scrollIntoViewIfNeeded(); await next.click();
    await page.getByText('Showing 51-85 of 85 people', {exact:true}).waitFor();
    await page.evaluate(url=>import(url),origin+'/assets/js/adminPrivacyPanel.js');
    await page.getByRole('button',{name:'Privacy',exact:true}).click();
    await page.locator('#admin-privacy-tbody tr').first().waitFor();
    await page.locator('#admin-privacy-tbody tr').last().scrollIntoViewIfNeeded();
    if (await page.locator('.admin-about').getAttribute('open')!==null) throw Error('Privacy help expanded by default');
    if (await page.evaluate(()=>document.querySelector('#admin-tab-content').scrollWidth>document.querySelector('#admin-tab-content').clientWidth+1)) throw Error('Content clips horizontally');
    if (errors.length) throw Error(errors.join('\n'));
    console.log('PASS admin reporting, self filter, period, errors, analytics and layout:', width);
    await page.close();
  }
  const page = await browser.newPage();
  await page.route('**/supabaseClient.js?*', route => route.fulfill({contentType: 'text/javascript', body: `
    window.visitCalls = []; window.actor = null;
    export const supabase = {
      auth: {
        getSession: async () => ({data:{session:null}}),
        onAuthStateChange: callback => { window.authChange = callback; callback('INITIAL_SESSION', null); }
      },
      rpc: async (name,args) => { window.visitCalls.push({name,args}); return {}; }
    };`
  }));
  await page.goto(origin + '/visitor-harness');
  await page.addScriptTag({type: 'module', url: origin + '/assets/js/site-visits.js'});
  await page.waitForFunction(() => window.visitCalls?.length === 1);
  const first = await page.evaluate(() => window.visitCalls[0]);
  await page.reload();
  await page.addScriptTag({type: 'module', url: origin + '/assets/js/site-visits.js'});
  await page.waitForFunction(() => window.visitCalls?.length === 1);
  if (await page.evaluate(() => window.visitCalls[0].args.p_session_id) !== first.args.p_session_id) throw Error('Reload duplicated guest visit');
  await page.evaluate(() => window.authChange('SIGNED_IN', {user:{id:'member-id'}}));
  await page.waitForFunction(() => window.visitCalls.length === 2);
  const calls = await page.evaluate(() => window.visitCalls);
  if (calls[0].args.p_session_id !== calls[1].args.p_session_id) throw Error('Sign-in duplicated guest visit');
  await page.close();
  const privatePage = await browser.newPage();
  await privatePage.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', {value:true}));
  await privatePage.goto(origin + '/visitor-harness');
  await privatePage.route('**/supabaseClient.js?*', route => route.fulfill({contentType:'text/javascript',body:'export const supabase = {};'}));
  await privatePage.evaluate(url => import(url), origin + '/assets/js/site-visits.js');
  if (await privatePage.evaluate(() => localStorage.getItem('ie_visit_browser_v1')) !== null) throw Error('Privacy preference ignored');
  console.log('PASS anonymous collection, duplicate auth events, sign-in upgrade, reload reuse and privacy preference');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
