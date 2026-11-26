'use strict';
const DAY = 86400000;
function reviewQueue(inventory, now = Date.now()) {
  if (inventory?.schemaVersion !== 1 || !Array.isArray(inventory.opportunities) || !Number.isFinite(now)) throw new TypeError('Invalid inventory');
  return inventory.opportunities.map(row => {
    const reviewed = Date.parse(row?.reviewedAt), deadline = Date.parse(row?.deadline);
    let url;
    try { url = new URL(row?.sourceUrl); } catch (_) {}
    const valid = row?.status === 'published' && url?.protocol === 'https:' && !url.username && !url.password &&
      Number.isFinite(reviewed) && reviewed <= now && Number.isFinite(deadline);
    const expires = valid ? Math.min(deadline, reviewed + 7 * DAY) : NaN;
    const status = !valid ? 'invalid' : expires <= now ? 'expired' : expires - now <= 2 * DAY ? 'review_due' : 'current';
    return { title: row?.title || '', organization: row?.organization || '', pathwayId: row?.pathwayId || null,
      sourceUrl: valid ? url.href : null, status,
      reviewBy: valid ? new Date(expires).toISOString() : null };
  });
}
module.exports = { reviewQueue };
if (require.main === module) {
  const fs = require('node:fs');
  const path = require('node:path');
  const inventory = JSON.parse(fs.readFileSync(path.join(__dirname,'../data/hpe-published-opportunities.json'),'utf8'));
  const queue = reviewQueue(inventory);
  if (process.argv.includes('--current-inventory')) {
    const opportunities = inventory.opportunities.filter((_, index) =>
      ['current', 'review_due'].includes(queue[index].status));
    console.log(JSON.stringify({ schemaVersion: inventory.schemaVersion, opportunities }, null, 2));
  } else console.log(JSON.stringify(queue, null, 2));
}
