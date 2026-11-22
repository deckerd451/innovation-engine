// Count app-controlled actions from an authenticated landing (sign-in is step 1).
// Synthetic identities and in-memory writes only; never sends a real request.
import assert from 'node:assert/strict';
import {appHarness} from './helpers/app-harness.mjs';
let checks=0;
for(const width of [320,390,1280]){
 const app=await appHarness(),run=app.evaluate;
 const check=async(expr,label)=>{assert.ok(await run(expr),label);checks++;console.log('PASS '+label+' at '+width);};
 try{
  await app.load(width,844);
  await run(`(()=>{
   const db=window.supabase.__db;
   db.opportunity_interests=[];
   db.opportunities.push({id:'direct-opp',title:'Help test a community project',description:'Try the prototype and share what you learn.',posted_by:'m-eli',is_public:true,status:'open',skills:['Python']});
   window.currentUserProfile=window.__fixtureProfile;
   window.dispatchEvent(new CustomEvent('profile-loaded',{detail:{profile:window.__fixtureProfile,user:{id:'auth-me'}}}));
   return true;
  })()`);
  // Step 2: open a Home opportunity; step 3: share interest, without another page.
  await run(`window.openNodePanel({id:'direct-opp',type:'opportunity'});true`);
  await app.wait(`document.querySelector('#opportunity-interest-toggle')`,'direct interest action');
  await check(`document.querySelector('.opportunity-poster').textContent.includes('Eli')`,'Poster is visible alongside the title');
  await check(`!document.querySelector('#node-side-panel .opportunity-interest a')&&document.querySelector('#opportunity-interest-toggle').textContent==="I'm interested"`,'No intermediate page or form');
  await run(`document.querySelector('#opportunity-interest-toggle').click();document.querySelector('#opportunity-interest-toggle').click();true`);
  await app.wait(`document.querySelector('#opportunity-interest-toggle').textContent==='Withdraw interest'`,'interest shared');
  await check(`window.supabase.__db.opportunity_interests.length===1&&window.supabase.__db.opportunity_interests[0].opportunity_id==='direct-opp'`,'One action creates one interest despite repeat taps');
  await check(`document.querySelector('#opportunity-interest-status').textContent.includes('Interest shared')`,'Completion is clear in place');
  await run(`document.querySelector('#opportunity-interest-toggle').click();true`);
  await app.wait(`document.querySelector('#opportunity-interest-toggle').textContent==="I'm interested"`,'withdrawn');
  await check(`window.supabase.__db.opportunity_interests.length===0`,'Withdrawal uses existing private service');
  await run(`window.closeNodePanel();window.supabase.__db.opportunities.find(o=>o.id==='direct-opp').status='closed';window.openNodePanel({id:'direct-opp',type:'opportunity'});true`);
  await app.wait(`document.querySelector('.opportunity-interest')?.textContent.includes('no longer accepting')`,'closed opportunity');
  await check(`!document.querySelector('#opportunity-interest-toggle')`,'Closed opportunities cannot solicit interest');
  await run(`window.closeNodePanel();window.supabase.__db.opportunities.find(o=>o.id==='direct-opp').status='open';window.openNodePanel({id:'direct-opp',type:'opportunity'});true`);
  await app.wait(`document.querySelector('#opportunity-interest-toggle')`,'reopened');
  await run(`window.dispatchEvent(new CustomEvent('profile-loaded',{detail:{profile:{id:'different-member'}}}));document.querySelector('#opportunity-interest-toggle').click();true`);
  await app.wait(`document.querySelector('#opportunity-interest-status')?.textContent.includes('sign-in changed')`,'identity guard');
  await check(`window.supabase.__db.opportunity_interests.length===0`,'Changing account cannot submit the previous member action');
  await run(`window.closeNodePanel();window.dispatchEvent(new CustomEvent('profile-loaded',{detail:{profile:window.__fixtureProfile,user:{id:'auth-me'}}}));window.supabase.__db.opportunities.find(o=>o.id==='direct-opp').posted_by=window.__fixtureProfile.id;window.openNodePanel({id:'direct-opp',type:'opportunity'});true`);
  await app.wait(`document.querySelector('.opportunity-interest a')`,'poster management');
  await check(`!document.querySelector('#opportunity-interest-toggle')&&document.querySelector('.opportunity-interest a').textContent==='View interested people'`,'Poster retains management without soliciting own interest');
  await run(`window.closeNodePanel();window.supabase.__db.projects.push({id:'direct-project',title:'Direct project',creator_id:'m-eli',description:'A useful next task',status:'active'});window.openNodePanel({id:'direct-project',type:'project'});true`);
  await app.wait(`document.querySelector('.project-owner')`,'project owner');
  await check(`document.querySelector('.project-owner').textContent.includes('Eli')`,'Project owner is visible near title without opening another page');
  await check(`[...document.querySelectorAll('button[onclick]')].some(b=>b.getAttribute('onclick').startsWith('joinProjectFromPanel('))`,'Project join request remains a single action');
  await run(`window.closeNodePanel();window.AppNav.go('explore');true`);await app.sleep(500);
  await check(`document.querySelector('.udc-resource-tab[aria-selected=true]').dataset.resource==='people'`,'Explore starts with people without another category step');
  await check(`[...document.querySelectorAll('.udc-resource-show-btn')].some(b=>b.textContent.trim()==='View profile')`,'Profile actions have visible labels');
  await run(`window.closeNodePanel();window.supabase.__db.organizations.push({id:'direct-org',name:'Python Collective',description:'Local builders'});Object.assign(window.supabase.__db.opportunities.find(o=>o.id==='direct-opp'),{title:'Python mentor',posted_by:'m-eli'});window.supabase.__db.projects.find(p=>p.id==='direct-project').required_skills=['Python'];window.AppNav.go('home');document.querySelector('#home-idea-input').value='Python';document.querySelector('.home-idea-form').requestSubmit();true`);
  await app.wait(`document.querySelector('[data-search-kind="organization"]')`,'all-category search');
  await check(`['People','Projects','Skills','Organizations','Opportunities'].every(label=>[...document.querySelectorAll('.home-idea-results h3')].some(h=>h.textContent===label))`,'One search groups matches from every Explore category');
  await run(`document.querySelector('[data-search-id="direct-opp"]').click();true`);
  await app.wait(`document.querySelector('#opportunity-interest-toggle')`,'search to opportunity');
  await run(`document.querySelector('#opportunity-interest-toggle').click();true`);
  await app.wait(`document.querySelector('#opportunity-interest-toggle').textContent==='Withdraw interest'`,'fourth-step value');
  await check(`window.supabase.__db.opportunity_interests.length===1`,'Sign-in, search, open result, share interest fits four app actions');
  await run(`window.closeNodePanel();const input=document.querySelector('#home-idea-input');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));true`);
  await check(`document.querySelector('.home-idea-results').textContent===''`,'Editing the query clears obsolete results');

 }finally{await app.close();}
}
console.log(`${checks}/${checks} direct value checks passed`);
