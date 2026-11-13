// Local synthetic regression: Analytics must open visibly above Admin.
import assert from 'node:assert/strict';
import {appHarness} from './helpers/app-harness.mjs';
const app=await appHarness();
const {evaluate:run,wait,sleep}=app;
let passed=0;
const check=(ok,label)=>{assert.ok(ok,label);passed++;console.log('PASS',label);};
async function tap(selector) {
  const {result:receiver}=await app.send('Runtime.evaluate',{expression:'window'});
  const result=await app.send('Runtime.callFunctionOn',{objectId:receiver.objectId,functionDeclaration:`function(selector){const el=document.querySelector(selector),r=el.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,hit:el.contains(document.elementFromPoint(x,y))};}`,arguments:[{value:selector}],returnByValue:true});
  const point=result.result.value;check(point.hit,selector+' is visible and unobstructed');
  await app.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});await app.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);
}
try {
  await app.load(390,600);
  await run(`window.currentAuthUser={id:'auth-me',email:'dmhamilton1@live.com'};window.__metrics={total_members:85,active_members:23,active_window_days:30,new_members_30d:4,total_connections:20,new_connections_30d:2,active_projects:3,open_opportunities:2,isolated_members_count:0,key_connectors:[],top_skills:[],isolated_members_sample:[]};window.__mode='hold';window.__baseRpc=window.supabase.rpc.bind(window.supabase);window.supabase.rpc=(name,args)=>{if(name==='get_admin_network_analytics'){if(window.__mode==='hold')return new Promise(resolve=>window.__finishAnalytics=()=>resolve({data:window.__metrics,error:null}));return Promise.resolve(window.__mode==='error'?{data:null,error:{code:'NETWORK',message:'test failure'}}:{data:window.__metrics,error:null});}if(name==='get_admin_retention_analytics')return Promise.resolve({data:null,error:{message:'not configured'}});return window.__baseRpc(name,args);};window.AppNav.go('you');true`);
  await wait('document.querySelector("#btn-profile-admin")','You Admin button');await tap('#btn-profile-admin');
  await wait('document.querySelector("#visitor-analytics")','Visitors');
  await run(`document.querySelector('#visitor-analytics').scrollIntoView({block:'center'});true`);await tap('#visitor-analytics');
  await wait('document.querySelector("#open-analytics-dashboard-btn")','Analytics introduction');
  for(const [width,height] of [[390,600],[320,568],[1280,800]]) {
    await app.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<720});await sleep(100);
    await run(`window.__mode='hold';document.querySelector('#open-analytics-dashboard-btn').scrollIntoView({block:'center'});true`);
    await tap('#open-analytics-dashboard-btn');await wait('window.__finishAnalytics','pending network request');
    check(await run(`(() => {const m=document.querySelector('#admin-analytics-modal'),b=m.querySelector('.admin-analytics-close'),r=b.getBoundingClientRect();return m.getAttribute('aria-modal')==='true'&&!m.inert&&document.querySelector('#admin-panel').inert&&m.contains(document.activeElement)&&b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))&&r.top>=0&&r.bottom<=innerHeight;})()`),`${width}: loading Analytics is above Admin with a reachable Close button`);
    await run(`window.__finishAnalytics();window.__finishAnalytics=null;true`);await wait('document.querySelector("#admin-analytics-modal .admin-metric-grid")','metrics');await sleep(50);
    check(await run(`(() => {const m=document.querySelector('#admin-analytics-modal'),f=m.querySelector('.admin-analytics-frame'),r=f.getBoundingClientRect();return m.contains(document.activeElement)&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&getComputedStyle(m.querySelector('.admin-analytics-scroll')).overflowY==='auto';})()`),`${width}: rendered metrics remain within the viewport and scroll independently`);
    await run(`document.querySelector('.admin-analytics-scroll').scrollTop=10000;true`);await tap('#admin-analytics-modal .admin-analytics-close');
    await sleep(50);check(await run(`document.querySelector('#admin-analytics-modal').style.display==='none'&&!document.querySelector('#admin-panel').inert&&document.activeElement.id==='open-analytics-dashboard-btn'&&!document.activeElement.disabled`),'Close returns to the enabled Admin opener');
  }
  await run(`window.__mode='error';document.querySelector('#open-analytics-dashboard-btn').click();true`);await wait('document.querySelector("#admin-analytics-retry-btn")','error');
  check(await run(`document.querySelector('#admin-analytics-modal').contains(document.activeElement)`),'RPC failure remains in the visible Analytics dialog');
  await run(`window.__mode='success';document.querySelector('#admin-analytics-retry-btn').click();true`);await wait('document.querySelector("#admin-analytics-modal .admin-metric-grid")','retried metrics');
  await app.key('Escape');await sleep(50);check(await run(`document.activeElement.id==='open-analytics-dashboard-btn'&&!document.querySelector('#admin-panel').inert`),'Retry then Escape restores Admin');
  console.log(`${passed}/${passed} Analytics overlay checks passed`);
} finally {await app.close();}
