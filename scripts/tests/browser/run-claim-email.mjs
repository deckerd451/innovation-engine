// Synthetic UI/callback verification; this never sends an actual email.
import assert from 'node:assert/strict';
import {appHarness} from './helpers/app-harness.mjs';
const app=await appHarness();const {evaluate:run,wait}=app;
let passed=0;const check=(ok,label)=>{assert.ok(ok,label);passed++;console.log('PASS',label);};
try {
 await app.load(390,700);
 await run(`window.confirm=()=>true;window.currentAuthUser={id:'auth-me',email:'dmhamilton1@live.com'};window.__toasts=[];window.showToast=(message,type)=>window.__toasts.push({message,type});const db=window.supabase.__db;db.community.push({...db.community[0],id:'20000000-0000-4000-8000-000000000001',name:'Claim Fixture',email:'recipient@example.test',user_id:null});window.__rpc=window.supabase.rpc.bind(window.supabase);window.supabase.rpc=(name,args)=>name==='admin_member_emails'?Promise.resolve({data:args.p_ids.map(id=>({id,email:db.community.find(p=>p.id===id)?.email||'fixture@example.test'})),error:null}):window.__rpc(name,args);window.__from=window.supabase.from.bind(window.supabase);window.supabase.from=(table)=>{const q=window.__from(table);q.range=(start,end)=>{if(start!==0)throw Error('This UI fixture supports only page one');return q.limit(end+1);};return q;};window.__sendCalls=[];window.__sendStatus='accepted';window.supabase.functions={invoke:async(name,{body})=>{window.__sendCalls.push({name,body});if(window.__holdSend)await new Promise(resolve=>window.__finishSend=resolve);return {data:{results:body.person_ids.map(person_id=>({person_id,status:window.__sendStatus}))},error:null};}};window.openAdminPanel();true`);
 await run(`document.querySelector('#admin-panel [data-tab="manage"]').click();true`);await wait('document.querySelector(".admin-people-panel")','People');
 await run(`window.__holdSend=true;window.handleSendClaimEmailSingle('20000000-0000-4000-8000-000000000001');window.handleSendClaimEmailSingle('20000000-0000-4000-8000-000000000001');true`);await wait('window.__sendCalls.length===1&&window.__finishSend','send');
 check(await run(`window.__sendCalls[0].name==='send-claim-emails'&&Object.keys(window.__sendCalls[0].body).join()==='person_ids'`),'Single send calls the real endpoint with profile IDs only');
 check(await run(`!window.__toasts.some(t=>t.type==='success')`),'No success before service acceptance');
 await run(`window.__finishSend();window.__holdSend=false;true`);await wait('document.querySelector("#claim-email-status")?.textContent.includes("1 of 1")','receipt');
 check(await run(`window.__toasts.at(-1).message.includes('accepted')`),'Accepted receipt is displayed truthfully');
 await run(`window.__sendStatus='rate_limited';window.handleSendClaimEmailSingle('20000000-0000-4000-8000-000000000001');true`);await wait('document.querySelector("#claim-email-status")?.textContent.includes("resend limit")','limit');
 check(await run(`window.__toasts.at(-1).type!=='success'`),'Rate limit is not reported as sent');
 await run(`window.supabase.__db.community.push({...window.supabase.__db.community.find(p=>p.id==='20000000-0000-4000-8000-000000000001'),id:'20000000-0000-4000-8000-000000000002',name:'Second Claim Fixture',email:'second@example.test'});window.__sendStatus='accepted';window.closePersonDrawer?.();window.AdminPeoplePanel.renderPeoplePanel(document.querySelector('#admin-tab-content'));true`);
 await wait("[...document.querySelectorAll('.person-checkbox')].some(b=>b.dataset.personId==='20000000-0000-4000-8000-000000000002')",'second profile');
 await run(`for(const id of ['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002']){const box=[...document.querySelectorAll('.person-checkbox')].find(b=>b.dataset.personId===id);box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));}window.supabase.functions.invoke=async(name,{body})=>({data:{results:body.person_ids.map((person_id,i)=>({person_id,status:i?'rate_limited':'accepted'}))},error:null});document.querySelector('#bulk-claim-email-btn').click();true`);
 await wait('document.querySelector("#claim-email-status")?.textContent.includes("1 of 2")','bulk receipt');
 check(await run(`document.querySelector('#claim-email-status').textContent.includes('resend limit')&&[...document.querySelectorAll('.person-checkbox')].filter(b=>b.dataset.personId==='20000000-0000-4000-8000-000000000001').every(b=>!b.checked)&&[...document.querySelectorAll('.person-checkbox')].filter(b=>b.dataset.personId==='20000000-0000-4000-8000-000000000002').some(b=>b.checked)`),'Bulk reports partial acceptance and retains failed recipients for review');
 // Callback page uses the same fixture client, with an explicit verified-session stub.
 await app.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__claimCalls=0;window.supabase.auth.setSession=async tokens=>{window.__callbackTokens=tokens;return {error:null};};const old=window.supabase.rpc.bind(window.supabase);window.supabase.rpc=(name,args)=>name==='claim_community_profile_by_email'?(window.__claimCalls++,Promise.resolve({data:'claimed-profile',error:null})):old(name,args);`});
 const origin=await run('location.origin');
 await app.send('Page.navigate',{url:origin+'/claim.html#access_token=fixture-access&refresh_token=fixture-refresh'});
 await wait('document.querySelector("#claim-status")?.textContent.includes("linked")','callback');
 check(await run(`!location.hash&&window.__callbackTokens.access_token==='fixture-access'&&window.__claimCalls===1`),'Email link clears tokens and invokes verified profile claiming');
 check(await run(`!document.querySelector('#claim-continue').hidden&&document.querySelector('#claim-continue').href.endsWith('/index.html')`),'Successful claim offers the fixed app destination');
 await app.send('Page.navigate',{url:origin+'/claim.html'});await wait('document.querySelector("#claim-status")?.textContent.includes("missing or expired")','invalid link');
 check(await run(`window.__claimCalls===0`),'Missing link credentials never claim a profile');
 check(app.dialogs.length===0,'Test does not send native messages or request credentials');
 console.log(`${passed}/${passed} claim email browser checks passed`);
} finally {await app.close();}
