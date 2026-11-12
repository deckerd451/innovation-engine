#!/usr/bin/env node
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
(async () => {
  const { waitForChromeEndpoint } = await import('./browser/helpers/chrome-startup.mjs');
  const child = () => Object.assign(new EventEmitter(), {stderr:new EventEmitter()});
  let process = child();
  let ready = waitForChromeEndpoint(process, 'test-chrome', 1000);
  process.stderr.emit('data', Buffer.from('DevTools listening on ws://127.0.0.1:123/devtools/browser/test\n'));
  assert.equal(await ready, 'ws://127.0.0.1:123/devtools/browser/test');
  assert.equal(process.listenerCount('exit'), 0, 'Success removes startup listeners');
  process = child(); ready = waitForChromeEndpoint(process, 'test-chrome', 1000);
  process.stderr.emit('data', Buffer.from('browser initialization failed'));
  process.emit('exit', 1, null);
  await assert.rejects(ready, /code=1[\s\S]*browser initialization failed/);
  process = child(); ready = waitForChromeEndpoint(process, 'missing-chrome', 1000);
  process.emit('error', new Error('spawn ENOENT'));
  await assert.rejects(ready, /Chrome launch failed: spawn ENOENT/);
  process = child();
  await assert.rejects(waitForChromeEndpoint(process, 'slow-chrome', 10), /within 10ms[\s\S]*no stderr output/);
  assert.equal(process.stderr.listenerCount('data'), 0, 'Timeout removes startup listeners');
  console.log('Chrome readiness, early exit, spawn error and timeout checks passed');
})().catch(error => {console.error(error); process.exit(1);});
