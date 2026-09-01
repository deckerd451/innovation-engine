#!/usr/bin/env node
'use strict';

// Focused contract for the Reflection "Waiting On You" area:
//  1. Messages waiting on the reader's reply are told apart from messages the
//     reader already sent and is waiting to hear back on -- they are not all
//     the same row any more.
//  2. Acting on the highlighted row hands the "start here" focus to the next
//     item instead of always pinning messages as the sole top priority.
//  3. Opportunities and project bids that need attention join the same
//     distinct-highlight-and-advance flow, so the single "start here" item can
//     be any of them -- not just a message.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const digest = fs.readFileSync(path.join(root, 'assets/js/start-daily-digest.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/command-dashboard.css'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/sql/functions/get_start_sequence_data.sql'), 'utf8');
const report = fs.readFileSync(path.join(root, 'assets/js/start-sequence-report.js'), 'utf8');

// --- 1. inbound vs outbound -------------------------------------------------
assert.match(digest, /direction:\s*'inbound'/, 'attention rows should carry an inbound direction');
assert.match(digest, /direction:\s*'outbound'/, 'attention rows should carry an outbound direction');
assert.match(digest, /immediate\.messages_awaiting_reply/, 'sent-and-awaiting-reply messages should be read from data');
assert.match(digest, /waiting on your reply/, 'inbound messages should read as waiting on your reply');
assert.match(digest, /'message' : 'messages'\} you sent/, 'outbound messages should read as sent and awaiting a reply');
assert.match(digest, /Waiting on your reply/, 'group header for inbound items');
assert.match(digest, /You're waiting to hear back/, 'group header for outbound items');
// Direction, not decoration, drives colour + order.
assert.match(digest, /directionRank\s*=\s*\{\s*inbound:\s*0,\s*outbound:\s*1\s*\}/);
assert.match(digest, /item\.direction === 'inbound' \? 'now' : 'soon'/);

// --- 2. focus advances ----------------------------------------------------
assert.match(digest, /_clearedAttention/, 'a per-visit set tracks rows already acted on');
assert.match(digest, /actions\.find\(item => !_clearedAttention\.has\(item\.key\)\)/, 'focus is the first row not yet acted on');
assert.match(digest, /network-reflection-attention-row--focus/, 'the focus row gets its own class');
assert.match(digest, /'Start here'/, 'the focus row is labelled');
assert.match(digest, /_renderReflectionAttention\(_lastReflectionData\)/, 'acting on a row re-renders so the focus moves on');
// Inbound and outbound message rows share openMessaging, so clearing must be
// keyed per row, never per handler.
assert.doesNotMatch(digest, /_clearedAttention\.(has|add|delete)\(item\.handler\)/);

// --- 3. styling hooks ---------------------------------------------------
assert.match(css, /\.network-reflection-attention-row--focus\b/);
assert.match(css, /\.network-reflection-attention-group-title\b/);
assert.match(css, /\.network-reflection-attention-row--done\b/);

// --- 4. data source -----------------------------------------------------
assert.match(sql, /'messages_awaiting_reply', json_build_object/, 'RPC exposes the sent-and-awaiting-reply count');
assert.match(sql, /ORDER BY m\.created_at DESC\s*\n\s*LIMIT 1\s*\n\s*\) = user_community_id/, 'counts threads whose last message the reader sent');
assert.match(report, /messages_awaiting_reply: \{ count: 0/, 'empty report keeps the shape stable before the RPC redeploys');

// --- 5. opportunities + bids share the highlight-and-advance flow --------
// Project bids already flow through as inbound (bids_to_review) and outbound
// (pending_bids); opportunities now join too, as their own calm tier so the
// "start here" focus can land on any of them.
assert.match(digest, /key:\s*'bids_to_review'/, 'offers to review are an attention row');
assert.match(digest, /key:\s*'pending_bids'/, 'offers you sent are an attention row');
assert.match(digest, /_reflectionAttentionActions\(immediate, data\?\.opportunities/, 'opportunity data is fed into the attention builder');
assert.match(digest, /direction:\s*'opportunity'/, 'opportunities carry their own direction');
assert.match(digest, /key:\s*'skill_matched_projects'/, 'skill-matched opportunities surface as an attention row');
assert.match(digest, /countOf\(opportunities\?\.skill_matched_projects\)/, 'the opportunity row reads its count from opportunity data');
assert.match(digest, /handler:\s*'openSkillMatchedProjects'/, 'the opportunity row routes to the skill-matched projects handler');
assert.match(digest, /direction:\s*'opportunity',\s*title:\s*'Worth a look'/, 'opportunities get their own group heading');
assert.match(digest, /focus\.direction === 'opportunity'/, 'an opportunity can be the "start here" focus');
// The opportunity row is not keyed on its handler either -- same per-row rule.
assert.match(digest, /rankOf\(a\.direction\) - rankOf\(b\.direction\)/, 'ordering ranks every direction, opportunities last');
assert.match(digest, /item\.direction === 'opportunity' \? 'later' : urgency/, 'opportunities get a distinct colour tone');
assert.match(css, /\.network-reflection-attention-row--later\b/, 'opportunity rows have their own styling hook');
// openSkillMatchedProjects is now an attention handler, so the same insight is
// not also duplicated under "Next moves".
assert.match(digest, /_isAttentionHandler[\s\S]{0,200}openSkillMatchedProjects/, 'skill-matched projects count as an attention handler');

console.log('Network Reflection attention direction + focus: all checks passed');
