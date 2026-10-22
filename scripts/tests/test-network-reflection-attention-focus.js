#!/usr/bin/env node
'use strict';

// Focused contract for the Reflection "Needs attention" area:
//  1. It lists only what someone is waiting on the reader for (a reply, a
//     request to connect, an offer to review). Messages and offers the reader
//     sent are not urgent work, and skill-matched projects are a calm Move.
//  2. Acting on the highlighted row hands the "start here" focus to the next
//     item instead of always pinning the same row.
// Behaviour is covered in test-home-trustworthy-suggestions.js.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const digest = fs.readFileSync(path.join(root, 'assets/js/start-daily-digest.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/command-dashboard.css'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/sql/functions/get_start_sequence_data.sql'), 'utf8');
const report = fs.readFileSync(path.join(root, 'assets/js/start-sequence-report.js'), 'utf8');

// --- 1. inbound only ------------------------------------------------------
assert.match(digest, /key:\s*'pending_requests'/);
assert.match(digest, /key:\s*'unread_messages'/);
assert.match(digest, /key:\s*'bids_to_review'/);
assert.match(digest, /waiting on your reply/, 'inbound messages read as waiting on your reply');
assert.doesNotMatch(digest, /immediate\.messages_awaiting_reply|immediate\.pending_bids/, 'outgoing items are not attention rows');
assert.doesNotMatch(digest, /You're waiting to hear back|you sent/, 'nothing presents what the reader sent as urgent');
assert.doesNotMatch(digest, /direction:\s*'(outbound|opportunity)'/);
assert.match(digest, /function _reflectionAttentionActions\(immediate\)/, 'only inbound data feeds the attention builder');
// Skill-matched projects stay available as a Move rather than attention.
assert.doesNotMatch(digest, /_isAttentionHandler[\s\S]{0,200}openSkillMatchedProjects/);
assert.match(digest, /item\.handler === 'openSkillMatchedProjects' \|\| !_isGenericReflectionNavigation/);

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
assert.match(css, /\.network-reflection-attention-row--done\b/);

// --- 4. data source (unchanged: the RPC still reports outgoing counts) ---
assert.match(sql, /'messages_awaiting_reply', json_build_object/, 'RPC exposes the sent-and-awaiting-reply count');
assert.match(report, /messages_awaiting_reply: \{ count: 0/, 'empty report keeps the shape stable');

console.log('Network Reflection attention (inbound only) + focus: all checks passed');
