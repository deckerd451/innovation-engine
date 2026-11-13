// Synthetic end-to-end Analytics → full review → existing People management.
import assert from 'node:assert/strict';
import {appHarness} from './helpers/app-harness.mjs';
const app=await appHarness();const {evaluate:run,wait,sleep}=app;
let passed=0;const check=(ok,label)=>{assert.ok(ok,label);passed++;console.log('PASS',label);};
try {
 await app.load(390,700);
 await run(`window.currentAuthUser={id:'auth-me',email:'dmhamilton1@live.com'};window.supabase.__db.community.forEach(p=>p.connection_count=1);const base=window.supabase.__db.community[0];for(let i=0;i<72;i++)window.supabase.__db.community.push({...base,id:'review-'+i,name:i===0?'Person " onpointerenter="window.__reviewInjected=true':'Person '+i,connection_count:i%2?null:0,user_id:null,is_hidden:i%3===0,is_disabled:i%4===0});window.__reviewMode='success';window.__rpc=window.supabase.rpc.bind(window.supabase);window.supabase.rpc=(name,args)=>{if(name==='get_admin_network_analytics')return Promise.resolve({data:{total_members:85,active_members:6,active_window_days:30,isolated_members_count:72,isolated_members_sample:[],key_connectors:[],top_skills:[]},error:null});if(name==='get_admin_retention_analytics')return Promise.resolve({data:null,error:null});if(name==='get_admin_unconnected_members'){window.__reviewArgs=args;if(window.__reviewMode==='missing')return Promise.resolve({data:null,error:{code:'PGRST202'}});if(window.__reviewMode==='error')return Promise.resolve({data:null,error:{code:'NETWORK'}});const rows=window.supabase.__db.community.filter(p=>(p.connection_count??0)===0);return Promise.resolve({data:{total:rows.length,members:rows.slice(args.p_offset,args.p_offset+args.p_limit).map(({id,name,skills})=>({id,name,skills}))},error:null});}return window.__rpc(name,args);};window.openAdminPanel();true`);
 await wait('window.openAnalyticsModal','Analytics module');
 await run(`window.openAnalyticsModal();true`);await wait('document.querySelector("#admin-review-unconnected")','review action');
 await run(`document.querySelector('#admin-review-unconnected').click();true`);await wait('document.querySelectorAll(".admin-review-members li").length===25','first page');
 check(await run(`document.querySelector('#admin-unconnected-review [role="status"]').textContent.includes('of 72')`),'Review count matches the 72-member Analytics snapshot');
 check(await run(`document.querySelector('.admin-review-controls button').disabled`),'First page cannot go backwards');
 check(await run(`document.querySelector('.admin-review-members strong').textContent===window.supabase.__db.community.find(p=>p.id==='review-0').name&&!document.querySelector('.admin-review-members [onpointerenter]')&&!window.__reviewInjected`),'Quoted names stay literal text');
 await run(`document.querySelector('.admin-review-controls button:nth-child(2)').click();true`);await wait('window.__reviewArgs.p_offset===25&&document.querySelector(".admin-review-members strong").textContent==="Person 25"','second page');
 check(await run(`document.querySelectorAll('.admin-review-members li').length===25`),'Second page reaches members beyond the old sample');
 await run(`document.querySelector('.admin-review-controls button:nth-child(2)').click();true`);await wait('document.querySelectorAll(".admin-review-members li").length===22','last page');
 check(await run(`document.querySelector('.admin-review-controls button:nth-child(2)').disabled`),'Last page shows the remaining 22 and disables Next');
 check(await run(`(()=>{const e=document.querySelector('.admin-analytics-scroll');return e.scrollWidth<=e.clientWidth;})()`),'Review fits the mobile content width');
 await run(`window.__reviewMode='missing';document.querySelector('.admin-review-controls button:nth-child(3)').click();true`);await wait('document.querySelector("#admin-unconnected-review [role=status]").textContent.includes("database setup")','setup state');
 check(await run(`!document.querySelector('.admin-review-controls button:nth-child(3)').disabled`),'Missing migration leaves Refresh available');
 await run(`window.__reviewMode='success';window.supabase.__db.community.filter(p=>(p.connection_count??0)===0).forEach(p=>p.connection_count=1);document.querySelector('.admin-review-controls button:nth-child(3)').click();true`);
 await wait('document.querySelector("#admin-unconnected-review [role=status]").textContent.includes("No members currently match")','empty review');
 check(await run(`document.querySelector('#admin-unconnected-review [role=status]').textContent.includes('previously showed 72')`),'Changed count is explicit and an empty last page resets safely');
 await run(`window.supabase.__db.community.filter(p=>p.id.startsWith('review-')).forEach(p=>p.connection_count=0);true`);
 await run(`window.__reviewMode='error';document.querySelector('.admin-review-controls button:nth-child(3)').click();true`);await wait('document.querySelector("#admin-unconnected-review [role=status]").textContent.includes("could not")','retryable error');
 check(true,'Network failure displays a retryable state');
 await run(`window.__reviewMode='success';document.querySelector('.admin-review-controls button:nth-child(3)').click();true`);await wait('document.querySelectorAll(".admin-review-members li").length===25','retry');
 await run(`document.querySelector('.admin-review-members button').click();true`);await wait('document.querySelector("#person-drawer input")','person drawer');
 check(await run(`document.querySelector('#admin-analytics-modal').style.display==='none'&&document.querySelector('[data-tab="manage"]').classList.contains('active-admin-tab')&&document.querySelector('#person-drawer').textContent.includes('onpointerenter')`),'Manage person opens the selected profile in existing People management');
 check(await run(`document.querySelector('#person-drawer').contains(document.activeElement)||document.activeElement.id==='person-drawer'`),'Focus follows to the management drawer');
 console.log(`${passed}/${passed} member review checks passed`);
} finally {await app.close();}
