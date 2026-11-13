// Synthetic identity checks only; no production service is contacted.
import assert from 'node:assert/strict';
import {appHarness} from './helpers/app-harness.mjs';
const app = await appHarness();
const {evaluate:run,wait,sleep} = app;
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; console.log('PASS', label); }
try {
  await app.load(390, 844);
  await run(`window.currentAuthUser={id:'auth-me',email:'member@example.test'};window.AppNav.go('you');true`);
  await wait('document.querySelector("#btn-profile-logout")','You account controls');
  check(await run(`!document.querySelector('#btn-profile-admin')`),'Ordinary member has no Admin button');
  await run(`window.currentAuthUser.email='dmhamilton1@live.com';window.openProfileModal();true`);
  await wait('document.querySelector("#btn-profile-admin")','Admin account control');
  check(await run(`document.querySelector('#btn-profile-admin').textContent.trim()==='Admin panel'`),'Admin has an explicit button label');
  // Short mobile windows must retain a tappable account action above navigation.
  for (const height of [844,600]) {
    await app.send('Emulation.setDeviceMetricsOverride',{width:390,height,deviceScaleFactor:1,mobile:true});await sleep(250);
    const point = await run(`(() => {const b=document.querySelector('#btn-profile-admin');const r=b.getBoundingClientRect(),n=document.querySelector('#app-nav').getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,visible:r.top>=0&&r.bottom<=n.top&&r.height>=44&&b.contains(document.elementFromPoint(x,y)),overflow:document.documentElement.scrollWidth>innerWidth};})()`);
    check(point.visible&&!point.overflow,`Admin control is unobstructed at 390×${height}`);
    await app.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
    await app.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await wait('document.querySelector("#admin-panel")','Admin panel after real tap');
    check(await run(`document.querySelector('#admin-panel').contains(document.activeElement)`),'Real tap opens existing Admin with focus inside');
    await app.key('Escape');await sleep(80);
    check(await run(`document.activeElement.id==='btn-profile-admin'`),'Closing Admin restores its You button');
  }
  await run(`window.currentAuthUser.email='member@example.test';document.querySelector('#btn-profile-admin').click();true`);
  check(await run(`!document.querySelector('#admin-panel')`),'A stale button rechecks permission before opening');
  await run(`window.openProfileModal();true`);
  check(await run(`!document.querySelector('#btn-profile-admin')`),'Reopening You removes the button for a non-admin');
  console.log(`${checks}/${checks} mobile Admin checks passed`);
} finally {await app.close();}
