import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const fields = ["title","firstAction","capability","outputAsset","nextOpportunity","nextInputAsset","nextUsesCapability","constraints"] as const;
const scenario = "Fictional adults: A wants to learn data visualization and has basic spreadsheet skills. B wants to improve a fictional community food pantry's inventory planning and knows its workflow. C wants to learn to teach digital skills. They have two hours each, a laptop and fabricated inventory data. No real commitments or resources are verified.";
function valid(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === fields.length && fields.every(k => typeof v[k] === "string" && (v[k] as string).trim().length > 0 && (v[k] as string).length <= 1200)
    && v.outputAsset === v.nextInputAsset && v.capability === v.nextUsesCapability;
}
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async req => {
  if (req.method !== "POST") return reply(405,{error:"POST required"});
  try {
    const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const key = Deno.env.get("GEMINI_API_KEY"), model = Deno.env.get("HPOE_GEMINI_MODEL");
    if (!url || !anon || !service || !key || !model || !/^gemini-[a-z0-9.-]+$/.test(model) || Deno.env.get("HPOE_SYNTHETIC_ENABLED") !== "true") return reply(503,{error:"Pilot unavailable"});
    const token = req.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return reply(401,{error:"Authentication required"});
    const auth = createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error} = await auth.auth.getUser(token);
    if (error || !data.user) return reply(401,{error:"Authentication required"});
    const reader = req.body?.getReader();
    if (!reader) return reply(400,{error:"Synthetic selector required"});
    let size=0, raw="";
    const decoder=new TextDecoder();
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>256){await reader.cancel();return reply(413,{error:"Request too large"});}raw+=decoder.decode(value,{stream:true});}
    raw+=decoder.decode();
    let body;
    try {body=JSON.parse(raw);} catch {return reply(400,{error:"Invalid request"});}
    if (!body || Object.keys(body).length!==1 || body.operation!=="synthetic") return reply(400,{error:"Synthetic selector required"});
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const quota=await admin.rpc("hpoe_reserve_generation",{p_actor:data.user.id});
    if(quota.error) return reply(503,{error:"Pilot unavailable"});
    if(quota.data!==true) return reply(403,{error:"Not eligible or quota exhausted"});
    const properties=Object.fromEntries(fields.map(k=>[k,{type:"STRING"}]));
    const result=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",{
      method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
      signal:AbortSignal.timeout(25000),
      body:JSON.stringify({contents:[{parts:[{text:scenario+" Generate one feasible collaborative developmental opportunity and a subsequent opportunity that reuses the first output asset and learned capability. Include an achievable first action and material constraints. All outcomes are hypothetical. Repeat outputAsset exactly in nextInputAsset and capability exactly in nextUsesCapability."}]}],generationConfig:{responseMimeType:"application/json",responseSchema:{type:"OBJECT",properties,required:fields},maxOutputTokens:2048}})
    });
    if(!result.ok)return reply(502,{error:"Model request unsuccessful"});
    const response=await result.json();
    const candidate=response.candidates?.[0];
    if(candidate?.finishReason!=="STOP")return reply(502,{error:"Incomplete model response"});
    const proposal=JSON.parse(candidate.content.parts.filter((p:{thought?:boolean})=>!p.thought).map((p:{text?:string})=>p.text||"").join(""));
    if(!valid(proposal))return reply(502,{error:"Invalid model response"});
    return reply(200,{synthetic:true,verified:false,proposal});
  }catch{return reply(503,{error:"Pilot unavailable"});}
});
