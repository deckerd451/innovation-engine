'use strict';
// Input must originate from the public Nearify event listing, never attendance data.
function nearifyCandidates(events, now=Date.now()) {
  if(!Array.isArray(events)||!Number.isFinite(now)) throw new TypeError('Invalid event snapshot');
  const seen=new Set(), rows=[];
  for(const event of events) {
    const start=Date.parse(event?.starts_at);
    if(!event || event.deleted_at || typeof event.name!=='string' || !event.name.trim() ||
      !Number.isFinite(start)||start<=now||typeof event.id!=='string'||!event.id.trim()||seen.has(event.id)) continue;
    const url=new URL('https://nearify.org/events/event.html');
    if(typeof event.slug==='string'&&event.slug.trim()) url.searchParams.set('slug',event.slug);
    else url.searchParams.set('id',event.id);
    url.searchParams.set('web','1');
    seen.add(event.id);
    rows.push({title:event.name.trim(),organization:'Nearify',sourceUrl:url.href,
      startsAt:new Date(start).toISOString(),deadline:new Date(start).toISOString(),
      status:'needs_review',availability:'unconfirmed'});
  }
  return rows;
}
module.exports={nearifyCandidates};
