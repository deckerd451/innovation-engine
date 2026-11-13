import {completeEmailClaim} from './claim-email-completion.mjs';
// Capture and remove sensitive fragment before loading the Auth client.
const url=new URL(window.location.href);
window.history.replaceState(null,'',url.pathname);
const status=document.getElementById('claim-status');
const next=document.getElementById('claim-continue');
try {
 const {supabase}=await import('./supabaseClient.js');
 await completeEmailClaim({url,client:supabase,clearUrl:()=>{}});
 status.textContent='Your verified account is linked to your community profile. Continue to start connecting.';
 next.hidden=false;
} catch(error) {
 status.textContent=error instanceof Error?error.message:'Your claim link could not be completed. Contact an admin.';
 next.textContent='Return to sign in';next.hidden=false;
}
