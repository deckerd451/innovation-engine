#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '../..');
const digest = fs.readFileSync(path.join(rootDir, 'assets/js/start-daily-digest.js'), 'utf8');

function functionSource(name) {
  const start = digest.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = digest.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < digest.length; index += 1) {
    if (digest[index] === '{') depth += 1;
    if (digest[index] === '}') depth -= 1;
    if (depth === 0) return digest.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}`);
}

class FakeElement {
  constructor() {
    this.children = [];
    this.className = '';
    this.textContent = '';
  }

  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
}

const summaryRoot = new FakeElement();
const pendingCounts = new Map();
const sandbox = {
  console,
  document: {
    getElementById(id) { return id === 'network-reflection-summary' ? summaryRoot : null; },
    createElement() { return new FakeElement(); },
  },
  _loadReflectionActiveProjectCount(data) {
    return new Promise(resolve => pendingCounts.set(data.profile.id, resolve));
  },
};

vm.runInNewContext(`
  let _reflectionNetworkSummaryRenderId = 0;
  ${functionSource('_renderReflectionNetworkSummary')}
  this.renderSummary = _renderReflectionNetworkSummary;
`, sandbox, { filename: 'start-daily-digest-summary.js' });

function reflectionData(id, connections, opportunities) {
  return {
    profile: { id },
    network_insights: { connections: { total: connections } },
    opportunities: { open_opportunities: { count: opportunities } },
  };
}

(async () => {
  const firstRender = sandbox.renderSummary(reflectionData('first', 1, 2));
  const secondRender = sandbox.renderSummary(reflectionData('second', 10, 20));

  pendingCounts.get('second')(30);
  await secondRender;
  pendingCounts.get('first')(3);
  await firstRender;

  assert.equal(summaryRoot.children.length, 1, 'overlapping renders leave exactly one summary grid');
  const cards = summaryRoot.children[0].children;
  assert.equal(cards.length, 3, 'the summary contains exactly three metric cards');
  assert.deepEqual(
    cards.map(card => [card.children[1].textContent, card.children[0].textContent]),
    [['Connections', '10'], ['Active projects', '30'], ['Opportunities', '20']]
  );
  assert.equal(cards.some(card => card.children[1].textContent === 'Themes'), false);

  console.log('Network Reflection summary race: all checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
