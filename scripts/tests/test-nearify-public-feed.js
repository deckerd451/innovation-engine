#!/usr/bin/env node
const assert=require('node:assert/strict');
const {retrieve}=require('../nearify-public-feed');
(async()=>{
 const now=Date.parse('2026-11-26');
 const rows=await retrieve('sb_publishable_test',async(url,opts)=>{
  const u=new URL(url);
  assert.equal(u.hostname,'unndeygygkgodmmdnlup.supabase.co');
  assert.equal(u.searchParams.get('select'),'id,name,slug,starts_at');
  assert.equal(u.searchParams.get('deleted_at'),'is.null');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.headers.Authorization,undefined);
  return {ok:true,json:async()=>[{id:'1',name:'Meetup',starts_at:'2026-12-01'}]};
 },now);
 assert.equal(rows[0].status,'needs_review');
 await assert.rejects(retrieve('sb_secret_test'),/publishable/);
 await assert.rejects(retrieve('sb_publishable_test',async()=>({ok:false,status:403}),now),/403/);
 console.log('Nearify public feed checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
