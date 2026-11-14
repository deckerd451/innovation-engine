// Synthetic report only; no production traffic or database access.
import assert from 'node:assert/strict';
import {appHarness} from './helpers/app-harness.mjs';
const app = await appHarness();
try {
 for (const width of [390,1280]) {
  await app.load(width,844);
  await app.evaluate(`window.__visitCalls=[];window.supabase.rpc=async(name,args)=>{window.__visitCalls.push({name,args});return window.__missing?{error:{code:'PGRST202'}}:{data:{separation_version:2,visits:args.p_view==='community'?3:args.p_view==='internal'?4:7,browsers:2,guests:2,members:1,internal_visits:4,community_visits:3,recent:[{last_seen_at:'2026-11-14T12:00:00Z',signed_in:true,internal:args.p_view!=='community'}]}}};window.openAdminPanel();true`);
  await app.wait(`document.querySelector('.visitor-internal-summary')?.textContent.includes('4 visits excluded')`,'report');
  assert.equal(await app.evaluate(`document.querySelector('#visitor-view').value`),'community');
  assert.equal(await app.evaluate(`document.querySelector('#visitor-title').textContent`),'Community visits');
  assert.ok(await app.evaluate(`document.querySelector('#visitor-result').textContent.includes('Member visits')`));
  await app.evaluate(`document.querySelector('#visitor-period').value='0';document.querySelector('#visitor-period').dispatchEvent(new Event('change'));true`);
  await app.wait(`window.__visitCalls.some(c=>c.args.p_days===0)`,'hour');
  for (const [view,total,title] of [['internal','4','Recent admin/browser visits'],['all','7','Recent visits — all activity']]) {
   await app.evaluate(`document.querySelector('#visitor-view').value='${view}';document.querySelector('#visitor-view').dispatchEvent(new Event('change'));true`);
   await app.wait(`document.querySelector('#visitor-result')?.textContent.includes('${title}')`,'view');
   assert.equal(await app.evaluate(`document.querySelector('.visitor-metrics strong').textContent`),total);
   assert.ok(await app.evaluate(`window.__visitCalls.at(-1).args.p_view==='${view}'&&window.__visitCalls.at(-1).name==='get_admin_site_visit_report'`));
  }
  assert.ok(await app.evaluate(`document.querySelector('#visitor-result li').textContent.includes('Admin/browser activity')`));
  assert.ok(!await app.evaluate(`document.querySelector('#admin-tab-content').scrollWidth>document.querySelector('#admin-tab-content').clientWidth+1`));
  await app.evaluate(`window.__missing=true;document.querySelector('#visitor-refresh').click();true`);
  await app.wait(`document.querySelector('#visitor-result')?.textContent.includes('need a database update')`,'migration guard');
  console.log('PASS community default, three views, last hour, labels, layout and migration guard at',width);
 }
} finally {await app.close();}
