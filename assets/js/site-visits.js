import { supabase } from './supabaseClient.js?v=fc09b39b-1770146154f916933b2da';
import { visitIdentity } from './site-visits-core.mjs';

// Respect browser privacy preferences. Failure must never affect sign-in.
if (!navigator.globalPrivacyControl && navigator.doNotTrack !== '1') {
  let lastActor;
  let initialized = false;
  let queue = Promise.resolve();
  const record = (session) => {
    const actor = session?.user?.id || null;
    if (initialized && actor === lastActor) return;
    initialized = true;
    lastActor = actor;
    queue = queue.then(async () => {
      try {
        const identity = visitIdentity(localStorage, () => crypto.randomUUID(), Date.now(), actor);
        const { error } = await supabase.rpc('record_site_visit', identity);
        if (error) console.debug('[visits] Recording unavailable');
      } catch { /* Storage, network or migration unavailable; app remains usable. */ }
    });
  };
  // Defer RPC work outside Supabase's synchronous auth callback.
  supabase.auth.onAuthStateChange((_event, session) => setTimeout(() => record(session), 0));
  supabase.auth.getSession().then(({ data, error }) => { if (!error) record(data.session); }).catch(() => {});
}
