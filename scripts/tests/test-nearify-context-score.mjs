// Run with PGLITE_MODULE pointing to @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const {PGlite}=await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db=new PGlite();
try {
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TABLE community(id uuid PRIMARY KEY,user_id uuid,name text,skills text,image_url text,role text,bio text,is_hidden boolean DEFAULT false);
CREATE TABLE community_experience_authorizations(community_id uuid,experience text,status text);
CREATE TABLE nearify_identity_map(community_id uuid,nearify_user_id text);
CREATE TABLE nearify_event_presence(community_id uuid,nearify_event_id text,status text,is_live boolean);
CREATE TABLE project_members(user_id uuid,project_id uuid);
CREATE TABLE organization_members(community_id uuid,organization_id uuid);
CREATE TABLE connections(from_user_id uuid,to_user_id uuid,status text);
INSERT INTO community(id,user_id,name,skills)
 SELECT lpad(i::text,32,'0')::uuid,lpad((i+100)::text,32,'0')::uuid,'Person '||i,
 CASE WHEN i=1 THEN 'JavaScript, SQL, Design, Python' WHEN i=2 THEN 'javascript, SQL, design, python, SQL' ELSE '' END FROM generate_series(1,8)i;
INSERT INTO community_experience_authorizations SELECT id,'nearify','authorized' FROM community;
INSERT INTO nearify_identity_map SELECT id,'near-'||name FROM community;
INSERT INTO nearify_event_presence SELECT id,'event','joined',true FROM community;
INSERT INTO project_members SELECT id,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid FROM community WHERE name IN('Person 1','Person 2');
INSERT INTO organization_members SELECT id,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid FROM community WHERE name IN('Person 1','Person 2');
INSERT INTO connections SELECT a.id,b.id,'accepted' FROM community a CROSS JOIN community b WHERE a.name IN('Person 1','Person 2') AND b.name='Person 8';
UPDATE community SET is_hidden=true WHERE name='Person 3';
UPDATE community_experience_authorizations SET status='revoked' WHERE community_id=(SELECT id FROM community WHERE name='Person 4');
UPDATE community_experience_authorizations SET status='needs_reconfirmation' WHERE community_id=(SELECT id FROM community WHERE name='Person 5');
UPDATE nearify_event_presence SET is_live=false WHERE community_id=(SELECT id FROM community WHERE name='Person 6');
DELETE FROM community_experience_authorizations WHERE community_id=(SELECT id FROM community WHERE name='Person 7');
SELECT set_config('test.actor',(SELECT user_id::text FROM community WHERE name='Person 1'),false);
`);
const migration=read('supabase/sql/migrations/20261114_nearify_context_score.sql');
const rollback=read('supabase/sql/rollback/20261114_nearify_context_score_rollback.sql');
await db.exec(rollback.replace(/DROP FUNCTION public\.nearify_professional_context_score[^;]+;/,''));
const collect=async()=>{
 const event=(await db.query(`SELECT public.get_nearify_event_recommendations('event',5) AS v`)).rows[0].v;
 const live=(await db.query(`SELECT public.get_nearify_live_attendee_signals(ARRAY['near-Person 1','near-Person 2','near-Person 3','near-Person 4','near-Person 5','near-Person 6','near-Person 7','near-Person 8','unknown','']) AS v`)).rows[0].v;
 return [event,live];
};
const baseline=await collect();
assert.equal(baseline[0].recommendations[0].name,'Person 2');
assert.equal(baseline[0].recommendations[0].score,25);
assert.equal(baseline[1].signals['near-Person 2'].score,19);
assert.equal(baseline[0].recommendations.length,1);
assert.deepEqual(Object.keys(baseline[1].signals).sort(),['near-Person 2','near-Person 6','near-Person 8']);
await db.exec(migration);
assert.deepEqual(await collect(),baseline,'RPC output and eligibility parity');
const parity=await db.query(`SELECT count(*)::int AS failures FROM
 unnest(ARRAY[NULL,0,1,2,4,100]::bigint[])p,
 unnest(ARRAY[NULL,0,1,2,4,100]::bigint[])m,
 unnest(ARRAY[NULL,0,1,2,4,100]::bigint[])o,
 unnest(ARRAY[NULL,0,1,2,3,4,100]::bigint[])s
 WHERE public.nearify_professional_context_score(p,m,o,s) IS DISTINCT FROM ((p>0)::int*5+(m>0)::int*4+(o>0)::int*4+LEAST(s,3)*2)`);
assert.equal(parity.rows[0].failures,0);
for(const status of ['revoked','needs_reconfirmation']){
 await db.query(`UPDATE community_experience_authorizations SET status=$1 WHERE community_id=(SELECT id FROM community WHERE name='Person 1')`,[status]);
 const result=await collect();
 if(status==='revoked'){assert.deepEqual(result[0].recommendations,[]);assert.deepEqual(result[1].signals,{});}
 else assert.deepEqual(result,baseline);
}
await db.exec(`UPDATE community_experience_authorizations SET status='authorized' WHERE community_id=(SELECT id FROM community WHERE name='Person 1');
 GRANT USAGE ON SCHEMA public TO authenticated,service_role,anon; SET ROLE authenticated;`);
assert.equal(Number((await db.query('SELECT public.nearify_professional_context_score(1,1,1,3) AS n')).rows[0].n),19);
await db.exec('RESET ROLE; SET ROLE anon;');
await assert.rejects(db.query('SELECT public.nearify_professional_context_score(1,1,1,3)'),/permission denied/);
await db.exec('RESET ROLE;');
await db.exec(rollback);
assert.deepEqual(await collect(),baseline,'rollback result parity');
assert.equal((await db.query(`SELECT to_regprocedure('public.nearify_professional_context_score(bigint,bigint,bigint,bigint)') AS f`)).rows[0].f,null);
for(const name of ['nearify_event_recommendations','nearify_live_attendee_signals']){
 const text=read(`supabase/sql/${name}.sql`);
 const definition=text.slice(text.indexOf('CREATE OR REPLACE FUNCTION'),text.indexOf('-- ================================================================\n-- COMPLETION')).trim();
 assert.ok(migration.includes(definition),name+' source/migration parity');
}
console.log('PASS: RPC parity, 1512 arithmetic cases, eligibility/authorization, helper grants, source parity, rollback');
}finally{await db.close();}
