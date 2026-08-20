#!/usr/bin/env node

// Deterministic local test runner.
//
// scripts/tests/ mixes two kinds of files, distinguished by convention (see
// docs/VALIDATION.md for the full breakdown):
//  - Offline regression tests: start with `#!/usr/bin/env node` and are
//    meant to run directly with plain Node. They assert against this
//    codebase's own source/SQL text, or exercise real modules inside a
//    node:vm sandbox / fake-global stubs -- no real browser, no live
//    database, no network.
//  - Browser-console / live-Supabase smoke tests: no shebang, meant to be
//    pasted into a signed-in browser session's devtools console. These
//    can't run headless here.
//
// This runs only the first group.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const testsDir = path.join(root, 'scripts', 'tests');

const offlineTests = fs
  .readdirSync(testsDir)
  .filter((name) => name.startsWith('test-') && name.endsWith('.js'))
  .filter((name) => fs.readFileSync(path.join(testsDir, name), 'utf8').startsWith('#!/usr/bin/env node'))
  .sort();

console.log(`Running ${offlineTests.length} deterministic local test(s)...\n`);

let failed = 0;
for (const name of offlineTests) {
  console.log(`--- ${name} ---`);
  const result = spawnSync(process.execPath, [path.join(testsDir, name)], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    failed += 1;
    console.error(`❌ ${name} exited with status ${result.status}\n`);
  } else {
    console.log('');
  }
}

if (failed > 0) {
  console.error(`${failed}/${offlineTests.length} local test file(s) failed.`);
  process.exit(1);
}

console.log(`✅ ${offlineTests.length}/${offlineTests.length} deterministic local test(s) passed.`);
