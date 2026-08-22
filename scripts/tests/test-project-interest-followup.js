#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const panel = fs.readFileSync(path.join(root, 'assets/js/node-panel.js'), 'utf8');
const helpers = fs.readFileSync(path.join(root, 'assets/js/followup-contact.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/sql/migrations/20260822c_project_interest_followups.sql'), 'utf8');

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.project_interest_followups/, 'project request follow-up history must be durable');
assert.match(migration, /REFERENCES public\.project_members\(id\) ON DELETE CASCADE/, 'history must belong to the canonical project request row');
assert.match(migration, /CHECK \(channel IN \('message', 'email'\)\)/, 'Message and Email must remain distinct channels');
assert.match(migration, /Project owners can view request follow-ups[\s\S]*owner\.user_id = auth\.uid\(\)/, 'only the actual project owner may read follow-up history');
assert.match(migration, /Project owners can create request follow-ups[\s\S]*pm\.role = 'pending'[\s\S]*owner\.user_id = auth\.uid\(\)/, 'only the actual owner may record follow-up for a pending request');
assert.doesNotMatch(migration, /FOR (?:UPDATE|DELETE)/, 'follow-up facts must be append-only');
assert.match(migration, /get_project_interest_requests[\s\S]*SECURITY DEFINER[\s\S]*owner\.user_id = auth\.uid\(\)[\s\S]*requester\.email/, 'requester email must be returned only through an owner-gated read');
assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_project_interest_requests\(UUID\) FROM PUBLIC/, 'owner contact lookup must not be publicly executable');
const ownerRequestRpc = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.get_project_interest_requests'));
assert.doesNotMatch(ownerRequestRpc, /pm\.created_at/, 'owner request loading must not depend on the nonexistent live project_members.created_at column');
assert.doesNotMatch(ownerRequestRpc, /ORDER BY pm\.joined_at/, 'pending requests must not be ordered by joined_at, which represents actual membership and is not populated for requests');
assert.doesNotMatch(panel, /project_members\.created_at|pm\.created_at/, 'Project request UI must not assume a project_members request timestamp');

assert.match(panel, /from '\.\/followup-contact\.js'/, 'Projects must reuse the Opportunity contact helpers');
assert.match(panel, /rpc\('get_project_interest_requests', \{ p_project_id: projectId \}\)/, 'Project owner review must use the protected request lookup');
assert.match(panel, /function escapeHtml\(text\)[\s\S]*div\.textContent = text[\s\S]*const escape = escapeHtml;/, 'project request rendering must use the module-local canonical HTML escaper');
assert.doesNotMatch(panel, /const escape = window\.escapeHtml \|\|/, 'request rendering must not depend on a separately initialized global escaper');
for (const escapedAttribute of ['projectId', 'request.id', 'user.id', 'projectTitle', 'emailDraft.href']) {
  const escaped = escapedAttribute.replace('.', '\\.');
  assert.match(panel, new RegExp(`="\\$\\{escape\\(${escaped}\\)\\}"`), `${escapedAttribute} must be escaped before HTML attribute interpolation`);
}
assert.match(panel, /\$\{escape\(user\.name\)\}[\s\S]*\$\{escape\(user\.bio\.substring[\s\S]*\$\{escape\(skill\)\}/, 'requester text fields must be HTML-escaped');
assert.match(panel, /createNativeEmailDraft\([\s\S]*Join request for \$\{projectTitle\}[\s\S]*interest in joining \$\{projectTitle\}/, 'native email must contain project-specific recipient context');
assert.match(panel, /<a class="email-request-action" href="\$\{escape\(emailDraft\.href\)\}"/, 'Email must be a direct native mailto anchor');
assert.doesNotMatch(panel, /email-request-action[\s\S]{0,500}preventDefault\(/, 'native email handoff must not be intercepted');
assert.match(panel, /email-request-action[\s\S]*recordFollowupBestEffort[\s\S]*p_channel: 'email'/, 'Email clicks must start best-effort truthful persistence');
assert.match(panel, /openMessagesModal\(\)[\s\S]*MessagingModule\.startConversation[\s\S]*type: 'project'[\s\S]*p_channel: 'message'/, 'Message must use canonical messaging with project context and record only after initiation');
assert.match(panel, /const messagesModal = document\.getElementById\('messages-modal'\);[\s\S]*const requestModalDisplay = modal\.style\.display;[\s\S]*modal\.style\.display = 'none';[\s\S]*await window\.openMessagesModal\(\)/, 'Message must hide the request overlay before opening canonical messaging');
assert.match(panel, /const restoreRequestModal = \(\) => \{[\s\S]*modal\.style\.display = requestModalDisplay;[\s\S]*messagesObserver\?\.disconnect\(\);[\s\S]*MutationObserver[\s\S]*!messagesModal\.classList\.contains\('active'\)\) restoreRequestModal\(\)/, 'closing canonical messaging must restore the same Join Requests modal');
assert.match(panel, /const projectPanelDisplay = panelElement\?\.style\.display;[\s\S]*if \(panelElement\) panelElement\.style\.display = 'none';[\s\S]*await window\.openMessagesModal\(\)/, 'the Project side panel must leave the visual stack before canonical messaging opens');
assert.match(panel, /const restoreRequestModal = \(\) => \{[\s\S]*modal\.style\.display = requestModalDisplay;[\s\S]*panelElement\.style\.display = projectPanelDisplay;[\s\S]*messagesObserver\?\.disconnect\(\)/, 'closing Messages must restore the same Project panel and request modal instances');
const projectMessageHandoff = panel.slice(panel.indexOf("modal.querySelectorAll('.message-request-btn')"), panel.indexOf("modal.querySelectorAll('.email-request-action')"));
assert.doesNotMatch(projectMessageHandoff, /closeNodePanel\(|openNodePanel\(|loadNodeDetails\(/, 'temporary messaging handoff must preserve prior Project/request context without destructive close or reload');
assert.match(panel, /catch \(contactError\)[\s\S]*if \(!messagesModal\?\.classList\.contains\('active'\)\) restoreRequestModal\(\)/, 'failed message handoff must not strand the Join Requests modal hidden');
assert.match(panel, /summarizeFollowups\(request\.followups\)[\s\S]*Message[\s\S]*Email[\s\S]*attempts[\s\S]*initiated/, 'history must compactly preserve each truthful channel and repeat attempts');
assert.doesNotMatch(panel, /Email (?:sent|delivered)/i, 'mailto history must not claim delivery');

assert.match(helpers, /export function createNativeEmailDraft/, 'shared native email helper must remain exported');
assert.match(helpers, /export function recordFollowupBestEffort/, 'shared non-blocking persistence helper must remain exported');
assert.match(helpers, /export function summarizeFollowups/, 'shared compact history helper must remain exported');

console.log('Project interest follow-up communication: all checks passed');
