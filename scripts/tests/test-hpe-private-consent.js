#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('supabase/sql/migrations/20261126_hpe_private_consent.sql','utf8');
for(const table of ['hpe_participation_consent','hpe_research_consent','hpe_outcome_response']) {
 assert.ok(sql.includes('ALTER TABLE public.'+table+' ENABLE ROW LEVEL SECURITY'));
 assert.ok(sql.includes('DROP TABLE')===false);
}
assert.match(sql,/REFERENCES public\.hpe_participation_consent\(user_id\) ON DELETE CASCADE/);
assert.match(sql,/REFERENCES public\.hpe_research_consent\(user_id\) ON DELETE CASCADE/);
assert.match(sql,/GRANT INSERT \(consent_version, adult_confirmed, scope\)/);
assert.match(sql,/interval '720 hours'/);
assert.match(sql,/REVOKE ALL .* FROM PUBLIC, anon, authenticated/);
console.log('HPE consent schema contract checks passed');
