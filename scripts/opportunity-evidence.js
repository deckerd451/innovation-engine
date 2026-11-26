'use strict';
const {providerCandidates} = require('./opportunity-intake');
async function collectEvidence(registry, request = fetch) {
  const results = [];
  for (const candidate of providerCandidates(registry)) {
    const checkedAt = new Date().toISOString();
    let httpStatus = null, outcome = 'unreachable';
    try {
      const response = await request(candidate.sourceUrl, {method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(8000)});
      httpStatus = response.status;
      outcome = response.ok ? 'reachable' : httpStatus >= 300 && httpStatus < 400 ? 'redirect_review' : 'http_review';
    } catch (_) {}
    results.push({...candidate,checkedAt,httpStatus,outcome,verification:'not_verified'});
  }
  return results;
}
module.exports = {collectEvidence};
if (require.main === module) {
  collectEvidence(require('../data/opportunity-sources-charleston.json')).then(rows => console.log(JSON.stringify(rows,null,2))).catch(err => {console.error(err.message);process.exitCode=1;});
}
