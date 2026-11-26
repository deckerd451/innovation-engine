'use strict';
const {stageOpportunities} = require('./opportunity-supply');
function proposeInventory(reviews, now = Date.now()) {
  if (!Array.isArray(reviews)) throw new TypeError('Invalid reviews');
  const eligible = reviews.filter(row => typeof row?.reviewer === 'string' && row.reviewer.trim() &&
    typeof row.evidenceNote === 'string' && row.evidenceNote.trim() &&
    row.availability === 'provider_confirmation_required');
  const {accepted,rejected} = stageOpportunities(eligible,now);
  return {inventory:{schemaVersion:1,opportunities:accepted.map(row=>({...row,status:'published',
    deadline:new Date(Math.min(Date.parse(row.deadline),Date.parse(row.reviewedAt)+7*86400000)).toISOString(),
    availability:'provider confirmation required'}))}, rejectedCount:rejected.length+reviews.length-eligible.length};
}
module.exports = {proposeInventory};
if (require.main === module) {
  const fs = require('node:fs');
  if (!process.argv[2]) throw new Error('Provide a reviewed evidence JSON file');
  const result = proposeInventory(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
  if(result.rejectedCount) {console.error('Rejected reviews: '+result.rejectedCount);process.exitCode=1;}
  else console.log(JSON.stringify(result.inventory,null,2));
}
