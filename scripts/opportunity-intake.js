'use strict';
function providerCandidates(registry) {
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry.sources)) throw new TypeError('Invalid registry');
  const seen = new Set(), candidates = [];
  for (const row of registry.sources) {
    let url;
    try { url = new URL(row?.sourceUrl); } catch (_) { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || typeof row.organization !== 'string' || !row.organization.trim()) continue;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    candidates.push({organization:row.organization.trim(),sourceUrl:url.href,scope:registry.scope || null,
      status:'needs_review',availability:'unconfirmed'});
  }
  return candidates;
}
module.exports = {providerCandidates};
if (require.main === module) {
  const registry = require('../data/opportunity-sources-charleston.json');
  console.log(JSON.stringify(providerCandidates(registry),null,2));
}
