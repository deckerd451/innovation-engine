'use strict';
const {stageOpportunities} = require('./opportunity-supply');
function proposeInventory(reviews, now = Date.now()) {
  if (!Array.isArray(reviews)) throw new TypeError('Invalid reviews');
  const eligible = reviews.filter(row => typeof row?.reviewer === 'string' && row.reviewer.trim() &&
    typeof row.evidenceNote === 'string' && row.evidenceNote.trim() &&
    row.availability === 'provider_confirmation_required' &&
    ['contribution','learning','social'].includes(row.participationType) &&
    row.geographicRelevance === 'charleston-sc' && row.eligibility === 'adult_public' &&
    ['recurring_program','scheduled_event'].includes(row.kind) &&
    (row.kind !== 'scheduled_event' || (Date.parse(row.startsAt)>now && Date.parse(row.deadline)<=Date.parse(row.startsAt))));
  const {accepted,rejected} = stageOpportunities(eligible,now);
  const identity = row => JSON.stringify([row.sourceUrl,row.pathwayId || null]);
  const topicsBySource = new Map(), detailsBySource = new Map();
  for (const row of eligible) {
    const staged = stageOpportunities([row],now).accepted[0];
    if (!staged || topicsBySource.has(identity(staged))) continue;
    detailsBySource.set(identity(staged),{participationType:row.participationType,geographicRelevance:row.geographicRelevance,eligibility:row.eligibility,kind:row.kind, ...(row.kind==='scheduled_event'?{startsAt:new Date(row.startsAt).toISOString()}:{}),deadlineMeaning:'review expiry or earlier opportunity cutoff'});
    topicsBySource.set(identity(staged), Array.isArray(row.topics) ? [...new Set(row.topics.filter(t=>typeof t==='string').map(t=>t.trim().toLowerCase()).filter(t=>t && t.length<=64))].slice(0,12) : []);
  }
  return {inventory:{schemaVersion:1,opportunities:accepted.map(row=>({...row,...detailsBySource.get(identity(row)),status:'published',
    deadline:new Date(Math.min(Date.parse(row.deadline),Date.parse(row.reviewedAt)+7*86400000)).toISOString(),
    topics:topicsBySource.get(identity(row)) || [], availability:'provider confirmation required'}))}, rejectedCount:rejected.length+reviews.length-eligible.length};
}
module.exports = {proposeInventory};
if (require.main === module) {
  const fs = require('node:fs');
  if (!process.argv[2]) throw new Error('Provide a reviewed evidence JSON file');
  const reviews = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  // Artifact verification uses an explicit time so unrelated PRs still work after expiry.
  const now = process.argv[3] === '--check'
    ? Math.max(...reviews.map(row => Date.parse(row?.reviewedAt)))
    : Date.now();
  const result = proposeInventory(reviews, now);
  if (!result.inventory.opportunities.length) throw new Error('No publishable reviews');
  const output = JSON.stringify(result.inventory, null, 2) + '\n';
  if(result.rejectedCount) {console.error('Rejected reviews: '+result.rejectedCount);process.exitCode=1;}
  else if (process.argv[3] === '--check') {
    const file = require('node:path').join(__dirname, '../data/hpe-published-opportunities.json');
    if (fs.readFileSync(file, 'utf8') !== output) throw new Error('Published inventory differs from reviewed evidence');
  } else process.stdout.write(output);
}
