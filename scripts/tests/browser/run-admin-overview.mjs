// Actual admin UI with synthetic aggregates; no production network requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {appHarness} from './helpers/app-harness.mjs';
const require = createRequire(import.meta.url);
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const app = await appHarness();
const run = app.evaluate, wait = app.wait;
let passed = 0;
function check(ok,label) { assert.ok(ok,label); console.log('PASS',label); passed++; }
try {
 for (const width of [1280,390]) {
  await app.load(width,844);
  await run(`window.__from=window.supabase.from.bind(window.supabase);window.supabase.from=(table)=>{const q=window.__from(table),select=q.select.bind(q);q.select=(columns,options)=>options?.head?{then:resolve=>resolve({count:85,error:null}),not:()=>Promise.resolve({count:23,error:null})}:select(columns,options);q.range=(start,end)=>q.limit(end-start+1);return q;};window.__hubMode='success';window.__hubCalls=[];window.__originalRpc=window.supabase.rpc.bind(window.supabase);window.supabase.rpc=async(name,args)=>{window.__hubCalls.push({name,args});if(name==='get_admin_site_visit_report'){if(window.__hubMode==='hold')await new Promise(resolve=>window.__hubResolve=resolve);if(window.__hubMode==='failure')return {error:{code:'NETWORK'}};return {data:{separation_version:2,visits:12,members:4,guests:8,internal_visits:30,community_visits:12,browsers:9,recent:[],daily:window.__hubMode==='missing'?undefined:[{day:'2026-11-13',visits:5},{day:'2026-11-14',visits:7}]}};}if(name==='get_admin_network_analytics')return window.__hubMode==='failure'?{error:{code:'NETWORK'}}:{data:{total_members:85,active_members:6,active_projects:4,open_opportunities:3,total_connections:15,isolated_members_count:72,new_members_30d:2,new_connections_30d:1}};if(name==='get_admin_unconnected_members')return {data:{total:1,members:[{id:window.supabase.__db.community[0].id,name:'Synthetic Review',skills:['Web']}]}};return window.__originalRpc(name,args);};window.openAdminPanel();true`);
  await wait(`document.querySelector('.admin-hub-status')?.textContent.includes('Reports updated')`,'overview');
  check(await run(`document.querySelector('#admin-panel [data-tab=overview]').getAttribute('aria-pressed')==='true'&&document.querySelector('.admin-hub-metrics strong').textContent==='12'`),'Overview is the default with actual traffic totals at '+width);
  check(await run(`document.querySelectorAll('.admin-hub-chart li').length===2&&document.querySelector('.admin-hub-chart').textContent.includes('11-14')`),'Daily chart uses supplied counts and UTC dates');
  check(await run(`document.querySelector('.admin-hub-planned').textContent.includes('Not yet available')`),'Uncollected metrics are explicitly unavailable');
  check(await run(`document.querySelector('#admin-tab-content').scrollWidth<=document.querySelector('#admin-tab-content').clientWidth+1&&document.querySelector('#admin-panel').getBoundingClientRect().right<=innerWidth+1`),'Overview fits viewport without horizontal content clipping');
  await run(axe+';true');
  const violations=await run(`axe.run(document.querySelector('#admin-panel'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))`);
  check(!violations.length,'Overview accessibility: '+JSON.stringify(violations));
  const shot=await app.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/admin-overview-'+width+'.png',Buffer.from(shot.data,'base64'));
  await run(`[...document.querySelectorAll('.admin-hub-action')].find(b=>b.textContent.includes('unclaimed accounts')).click();true`);
  await wait(`document.querySelector('#filter-claimed')?.value==='false'`,'unclaimed follow-up');
  check(await run(`document.querySelector('#admin-panel [data-tab=manage]').getAttribute('aria-pressed')==='true'`),'Unclaimed action opens the filtered People list');
  await run(`document.querySelector('#admin-panel [data-tab=community]').click();true`);
  await wait(`document.querySelector('.admin-hub-status')?.textContent.includes('Reports updated')`,'community');
  check(await run(`document.querySelector('.admin-hub-metrics strong').textContent==='4'&&[...document.querySelectorAll('.admin-hub-action')].some(b=>b.textContent.includes('Manage projects'))`),'Community preserves project, organization and analytics destinations');
  await run(`[...document.querySelectorAll('.admin-hub-action')].find(b=>b.textContent.includes('profiles without connections')).click();true`);
  await wait(`document.querySelector('.admin-hub-review')?.textContent.includes('Synthetic Review')`,'full review');
  check(true,'Existing unconnected-member review is reachable');
  await run(`document.querySelector('#admin-panel [data-tab=manage]').click();true`);
  await wait(`document.querySelector('.admin-people-panel')`,'People');
  check(await run(`document.querySelector('#admin-panel [data-tab=manage]').getAttribute('aria-pressed')==='true'`),'People management remains reachable');
  await run(`document.querySelector('#admin-panel [data-tab=privacy]').click();true`);
  await wait(`document.querySelector('#admin-settings-privacy')`,'settings');
  check(await run(`document.querySelector('#admin-settings-privacy').children.length>0&&document.querySelector('#admin-system-tools')`),'Settings retains privacy tools and diagnostics');
  await run(`window.__hubMode='missing';document.querySelector('#admin-panel [data-tab=overview]').click();true`);
  await wait(`document.querySelector('.admin-hub-trend')?.textContent.includes('Not yet available')`,'missing migration');
  check(await run(`document.querySelector('.admin-hub-metrics strong').textContent==='12'`),'Missing daily update preserves existing totals');
  await run(`window.__hubMode='failure';document.querySelector('.admin-hub-refresh').click();true`);
  await wait(`document.querySelector('.admin-hub-status')?.textContent.includes('Some reports')`,'partial failure');
  check(await run(`document.querySelector('.admin-hub-metrics strong').textContent==='Unavailable'&&!document.querySelector('.admin-hub-refresh').disabled`),'Failed reports are unavailable, not zero, with retry');
  await run(`window.__hubMode='hold';document.querySelector('.admin-hub-refresh').click();true`);
  await wait('window.__hubResolve','pending request');
  await run(`document.querySelector('#admin-panel [data-tab=privacy]').click();window.__hubResolve();true`);
  await wait(`document.querySelector('#admin-settings-privacy')`,'leave during request');
  check(await run(`!document.querySelector('.admin-hub-metrics')&&document.querySelector('#admin-panel [data-tab=privacy]').getAttribute('aria-pressed')==='true'`),'Late overview result cannot replace another section');
 }
 console.log(`${passed}/${passed} admin overview checks passed`);
} finally { await app.close(); }
