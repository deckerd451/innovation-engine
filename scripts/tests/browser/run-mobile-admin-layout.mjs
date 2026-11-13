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
  await run(`window.currentAuthUser={id:'auth-me',email:'dmhamilton1@live.com'};window.__originalRpc=window.supabase.rpc.bind(window.supabase);window.supabase.rpc=(name,args)=>name==='get_admin_site_visits'?Promise.resolve({data:{visits:0,browsers:0,guests:0,members:0,recent:[]},error:null}):window.__originalRpc(name,args);window.openAdminPanel();true`);
  await wait('document.querySelector("#admin-panel")','Admin');
  for(const [width,height] of [[320,568],[390,600],[430,844]]) {
    await app.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await sleep(200);
    check(await run(`(() => {const nav=document.querySelector('.admin-main-tabs'),rects=[...nav.children].map(e=>e.getBoundingClientRect());return rects.every(r=>Math.abs(r.top-rects[0].top)<1&&r.height>=44)&&nav.scrollWidth<=nav.clientWidth&&rects.every(r=>r.left>=0&&r.right<=innerWidth);})()`),`${width}: all four destinations fit one row with 44px tap height`);
    await tap('#resource-mgmt-dropdown-btn');
    check(await run(`(() => {const r=document.querySelector('#resource-mgmt-dropdown').getBoundingClientRect(),n=document.querySelector('.admin-main-tabs').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=n.bottom-2&&r.bottom<=innerHeight;})()`),`${width}: Manage menu fits below navigation`);
    await tap('#resource-mgmt-dropdown [data-tab="projects"]');
    check(await run(`document.querySelector('[data-tab="projects"]').classList.contains('active-admin-tab')`),'Projects opens through Manage');
    await tap('.admin-main-tabs > [data-tab="privacy"]');
    await wait('document.querySelector(".admin-privacy-search")','Privacy');
    check(await run(`document.querySelector('.admin-main-tabs > [data-tab="privacy"]').classList.contains('active-admin-tab')`),'Privacy activates without wrapping');
    await tap('.admin-main-tabs > [data-tab="visitors"]');
    check(await run(`(() => {const el=document.querySelector('#admin-tab-content');return getComputedStyle(el).overflowY==='auto'&&el.clientHeight>150&&document.documentElement.scrollWidth<=innerWidth;})()`),'Content retains its own scroll area without page overflow');
    if(width===390) {const shot=await app.send('Page.captureScreenshot',{format:'png'});fs.mkdirSync('/workspace/shared',{recursive:true});fs.writeFileSync('/workspace/shared/mobile-admin-compact.png',Buffer.from(shot.data,'base64'));}
  }
  await app.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});await sleep(200);
  check(await run(`getComputedStyle(document.querySelector('.admin-main-tabs')).display==='flex'`),'Desktop keeps its existing navigation layout');
  console.log(`${passed}/${passed} Admin layout checks passed`);
} finally {await app.close();}
