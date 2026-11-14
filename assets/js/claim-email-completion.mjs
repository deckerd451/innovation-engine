// Complete only the verified session delivered by Supabase's email link.
export async function completeEmailClaim({url,client,clearUrl}) {
 const fragment=new URLSearchParams(url.hash.slice(1));
 const access=fragment.get('access_token'), refresh=fragment.get('refresh_token');
 clearUrl(); // Remove credentials before any asynchronous work or error display.
 if(!access||!refresh||access.length>20000||refresh.length>20000)throw Error('This link is missing or expired. Ask an admin for a new claim email.');
 const {error:sessionError}=await client.auth.setSession({access_token:access,refresh_token:refresh});
 if(sessionError)throw Error('This link could not be verified. Ask an admin for a new claim email.');
 const {data,error}=await client.rpc('claim_community_profile_by_email');
 if(error)throw Error('Your email was verified, but your profile could not be claimed. Sign in again or contact an admin.');
 if(!data)throw Error('No profile matches your verified email. Contact an admin before creating another profile.');
 return data;
}
