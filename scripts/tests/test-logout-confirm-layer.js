#!/usr/bin/env node
// Every Log out button goes through window.doLogout, which asks "Log out?" in
// the shared #ds-confirm-modal. That dialog used the generic .modal.active
// layer (--z-modal: 200), below the mobile My Space screen and the profile
// side panel, so on a phone it opened invisibly underneath them and Log out
// appeared to do nothing. This keeps the dialog above every surface that can
// open it. scripts/tests/browser/run-logout-confirm.mjs checks the same thing
// with real clicks in Chrome.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');
const index = read('index.html');
const designSystem = read('assets/css/design-system.css');
const mobileYouCss = read('assets/css/mobile-you.css');
const nodePanel = read('assets/js/node-panel.js');
const base = read('assets/css/base.css');

const confirmZ = Number((designSystem.match(/#ds-confirm-modal\.modal\.active\s*\{\s*z-index:\s*(\d+)\s*!important;/) || [])[1]);
assert.ok(confirmZ, 'design-system.css gives #ds-confirm-modal.modal.active its own !important z-index');

const layers = {
  'mobile My Space screen': Number((mobileYouCss.match(/#mobile-you-screen\.mobile-you-screen\s*\{[^}]*z-index:\s*(\d+)/) || [])[1]),
  'profile side panel': Number((nodePanel.match(/panelElement\.id = 'node-side-panel';[\s\S]*?z-index:\s*(\d+)/) || [])[1]),
  'profile modal': Number((base.match(/#profile-modal\.modal\s*\{[^}]*z-index:\s*(\d+)/) || [])[1]),
};
for (const [name, z] of Object.entries(layers)) {
  assert.ok(z, `found the ${name} z-index`);
  assert.ok(confirmZ > z, `confirmation dialog (${confirmZ}) is above the ${name} (${z})`);
}

// design-system.css is linked with a cache-buster so returning visitors get the fix.
assert.match(index, /assets\/css\/design-system\.css\?v=logout-confirm-20261015/);

// The Log out buttons that use the dialog.
assert.match(read('assets/js/mobile-you.js'), /\[data-profile-action="logout"\]'\)\?\.addEventListener\('click', \(\) => window\.doLogout\?\.\(\)\)/);
assert.match(nodePanel, /id="profile-logout-btn"[^>]*onclick="window\.doLogout\?\.\(\);"/);
assert.match(read('assets/js/command-dashboard.js'), /\$id\('cd-logout-btn'\)[\s\S]{0,200}window\.doLogout\(\)/);
// doLogout confirms, then signs out of Buildspace (Supabase) only.
assert.match(index, /window\.doLogout = async function doLogout\(\)[\s\S]*?window\.dsConfirm\(\{[\s\S]*?title: "Log out\?"[\s\S]*?window\.handleLogout\(\)/);
assert.match(read('auth.js'), /window\.handleLogout = async function handleLogout\(\)[\s\S]*?window\.supabase\.auth\.signOut\(\)/);

console.log('logout confirmation layer contracts passed');
