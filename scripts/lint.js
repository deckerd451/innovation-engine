#!/usr/bin/env node

// Deterministic syntax check for every git-tracked .js file.
//
// This repo is a static site with no bundler, so there's no real "build"
// step to run. `node --check` (parse-only, no execution) is the closest
// honest stand-in: it catches syntax errors before they ship, without
// executing any file or requiring new dependencies.

const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const trackedJsFiles = execFileSync('git', ['ls-files', '*.js'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .sort();

console.log(`Checking syntax of ${trackedJsFiles.length} tracked .js file(s)...\n`);

let failed = 0;
for (const file of trackedJsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'pipe' });
  if (result.status !== 0) {
    failed += 1;
    console.error(`❌ ${file}`);
    console.error(result.stderr.toString());
  }
}

if (failed > 0) {
  console.error(`${failed}/${trackedJsFiles.length} file(s) failed the syntax check.`);
  process.exit(1);
}

console.log(`✅ ${trackedJsFiles.length}/${trackedJsFiles.length} tracked .js file(s) parse cleanly.`);
