'use strict';
const { summarizeParticipation } = require('./human-potential-metrics');

// Input is an offline, already deduplicated consented cohort tally.
// No identifiers, free text, or individual survey responses are accepted.
function reportOutcome(input, now = Date.now()) {
  const keys = ['windowStart','windowEnd','participated','notParticipated','missing'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== keys.length || keys.some(k => !Object.hasOwn(input,k))) {
    throw new TypeError('Expected only fixed-window aggregate fields');
  }
  const day = 86400000;
  const start = Date.parse(input.windowStart), end = Date.parse(input.windowEnd);
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end) ||
      end - start !== 30 * day || end > now) throw new RangeError('Expected completed 30-day window');
  const result = summarizeParticipation(input);
  if (result.suppressed) return { schemaVersion:1, suppressed:true };
  return { schemaVersion:1, windowStart:new Date(start).toISOString(),
    windowEnd:new Date(end).toISOString(), endpoint:'self-confirmed meaningful contribution',
    ...result, interpretation:'Descriptive internal report; missing is unknown, not failure. No causal inference.' };
}
module.exports = { reportOutcome };
if (require.main === module) {
  const fs = require('node:fs');
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/hpe-outcome-report.js aggregate.json');
  console.log(JSON.stringify(reportOutcome(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));
}
