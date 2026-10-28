#!/usr/bin/env node
// Live website code reads profiles by named columns and never reads email,
// so the database can later stop members reading community.email without
// breaking anything (the email-privacy plan, Stage B).
//
//   - No select('*') / select() on community or community_with_last_seen,
//     and no embedded community(*) in another table's select.
//   - No email in any profile select, filter or embedded profile -- none at
//     all: members (admins included) can't read the column
//     (docs/SECURITY_MEMBER_EMAIL_PRIVACY.md). Sign-in claims older profiles
//     on the server; the admin People panel reads emails through admin-only
//     database functions.
//   - The shared column lists (assets/js/profile-columns.js) exclude email,
//     and every page that queries profiles loads them first.
//   - Members' emails are not shown: profile pages, Inbox, Network overview,
//     opportunity and project-interest replies use Message instead.
//
// "Live" is every page plus each script any live file mentions by name (a
// generous reading, so a file only counts as dead when nothing refers to it).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const PAGES = ['index.html', 'explore.html', 'opportunities.html', 'opportunity.html',
  'organizations.html', 'organization-profile.html', 'organization-admin.html'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'scripts', 'docs', 'supabase', 'sql', 'demos']);
// The admin panel's column lists; their definitions are checked below (no
// email).
const ADMIN_COLUMNS_FILE = 'assets/js/adminPeopleService.js';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(js|html)$/.test(entry.name) && !/\.min\.js$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const files = walk('');
const source = new Map(files.map((f) => [f, read(f)]));
const live = new Set(PAGES.filter((p) => source.has(p)));
for (let grew = true; grew;) {
  grew = false;
  const text = [...live].map((f) => source.get(f)).join('\n');
  for (const f of files) {
    if (live.has(f) || !f.endsWith('.js')) continue;
    const base = path.basename(f).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`[/'"\`]${base}(\\?|['"\`])`).test(text)) { live.add(f); grew = true; }
  }
}

