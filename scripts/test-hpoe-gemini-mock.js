#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source=fs.readFileSync('supabase/functions/hpoe-synthesize/index.ts','utf8').replace(/^import .*;\n/,'').replace(' as const','').replace('value: unknown): boolean','value)').replace('value as Record<string, unknown>','value').replace(/ as string/g,'').replace('status: number, body: unknown','status, body').replace('p:{thought?:boolean}','p').replace('p:{text?:string}','p');
let handler, calls, env, user, quota, provider;
const proposal={title:'Inventory',firstAction:'Make chart',capability:'Charting',outputAsset:'Guide',nextOpportunity:'Teach charting',nextInputAsset:'Guide',nextUsesCapability:'Charting',constraints:'Two hours'};
vm.runInNewContext(source,{Deno:{env:{get:k=>env[k]},serve:f=>handler=f},createClient:()=>({auth:{getUser:async()=>({data:{user},error:null})},rpc:async()=>quota}),fetch:async(u,o)=>{calls++;assert.equal(JSON.parse(o.body).contents.length,1);return provider},Response,TextDecoder,AbortSignal});
async function run(){
for(const [name,status,change] of [
['disabled',503,s=>delete env.HPOE_SYNTHETIC_ENABLED],
['missing auth',401,s=>delete s.headers.Authorization],
['invalid user',401,s=>user=null],
['private input',400,s=>s.body=JSON.stringify({operation:'synthetic',name:'private'})],
['oversize',413,s=>s.body='x'.repeat(257)],
['quota denied',403,s=>quota={data:false}],
['provider failure',502,s=>provider={ok:false}],
['valid',200,s=>{}],
['invalid chain',502,s=>provider=mock({...proposal,nextInputAsset:'other'})]
]){
calls=0;env={SUPABASE_URL:'url',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',GEMINI_API_KEY:'fake',HPOE_GEMINI_MODEL:'gemini-test',HPOE_SYNTHETIC_ENABLED:'true'};user={id:'fake'};quota={data:true};provider=mock(proposal);
const s={method:'POST',headers:{Authorization:'Bearer fake'},body:'{"operation":"synthetic"}'};change(s);const res=await handler(new Request('https://example.test',s));assert.equal(res.status,status,name);assert.equal(calls,status===200||status===502?1:0,name);console.log('PASS '+name);
}}
function mock(p){return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(p)}]}}]})}}
run().catch(e=>{console.error(e);process.exitCode=1});
