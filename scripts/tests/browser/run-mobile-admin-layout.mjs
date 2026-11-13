// Synthetic, local-only Admin layout and touch regression.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {appHarness} from './helpers/app-harness.mjs';
const app=await appHarness();
const {evaluate:run,wait,sleep}=app;
let passed=0;
const check=(value,label)=>{assert.ok(value,label);passed++;console.log('PASS',label);};
async function tap(selector) {
  // Pass selector as a CDP argument, never as constructed JavaScript source.
  const {result: receiver}=await app.send('Runtime.evaluate',{expression:'window'});
  const result=await app.send('Runtime.callFunctionOn',{
    objectId:receiver.objectId,
    functionDeclaration:`function(selector) {
      const el=document.querySelector(selector),r=el.getBoundingClientRect();
      const x=r.x+r.width/2,y=r.y+r.height/2;
      return {x,y,hit:el.contains(document.elementFromPoint(x,y))};
    }`,
    arguments:[{value:selector}],returnByValue:true
  });
  if(result.exceptionDetails) throw Error(result.exceptionDetails.text);
  const point=result.result.value;
  check(point.hit,selector+' is unobstructed');
  await app.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
  await app.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(150);
}
try {
  await app.load(390,600);
  await run(`window.currentAuthUser={id:'auth-me',email:'dmhamilton1@live.com'};window.__originalRpc=window.supabase.rpc.bind(window.supabase);window.supabase.rpc=(name,args)=>name==='get_admin_site_visits'?(window.__visitorArgs=args,Promise.resolve({data:{visits:args.p_days,browsers:0,guests:0,members:0,recent:[]},error:null})):window.__originalRpc(name,args);window.supabase.__db.theme_circles=[{id:'theme-long',title:'A very long theme name for a community project and collaboration workshop',status:'active'}];window.supabase.__db.projects.forEach((p,i)=>{p.name='LongProjectNameWithoutAnySpaces'.repeat(4)+(i===0?' \" onpointerenter=\"window.__projectLabelInjected=true':'');p.description='A long project description for layout verification. '.repeat(8);p.theme_id=i===0?'theme-long':null;});window.openAdminPanel();true`);
  await wait('document.querySelector("#admin-panel")','Admin');
  for(const [width,height] of [[320,568],[390,600],[430,844]]) {
    await app.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await sleep(200);
    check(await run(`(() => {const nav=document.querySelector('.admin-main-tabs'),rects=[...nav.children].map(e=>e.getBoundingClientRect());return rects.every(r=>Math.abs(r.top-rects[0].top)<1&&r.height>=44)&&nav.scrollWidth<=nav.clientWidth&&rects.every(r=>r.left>=0&&r.right<=innerWidth);})()`),`${width}: all four destinations fit one row with 44px tap height`);
    await tap('#resource-mgmt-dropdown-btn');
    check(await run(`(() => {const r=document.querySelector('#resource-mgmt-dropdown').getBoundingClientRect(),n=document.querySelector('.admin-main-tabs').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=n.bottom-2&&r.bottom<=innerHeight;})()`),`${width}: Manage menu fits below navigation`);
    await tap('#resource-mgmt-dropdown [data-tab="projects"]');
    check(await run(`document.querySelector('[data-tab="projects"]').classList.contains('active-admin-tab')`),'Projects opens through Manage');
    await wait('document.querySelector(".admin-project-card")','Project cards');
    check(await run(`(() => {const project=window.supabase.__db.projects[0],el=document.getElementById('theme-select-'+project.id);el.dispatchEvent(new Event('pointerenter'));return el.getAttribute('aria-label')==='Theme for '+project.name&&!el.hasAttribute('onpointerenter')&&!window.__projectLabelInjected;})()`),'Quoted project name remains label text and cannot inject an event handler');
    check(await run(`(() => {const content=document.querySelector('#admin-tab-content'),bounds=content.getBoundingClientRect();return [...document.querySelectorAll('.admin-project-card,.admin-project-theme-controls select,.admin-project-theme-controls button')].every(el=>{const r=el.getBoundingClientRect();return r.left>=bounds.left-1&&r.right<=bounds.right+1;})&&content.scrollWidth<=content.clientWidth;})()`),'Long project text, selects, Assign and Remove fit without clipping');
    check(await run(`getComputedStyle(document.querySelector('.admin-project-theme-controls')).flexDirection==='column'`),'Theme actions stack vertically on phones');
    await tap('.admin-main-tabs > [data-tab="privacy"]');
    await wait('document.querySelector(".admin-privacy-search")','Privacy');
    check(await run(`document.querySelector('.admin-main-tabs > [data-tab="privacy"]').classList.contains('active-admin-tab')`),'Privacy activates without wrapping');
    await tap('.admin-main-tabs > [data-tab="visitors"]');
    check(await run(`(() => {const el=document.querySelector('#admin-tab-content');return getComputedStyle(el).overflowY==='auto'&&el.clientHeight>150&&document.documentElement.scrollWidth<=innerWidth;})()`),'Content retains its own scroll area without page overflow');
    await run(`document.querySelector('#visitor-period').value='1';document.querySelector('#visitor-period').dispatchEvent(new Event('change'));true`);
    await wait('window.__visitorArgs.p_days===1&&document.querySelector(".visitor-metrics strong")?.textContent==="1"','daily results');
    check(await run(`document.querySelector('#visitor-period option[value="1"]').textContent==='Last 24 hours'&&window.__visitorArgs.p_exclude_self===true`),'Daily option requests one rolling day and keeps self-exclusion');
    await tap('#visitor-refresh');
    check(await run(`window.__visitorArgs.p_days===1`),'Refresh retains the daily period');
    if(width===390) {const shot=await app.send('Page.captureScreenshot',{format:'png'});fs.mkdirSync('/workspace/shared',{recursive:true});fs.writeFileSync('/workspace/shared/mobile-admin-compact.png',Buffer.from(shot.data,'base64'));}
  }
  await app.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});await sleep(200);
  check(await run(`getComputedStyle(document.querySelector('.admin-main-tabs')).display==='flex'`),'Desktop keeps its existing navigation layout');
  console.log(`${passed}/${passed} Admin layout checks passed`);
} finally {await app.close();}
