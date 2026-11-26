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
  const topicsBySource = new Map(), detailsBySource = new Map();
  for (const row of eligible) {
    const staged = stageOpportunities([row],now).accepted[0];
    if (!staged || topicsBySource.has(staged.sourceUrl)) continue;
    detailsBySource.set(staged.sourceUrl,{participationType:row.participationType,geographicRelevance:row.geographicRelevance,eligibility:row.eligibility,kind:row.kind, ...(row.kind==='scheduled_event'?{startsAt:new Date(row.startsAt).toISOString()}:{}),deadlineMeaning:'review expiry or earlier opportunity cutoff'});
    topicsBySource.set(staged.sourceUrl, Array.isArray(row.topics) ? [...new Set(row.topics.filter(t=>typeof t==='string').map(t=>t.trim().toLowerCase()).filter(t=>t && t.length<=64))].slice(0,12) : []);
  }
  return {inventory:{schemaVersion:1,opportunities:accepted.map(row=>({...row,...detailsBySource.get(row.sourceUrl),status:'published',
    deadline:new Date(Math.min(Date.parse(row.deadline),Date.parse(row.reviewedAt)+7*86400000)).toISOString(),
    topics:topicsBySource.get(row.sourceUrl) || [], availability:'provider confirmation required'}))}, rejectedCount:rejected.length+reviews.length-eligible.length};
}
module.exports = {proposeInventory};
if (require.main === module) {
  const fs = require('node:fs');
  if (!process.argv[2]) throw new Error('Provide a reviewed evidence JSON file');
  const result = proposeInventory(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
  if(result.rejectedCount) {console.error('Rejected reviews: '+result.rejectedCount);process.exitCode=1;}
  else console.log(JSON.stringify(result.inventory,null,2));
}
