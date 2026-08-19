#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const dashboard = fs.readFileSync(path.join(root, 'assets/js/command-dashboard.js'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'assets/js/intelligence/daily-brief-engine.js'), 'utf8');

// Validate the actual tier keys against the section keys produced by the
// current engine, rather than maintaining a second list of allowed keys. The
// extraction is intentionally scoped to generateDailyBrief's sections object.
const sectionsBlock = engineSource.match(/const sections = \{\n([\s\S]*?)\n  \};/);
assert.ok(sectionsBlock, 'Could not locate engine sections object');
const producedKeys = new Set(
  [...sectionsBlock[1].matchAll(/^\s{4}([a-z_]+):/gm)].map(match => match[1])
);
assert.ok(producedKeys.size > 0, 'Engine sections object is empty');
const tierKeys = [...dashboard.matchAll(/briefSections:\s*\[([^\]]*)\]/g)]
  .flatMap(match => [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]));
assert.ok(tierKeys.length > 0, 'No command-dashboard tier mappings found');
for (const key of tierKeys) assert.ok(producedKeys.has(key), `Tier references missing brief section: ${key}`);
assert.doesNotMatch(dashboard, /briefSections:\s*\[[^\]]*(combination_opportunities|blind_spots)/);
assert.match(engineSource, /isEligiblePublicOpportunity/);

global.window = {};
(async () => {
  const engine = await import(pathToFileURL(path.join(root, 'assets/js/intelligence/daily-brief-engine.js')).href);
  assert.equal(engine.isEligiblePublicOpportunity({ is_public: true }), true);
  assert.equal(engine.isEligiblePublicOpportunity({ is_public: false }), false);
  assert.equal(engine.isEligiblePublicOpportunity({ is_public: null }), false);
  console.log('Reflection review regressions: all checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
