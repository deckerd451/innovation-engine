'use strict';
const {nearifyCandidates}=require('./nearify-opportunity-intake');
const endpoint='https://unndeygygkgodmmdnlup.supabase.co/rest/v1/events';
async function retrieve(key,request=fetch,now=Date.now()) {
  if(typeof key!=='string'||!key.startsWith('sb_publishable_')) throw new Error('Nearify publishable key required');
  const url=new URL(endpoint);
  url.search=new URLSearchParams({select:'id,name,slug,starts_at',deleted_at:'is.null',starts_at:'gt.'+new Date(now).toISOString(),order:'starts_at.asc,id.asc',limit:'50'});
  const response=await request(url.href,{headers:{apikey:key},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error('Nearify public feed HTTP '+response.status);
  return nearifyCandidates(await response.json(),now);
}
module.exports={retrieve};
if(require.main===module) retrieve(process.env.NEARIFY_PUBLISHABLE_KEY).then(rows=>console.log(JSON.stringify(rows,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
