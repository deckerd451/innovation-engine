// Nearify-owned context for the mobile Event and Nearby tabs.
// This module never creates presence, eligibility, proximity, or candidates.
(() => {
  'use strict';
  if (window.innerWidth >= 1024) return;

  const EMPTY_EVENT = 'No active Nearify event right now.';

  const style = document.createElement('style');
  style.textContent = '.nearify-mobile-context-overlay{position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,.82)}.nearify-mobile-context-panel{position:relative;width:min(100%,30rem);max-height:82vh;overflow:auto;padding:1.5rem;border:1px solid rgba(0,224,255,.35);border-radius:16px;background:linear-gradient(135deg,rgba(10,14,39,.98),rgba(16,20,39,.98));color:#fff}.nearify-mobile-context-close{position:absolute;top:.6rem;right:.7rem;border:0;background:transparent;color:#aaa;font-size:1.75rem}.nearify-mobile-context-panel h2{margin:0 2rem 1rem 0;color:#00e0ff}.nearify-mobile-context-panel p{color:#ddd;line-height:1.5}.nearify-mobile-context-panel small{color:#aaa}.nearify-mobile-people{margin-top:1rem}.nearify-mobile-person{display:flex;flex-direction:column;gap:.25rem;margin:.6rem 0;padding:.85rem;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.05)}.nearify-mobile-person span,.nearify-mobile-person small{color:#bbb}.nearify-mobile-empty{color:#aaa}';
  document.head.appendChild(style);

  function supabase() { return window.supabase || null; }

  async function currentEvent() {
    const client = supabase();
    if (!client?.auth?.getUser) return null;
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData?.user) return null;

    // Do not expose even the caller's retained presence context after the
    // Nearify authorization has been revoked or is absent. The RPC resolves
    // the linked identity and authorization server-side.
    const { data: authorization, error: authorizationError } = await client.rpc('get_nearify_authorization_status');
    const authorizationResult = typeof authorization === 'string' ? JSON.parse(authorization) : authorization;
    if (authorizationError || authorizationResult?.status !== 'authorized') return null;

    // The authenticated session selects the caller's community row. RLS on
    // nearify_event_presence remains the authority for what can be read.
    const { data: profile, error: profileError } = await client
      .from('community')
      .select('id')
      .eq('user_id', authData.user.id)
      .limit(1)
      .maybeSingle();
    if (profileError || !profile?.id) return null;

    const { data: rows, error } = await client
      .from('nearify_event_presence')
      .select('nearify_event_id, event_name, event_starts_at, status, updated_at')
      .eq('community_id', profile.id)
      .eq('status', 'joined')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error || !rows?.length) return null;
    return rows[0];
  }

  async function loadContext() {
    const event = await currentEvent();
    if (!event) return { event: null, recommendations: [] };
    const client = supabase();
    const { data, error } = await client.rpc('get_nearify_event_recommendations', {
      p_nearify_event_id: event.nearify_event_id,
      p_limit: 5,
    });
    if (error) {
      console.warn('[NearifyMobileContext] Recommendation load failed:', error.message);
      return { event, recommendations: [] };
    }
    const result = typeof data === 'string' ? JSON.parse(data) : data;
    return { event, recommendations: Array.isArray(result?.recommendations) ? result.recommendations : [] };
  }

  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function recommendationMarkup(recommendations) {
    if (!recommendations.length) {
      return '<p class="nearify-mobile-empty">No Nearify-established people are available for this event right now.</p>';
    }
    return recommendations.map((person) => {
      const reasons = (person.reasons || []).map((reason) => {
        if (reason.type === 'shared_event') return 'Nearify event context';
        if (reason.type === 'shared_skill') return `${reason.count} shared skill${reason.count === 1 ? '' : 's'}`;
        if (reason.type === 'shared_project') return `${reason.count} shared project${reason.count === 1 ? '' : 's'}`;
        if (reason.type === 'shared_organization') return `${reason.count} shared organization${reason.count === 1 ? '' : 's'}`;
        if (reason.type === 'mutual_connections') return `${reason.count} mutual connection${reason.count === 1 ? '' : 's'}`;
        return null;
      }).filter(Boolean);
      return `<article class="nearify-mobile-person"><strong>${escape(person.name || 'Nearify-established person')}</strong>${person.role ? `<span>${escape(person.role)}</span>` : ''}${person.headline ? `<span>${escape(person.headline)}</span>` : ''}${reasons.length ? `<small>${escape(reasons.join(' · '))}</small>` : ''}</article>`;
    }).join('');
  }

  async function show(kind) {
    const overlay = document.createElement('div');
    overlay.className = 'nearify-mobile-context-overlay';
    overlay.innerHTML = '<section class="nearify-mobile-context-panel" role="dialog" aria-modal="true"><button type="button" class="nearify-mobile-context-close" aria-label="Close">×</button><div class="nearify-mobile-context-content"><p>Loading Nearify context…</p></div></section>';
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.nearify-mobile-context-close').addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    const content = overlay.querySelector('.nearify-mobile-context-content');
    try {
      const context = await loadContext();
      if (!context.event) {
        content.innerHTML = `<h2>${kind === 'event' ? 'Event' : 'Nearby'}</h2><p>${EMPTY_EVENT}</p>`;
        return;
      }
      const heading = kind === 'event' ? 'This Nearify event' : 'Nearify-established people';
      const intro = kind === 'event' ? 'What matters about the event you’re in' : 'What to know about people Nearify has established as relevant';
      content.innerHTML = `<h2>${heading}</h2><p>${escape(context.event.event_name || 'Current Nearify event')}</p><small>${intro}</small><div class="nearify-mobile-people">${recommendationMarkup(context.recommendations)}</div>`;
    } catch (error) {
      console.error('[NearifyMobileContext] Context load failed:', error);
      content.innerHTML = `<h2>${kind === 'event' ? 'Event' : 'Nearby'}</h2><p>${EMPTY_EVENT}</p>`;
    }
  }

  window.NearifyMobileContext = { currentEvent, loadContext, showEvent: () => show('event'), showNearby: () => show('nearby') };
})();
