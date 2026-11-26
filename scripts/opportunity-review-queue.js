'use strict';
function reviewCandidates(providers,events,now=Date.now()){
 if(!Array.isArray(providers)||!Array.isArray(events)||!Number.isFinite(now)) throw new TypeError('Invalid candidate inputs');
 const seen=new Set(), candidates=[];
 for(const [source,rows] of [['provider',providers],['nearify',events]]) for(const row of rows){
  let url; try{url=new URL(row?.sourceUrl);}catch{continue;}
  if(url.protocol!=='https:'||url.username||url.password||typeof row.organization!=='string'||!row.organization.trim()) continue;
  if(source==='nearify'&&(url.origin!=='https://nearify.org'||url.pathname!=='/events/event.html'||!(Date.parse(row.startsAt)>now)||typeof row.title!=='string'||!row.title.trim())) continue;
  url.hash=''; for(const key of [...url.searchParams.keys()]) if(/^utm_/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  if(seen.has(url.href)) continue; seen.add(url.href);
  candidates.push({source,sourceUrl:url.href,organization:row.organization.trim(),title:source==='nearify'?row.title.trim():null,
   startsAt:source==='nearify'?new Date(row.startsAt).toISOString():null,
   scope:source==='provider'&&typeof row.scope==='string'?row.scope:null,
   status:'needs_review',availability:'unconfirmed',participationType:null,geographicRelevance:null,eligibility:null,
   reviewChecklist:['official details','availability','participation type','geographic relevance','eligibility and access']});
 }
 return {schemaVersion:1,candidates};
}
module.exports={reviewCandidates};
if(require.main===module){
 const fs=require('node:fs');
 const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 console.log(JSON.stringify(reviewCandidates(read(process.argv[2]),read(process.argv[3])),null,2));
}
