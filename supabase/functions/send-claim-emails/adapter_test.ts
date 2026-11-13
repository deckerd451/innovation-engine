// Real SDK adapter, synthetic HTTP only. No network permission is granted.
Deno.test('adapter verifies identity and requests a non-PKCE email with the fixed callback', async()=>{
 const oldFetch=globalThis.fetch, oldServe=Deno.serve;
 const keys=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','CLAIM_EMAIL_REDIRECT_URL'];
 const old=keys.map(key=>Deno.env.get(key));
 const values=['https://fixture.supabase.test','public-fixture','service-fixture','https://deckerd451.github.io/innovation-engine/claim.html'];
 const check=(value:unknown,label:string)=>{if(!value)throw Error(label);};
 let handler:((request:Request)=>Promise<Response>)|undefined;
 const calls:{url:URL,request:Request,body:Record<string,unknown>|null}[]=[];
 try {
  keys.forEach((key,i)=>Deno.env.set(key,values[i]));
  globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
   const request=new Request(input,init),url=new URL(request.url);
   const body=request.method==='POST'?await request.json():null;
   calls.push({url,request,body});
   if(url.pathname==='/auth/v1/user')return Response.json({id:'00000000-0000-4000-8000-000000000001',email:'admin@example.test'});
   if(url.pathname==='/rest/v1/rpc/reserve_admin_claim_emails')return Response.json([{person_id:'20000000-0000-4000-8000-000000000001',request_id:'receipt',email:'recipient@example.test',status:'reserved'}]);
   if(url.pathname==='/auth/v1/otp')return Response.json({});
   if(url.pathname==='/rest/v1/rpc/finish_admin_claim_email')return new Response(null,{status:204});
   throw Error('Unexpected adapter request');
  };
  Object.defineProperty(Deno,'serve',{configurable:true,value:(fn:typeof handler)=>{handler=fn;return {};}});
  await import('./index.ts');
  check(handler,'Handler must be installed');
  const response=await handler!(new Request('https://function.example.test',{method:'POST',headers:{Authorization:'Bearer admin-fixture',Origin:'https://deckerd451.github.io'},body:JSON.stringify({person_ids:['20000000-0000-4000-8000-000000000001']})}));
  check(response.status===200,'Send request must succeed');
  const result=await response.json();check(result.results[0].status==='accepted','API acceptance must be reported');
  const otp=calls.find(call=>call.url.pathname==='/auth/v1/otp')!;
  check(otp.body?.email==='recipient@example.test','Address must come from the reservation');
  check(otp.url.searchParams.get('redirect_to')===values[3],'Use the server-configured redirect');
  check(!otp.body?.code_challenge,'Recipient must not require the admin browser PKCE verifier');
  check(calls.find(call=>call.url.pathname.endsWith('reserve_admin_claim_emails'))?.request.headers.get('Authorization')==='Bearer admin-fixture','Reserve with the verified user identity');
  check(calls.find(call=>call.url.pathname.endsWith('finish_admin_claim_email'))?.request.headers.get('Authorization')==='Bearer service-fixture','Finalize using the server-only role');
  check(calls.length===4,'Only identity, reservation, OTP and receipt endpoints should be called');
 } finally {
  globalThis.fetch=oldFetch;Object.defineProperty(Deno,'serve',{value:oldServe});
  keys.forEach((key,i)=>old[i]===undefined?Deno.env.delete(key):Deno.env.set(key,old[i]!));
 }
});
