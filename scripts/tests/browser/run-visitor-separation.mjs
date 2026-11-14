// Synthetic report only; no production traffic or database access.
import assert from 'node:assert/strict';
import {appHarness} from './helpers/app-harness.mjs';
const app = await appHarness();
try {
 for (const width of [390,1280]) {
  await app.load(width,844);
  await app.evaluate(`window.__visitCalls=[];window.supabase.rpc=async(name,args)=>{window.__visitCalls.push({name,args});return {data:window.__oldReport?{visits:99}:{separation_version:2,visits:args.p_exclude_self?3:7,browsers:2,guests:2,members:1,internal_visits:4,community_visits:3,recent:[{last_seen_at:'2026-11-14T12:00:00Z',signed_in:true,internal:!args.p_exclude_self}]}}};window.openAdminPanel();true`);
  await app.wait(`document.querySelector('#visitor-result')?.textContent.includes('Community traffic: 3 visits.')`,'report');
  assert.equal(await app.evaluate(`document.querySelector('#visitor-self').checked`),false);
  await app.evaluate(`document.querySelector('#visitor-period').value='0';document.querySelector('#visitor-period').dispatchEvent(new Event('change'));true`);
  await app.wait(`window.__visitCalls.some(c=>c.args.p_days===0)`,'hour');
  await app.evaluate(`document.querySelector('#visitor-self').click();true`);
  await app.wait(`document.querySelector('#visitor-result')?.textContent.includes('Combined traffic')`,'combined');
  assert.ok(await app.evaluate(`document.querySelector('#visitor-result li').textContent.includes('Admin/browser activity')`));
  await app.evaluate(`window.__oldReport=true;document.querySelector('#visitor-refresh').click();true`);
  await app.wait(`document.querySelector('#visitor-result')?.textContent.includes('separation needs database setup')`,'migration guard');
  assert.ok(!await app.evaluate(`document.querySelector('#visitor-result').textContent.includes('99')`));
  console.log('PASS visitor separation, last hour, combined label and migration guard at',width);
 }
} finally {await app.close();}
