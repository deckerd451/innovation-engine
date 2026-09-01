#!/usr/bin/env node
'use strict';

// Regression: the Network Reflection summary + attention + next-moves areas all
// hang off one RPC, get_start_sequence_data. In production community.skills is a
// comma-separated TEXT string, not a TEXT[] column, so feeding it straight into
// `skill = ANY(c.skills)` made Postgres abort the whole function with
//   "op ANY/ALL (array) requires array on right side"
// and every dependent Reflection panel showed "Database error: op ANY/ALL (...".
//
// The fix normalises skills to a real array once, up front, and every
// array-typed operation now runs against that local variable -- never against
// the raw column, whose storage type varies by environment.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(
  path.join(root, 'supabase/sql/functions/get_start_sequence_data.sql'),
  'utf8'
);
// The "must not appear" checks below target executable SQL, not the comments
// that explain the bug -- strip line comments before asserting absence.
const executableSql = sql.replace(/--[^\n]*/g, '');

// --- 1. skills is read as text and normalised to an array before use --------
assert.match(sql, /skills::text\s*\n\s*INTO user_community_id, skills_raw/,
  'the RPC must read community.skills as text, not assume an array column');
assert.match(sql, /user_skills\s+TEXT\[\]/, 'a normalised TEXT[] local holds the caller skills');
assert.match(sql, /string_to_array\(skills_raw, ','\)/,
  'a comma-separated skills string must be split into an array');
assert.match(sql, /skills_raw LIKE '\{%\}'/,
  'an already-array-literal skills value must be handled too');

// --- 2. no array operator ever touches the raw column ----------------------
// These are the exact expressions that threw before the fix.
assert.doesNotMatch(executableSql, /ANY\(c\.skills\)/,
  'skill = ANY(c.skills) is what raised "op ANY/ALL (array) requires array on right side"');
assert.doesNotMatch(executableSql, /array_length\(other\.skills/,
  'array_length(other.skills, 1) also assumes an array column');
assert.doesNotMatch(executableSql, /array_length\(c\.skills/, 'no array_length against the raw caller column either');

// --- 3. skill matching now runs against the normalised array --------------
assert.match(sql, /skill = ANY\(user_skills\)/,
  'skill matching must compare against the normalised user_skills array');
assert.match(sql, /array_length\(user_skills, 1\) > 0/,
  'skill matching is guarded so an empty skill set short-circuits to 0');

// --- 4. the payload exposes skills as a clean array ----------------------
assert.match(sql, /'skills', user_skills/,
  "the profile block should surface the normalised array, not the raw column");

// --- 5. unrelated Reflection wiring is untouched ------------------------
assert.match(sql, /'messages_awaiting_reply', json_build_object/,
  'the sent-and-awaiting-reply count must still be present');
assert.match(sql, /COALESCE\(c\.connection_count, 0\)/,
  'the connection_count read the Network Report depends on must be preserved');

console.log('Network Reflection summary skills-array handling: all checks passed');
