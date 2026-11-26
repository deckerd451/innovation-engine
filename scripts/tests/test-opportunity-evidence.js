#!/usr/bin/env node
const assert = require('node:assert/strict');
const {collectEvidence} = require('../opportunity-evidence');
(async () => {
  const registry = {schemaVersion:1,sources:[200,302,404,500].map(n=>({organization:'Provider '+n,sourceUrl:'https://example.org/'+n}))};
  const rows = await collectEvidence(registry,async (url,options)=>{
    assert.equal(options.redirect,'manual');
    assert.equal(options.method,'HEAD');
    const status = Number(url.split('/').pop());
    if(status===500) throw new Error('offline');
    return {status,ok:status===200};
  });
  assert.deepEqual(rows.map(r=>r.outcome),['reachable','redirect_review','http_review','unreachable']);
  assert.ok(rows.every(r=>r.verification==='not_verified' && r.status==='needs_review'));
  console.log('Evidence checks passed');
})().catch(err=>{console.error(err);process.exitCode=1;});
