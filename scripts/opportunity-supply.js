'use strict';
// Offline staging only. Human review must verify the source and availability.
// Never publish or write to Supabase from this module.
function stageOpportunities(rows, now = Date.now()) {
  if (!Array.isArray(rows) || !Number.isFinite(now)) throw new TypeError('Invalid intake');
  const accepted = [], rejected = [], seen = new Set();
  for (const row of rows) {
    let url;
    try { url = new URL(row?.sourceUrl); } catch (_) {}
    const deadline = Date.parse(row?.deadline);
    const reviewed = Date.parse(row?.reviewedAt);
    const valid = url?.protocol === 'https:' && !url.username && !url.password &&
      typeof row?.title === 'string' && row.title.trim() &&
      typeof row?.organization === 'string' && row.organization.trim() &&
      row.reviewStatus === 'verified' && Number.isFinite(reviewed) && reviewed <= now &&
      now - reviewed < 7 * 86400000 && Number.isFinite(deadline) && deadline > now;
    if (!valid) { rejected.push({ reason: 'missing, stale or invalid evidence' }); continue; }
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    const sourceUrl = url.href;
    const pathway = row.pathwayId;
    if (pathway !== undefined && (typeof pathway !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(pathway))) { rejected.push({reason:'invalid pathway identifier'}); continue; }
    const key = JSON.stringify([sourceUrl,pathway || null]);
    if (seen.has(key)) { rejected.push({ reason: 'duplicate source' }); continue; }
    seen.add(key);
    accepted.push({ title: row.title.trim(), organization: row.organization.trim(), sourceUrl, ...(pathway ? {pathwayId:pathway} : {}),
      deadline: new Date(deadline).toISOString(), reviewedAt: new Date(reviewed).toISOString(), status: 'staged' });
  }
  return { accepted, rejected };
}
module.exports = { stageOpportunities };
