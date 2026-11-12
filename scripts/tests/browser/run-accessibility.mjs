// Local accessibility smoke: actual app controls with synthetic accounts/data.
// npm run test:a11y (npm ci first); CHROME_PATH chooses the test browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {appHarness} from './helpers/app-harness.mjs';
const require=createRequire(import.meta.url);
const axe=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const app=await appHarness();
let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log('PASS',label);};
const {evaluate:run,wait,key,sleep}=app;
async function scan(label) {
  await run(axe+';true');
  const violations=await run(`axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}).then(r=>r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,details:n.any.map(c=>c.data)}))})))`);
  check(!violations.length, label+' axe: '+JSON.stringify(violations));
}
async function wrap(root) {
  await run(`(() => {const list=[...document.querySelectorAll('${root} button,${root} input,${root} textarea,${root} select,${root} a[href]')].filter(el=>!el.matches(':disabled')&&el.getClientRects().length&&!el.closest('[hidden]'));list.at(-1).focus();true;})()`);
  await key('Tab');check(await run(`document.querySelector('${root}').contains(document.activeElement)`),root+' traps forward Tab');
  await run(`document.querySelector('${root}').focus();true`);await key('Tab',true);
  check(await run(`document.querySelector('${root}').contains(document.activeElement)`),root+' traps reverse Tab');
}
try {
  await app.load();await scan('member Home');
  await run(`window.AppNav.go('explore');true`);await sleep(400);
  await run(`document.querySelector('[data-resource="people"]').focus();true`);await key('ArrowRight');
  check(await run(`document.activeElement.dataset.resource==='projects'&&document.querySelector('.udc-resource-tab[aria-selected="true"]').dataset.resource==='projects'`),'ArrowRight synchronizes focus and category selection');
  await key('End');check(await run(`document.activeElement.dataset.resource==='opportunities'`),'End selects the last category');
  await key('Home');check(await run(`document.activeElement.dataset.resource==='people'&&document.querySelectorAll('.udc-resource-tab[tabindex="0"]').length===1`),'Home restores one roving tab stop');
  await scan('Explore');
  await run(`window.__a11yOpener=document.querySelector('#udc-resource-list button');window.__a11yOpener.focus();window.viewProjectDetails(window.supabase.__db.projects[0].id);true`);
  await wait('document.querySelector("#project-detail-overlay")','project');await sleep(300);
  check(await run(`document.querySelector('#project-detail-overlay').matches('[role="dialog"][aria-modal="true"]')&&document.querySelector('#project-detail-overlay').contains(document.activeElement)&&document.querySelector('#main-content').inert`),'Project is a named modal with focus inside and background inert');
  await wrap('#project-detail-overlay');await scan('Project');
  // A nested dialog must not let Escape reach and close its parent.
  await run(`(() => {window.__nestedOpener=document.activeElement;const root=document.createElement('div');root.id='a11y-nested';root.innerHTML='<h2>Nested editor</h2><button>Save</button><button>Cancel</button>';root.style.cssText='position:fixed;inset:20%;background:#101427;color:white;z-index:30000';document.body.appendChild(root);window.A11yDialog.open(root);return true;})()`);
  await wrap('#a11y-nested');await key('Escape');await sleep(50);
  check(await run(`!document.querySelector('#a11y-nested')&&!!document.querySelector('#project-detail-overlay')&&document.activeElement===window.__nestedOpener`),'Nested Escape closes only the child and restores parent focus');
  await run(`document.querySelector('#pd-tabs [data-tab="tasks"]').click();true`);await sleep(300);
  await run(`document.querySelector('.pt-task .pt-row').click();document.querySelector('.pt-task [data-status="done"]').click();true`);
  await wait('document.querySelector(".pt-complete-form")','completion form');await scan('Inline task completion');
  await key('Escape');check(await run(`!document.querySelector('.pt-complete-form')&&!!document.querySelector('#project-detail-overlay')`),'First Escape cancels completion and keeps its project');
  await key('Escape');await sleep(50);
  check(await run(`!document.querySelector('#project-detail-overlay')&&document.activeElement===window.__a11yOpener&&!document.querySelector('#main-content').inert`),'Second Escape closes Project, restores opener and releases background');
  await run(`window.__adminOpener=document.activeElement;window.currentUserProfile.user_role='Admin';window.openAdminPanel();true`);
  await wait('document.querySelector("#admin-panel")','admin');await wrap('#admin-panel');
  await run(`document.querySelector('#admin-panel [data-tab="manage"]').click();true`);await wait('document.querySelector(".admin-people-filters")','People');
  await run(`document.querySelector('.admin-people-filters').open=true;true`);await scan('Admin People filters');
  await run(`document.querySelector('#admin-panel [data-tab="privacy"]').click();true`);await sleep(200);await scan('Admin Privacy');
  // Existing non-removing dialogs opened from Admin must remain usable.
  await run(`window.openProjectsModal();true`);await sleep(300);
  check(await run(`document.querySelector('#projects-modal').contains(document.activeElement)&&document.querySelector('#admin-panel').inert`),'Existing Projects modal can open above Admin');
  await key('Escape');await sleep(100);
  check(await run(`!document.querySelector('#projects-modal').classList.contains('active')&&document.querySelector('#admin-panel').contains(document.activeElement)`),'Existing Projects modal closes without removing its DOM or trapping Admin');
  // Screen navigation owns its inert state while dialogs are suspended.
  await run(`window.AppNav.go('inbox');true`);await sleep(500);
  check(await run(`document.body.dataset.destination==='inbox'&&getComputedStyle(document.querySelector('#admin-panel')).display==='none'`),'Inbox handoff suspends the prior dialog');
  await run(`window.closeMessagesModal();true`);await sleep(200);
  check(await run(`document.querySelector('#admin-panel').contains(document.activeElement)&&document.querySelector('#admin-panel').getAttribute('aria-modal')==='true'`),'Returning from Inbox restores the dialog and focus');
  await key('Escape');await sleep(50);check(await run(`!document.querySelector('#admin-panel')&&(window.__adminOpener.isConnected ? document.activeElement===window.__adminOpener : document.activeElement.dataset.destination==='explore')`),'Admin close restores its opener or the current destination after a redraw');
  const before=await run(`Number(document.querySelector('#cd-resize-handle').getAttribute('aria-valuenow'))`);
  await run(`document.querySelector('#cd-resize-handle').focus();true`);await key('ArrowRight');
  check(await run(`Number(document.querySelector('#cd-resize-handle').getAttribute('aria-valuenow'))>${before}`),'Keyboard resize exposes the new width');
  await app.load(390,844);await run(`window.AppNav.go('explore');true`);await sleep(300);await scan('Phone Explore');
  await app.send('Emulation.setDeviceMetricsOverride',{width:640,height:360,deviceScaleFactor:1,mobile:false});await sleep(200);
  check(await run(`document.documentElement.scrollWidth<=innerWidth`),'640px reflow has no page-level horizontal overflow');await scan('640px reflow');
  check(app.dialogs.length===0,'No native prompt/alert was needed');
  check(!app.errors.some(error=>/dialog-focus|_syncResourceTabs|filter is not a function/.test(error)),'No new focus or keyboard runtime error');
  console.log(`Accessibility: ${checks} checks passed`);
} finally {await app.close();}
