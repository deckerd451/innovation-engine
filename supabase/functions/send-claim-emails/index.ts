import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {createClaimEmailHandler} from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const redirect=Deno.env.get('CLAIM_EMAIL_REDIRECT_URL') || 'https://deckerd451.github.io/innovation-engine/claim.html';
const target=new URL(redirect);
if(target.protocol!=='https:' || target.username || target.password || target.hash || target.search)throw Error('Configure a fixed HTTPS claim callback URL');
const options={global:{fetch:(input:RequestInfo|URL, init?:RequestInit)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,flowType:'implicit' as const}};
const privileged=createClient(url,service,options);
const userClient=(authorization:string)=>createClient(url,anon,{...options,global:{...options.global,headers:{Authorization:authorization}}});
Deno.serve(createClaimEmailHandler({
 origin:target.origin,
 authenticate:async(token:string)=>{const {data,error}=await userClient(token).auth.getUser(token.slice(7));if(error)throw error;return data.user;},
 reserve:async(token:string,ids:string[])=>{const {data,error}=await userClient(token).rpc('reserve_admin_claim_emails',{p_ids:ids});if(error)throw error;return data;},
 send:(email:string)=>createClient(url,anon,options).auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:redirect}}),
 finish:async(id:string,accepted:boolean,code:string)=>{const {error}=await privileged.rpc('finish_admin_claim_email',{p_request_id:id,p_accepted:accepted,p_code:code});if(error)throw error;}
}));
