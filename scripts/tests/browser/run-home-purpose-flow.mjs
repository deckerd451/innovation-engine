// Participation-based Home, real local app, synthetic member data; no live service calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {appHarness} from './helpers/app-harness.mjs';
const app=await appHarness(), run=app.evaluate, require=createRequire(import.meta.url);
let checks=0;
async function check(expr,label){assert.ok(await run(expr),label);checks++;console.log('PASS '+label);}
try {
 for(const width of [320,390,768,1280]){
  await app.load(width,844);
  await app.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await run(`window.AppNav.go('home');window.StartDailyDigest.inboundAttention=()=>[];window.__next={status:'ready',person:null,joinIn:[],community:{projects:[],opportunities:[],skills:[]}};window.StartDailyDigest.homeSuggestions=()=>window.__next;window.dispatchEvent(new CustomEvent('daily-brief-updated'));window.dispatchEvent(new CustomEvent('total-unread-messages-updated',{detail:{count:0}}));true`);
  await check(`document.querySelectorAll('.home-view #home-idea-input').length===1&&!document.querySelector('.home-view .home-pulse-link')`,'One finder, no Pulse detour at '+width);
  await check(`document.querySelector('.home-view').dataset.homeMode==='participating'&&!!(document.querySelector('[data-home=mine]').compareDocumentPosition(document.querySelector('[data-home=goal]'))&Node.DOCUMENT_POSITION_FOLLOWING)&&document.querySelector('.home-idea h2').textContent==='Search the community'`,'Participation puts projects before compact discovery at '+width);
  await check(`document.querySelectorAll('[data-home=mine]>.home-mine-list [data-project-id]').length<=2&&!document.querySelector('[data-home=mine]').textContent.includes('You started it')`,'Compact projects without repeated metadata at '+width);
  await run(`window.HomeView.focusGoal();document.querySelector('#home-idea-input').value='Python community';window.dispatchEvent(new CustomEvent('daily-brief-updated'));true`);
  await check(`document.querySelector('#home-idea-input').value==='Python community'&&document.activeElement.id==='home-idea-input'`,'Live updates preserve the member’s input at '+width);
  await run(`document.querySelector('#home-idea-input').blur();window.dispatchEvent(new CustomEvent('total-unread-messages-updated',{detail:{count:2}}));true`);
  await app.sleep(100);
  await check(`document.querySelector('.home-grid').firstElementChild.dataset.home==='attention'&&!document.querySelector('[data-home=attention]').hidden&&document.querySelector('[data-home=picked]').hidden&&document.querySelectorAll('[data-home=attention] .home-row').length===1`,'Inbox attention wins without competing recommendations at '+width);
  await run(`window.__next.joinIn=[{id:'project_a',type:'project',entityId:'project-a',name:'Community garden',reason:'Needs Python'},{id:'project_b',type:'project',entityId:'project-b',name:'Second invitation',reason:'Needs CSS'}];window.__next.community.projects=[{id:'project-a',title:'Community garden',about:'Help your neighbors',people:2,needs:['Python']},{id:'project-c',title:'New project',about:'Open to collaborators',people:2,needs:[]}];window.dispatchEvent(new CustomEvent('daily-brief-updated'));window.dispatchEvent(new CustomEvent('total-unread-messages-updated',{detail:{count:0}}));true`);
  await check(`!document.querySelector('[data-home=picked]').hidden&&document.querySelectorAll('[data-home=join] .home-pick').length===1&&!document.querySelector('[data-home=happening]').textContent.includes('Community garden')`,'One reasoned invitation, no duplicate community card at '+width);
  await run(`window.__opened=null;window.StartDailyDigest.selectReflectionEntity=(type,id)=>{window.__opened={type,id};return true};document.querySelector('[data-home=join] [data-join]').click();true`);
  await check(`window.__opened?.id==='project-a'`,'Invitation opens the intended detail at '+width);
  await run(`window.__next.person={id:'person_riley',type:'person',entityId:'riley-fixture',name:'Riley',reason:'Shared Python',reasons:[{category:'shared_skill',detail:'Python'}]};window.dispatchEvent(new CustomEvent('daily-brief-updated'));true`);
  await check(`!document.querySelector('[data-home=meet]').hidden&&document.querySelector('[data-home=join]').hidden&&document.querySelector('.home-meet-card .network-reflection-concierge-actions').firstElementChild.textContent==='View profile'`,'One person replaces the invitation, with profile first at '+width);
  await run(`window.StartDailyDigest.inboundAttention=()=>[{key:'pending',count:1,message:()=> 'A connection request',action:'Review request',handler:'reviewRequests'}];window.dispatchEvent(new CustomEvent('total-unread-messages-updated',{detail:{count:2}}));true`);
  await check(`document.querySelectorAll('[data-home=attention] .home-row').length===2&&document.querySelector('[data-home=attention] details')&&!document.querySelector('[data-home=attention] details').open`,'Other pending updates remain available on demand at '+width);
  await run(`window.__next.person=null;window.StartDailyDigest.inboundAttention=()=>[];window.dispatchEvent(new CustomEvent('total-unread-messages-updated',{detail:{count:0}}));true`);
  await run(`window.__next.joinIn=[];window.dispatchEvent(new CustomEvent('daily-brief-updated'));window.__goal=document.querySelector('#home-idea-input');window.__goal.scrollIntoView({block:'center'});true`);
  await check(`document.documentElement.scrollWidth<=innerWidth`,'No page overflow at '+width);
  await run(`document.querySelectorAll('.toast,.toast-notification,.unified-network-notification,.synapse-notification').forEach(n=>n.remove());document.querySelector('#mobile-you-content')?.scrollTo(0,0);document.querySelector('#cd-home')?.scrollTo(0,0);document.querySelector('.home-view')?.scrollIntoView({block:'start'});true`);
  const shot=await app.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/home-purpose-'+width+'.png',Buffer.from(shot.data,'base64'));
  await run(`window.__savedFrom=window.supabase.from.bind(window.supabase);window.supabase.from=table=>{const query=window.__savedFrom(table);if(!['projects','project_members','connections'].includes(table))return query;let proxy;proxy=new Proxy(query,{get(target,key){if(key==='then')return (ok,bad)=>Promise.resolve({data:[],error:null}).then(ok,bad);const value=target[key];return typeof value==='function'?(...args)=>{value.apply(target,args);return proxy}:value;}});return proxy;};window.HomeView.clear();window.HomeView.show();true`);
  await app.wait(`document.querySelector('.home-view')?.dataset.homeMode==='discover'&&document.querySelector('[data-home=mine]')?.textContent.includes('Find a project')`,'member without participation');
  await check(`document.querySelector('.home-grid').firstElementChild.dataset.home==='goal'&&document.querySelector('.home-idea h2').textContent==='Search the community'`,'Members without projects or connections start with discovery at '+width);
  const discoveryShot=await app.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/home-discovery-'+width+'.png',Buffer.from(discoveryShot.data,'base64'));
  await run(`document.querySelector('#home-idea-input').focus();document.querySelector('#home-idea-input').value='Find robotics collaborators';window.supabase.from=window.__savedFrom;window.dispatchEvent(new CustomEvent('project-task-updated'));true`);
  await app.sleep(200);
  await check(`document.activeElement.id==='home-idea-input'&&document.querySelector('#home-idea-input').value==='Find robotics collaborators'&&document.querySelector('.home-view').dataset.homeMode==='discover'`,'Participation changes wait while the member types at '+width);
  await run(`document.querySelector('#home-idea-input').blur();true`);
  await app.wait(`document.querySelector('.home-view')?.dataset.homeMode==='participating'`,'participation after typing');
  await check(`document.querySelector('#home-idea-input').value==='Find robotics collaborators'`,'Reordering preserves finder text at '+width);

 }
 await run(fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8')+';true');
 const violations=await run(`(async()=>{const r=await axe.run(document.querySelector('.home-view'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(x=>x.id)})()`);
 assert.deepEqual(violations,[],'Home accessibility');checks++;console.log('PASS Home accessibility');
 console.log(`${checks}/${checks} Home purpose and flow checks passed`);
} finally {await app.close();}
