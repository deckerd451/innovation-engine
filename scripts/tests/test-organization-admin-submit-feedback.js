#!/usr/bin/env node

// organization-admin.html's create-org and post-opp forms have no
// client-side dedupe on the server side -- a slow network round-trip with
// no visible feedback reads as a dead click and invites a duplicate
// submission. This asserts both forms disable their submit button with a
// busy label for the duration of the request, and only re-enable it on the
// paths that don't navigate away.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'organization-admin.html'), 'utf8');

assert.match(html, /function setFormSubmitting\(button, isSubmitting, busyLabel\) \{[\s\S]*?button\.disabled = true;[\s\S]*?\} else \{[\s\S]*?button\.disabled = false;/,
  'setFormSubmitting must disable the button while submitting and re-enable it when told to stop');

const createOrgHandler = html.slice(
  html.indexOf("document.getElementById('create-org-form').addEventListener"),
  html.indexOf("document.getElementById('post-opp-form').addEventListener"),
);
assert.match(createOrgHandler, /const submitBtn = e\.target\.querySelector\('button\[type="submit"\]'\);\s*\n\s*setFormSubmitting\(submitBtn, true,/,
  'create-org submit must disable its button immediately, before any async work');
assert.match(createOrgHandler, /SUBMIT BLOCKED — no authenticated session[\s\S]*?setFormSubmitting\(submitBtn, false\)/,
  'the no-session bail-out must re-enable the button so the user can retry after logging in');
assert.match(createOrgHandler, /name validation failed[\s\S]*?setFormSubmitting\(submitBtn, false\)/,
  'the validation bail-out must re-enable the button so the user can fix the name and resubmit');
assert.match(createOrgHandler, /createOrganization\(\) threw[\s\S]*?setFormSubmitting\(submitBtn, false\)/,
  'a thrown error must re-enable the button so the user can retry');
const createOrgSuccess = createOrgHandler.slice(createOrgHandler.indexOf('Organization created successfully'));
const createOrgSuccessBeforeCatch = createOrgSuccess.slice(0, createOrgSuccess.indexOf('} catch'));
assert.doesNotMatch(createOrgSuccessBeforeCatch, /setFormSubmitting\(submitBtn, false\)/,
  'the success path navigates away shortly after -- it must not re-enable the button and invite a duplicate create');

const postOppHandler = html.slice(html.indexOf("document.getElementById('post-opp-form').addEventListener"));
assert.match(postOppHandler, /const submitBtn = e\.target\.querySelector\('button\[type="submit"\]'\);\s*\n\s*setFormSubmitting\(submitBtn, true,/,
  'post-opp submit must disable its button immediately, before any async work');
assert.match(postOppHandler, /catch \(error\) \{[\s\S]*?setFormSubmitting\(submitBtn, false\)/,
  'a thrown error must re-enable the post-opp button so the user can retry');
const postOppSuccess = postOppHandler.slice(postOppHandler.indexOf('Opportunity posted successfully'));
const postOppSuccessBeforeCatch = postOppSuccess.slice(0, postOppSuccess.indexOf('} catch'));
assert.doesNotMatch(postOppSuccessBeforeCatch, /setFormSubmitting\(submitBtn, false\)/,
  'the success path navigates away shortly after -- it must not re-enable the button and invite a duplicate post');

console.log('✅ test-organization-admin-submit-feedback passed');
