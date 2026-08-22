#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const manager = fs.readFileSync(path.join(root, 'assets/js/organizations/opportunities.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'opportunity.html'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'assets/js/command-dashboard.js'), 'utf8');
const coordinator = fs.readFileSync(path.join(root, 'assets/js/explorer-coordinator.js'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'assets/js/node-panel.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/sql/migrations/20260822_opportunity_interests.sql'), 'utf8');
const followupMigration = fs.readFileSync(path.join(root, 'supabase/sql/migrations/20260822b_opportunity_interest_followups.sql'), 'utf8');
const contactHelpers = fs.readFileSync(path.join(root, 'assets/js/followup-contact.js'), 'utf8');

for (const exportedFunction of [
  'getOpportunityInterest',
  'expressOpportunityInterest',
  'withdrawOpportunityInterest',
  'getInterestedPeople',
  'recordOpportunityInterestFollowup'
]) {
  assert.match(manager, new RegExp(`export async function ${exportedFunction}\\b`), `${exportedFunction} must be exported`);
}

assert.match(manager, /error\?\.code === ["']23505["'][\s\S]*getOpportunityInterest/, 'duplicate interest retries must be idempotent');
assert.match(manager, /\.eq\("community_id", currentUserCommunityId\)/, 'interest reads and deletes must be scoped to the signed-in profile');
assert.match(manager, /const \{ posted_by: _ignoredPostedBy, \.\.\.safeUpdates \} = updates/, 'updateOpportunity must not submit posted_by changes');
assert.match(manager, /\.update\(\{[\s\S]{0,100}\.\.\.safeUpdates/, 'updateOpportunity must only submit sanitized updates');
assert.match(page, /profileId === opportunity\.posted_by/, 'poster view must be selected by canonical community identity');
assert.match(page, /getInterestedPeople\(opportunityId\)/, 'poster detail page must load interested people');
assert.match(page, /expressOpportunityInterest\(opportunityId\)/, 'member detail page must support expressing interest');
assert.match(page, /withdrawOpportunityInterest\(opportunityId\)/, 'member detail page must support withdrawing interest');
assert.match(manager, /community:community_id\s*\([\s\S]*?\bemail\b[\s\S]*?\)/, 'the existing poster-authorized lookup must return email for the optional contact action');
assert.match(page, /href="index\.html\?contact=\$\{encodeURIComponent\(person\.id\)\}&opportunity=\$\{encodeURIComponent\(opportunity\.id\)\}&opportunityTitle=\$\{encodeURIComponent\(opportunity\.title\)\}"/, 'poster contact must hand the interested community id to the deployment-safe main-app route');
assert.match(page, /if \(!validEmail\(person\.email\)\) return ''[\s\S]*fa-envelope[^\n]*> Email<\/a>/, 'email must be optional and shown only for a valid address');
assert.match(contactHelpers, /mailto:\$\{encodeURIComponent\(recipient\)\}\?subject=\$\{encodeURIComponent\(subject\)\}&body=\$\{encodeURIComponent\(body\)\}/, 'shared email drafts must retain a safely encoded mailto request');
assert.match(page, /const subject = `Interest in \$\{title\}`/, 'email subject must identify the opportunity');
assert.match(page, /const body = `Hi \$\{name\},[\s\S]*interest in \$\{title\}/, 'email body must identify the interested person and opportunity');
assert.match(page, /<a class="btn btn-primary"[^>]*><i class="fas fa-comment"><\/i> Message<\/a>[\s\S]*\$\{emailActions\(person, index\)\}/, 'in-app messaging must be an explicit primary channel in each row');
assert.match(page, /<a class="btn btn-secondary email-action" href="\$\{escapeHtml\(draft\.href\)\}"/, 'the primary email action must be a native mailto anchor');
assert.match(page, /function recordEmailAttempt\(person\)[\s\S]*recordFollowupBestEffort\(\(\) => recordOpportunityInterestFollowup\(opportunity\.id, person\.id, 'email'\)/, 'native email clicks must start best-effort durable history without awaiting it');
assert.match(page, /email-action[\s\S]*addEventListener\('click', \(\) => recordEmailAttempt/, 'the native email click must record the truthful email channel');
assert.doesNotMatch(page, /email-action[\s\S]{0,300}preventDefault\(/, 'the primary native mailto handoff must not be intercepted');
assert.doesNotMatch(page, /Promise\.race\([\s\S]*setTimeout\(resolve, 300\)/, 'native mailto navigation must not wait on persistence');
assert.doesNotMatch(page, /Email details|email-options-action|openEmailOptions|email-dialog|Try email app again|copy-email|copy-message/, 'the redundant visible email fallback and its unreachable implementation must be removed');
assert.doesNotMatch(page, /person-info[\s\S]{0,500}\$\{escapeHtml\(person\.email\)\}/, 'email address must not be displayed in the normal interested-person row');
assert.match(main, /await window\.openMessagesModal\(\);[\s\S]*window\.MessagingModule\.startConversation\(contactId, context\)/, 'opportunity contact intent must use the canonical in-app messaging flow');
assert.match(main, /if \(!conversationId\)[\s\S]*return;[\s\S]*record_opportunity_interest_followup[\s\S]*p_channel: "message"/, 'message follow-up must be recorded only after a conversation is initiated');
assert.match(main, /type: "opportunity"[\s\S]*params\.get\("opportunity"\)[\s\S]*params\.get\("opportunityTitle"\)/, 'the conversation must retain opportunity context');
assert.match(page, /people\.map\(\(\{ community: person, created_at, followups = \[\] \}, index\) => person \?/, 'null community profiles must be handled per interest row');
assert.match(page, /Profile unavailable/, 'hidden or unavailable profiles must render without exposing profile data');
assert.match(page, /class="back-link" href="index\.html\?explorer=opportunities"/, 'the back link must return to the deployment-safe canonical Opps experience');
assert.doesNotMatch(page, /class="back-link" href="\/?opportunities\.html"/, 'the back link must not route through the standalone opportunities page');
assert.match(main, /params\.get\("explorer"\)[\s\S]*supportedTabs\.has\(requestedTab\)[\s\S]*CommandDashboard\.selectResourceTab\(requestedTab\)/, 'main-app bootstrap must safely activate a requested Explorer tab');

const singleOpportunityQuery = manager.slice(
  manager.indexOf('export async function getOpportunity(id)'),
  manager.indexOf('export async function getOpportunities(filters')
);
assert.match(singleOpportunityQuery, /\.from\("opportunities"\)\s*\.select\("\*"\)\s*\.eq\("id", id\)\s*\.single\(\)/, 'single-opportunity loading must use the canonical opportunity row query');
assert.doesNotMatch(singleOpportunityQuery, /organizations\s*\(|theme_circles\s*\(|projects\s*\(/, 'single-opportunity loading must not depend on unnecessary nested relationships');

assert.match(dashboard, /ExplorerCoordinator\.selectOpportunity\(\{ id, label: name \}\)/, 'the normal Opps surface must select opportunities through ExplorerCoordinator');
assert.match(coordinator, /await window\.openNodePanel\(\{ id, type: 'opportunity', name: label \}\)/, 'opportunity selection must preserve the current detail-panel flow');
assert.match(panel, /href="opportunity\.html\?id=\$\{encodeURIComponent\(opp\.id\)\}"/, 'the in-app opportunity panel must use a deployment-base-safe relative link to the canonical interest workflow');
assert.doesNotMatch(panel, /href="\/opportunity\.html\?/, 'the canonical interest link must not discard a GitHub Pages project base path');
assert.match(panel, /Express or manage interest/, 'members must see an obvious interest action in the normal in-app flow');
assert.match(panel, /View interested people/, 'posters must see an obvious interested-people action in the normal in-app flow');

assert.match(migration, /UNIQUE\s*\(opportunity_id, community_id\)/i, 'duplicate interest must be prevented in the database');
assert.match(migration, /Members and posters can view opportunity interests/, 'read access policy must be explicit');
assert.match(migration, /poster\.user_id = auth\.uid\(\)/, 'only the actual poster may read other members\' interests');
assert.match(migration, /o\.posted_by <> opportunity_interests\.community_id/, 'posters must not express interest in their own opportunity');
assert.match(migration, /BEFORE UPDATE OF posted_by ON public\.opportunities/i, 'posted_by changes must be blocked at the database boundary');
assert.match(migration, /NEW\.posted_by IS DISTINCT FROM OLD\.posted_by/, 'poster immutability must compare old and new ownership');
assert.doesNotMatch(migration, /FOR SELECT[\s\S]{0,120}USING\s*\(true\)/i, 'interested identities must not be public to all authenticated members');
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.notify_opportunity_interest\(\)/, 'new interest must create a durable notification');
assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = public, pg_temp/, 'notification trigger must use a locked server-side execution context');
assert.match(migration, /SELECT o\.posted_by, o\.title[\s\S]*WHERE o\.id = NEW\.opportunity_id/, 'notification recipient must be derived from the actual opportunity poster');
assert.match(migration, /INSERT INTO public\.notifications \(user_id, type, title, message, link, metadata\)[\s\S]*v_poster_id,[\s\S]*'opportunity_interest'/, 'only the canonical poster must receive the interest notification');
assert.match(migration, /'opportunity\.html\?id=' \|\| NEW\.opportunity_id::TEXT/, 'notification must use a deployment-base-safe relative link to the protected opportunity-interest view');
assert.doesNotMatch(migration, /'\/opportunity\.html\?id=' \|\| NEW\.opportunity_id::TEXT/, 'notification link must not discard a GitHub Pages project base path');
assert.match(migration, /'interested_community_id', NEW\.community_id/, 'notification must retain the profile identity needed by in-app messaging');
assert.doesNotMatch(migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.notify_opportunity_interest')), /\bemail\b/i, 'notification delivery must not read or include either user email');
assert.match(migration, /AFTER INSERT ON public\.opportunity_interests[\s\S]*EXECUTE FUNCTION public\.notify_opportunity_interest\(\)/, 'notification must be atomic with a newly expressed interest');
assert.doesNotMatch(migration, /https?:\/\/(?:api\.)?(?:resend|sendgrid|postmark|mailgun)/i, 'interest notifications must not fabricate an unconfigured external delivery provider');

const openPublicGate = page.indexOf("opportunity.status !== 'open' || opportunity.is_public !== true");
const interestLookup = page.indexOf('interest = await getOpportunityInterest(opportunityId)');
const deadlineGate = page.indexOf('deadlinePassed && !isPoster && !interest');
assert.ok(openPublicGate !== -1 && openPublicGate < interestLookup, 'closed and private opportunities must remain unavailable before interest handling');
assert.ok(interestLookup !== -1 && interestLookup < deadlineGate, 'existing interest must be loaded before applying the deadline gate');
assert.match(page, /deadlinePassed && !isPoster && !interest/, 'expired opportunities must remain available only to posters and existing interested members');
assert.match(page, /if \(isPoster\) await renderInterestedPeople\(\)/, 'poster must still load interested people after passing the deadline gate');
assert.match(page, /interest = interest\s*\?\s*\(await withdrawOpportunityInterest\(opportunityId\), null\)\s*:\s*await expressOpportunityInterest\(opportunityId\)/, 'existing interested members must retain withdrawal while new interest uses the protected insert path');
assert.match(migration, /o\.application_deadline IS NULL OR o\.application_deadline > NOW\(\)/, 'database policy must block new interest after the deadline');

assert.match(followupMigration, /CREATE TABLE IF NOT EXISTS public\.opportunity_interest_followups/, 'follow-up history must be durable');
assert.match(followupMigration, /REFERENCES public\.opportunity_interests\(id\) ON DELETE CASCADE/, 'follow-ups must belong to the private interest relationship');
assert.match(followupMigration, /CHECK \(channel IN \('message', 'email'\)\)/, 'follow-up channels must use a narrow truthful taxonomy');
assert.match(followupMigration, /Posters can view opportunity interest follow-ups[\s\S]*poster\.user_id = auth\.uid\(\)/, 'only the actual poster may read follow-up history');
assert.match(followupMigration, /Posters can create opportunity interest follow-ups[\s\S]*poster\.user_id = auth\.uid\(\)/, 'only the actual poster may create follow-up history');
assert.doesNotMatch(followupMigration, /FOR (?:UPDATE|DELETE)/, 'follow-up history must be append-only');
assert.match(followupMigration, /SECURITY INVOKER/, 'follow-up recording RPC must preserve RLS authorization');
assert.match(manager, /followups:opportunity_interest_followups[\s\S]*channel[\s\S]*initiated_at/, 'poster interest reads must include follow-up history');
assert.match(contactHelpers, /function summarizeFollowups[\s\S]*new Map\(\)[\s\S]*\['message', 'email'\]/, 'shared follow-up summaries must keep Message and Email distinct');
assert.match(page, /const followupSummary = followups[\s\S]*summarizeFollowups\(followups\)[\s\S]*summary\.count > 1[\s\S]*\$\{label\} initiated/, 'follow-up history must stay compact by showing one truthful latest summary and attempt count per channel');
assert.match(page, /\$\{followupSummary\(followups\)\}/, 'each interested person must render the compact follow-up summary');
assert.doesNotMatch(page, /Email (?:sent|delivered)/i, 'the UI must not claim mailto delivery');

console.log('Opportunity interest flow and privacy: all checks passed');
