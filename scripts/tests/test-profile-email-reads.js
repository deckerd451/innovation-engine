#!/usr/bin/env node
// Live website code reads profiles by named columns and never reads email,
// so the database can later stop members reading community.email without
// breaking anything (the email-privacy plan, Stage B).
//
//   - No select('*') / select() on community or community_with_last_seen,
//     and no embedded community(*) in another table's select.
//   - No email in a profile select, filter or embedded profile, except the
//     reads marked "email-read-ok:" in the admin People panel and the
//     duplicate-claim fallback in sign-in. Those move to database functions
//     in a later migration.
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
// Files whose marked email reads are expected until the admin-only and
// claim database functions exist.
const EMAIL_READ_ALLOWED = new Set(['assets/js/adminPeopleService.js', 'assets/js/dashboard-actions.js', 'auth.js']);

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
  const allowed = EMAIL_READ_ALLOWED.has(file);
  // Each query on the profile table or the presence view, to the end of
  // its statement.
  const query = /from\(\s*['"](community|community_with_last_seen)['"]\s*\)/g;
  for (let m; (m = query.exec(text));) {
    let segment = text.slice(m.index, m.index + 900);
    const end = segment.search(/;|\n\s*\n/);
    if (end > 0) segment = segment.slice(0, end);
    const marked = /email-read-ok:/.test(segment);
    for (const sel of segment.matchAll(/\.select\(\s*(?:(['"`])([\s\S]*?)\1|([^,)]*))/g)) {
      const literal = sel[2];
      const expression = (sel[3] || '').trim().replace(/\($/, '()');
      if (literal === undefined && expression === '') found.push(`${at(m.index)} select() reads every column`);
      if (literal !== undefined && /(^|,)\s*\*/.test(literal)) found.push(`${at(m.index)} select('*') reads every column`);
      if (literal !== undefined && /\bemail\b/.test(literal) && !(allowed && marked)) found.push(`${at(m.index)} selects email`);
      if (expression && !/^window\.BuildspaceProfileColumns\.(own|member)$/.test(expression)
        && !(expression === 'ADMIN_PERSON_COLUMNS()' && allowed && marked)
        && !/^OWN_COLUMNS\(\)$/.test(expression)) {
        found.push(`${at(m.index)} selects an unchecked column list (${expression})`);
      }
    }
    if (/\.(eq|neq|ilike|like|in|is|or|not)\(\s*['"`][^'"`]*\bemail\b/.test(segment) && !(allowed && marked)) {
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
  unmarkedAdmin: "supabase.from('community').select(ADMIN_PERSON_COLUMNS()).eq('id', id);",
  unchecked: "supabase.from('community').select(columns).eq('id', id);",
};
for (const [kind, snippet] of Object.entries(bad)) {
  assert.ok(problemsIn('assets/js/adminPeopleService.js', snippet).length > 0, `the checker catches ${kind}`);
}
assert.deepEqual(problemsIn('x.js', "supabase.from('community').select(window.BuildspaceProfileColumns.member).eq('id', id);"), []);
assert.deepEqual(problemsIn('x.js', "supabase.from('community').select('id', { count: 'exact', head: true });"), []);
assert.ok(problemsIn('x.js', "supabase.from('community').select('id, email') // email-read-ok: admin\n;").length > 0, 'a marker only counts in the allowed admin and sign-in files');

// 1. Live code.
const problems = [...live].flatMap((f) => problemsIn(f, source.get(f)));
assert.deepEqual(problems, [], `live profile queries must name their columns and leave out email:\n  ${problems.join('\n  ')}`);

// The marked email reads are only where expected (admin panel, the
// duplicate-claim fallback), so the later migration knows what to replace.
const marked = [...live].flatMap((f) => (source.get(f).match(/email-read-ok:[^\n]*/g) || []).map((m) => `${f}: ${m}`));
for (const m of marked) assert.ok([...EMAIL_READ_ALLOWED].some((f) => m.startsWith(`${f}:`)), `unexpected email read: ${m}`);
assert.ok(marked.some((m) => m.startsWith('auth.js: email-read-ok: duplicate claim fallback')), 'the duplicate-claim fallback is marked');

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
assert.match(read('assets/js/adminPeopleService.js'), /const ADMIN_PERSON_COLUMNS = \(\) =>\s*`\$\{window\.BuildspaceProfileColumns\.own\}, is_disabled, image_path, email`;/, 'admin details: the own columns plus the admin fields');
assert.match(auth, /rpc\(\s*"claim_community_profile_by_email"\s*\)/);
assert.match(auth, /const claim = await claimOlderProfile\(\);[\s\S]*if \(claim\.id\)[\s\S]*if \(!claim\.fallback\)[\s\S]*\.ilike\("email", emailNorm\) \/\/ email-read-ok: duplicate claim fallback/,
  'sign-in claims an older profile on the server and only falls back to the email lookup when the claim function refuses or fails');
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

console.log(`Profile email reads: ${live.size} live files, no select('*') and no email outside ${marked.length} marked admin/claim reads`);