// Problems in one file's profile queries.
function problemsIn(file, text) {
  const found = [];
  const at = (i) => `${file}:${text.slice(0, i).split('\n').length}`;
  // Each query on the profile table or the presence view, to the end of
  // its statement.
  const query = /from\(\s*['"](community|community_with_last_seen)['"]\s*\)/g;
  for (let m; (m = query.exec(text));) {
    let segment = text.slice(m.index, m.index + 900);
    const end = segment.search(/;|\n\s*\n/);
    if (end > 0) segment = segment.slice(0, end);
    for (const sel of segment.matchAll(/\.select\(\s*(?:(['"`])([\s\S]*?)\1|([^,)]*))/g)) {
      const literal = sel[2];
      const expression = (sel[3] || '').trim().replace(/\($/, '()');
      if (literal === undefined && expression === '') found.push(`${at(m.index)} select() reads every column`);
      if (literal !== undefined && /(^|,)\s*\*/.test(literal)) found.push(`${at(m.index)} select('*') reads every column`);
      if (literal !== undefined && /\bemail\b/.test(literal)) found.push(`${at(m.index)} selects email`);
      if (expression && !/^window\.BuildspaceProfileColumns\.(own|member)$/.test(expression)
        && !(['ADMIN_PERSON_COLUMNS()', 'LIST_COLUMNS'].includes(expression) && file === ADMIN_COLUMNS_FILE)
        && !/^OWN_COLUMNS\(\)$/.test(expression)) {
        found.push(`${at(m.index)} selects an unchecked column list (${expression})`);
      }
    }
    if (/\.(eq|neq|ilike|like|in|is|or|not|order)\(\s*['"`][^'"`]*\bemail\b/.test(segment)) {
      found.push(`${at(m.index)} filters by email`);
    }
  }
  // A profile embedded in another table's select.
  for (const sel of text.matchAll(/\.select\(\s*(['"`])([\s\S]*?)\1/g)) {
    for (const embed of sel[2].matchAll(/community[\w!:]*\s*\(([^()]*)\)/g)) {
      if (/(^|,)\s*\*/.test(embed[1])) found.push(`${at(sel.index)} embeds every profile column`);
      if (/\bemail\b/.test(embed[1])) found.push(`${at(sel.index)} embeds profile email`);
    }
  }
  return found;
}

// The checker itself catches each kind of read (synthetic snippets).
const bad = {
  star: "supabase.from('community').select('*').eq('id', id);",
  empty: "supabase.from('community').insert(row).select().single();",
  emailColumn: "supabase.from('community').select('id, name, email');",
  emailFilter: "supabase.from('community').select('id').eq('email', value);",
  view: "supabase.from('community_with_last_seen').select('*');",
  embeddedStar: "supabase.from('project_members').select(`*, user:community(*)`);",
  embeddedEmail: "supabase.from('opportunity_interests').select(`id, community:community_id (id, name, email)`);",
  markedEmail: "supabase.from('community').select('id, email') // email-read-ok: admin\n;",
  emailOrder: "supabase.from('community').select('id').order('email');",
  unchecked: "supabase.from('community').select(columns).eq('id', id);",
};
for (const [kind, snippet] of Object.entries(bad)) {
  assert.ok(problemsIn('assets/js/adminPeopleService.js', snippet).length > 0, `the checker catches ${kind}`);
}
assert.deepEqual(problemsIn('x.js', "supabase.from('community').select(window.BuildspaceProfileColumns.member).eq('id', id);"), []);
assert.deepEqual(problemsIn('x.js', "supabase.from('community').select('id', { count: 'exact', head: true });"), []);
assert.ok(problemsIn('x.js', "supabase.from('community').select(ADMIN_PERSON_COLUMNS()).eq('id', id);").length > 0, 'the admin column list counts only in the admin service');
assert.deepEqual(problemsIn(ADMIN_COLUMNS_FILE, "supabase.from('community').select(ADMIN_PERSON_COLUMNS()).eq('id', id);"), []);

// 1. Live code.
const problems = [...live].flatMap((f) => problemsIn(f, source.get(f)));
assert.deepEqual(problems, [], `live profile queries must name their columns and leave out email:\n  ${problems.join('\n  ')}`);

// No email reads remain, marked or not.
const marked = [...live].flatMap((f) => (source.get(f).match(/email-read-ok:[^\n]*/g) || []).map((m) => `${f}: ${m}`));
assert.deepEqual(marked, [], 'no marked email reads remain');
assert.doesNotMatch(read('auth.js'), /is_hidden: true|consolidated your duplicate profiles/, 'sign-in never hides leftover duplicate profiles or claims to have consolidated them');

// The presence view has only these columns of the ones the site asks for
// (production check, 2026-10-28: no photo_visible or photo_consent_at), so
// every query on it asks for these only; photo consent comes from community.
const PRESENCE_VIEW_COLUMNS = new Set(['id', 'user_id', 'name', 'bio', 'skills', 'availability', 'user_role',
  'image_url', 'connection_count', 'projects_created', 'presence_last_seen', 'presence_expires_at']);
for (const f of live) {
  const text = source.get(f);
  for (const m of text.matchAll(/from\(\s*['"]community_with_last_seen['"]\s*\)\s*\.select\(\s*(['"`])([^'"`]*)\1/g)) {
    const missing = m[2].split(',').map((c) => c.trim()).filter((c) => c && !PRESENCE_VIEW_COLUMNS.has(c));
    assert.deepEqual(missing, [], `${f}: community_with_last_seen has no ${missing.join(', ')}`);
  }
}
{
  const panelJs = source.get('assets/js/node-panel.js');
  const person = panelJs.slice(panelJs.indexOf('async function renderPersonPanel'), panelJs.indexOf("window.PresenceRealtime?.seedFromProfile(profile)"));
  assert.match(person, /from\('community'\)\s*\.select\('photo_visible, photo_consent_at'\)\s*\.eq\('id', nodeData\.id\)/, 'the profile page reads photo consent from the profile itself');
  assert.match(person, /profile\.photo_visible = photoChoice\?\.photo_visible === true;\s*profile\.photo_consent_at = photoChoice\?\.photo_consent_at \|\| null;/, 'without a readable choice the photo stays hidden');
}

// 2. The shared column lists.
const columnsJs = read('assets/js/profile-columns.js');
const context = { window: {} };
require('node:vm').runInNewContext(columnsJs, context);
const { own, member } = context.window.BuildspaceProfileColumns;
for (const [name, list] of Object.entries({ own, member })) {
  assert.ok(list && !/\bemail\b|\*/.test(list), `${name} profile columns leave out email`);
  assert.match(list, /\bid\b/);
  assert.match(list, /\buser_id\b/);
}
for (const column of ['photo_visible', 'photo_consent_at', 'image_url', 'name']) {
  assert.match(member, new RegExp(`\\b${column}\\b`), `member columns include ${column} (photos, names)`);
}
for (const column of ['onboarding_completed', 'profile_completed']) {
  assert.match(own, new RegExp(`\\b${column}\\b`), `own columns include ${column} (sign-in decides onboarding)`);
}

// Every page that queries profiles loads the lists first, as a classic
// script (so it runs before modules and deferred scripts).
for (const page of PAGES.filter((p) => source.has(p) && /supabaseClient\.js|auth\.js/.test(source.get(p)))) {
  const html = source.get(page);
  const tag = html.match(/<script src="assets\/js\/profile-columns\.js\?v=[\w-]+"><\/script>/);
  assert.ok(tag, `${page} loads profile-columns.js as a classic script`);
  const before = html.slice(0, tag.index);
  assert.doesNotMatch(before, /from\(\s*['"]community/, `${page} queries no profile before profile-columns.js`);
  for (const [, src] of before.matchAll(/<script[^>]*src="([^"?]+)/g)) {
    assert.doesNotMatch(source.get(src) || '', /from\(\s*['"]community/, `${page}: ${src} loads before profile-columns.js but queries profiles`);
  }
}

// 3. Sign-in: the member's own email comes from the session; older
// profiles are claimed by the server-side claim function first.
const auth = read('auth.js');
assert.match(auth, /const OWN_COLUMNS = \(\) => window\.BuildspaceProfileColumns\.own;/, 'sign-in reads the shared own-profile columns');
const adminService = read('assets/js/adminPeopleService.js');
assert.match(adminService, /const ADMIN_PERSON_COLUMNS = \(\) =>\s*`\$\{window\.BuildspaceProfileColumns\.own\}, is_disabled, image_path`;/, 'admin details: the own columns plus the admin fields, no email');
const listColumns = adminService.match(/const LIST_COLUMNS = ([^;]+);/);
assert.ok(listColumns, 'the People list names its columns');
assert.doesNotMatch(listColumns[1], /email|\*/, 'and they leave out email');
assert.match(adminService, /rpc\('admin_member_emails', \{ p_ids:/, 'the admin panel gets emails from admin_member_emails');
assert.match(adminService, /rpc\('admin_search_people', \{/, 'and searches and sorts by email with admin_search_people');
assert.match(adminService, /rpc\('admin_find_members_by_email', \{ p_query: query, p_exact: exact \}\)/, 'and searches them with admin_find_members_by_email');
const adminActions = read('assets/js/dashboard-actions.js');
assert.match(adminActions, /rpc\('admin_find_members_by_email', \{ p_query: email, p_exact: true \}\)/, 'the "already exists" check uses the admin function');
assert.match(adminActions, /rpc\('admin_member_emails', \{ p_ids: people\.map/, 'admin search results get emails from the admin function');
assert.match(auth, /rpc\(\s*"claim_community_profile_by_email"\s*\)/);
assert.match(auth, /const claim = await claimOlderProfile\(\);\s*if \(claim\.failed\) \{[\s\S]*?throw new Error\("Profile claim failed"\);[\s\S]*?\.eq\("id", claim\.id\)\.eq\("user_id", uid\)/,
  'sign-in claims an older profile on the server only, fails (to be retried) if the claim fails, and uses a profile only if it is linked to this account');
assert.doesNotMatch(auth, /\.(ilike|eq|like)\(\s*["']email["']/, 'sign-in never looks profiles up by email');
assert.doesNotMatch(auth, /\.ilike\("email", emailNorm\)/, 'email lookups escape wildcards, so "_" or "%" in an address matches only itself');
assert.match(read('assets/js/supabaseClient.js'), /\.eq\("id", claimedId\)\s*\.eq\("user_id", user\.id\)/, 'the legacy profile helper also checks the claimed profile is this account\'s');
assert.match(auth, /email: user\.email,/, 'a new profile is still created with the session email');
assert.doesNotMatch(read('assets/js/supabaseClient.js'), /\.eq\("email"|select\("[^"]*email/, 'the legacy profile helper claims through the claim function too');

// 4. Members' emails are not shown.
const panel = read('assets/js/node-panel.js');
assert.doesNotMatch(panel, /mailto:\$\{profile\.email\}|profile\.email/, 'profile pages show no email, for connections or admins');
assert.doesNotMatch(panel, /email-request-action|createNativeEmailDraft/, 'join requests reply with Message, not email');
const messaging = read('assets/js/messaging.js');
assert.doesNotMatch(messaging, /user\.email|other\.email/, 'Inbox shows no other member\'s email (header, list, search)');
assert.doesNotMatch(read('assets/js/start-ui-enhanced.js'), /connection-email">\$\{conn\.email/, 'the network overview shows no email');
assert.doesNotMatch(read('opportunity.html'), /email-action|mailto:|person\.email/, 'opportunity posters reply with Message, not email');
assert.match(read('opportunity.html'), /<i class="fas fa-comment"><\/i> Message<\/a>/);

console.log(`Profile email reads: ${live.size} live files, no select('*') and no email selected, filtered or sorted on`);
