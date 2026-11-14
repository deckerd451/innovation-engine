// PostgreSQL authorization regression. PGLITE_MODULE may point to an isolated
// @electric-sql/pglite/dist/index.js install; no production credentials used.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const {PGlite}=await import(process.env.PGLITE_MODULE?pathToFileURL(process.env.PGLITE_MODULE).href:'@electric-sql/pglite');
const db=new PGlite();
const me='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const authMe='10000000-0000-0000-0000-000000000001';
const authOther='10000000-0000-0000-0000-000000000002';
const name='20261114b_nearify_event_presence_authz';
const signature='public.ingest_nearify_event_presence(text,text,timestamptz,text,uuid,uuid,text)';
const invoke=(event='event',status='joined',cid=null,aid=null,nid=null)=>db.query(
 'SELECT public.ingest_nearify_event_presence($1,$2,$3,$4,$5,$6,$7) AS result',
 [event,'Test Event','2026-11-14T12:00:00Z',status,cid,aid,nid]);
const denied=async action=>assert.rejects(action,error=>error.code==='42501');
const rows=async()=> (await db.query('SELECT * FROM public.nearify_event_presence ORDER BY community_id,nearify_event_id')).rows;
try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
 CREATE TABLE community(id uuid PRIMARY KEY,user_id uuid);
 CREATE TABLE nearify_identity_map(community_id uuid,nearify_user_id text);
 CREATE TABLE nearify_event_presence(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 community_id uuid,nearify_event_id text,event_name text,event_starts_at timestamptz,
 status text,last_seen_at timestamptz,updated_at timestamptz,is_live boolean NOT NULL DEFAULT false,
 UNIQUE(community_id,nearify_event_id));
 ALTER TABLE nearify_event_presence ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
 INSERT INTO community VALUES('${me}','${authMe}'),('${other}','${authOther}');
 INSERT INTO nearify_identity_map VALUES('${me}','NEAR-ME'),('${other}','NEAR-OTHER');
 INSERT INTO nearify_event_presence(community_id,nearify_event_id,status,is_live)
 VALUES('${other}','event','joined',true);`);
 const migration=read(`supabase/sql/migrations/${name}.sql`);
 const rollback=read(`supabase/sql/rollback/${name}_rollback.sql`);
 await db.exec(migration);
 const before=await rows();
 await db.exec('SET ROLE anon;');
 await denied(()=>invoke('event','left',other));
 await db.exec('RESET ROLE; SET ROLE authenticated;');
 await denied(()=>invoke('event','left',other)); // missing JWT
 await db.query("SELECT set_config('test.actor',$1,false)",[authMe]);
 for(const ids of [[other,null,null],[null,authOther,null],[null,null,'NEAR-OTHER'],[me,authOther,'NEAR-ME'],[me,authMe,'unknown'],[null,null,'']]){
  await denied(()=>invoke('event','left',...ids));
 }
 await db.exec('RESET ROLE;');
 assert.deepEqual(await rows(),before,'forged identities cause no mutation');
 await db.exec('SET ROLE authenticated;');
 assert.equal((await invoke('event','joined',null,null,'near-me')).rows[0].result.success,true,'native linked profile assertion, UUID casing tolerated');
 assert.equal((await invoke('event','joined',me,authMe,'NEAR-ME')).rows[0].result.created,false,'idempotent write');
 assert.equal((await invoke('own-no-hints')).rows[0].result.community_id,me);
 assert.equal((await invoke('event','invalid')).rows[0].result.success,false);
 assert.equal((await invoke(' ')).rows[0].result.success,false);
 await db.exec('RESET ROLE;');
 let own=(await rows()).filter(r=>r.community_id===me);
 assert.equal(own.length,2);
 assert.ok(own.every(r=>!r.is_live),'joining never implies live check-in');
 await db.exec(`UPDATE nearify_event_presence SET is_live=true WHERE community_id='${me}' AND nearify_event_id='event'; SET ROLE authenticated;`);
 assert.equal((await invoke('event','left')).rows[0].result.status,'left');
 await db.exec('RESET ROLE;');
 assert.equal((await rows()).find(r=>r.community_id===me&&r.nearify_event_id==='event').is_live,true,'existing live flag behavior preserved; joined filter excludes left rows');
 assert.deepEqual((await rows()).filter(r=>r.community_id===other),before);
 await db.query("SELECT set_config('test.actor',$1,false)",['10000000-0000-0000-0000-000000000099']);
 await db.exec('SET ROLE authenticated;');
 assert.equal((await invoke()).rows[0].result.success,false,'missing member cannot write');
 await db.exec('RESET ROLE;');
 // Add a role-specific anonymous grant and rerun to model the exported live
 // database; revoking PUBLIC alone would not remove this explicit grant.
 await db.exec(`GRANT EXECUTE ON FUNCTION ${signature} TO anon;`);
 await db.exec(migration);
 assert.equal((await db.query(`SELECT has_function_privilege('anon','${signature}','EXECUTE') AS allowed`)).rows[0].allowed,false);
 assert.ok((await db.query(`SELECT proconfig FROM pg_proc WHERE oid='${signature}'::regprocedure`)).rows[0].proconfig.includes('search_path=public, pg_temp'));
 const source=read('supabase/sql/nearify_event_presence.sql');
 const definition=source.match(/CREATE OR REPLACE FUNCTION public\.ingest_nearify_event_presence\([\s\S]*?\n\$\$;/)[0];
 assert.ok(migration.includes(definition),'source and migration agree');
 await db.exec(rollback);
 for(const role of ['anon','authenticated']){
  assert.equal((await db.query(`SELECT has_function_privilege($1,'${signature}','EXECUTE') AS allowed`,[role])).rows[0].allowed,false,'rollback must not restore client impersonation');
 }
 await db.exec(migration);
 assert.equal((await db.query(`SELECT has_function_privilege('authenticated','${signature}','EXECUTE') AS allowed`)).rows[0].allowed,true);
 console.log('PASS: anonymous/no-session rejection, cross-account and conflicting assertions, native compatibility, own writes, idempotency, unchanged live semantics, missing member, explicit grants, rollback and reapply');
}finally{await db.close();}
