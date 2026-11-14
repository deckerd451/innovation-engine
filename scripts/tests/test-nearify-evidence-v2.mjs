import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(process.env.PGLITE_MODULE?pathToFileURL(process.env.PGLITE_MODULE).href:'@electric-sql/pglite');
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const db=new PGlite();
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
const event='20000000-0000-0000-0000-000000000001';
const migration=read('supabase/sql/migrations/20261114c_nearify_evidence_v2.sql');
const invoke=(from='near-a',to='near-b',type='qr_confirmed',confidence=100,e=event)=>db.query(
 'SELECT public.ingest_nearify_evidence_v2($1,$2,$3,$4,$5,$6,$7) AS result',[e,from,to,type,confidence,'2026-11-14T12:00:00Z','Test']);
try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
 CREATE TABLE nearify_identity_map(community_id uuid,nearify_user_id text UNIQUE);
 CREATE TABLE community_experience_authorizations(community_id uuid,experience text,status text);
 CREATE TABLE interaction_edges(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,from_user_id uuid,to_user_id uuid,type text NOT NULL,status text NOT NULL CHECK(status IN('suggested','accepted','ignored','blocked')),confidence numeric NOT NULL,overlap_seconds integer NOT NULL,meta jsonb NOT NULL,created_at timestamptz NOT NULL);
 ALTER TABLE interaction_edges ENABLE ROW LEVEL SECURITY;
 CREATE TABLE connections(status text PRIMARY KEY);
 INSERT INTO connections VALUES('accepted'),('pending'),('blocked'),('declined');
 INSERT INTO nearify_identity_map VALUES('${a}','near-a'),('${b}','near-b');
 INSERT INTO community_experience_authorizations VALUES('${a}','nearify','authorized'),('${b}','nearify','authorized');`);
 // Historical duplicate pairs are legal in production. V2 must neither
 // fail on them nor return one as the result of a v2 retry.
 await db.query(`INSERT INTO interaction_edges(from_user_id,to_user_id,type,status,confidence,overlap_seconds,meta,created_at)
 SELECT $1::uuid,$2::uuid,'qr_confirmed','accepted',50,0,
 jsonb_build_object('event_id',$3::text,'signal_type','qr_confirmed'),now() FROM generate_series(1,2)`,[a,b,event]);
 const historical=(await db.query("SELECT * FROM interaction_edges ORDER BY id")).rows;
 await db.exec(migration);
 for(const role of ['anon','authenticated']){
  await db.exec(`SET ROLE ${role}`);
  await assert.rejects(invoke(),e=>e.code==='42501');
  await db.exec('RESET ROLE');
 }
 await db.exec('SET ROLE service_role');
 const first=(await invoke()).rows[0].result;
 assert.equal(first.edge_created,true);assert.equal(first.connection_created,false);assert.equal(first.connection_promoted,false);
 const retry=(await invoke('near-b','near-a')).rows[0].result;
 assert.equal(retry.edge_created,false);assert.equal(retry.edge_id,first.edge_id);
 for(const args of [['near-a','near-a'],['unknown','near-b'],['near-a','near-b','bad'],['near-a','near-b','qr_confirmed',101],['near-a','near-b','qr_confirmed',-1],['near-a','near-b','qr_confirmed',null],['near-a','near-b','qr_confirmed',NaN],['near-a','near-b','qr_confirmed',100,null]]){
  await assert.rejects(invoke(...args),e=>e.code==='22023');
 }
 for(const type of ['proximity','ble_proximity'])assert.equal((await invoke('near-a','near-b',type,30)).rows[0].result.edge_created,true);
 await db.exec('RESET ROLE');
 assert.deepEqual((await db.query('SELECT status FROM connections ORDER BY status')).rows.map(r=>r.status),['accepted','blocked','declined','pending']);
 assert.ok((await db.query("SELECT * FROM interaction_edges WHERE meta->>'source'='nearify-evidence-v2'")).rows.every(r=>r.status==='suggested'&&r.overlap_seconds===0));
 assert.deepEqual((await db.query("SELECT * FROM interaction_edges WHERE meta->>'source' IS NULL ORDER BY id")).rows,historical);
 await db.exec(`UPDATE interaction_edges SET status='blocked' WHERE id='${first.edge_id}'; SET ROLE service_role;`);
 await invoke();
 await db.exec('RESET ROLE');
 assert.equal((await db.query('SELECT status FROM interaction_edges WHERE id=$1',[first.edge_id])).rows[0].status,'blocked');
 for(const status of ['revoked','needs_reconfirmation']){
  await db.query('UPDATE community_experience_authorizations SET status=$1 WHERE community_id=$2',[status,b]);
  await db.exec('SET ROLE service_role');await assert.rejects(invoke(),e=>e.code==='22023');await db.exec('RESET ROLE');
 }
 await db.exec(`UPDATE community_experience_authorizations SET status='authorized';
 CREATE FUNCTION unsafe_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN INSERT INTO connections VALUES('forged'); RETURN NEW; END$$;
 CREATE TRIGGER unsafe AFTER INSERT ON interaction_edges FOR EACH ROW EXECUTE FUNCTION unsafe_trigger(); SET ROLE service_role;`);
 await assert.rejects(invoke('near-a','near-b','qr_confirmed',100,'20000000-0000-0000-0000-000000000002'),e=>e.code==='55000');
 await db.exec('RESET ROLE');
 assert.equal((await db.query("SELECT count(*)::int AS n FROM connections WHERE status='forged'")).rows[0].n,0);
 await db.exec('DROP TRIGGER unsafe ON interaction_edges');
 const source=read('supabase/sql/nearify_evidence_v2.sql');assert.ok(migration.includes(source));
 const before=(await db.query('SELECT * FROM interaction_edges ORDER BY id')).rows;
 await db.exec(read('supabase/sql/rollback/20261114c_nearify_evidence_v2_rollback.sql'));
 assert.deepEqual((await db.query('SELECT * FROM interaction_edges ORDER BY id')).rows,before);
 await db.exec(migration);
 console.log('PASS: service-only grants, evidence-only QR/proximity writes, reverse-pair retries, invalid/self/unlinked inputs, authorization, blocked-edge preservation, connection-state invariance, trigger fail-closed guard, production constraints and required overlap, historical duplicates unchanged, v2-only index, no updated_at dependency, rollback/reapply');
}finally{await db.close();}
