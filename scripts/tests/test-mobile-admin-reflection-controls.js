#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'assets/js/dashboard-actions.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'assets/js/command-dashboard.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/command-dashboard.css'), 'utf8');

assert.match(html, /id="btn-admin-mobile"[\s\S]*fa-crown/, 'mobile admin crown must exist in the persistent shell');
assert.match(actions, /btn-admin-mobile[\s\S]*openAdminPanel/, 'mobile crown must open the admin panel');
assert.match(actions, /mobileAdminBtn\.style\.display = 'flex'/, 'confirmed admins must see the mobile crown');
assert.match(css, /@media \(max-width:1023px\)[\s\S]*#btn-admin-mobile/, 'mobile crown must have small-screen positioning');

assert.match(html, /id="network-reflection-toggle"[\s\S]*aria-expanded="true"/, 'reflection must expose a collapse control');
assert.match(html, /id="network-reflection-resizer"[\s\S]*role="separator"/, 'reflection must expose an accessible resize handle');
assert.match(dashboard, /networkReflectionCollapsed/, 'collapsed preference must persist');
assert.match(dashboard, /networkReflectionDesktopWidth/, 'desktop width must persist');
assert.match(dashboard, /networkReflectionMobileHeight/, 'mobile height must persist');
assert.match(dashboard, /resizer\.addEventListener\('keydown'/, 'resize handle must support keyboard resizing');
assert.match(css, /body\.reflection-collapsed #network-reflection/, 'collapsed layout must have explicit styles');

console.log('✅ test-mobile-admin-reflection-controls passed');
