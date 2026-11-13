// Dependencies are injected for deterministic tests. Never accept recipient
// addresses or redirect URLs from callers; the database owns eligibility.
export function createClaimEmailHandler({origin,authenticate,reserve,send,finish}) {
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 const response=(status,body)=>new Response(JSON.stringify(body),{status,headers});
 return async request=>{
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==origin)return response(403,{error:'Origin not allowed'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return response(405,{error:'Use POST'});
  const token=request.headers.get('Authorization');
  if(!token?.startsWith('Bearer '))return response(401,{error:'Sign in again'});
  let user;
  try { user=await authenticate(token); } catch { return response(401,{error:'Sign in again'}); }
  if(!user)return response(401,{error:'Sign in again'});
  let body;
  try {
   const reader=request.body?.getReader();if(!reader)return response(400,{error:'Invalid request'});
   const chunks=[];let bytes=0;
   while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel();return response(413,{error:'Request too large'});}chunks.push(value);}
   const raw=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}
   body=JSON.parse(new TextDecoder().decode(raw));
  } catch {return response(400,{error:'Invalid request'});}
  const ids=body?.person_ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))||Object.keys(body).some(k=>k!=='person_ids'))return response(400,{error:'Choose 1 to 20 people'});
  let reservations;
  try { reservations=await reserve(token,[...new Set(ids)]);if(!Array.isArray(reservations))throw Error('Invalid reservation response'); } catch(error) {return response(error.code==='42501'?403:503,{error:error.code==='42501'?'Admin access required':'Email service setup or connection failed'});}
  const results=[];
  const deadline=Date.now()+75000;
  for(const row of reservations) {
   if(row.status!=='reserved'){results.push({person_id:row.person_id,status:row.status});continue;}
   if(Date.now()>deadline){results.push({person_id:row.person_id,status:'failed',code:'request_budget'});continue;}
   let accepted=false,code='provider_unavailable';
   try {const result=await send(row.email);accepted=!result.error;code=accepted?'accepted':result.error.code==='over_email_send_rate_limit'?'provider_rate_limited':'provider_rejected';} catch { /* A network failure is never reported as accepted. */ }
   try {await finish(row.request_id,accepted,code);} catch { /* Reservation still prevents immediate duplicate sending. */ }
   results.push({person_id:row.person_id,status:accepted?'accepted':'failed',code});
  }
  return response(200,{results});
 };
}
