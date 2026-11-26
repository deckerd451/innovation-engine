'use strict';
const {reviewQueue}=require('./opportunity-renewal');
function matchOpportunities(inventory, topics=[], now=Date.now()) {
  if(!Array.isArray(topics)) throw new TypeError('Expected explicit topics');
  const normalize = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
  const wanted = new Set(topics.map(normalize).filter(Boolean));
  const audit = reviewQueue(inventory,now);
  return inventory.opportunities.flatMap((row,i)=>{
    if(!['current','review_due'].includes(audit[i].status)) return [];
    const tags = Array.isArray(row.topics) ? row.topics.map(normalize) : [];
    const matched = [...new Set(tags.filter(t=>wanted.has(t)))];
    return [{opportunity:row,matchedTopics:matched}];
  }).sort((a,b)=>b.matchedTopics.length-a.matchedTopics.length);
}
module.exports={matchOpportunities};
