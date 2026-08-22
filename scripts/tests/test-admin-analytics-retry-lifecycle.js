#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const analytics = fs.readFileSync(path.join(root, 'assets/js/admin-analytics.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'assets/js/dashboard-actions.js'), 'utf8');

const renderError = analytics.slice(analytics.indexOf('function renderError('), analytics.indexOf('// Load and render analytics'));
assert.match(renderError, /analyticsModal\.innerHTML = frameHtml/, 'an error must render into the current canonical analytics modal');
assert.match(renderError, /analyticsModal\.querySelector\('#admin-analytics-retry-btn'\)\?\.addEventListener\('click',[\s\S]*openAnalyticsModal\(\)/,
  'the visible modal instance must own the retry listener and re-enter canonical open');
assert.doesNotMatch(renderError, /document\.getElementById\('admin-analytics-retry-btn'\)/,
  'retry binding must not select a stale duplicate button from another module/modal instance');

const openModal = analytics.slice(analytics.indexOf('async function openAnalyticsModal()'), analytics.indexOf('function renderError('));
assert.match(openModal, /Loading analytics[\s\S]*await loadAnalyticsData\(\)/,
  'retry must show loading and await the same canonical analytics loader');

const loadData = analytics.slice(analytics.indexOf('async function loadAnalyticsData()'), analytics.indexOf('function initials('));
assert.match(loadData, /supabase\.rpc\('get_admin_network_analytics', \{ p_active_window_days: 30 \}\)/,
  'each canonical loader entry must issue a new network analytics RPC');
assert.doesNotMatch(loadData, /supabase\.rpc\([\s\S]{0,120}\.catch\(/,
  'Supabase RPC builders must not use unsupported Promise.catch chaining');
assert.match(loadData, /const \{ data, error \} = await supabase\.rpc\('get_admin_retention_analytics', \{\}\);[\s\S]*return \{ data, error \};[\s\S]*catch \(error\)[\s\S]*return \{ data: null, error \};/,
  'optional retention analytics must use the canonical awaited { data, error } result while remaining independently fail-safe');
assert.match(loadData, /renderError\([\s\S]*retryable: !isAuthError/,
  'data failures must remain retryable while authorization failures stay fail-closed');

assert.match(html, /admin-analytics\.js\?v=admin-analytics-rpc-await-20260822b/, 'post-auth loading must deploy the RPC await fix');
assert.match(actions, /import\('\.\/admin-analytics\.js\?v=admin-analytics-rpc-await-20260822b'\)/,
  'on-demand loading must use the identical canonical module URL');

assert.match(analytics, /function closeAnalyticsModal\([\s\S]*analyticsModal\.style\.display = 'none'/,
  'close/reopen must continue using the existing canonical modal lifecycle');

console.log('✅ test-admin-analytics-retry-lifecycle passed');
