#!/usr/bin/env node

// Migration hygiene for migrations added since a base revision.
//
//   node scripts/check-migrations.js [base]     # default base: origin/main
//
// Every supabase/sql/migrations/*.sql file added since <base> must:
//  - be named YYYYMMDD[letter]_snake_case.sql, so manual application order
//    is unambiguous;
//  - have a non-empty rollback at supabase/sql/rollback/<name>_rollback.sql.
//
// Existing migrations are not re-checked: most predate the rollback
// convention, and fixes to not-yet-applied migrations are a normal part of
// review. Production migrations are applied by hand; nothing here connects to
// a database.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const base = process.argv[2] || 'origin/main';

const added = execFileSync(
  'git',
  ['diff', '--name-only', '--diff-filter=A', `${base}...HEAD`, '--', 'supabase/sql/migrations/'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\n')
  .filter((file) => file.endsWith('.sql'));

console.log(`Checking ${added.length} migration(s) added since ${base}...\n`);

const problems = [];
for (const file of added) {
  const name = path.basename(file, '.sql');
  if (!/^\d{8}[a-z]?_[a-z0-9_]+$/.test(name)) {
    problems.push(`${file}: name must be YYYYMMDD[letter]_snake_case.sql`);
  }
  const rollback = `supabase/sql/rollback/${name}_rollback.sql`;
  const rollbackPath = path.join(root, rollback);
  if (!fs.existsSync(rollbackPath)) {
    problems.push(`${file}: missing rollback ${rollback}`);
  } else if (!fs.readFileSync(rollbackPath, 'utf8').trim()) {
    problems.push(`${file}: rollback ${rollback} is empty`);
  } else {
    console.log(`✅ ${file} -> ${rollback}`);
  }
}

if (problems.length) {
  console.error(`\n${problems.length} migration hygiene problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('\nMigration hygiene passed.');
