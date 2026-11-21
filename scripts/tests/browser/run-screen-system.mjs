// Shared visual language and existing screen controls, synthetic member only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {appHarness} from './helpers/app-harness.mjs';
let app, run;
const require=createRequire(import.meta.url);
let checks=0;
async function check(expr,label){assert.ok(await run(expr),label);checks++;console.log('PASS '+label);}
async function shot(name,width){const r=await app.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`/tmp/screen-${name}-${width}.png`,Buffer.from(r.data,'base64'));}
try {
 for(const width of [320,390,1280]){
  if(app) await app.close();
  app=await appHarness();run=app.evaluate;
  await app.load(width,844);
  await run(`document.querySelectorAll('.toast,.unified-network-notification,.synapse-notification').forEach(n=>n.remove());true`);
  await check(`getComputedStyle(document.querySelector('#main-content')).backgroundColor==='rgb(11, 16, 36)'`,'Shared Home background at '+width);
  if(width<1024){
    await run(`window.currentUserProfile.image_url='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';window.currentAuthUser={id:window.currentUserProfile.user_id};window.HomeView.show();true`);
    await check(`document.querySelector('.home-avatar img')?.getAttribute('src')==='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='`,'Home uses the member profile photo at '+width);
  }
  await shot('home',width);
  await run(`window.AppNav.go('explore');true`);await app.sleep(300);
  await check(`getComputedStyle(document.querySelector('#command-dashboard')).backgroundColor==='rgb(11, 16, 36)'&&document.querySelector('.udc-resource-tab[aria-selected=true]')`,'Explore shares background and retains selected category at '+width);
  await run(`document.querySelector('#cd-explore-toggle').click();true`);
  await check(`!document.querySelector('#cd-explore-body').hidden&&document.querySelector('#cd-explore-toggle').disabled`,'Explore cannot collapse its destination at '+width);
  await check(`document.querySelector('#explore-tab-organizations').textContent.includes('Organizations')`,'Explore names Organizations clearly at '+width);
  await shot('explore',width);
  // The synthetic harness has no live provider channels.
  await run(`window.realtimeManager={subscribeOnce:()=>null,isChannelActive:()=>false};window.AppNav.go('inbox');true`);
  await app.wait(`document.querySelector('.conversations-header h3')?.textContent.includes('Inbox')`,'Inbox header');
  await check(`document.querySelector('#conv-search-input').getAttribute('aria-label')==='Search conversations'&&getComputedStyle(document.querySelector('#messages-modal .conversations-sidebar')).backgroundColor==='rgb(11, 16, 36)'`,'Inbox is consistently named and search remains labelled at '+width);
  await check(`document.querySelector('.new-message-btn').getBoundingClientRect().height>=44`,'New message retains its touch target at '+width);
  await run(`window.MessagingModule.getState().conversations.push({id:'fixture-conversation',unreadCount:2,otherUser:{name:'Unread member',communityId:'fixture-other'},last_message_preview:'Hello'});window.MessagingModule.filterConversations('');true`);
  await check(`document.querySelector('.conversation-item.unread .unread-preview')&&document.querySelector('.conv-unread-badge').textContent==='2'`,'Unread conversations identify their preview and count at '+width);
  await run(`window.MessagingModule.selectConversationById('fixture-conversation');true`);
  if(width<1024){
    await check(`document.querySelector('.mobile-back-btn').textContent.includes('Inbox')`,'Conversation provides an explicit Inbox return at '+width);
    await run(`document.querySelector('.mobile-back-btn').click();true`);
  }
  await shot('inbox',width);
  await run(`window.NearifyLink={getLinkedStatus:async()=>({linked:true}),getAuthorizationStatus:async()=>({status:'authorized'}),unlinkAccount:async()=>({success:true})};window.AppNav.go('you');true`);await app.wait(`document.querySelector('.ch-profile-edit-action')`,'profile');
  await check(`document.querySelector('.ch-profile-header').nextElementSibling.id==='btn-open-profile-editor'&&document.querySelector('.ch-profile-top').contains(document.querySelector('.ch-profile-actions'))`,'Edit is near identity; account controls scroll with You at '+width);
  await run(`document.querySelector('#btn-open-profile-editor').scrollIntoView({block:'center'});true`);
  await check(`document.querySelector('#btn-open-profile-editor').getBoundingClientRect().height>=44`,'Edit profile remains reachable at '+width);
  await app.wait(`document.querySelector('.ch-connected-app')`,'connected app');
  await check(`!document.querySelector('.ch-connected-app').open&&document.querySelector('.ch-connected-app #nearify-unlink-btn')`,'Connected app management is collapsed without losing disconnect at '+width);
  await run(`document.querySelector('.ch-connected-app summary').click();true`);
  await check(`document.querySelector('.ch-connected-app').open&&document.querySelector('.ch-connected-app').textContent.includes('Disconnecting unlinks')`,'Manage exposes sharing and disconnect consequences at '+width);
  await shot('you',width);
  await run(`window.currentUserProfile.user_role='Admin';window.openAdminPanel();true`);await app.wait(`document.querySelector('#admin-panel')`,'admin');
  await check(`getComputedStyle(document.querySelector('#admin-panel')).backgroundColor==='rgb(11, 16, 36)'&&document.querySelector('.admin-mode-label')`,'Admin shares the surface and remains identified at '+width);
  await check(`document.documentElement.scrollWidth<=innerWidth`,'No horizontal page overflow at '+width);
  await shot('admin',width);
  await app.key('Escape');
 }
 await run(fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8')+';true');
 await run(`window.AppNav.go('you');true`);await app.sleep(300);
 const violations=await run(`(async()=>{const r=await axe.run(document.querySelector('#profile-modal'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>v.id)})()`);
 assert.deepEqual(violations,[],'You accessibility');checks++;console.log('PASS You accessibility');
 console.log(`${checks}/${checks} shared screen design checks passed`);
}finally{await app?.close();}
