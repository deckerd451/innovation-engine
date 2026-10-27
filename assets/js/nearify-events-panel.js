// ================================================================
// NEARIFY EVENTS PANEL
// ================================================================
// Renders the "People you met" section of Network (every width).
// Calls get_nearify_event_peers() RPC (grouped by event) and shows each
// person once, with the events they were met at ("Met at 2 events") and
// their actual connection status from the member's own connections rows.
// Connect (promote_edge_to_connection on a suggested edge) is offered only
// to people with no connection or request either way. A name opens the
// person's profile.
//
// Usage (app-nav.js does this when Network opens and closes):
//   window.NearifyEventsPanel.mount(container);  // styles, skeleton, data
//   window.NearifyEventsPanel.unmount();
// ================================================================

const LOG = '[NearifyEventsPanel]';

// ----------------------------------------------------------------
// HTML skeleton (synchronous — inserted immediately on modal open)
// ----------------------------------------------------------------

export function renderNearifyEventsPanel() {
  return `
    <div class="ch-nearify-events-panel">
      <div class="ch-nearify-events-header">
        <span class="ch-nearify-events-title">
          <i class="fas fa-map-marker-alt" style="color:#f43f5e;margin-right:.4rem"></i>
          People you met
        </span>
        <span class="ch-nearify-events-status">Loading…</span>
      </div>
      <div class="ch-nearify-events-body">
        <div class="ch-nearify-events-spinner"></div>
      </div>
    </div>
  `;
}

// ----------------------------------------------------------------
// Data loading + rendering (async — called after modal open)
// ----------------------------------------------------------------

export async function initNearifyEventsPanel(container) {
  const supabase = window.supabase;
  const root = container || document;
  const panel = root.querySelector
    ? root.querySelector('.ch-nearify-events-panel')
    : document.querySelector('.ch-nearify-events-panel');
  if (!panel) return;

  // Classes, not ids, scoped to the container the section was mounted in.
  const body = panel.querySelector('.ch-nearify-events-body');
  const status = panel.querySelector('.ch-nearify-events-status');

  if (!supabase) {
    if (body) body.innerHTML = '<p class="ch-nearify-events-empty">Not available</p>';
    if (status) status.textContent = '';
    return;
  }

  try {
    const { data, error } = await supabase.rpc('get_nearify_event_peers');

    if (error) {
      console.warn(LOG, 'RPC error:', error.message);
      if (body) body.innerHTML = '<p class="ch-nearify-events-empty">Could not load event data</p>';
      if (status) status.textContent = '';
      return;
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data;

    if (!result?.success) {
      if (body) body.innerHTML = '<p class="ch-nearify-events-empty">Could not load event data</p>';
      if (status) status.textContent = '';
      return;
    }

    const events = result.events || [];
    const me = result.community_id || window.currentUserProfile?.id || null;
    // The peers RPC predates photo consent. Resolve current community choices
    // instead of treating its raw avatar URL as permission to show a photo.
    const peerIds = [...new Set(events.flatMap(ev => (ev.peers || []).map(p => p.community_id)).filter(Boolean))];
    if (peerIds.length) {
      const { data: profiles } = await supabase.from('community')
        .select('id, user_id, image_url, photo_visible, photo_consent_at').in('id', peerIds);
      const byId = new Map((profiles || []).map(p => [p.id, p]));
      events.forEach(ev => (ev.peers || []).forEach(peer => {
        peer.photoProfile = byId.get(peer.community_id) || null;
      }));
    }

    if (events.length === 0) {
      if (body) body.innerHTML = '<p class="ch-nearify-events-empty">No event interactions yet. Attend a Nearify event to see people you\'ve met here.</p>';
      if (status) status.textContent = '';
      return;
    }

    const people = _peopleFrom(events);
    const relations = await _loadRelations(supabase, me, people.map(p => p.id));
    if (status) status.textContent = `${people.length} ${people.length === 1 ? 'person' : 'people'}`;

    if (body) {
      body.innerHTML = `<div class="ch-nearify-peer-list">${people.map(p => _renderPerson(p, relations)).join('')}</div>`;
      _wireConnectButtons(panel, supabase);
      _wireProfileLinks(panel);
    }

  } catch (err) {
    console.warn(LOG, 'Unexpected error:', err);
    if (body) body.innerHTML = '<p class="ch-nearify-events-empty">Could not load event data</p>';
    if (status) status.textContent = '';
  }
}

// ----------------------------------------------------------------
// One entry per person
// ----------------------------------------------------------------

// The RPC returns one row per (event, person). Each person is listed once,
// with every event they were met at (most recent first), from those rows
// only: nothing is added that the member could not already see.
function _peopleFrom(events) {
  const byId = new Map();
  events.forEach(ev => (ev.peers || []).forEach(peer => {
    const id = peer.community_id || `edge:${peer.edge_id}`;
    let person = byId.get(id);
    if (!person) {
      person = { id: peer.community_id || null, name: peer.name, headline: peer.headline, photoProfile: peer.photoProfile, edges: [], events: [] };
      byId.set(id, person);
    }
    person.edges.push(peer);
    // When this person was met (the group's date is its earliest encounter).
    const when = peer.occurred_at || ev.occurred_at || '';
    const key = ev.event_id || ev.event_name || 'unknown';
    if (!person.events.some(e => e.key === key)) {
      person.events.push({ key, name: ev.event_name || 'Nearify Event', when });
    }
  }));
  const time = value => { const t = new Date(value).getTime(); return Number.isFinite(t) ? t : 0; };
  const people = [...byId.values()];
  people.forEach(person => person.events.sort((a, b) => time(b.when) - time(a.when)));
  return people.sort((a, b) => time(b.events[0]?.when) - time(a.events[0]?.when));
}

// The member's own connections rows with these people: accepted, or a
// pending request in either direction. null when they could not be read
// (each person then falls back to their encounter's status, as before).
async function _loadRelations(supabase, me, ids) {
  const peers = ids.filter(Boolean);
  if (!me || !peers.length) return new Map();
  try {
    const { data, error } = await supabase.from('connections')
      .select('from_user_id, to_user_id, status')
      .or(`from_user_id.eq.${me},to_user_id.eq.${me}`)
      .in('status', ['accepted', 'pending']);
    if (error) throw error;
    const wanted = new Set(peers.map(String));
    const relations = new Map();
    (data || []).forEach(row => {
      const other = String(row.from_user_id) === String(me) ? row.to_user_id : row.from_user_id;
      if (!wanted.has(String(other))) return;
      const relation = row.status === 'accepted' ? 'connected' : String(row.from_user_id) === String(me) ? 'sent' : 'received';
      // An accepted row wins over a stale pending one.
      if (relations.get(String(other)) !== 'connected') relations.set(String(other), relation);
    });
    return relations;
  } catch (err) {
    console.warn(LOG, 'Connection status unavailable:', err?.message || err);
    return null;
  }
}

const CONNECTED = `<span class="ch-peer-connected-badge"><i class="fas fa-check-circle"></i> Connected</span>`;
const REQUEST_SENT = `<span class="ch-peer-connected-badge"><i class="fas fa-paper-plane"></i> Request sent</span>`;

function _renderPerson(person, relations) {
  const name = _esc(person.name || 'Unknown');
  const headline = person.headline ? `<div class="ch-peer-headline">${_esc(person.headline)}</div>` : '';
  const avatar = window.profilePhotoUrl?.(person.photoProfile)
    ? `<img src="${_esc(window.profilePhotoUrl?.(person.photoProfile))}" alt="${name}" class="ch-peer-avatar" loading="lazy">`
    : `<div class="ch-peer-avatar ch-peer-avatar-placeholder">${_initials(person.name)}</div>`;

  const qr = person.edges.some(e => e.signal_type === 'qr_confirmed');
  const signalBadge = qr
    ? `<span class="ch-peer-badge ch-peer-badge-qr" title="Met via QR scan"><i class="fas fa-qrcode"></i></span>`
    : `<span class="ch-peer-badge ch-peer-badge-ble" title="Nearby at event"><i class="fas fa-bluetooth-b"></i></span>`;

  // Connect promotes one suggested encounter: a QR scan first, then the
  // most recent.
  const suggested = person.edges.filter(e => e.status === 'suggested')
    .sort((a, b) => (a.signal_type === 'qr_confirmed' ? 0 : 1) - (b.signal_type === 'qr_confirmed' ? 0 : 1));
  const edge = suggested[0] || person.edges[0];

  let action = '';
  const relation = relations ? relations.get(String(person.id)) : undefined;
  if (relations === null) {
    // Connection status unavailable: the encounter's own status, as before.
    action = person.edges.some(e => e.status === 'promoted' || e.status === 'confirmed') ? CONNECTED
      : suggested.length ? _connectButton(suggested[0], name) : '';
  } else if (relation === 'connected') {
    action = CONNECTED;
  } else if (relation === 'sent') {
    action = REQUEST_SENT;
  } else if (relation === 'received') {
    action = person.id
      ? `<button type="button" class="btn ch-btn-peer-respond" data-profile-id="${_esc(person.id)}" data-peer-name="${name}">Respond</button>`
      : '';
  } else if (suggested.length) {
    action = _connectButton(suggested[0], name);
  }

  const status = relation === 'received' ? `<div class="ch-peer-status">Wants to connect</div>` : '';
  const count = person.events.length;
  const met = count === 1
    ? `Met at ${_esc(person.events[0].name)}`
    : `Met at ${count} events`;
  const history = count === 1
    ? `<div class="ch-peer-met">${met}${person.events[0].when ? ` · ${_esc(_formatDate(person.events[0].when))}` : ''}</div>`
    : `<details class="ch-peer-met"><summary>${met}</summary><ul class="ch-peer-events">${person.events.map(e => `<li><span>${_esc(e.name)}</span>${e.when ? ` · <span class="ch-nearify-event-date">${_esc(_formatDate(e.when))}</span>` : ''}</li>`).join('')}</ul></details>`;
  const nameMarkup = person.id
    ? `<button type="button" class="ch-peer-name ch-peer-profile" data-profile-id="${_esc(person.id)}" data-peer-name="${name}">${name}</button>`
    : `<div class="ch-peer-name">${name}</div>`;

  return `
    <div class="ch-peer-card" data-edge-id="${_esc(edge?.edge_id)}"${person.id ? ` data-community-id="${_esc(person.id)}"` : ''}>
      <div class="ch-peer-left">
        ${avatar}
        ${signalBadge}
      </div>
      <div class="ch-peer-info">
        ${nameMarkup}
        ${headline}
        ${status}
      </div>
      <div class="ch-peer-action">
        ${action}
      </div>
      ${history}
    </div>
  `;
}

function _connectButton(edge, name) {
  return `<button class="btn ch-btn-peer-connect" data-edge-id="${_esc(edge.edge_id)}" data-peer-name="${name}">Connect</button>`;
}

// A name (and Respond, for a request waiting on the member) opens the
// person's profile, where the existing connection actions are.
function _wireProfileLinks(panel) {
  panel.querySelectorAll('[data-profile-id]').forEach(el => {
    el.addEventListener('click', () => {
      window.openNodePanel?.({ id: el.dataset.profileId, type: 'person', name: el.dataset.peerName || '' });
    });
  });
}

// ----------------------------------------------------------------
// Connect button wiring
// ----------------------------------------------------------------

function _wireConnectButtons(panel, supabase) {
  panel.querySelectorAll('.ch-btn-peer-connect').forEach(btn => {
    btn.addEventListener('click', async () => {
      const edgeId = btn.dataset.edgeId;
      const peerName = btn.dataset.peerName || 'this person';
      if (!edgeId) return;

      btn.disabled = true;
      btn.textContent = 'Connecting…';

      try {
        const { data, error } = await supabase.rpc('promote_edge_to_connection', { p_edge_id: edgeId });
        const result = typeof data === 'string' ? JSON.parse(data) : data;

        if (error) {
          console.warn(LOG, 'Promote RPC error:', error.message || error.details || JSON.stringify(error));
          btn.disabled = false;
          btn.textContent = 'Connect';
          return;
        }

        // data null with no error = function missing or returned void
        if (!result) {
          console.warn(LOG, 'Promote returned no data — ensure promote_edge_to_connection() is deployed in Supabase');
          btn.disabled = false;
          btn.textContent = 'Connect';
          return;
        }

        // already_promoted counts as success
        if (!result.success && !result.already_promoted) {
          console.warn(LOG, 'Promote failed:', result.error || 'unknown reason');
          btn.disabled = false;
          btn.textContent = 'Connect';
          return;
        }

        // The other person has to agree too: until they do, this is a request.
        const connected = result.status === 'accepted';
        const action = btn.closest('.ch-peer-action');
        if (action) {
          action.innerHTML = connected ? CONNECTED : REQUEST_SENT;
        }

        // Fire event for Synapse graph to pick up new connection
        window.dispatchEvent(new CustomEvent('nearify-connection-promoted', {
          detail: { edgeId, peerName },
        }));

        console.log(LOG, connected ? '✅ Connected with' : '✅ Request sent to', peerName);

      } catch (err) {
        console.warn(LOG, 'Exception during promote:', err);
        btn.disabled = false;
        btn.textContent = 'Connect';
      }
    }, { once: true });
  });
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

// Safe in text and in quoted attributes (names go into data-peer-name).
function _esc(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function _initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function _formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

// ----------------------------------------------------------------
// Styles (injected once)
// ----------------------------------------------------------------

let _stylesInjected = false;

export function ensureNearifyEventsPanelStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .ch-nearify-events-panel{margin-top:.85rem;border:1px solid rgba(244,63,94,.25);border-radius:12px;overflow:hidden;}
    .ch-nearify-events-header{display:flex;align-items:center;justify-content:space-between;padding:.65rem .9rem;background:rgba(244,63,94,.07);border-bottom:1px solid rgba(244,63,94,.15);}
    .ch-nearify-events-title{font-size:.82rem;font-weight:700;color:#f43f5e;text-transform:uppercase;letter-spacing:.07em;}
    .ch-nearify-events-status{font-size:.78rem;color:#888;}
    .ch-nearify-events-body{padding:.5rem .75rem .75rem;}
    .ch-nearify-events-spinner{width:20px;height:20px;border:2px solid rgba(244,63,94,.3);border-top-color:#f43f5e;border-radius:50%;margin:.75rem auto;animation:ch-spin .7s linear infinite;}
    @keyframes ch-spin{to{transform:rotate(360deg)}}
    .ch-nearify-events-empty{color:#888;font-size:.82rem;text-align:center;padding:.75rem 0;margin:0;}
    .ch-nearify-event-group{margin-bottom:.6rem;}
    .ch-nearify-event-group:last-child{margin-bottom:0;}
    .ch-nearify-event-label{font-size:.78rem;font-weight:700;color:#f43f5e;margin-bottom:.35rem;display:flex;align-items:baseline;gap:.5rem;}
    .ch-nearify-event-date{font-size:.72rem;color:#888;font-weight:400;}
    .ch-nearify-peer-list{display:flex;flex-direction:column;gap:.35rem;}
    .ch-peer-card{display:flex;flex-wrap:wrap;align-items:center;gap:.55rem;padding:.45rem .55rem;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);}
    .ch-peer-left{position:relative;flex:0 0 auto;}
    .ch-peer-avatar{width:32px;height:32px;border-radius:50%;object-fit:cover;display:block;}
    .ch-peer-avatar-placeholder{width:32px;height:32px;border-radius:50%;background:rgba(244,63,94,.2);display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;color:#f43f5e;}
    .ch-peer-badge{position:absolute;bottom:-3px;right:-3px;width:14px;height:14px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.45rem;border:1.5px solid #1a1a2e;}
    .ch-peer-badge-qr{background:#f43f5e;color:#fff;}
    .ch-peer-badge-ble{background:#3b82f6;color:#fff;}
    .ch-peer-info{flex:1;min-width:0;}
    .ch-peer-name{font-size:.82rem;font-weight:600;color:#eee;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .ch-peer-profile{display:block;max-width:100%;padding:0;border:0;background:none;font-family:inherit;text-align:left;cursor:pointer;}
    .ch-peer-profile:hover,.ch-peer-profile:focus-visible{color:#fff;text-decoration:underline;outline:none;}
    .ch-peer-status{font-size:.72rem;color:#fbbf24;}
    /* The encounter line runs under the person, the full width of the card. */
    .ch-peer-met{flex:1 0 100%;box-sizing:border-box;padding-left:calc(32px + .55rem);margin-top:-.3rem;font-size:.72rem;color:#aaa;}
    .ch-peer-met summary{cursor:pointer;color:#f8a5b4;}
    .ch-peer-events{list-style:none;margin:.25rem 0 0;padding:0;display:flex;flex-direction:column;gap:.15rem;}
    .ch-peer-events li{color:#ccc;}
    .ch-btn-peer-respond{font-size:.72rem;padding:.3rem .65rem;border-radius:20px;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.45);color:#fbbf24;cursor:pointer;}
    .ch-peer-headline{font-size:.72rem;color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .ch-peer-action{flex:0 0 auto;}
    .ch-btn-peer-connect{font-size:.72rem;padding:.3rem .65rem;border-radius:20px;background:rgba(244,63,94,.15);border:1px solid rgba(244,63,94,.4);color:#f43f5e;cursor:pointer;transition:background .2s;}
    .ch-btn-peer-connect:hover:not(:disabled){background:rgba(244,63,94,.28);}
    .ch-btn-peer-connect:disabled{opacity:.5;cursor:not-allowed;}
    .ch-peer-connected-badge{font-size:.72rem;color:#00ff88;display:flex;align-items:center;gap:.25rem;}
  `;
  document.head.appendChild(style);
}

// ----------------------------------------------------------------
// Network section: one mount at every width
// ----------------------------------------------------------------

const SECTION_ID = 'cd-network-history';

export async function mountNearifyEventsPanel(container) {
  if (!container) return;
  // The cards are laid out by these styles (32px avatars); without them a
  // photo renders at its full size.
  ensureNearifyEventsPanelStyles();
  unmountNearifyEventsPanel();
  const section = document.createElement('section');
  section.id = SECTION_ID;
  section.className = 'cd-network-history';
  section.setAttribute('aria-label', 'People you met');
  section.innerHTML = renderNearifyEventsPanel();
  container.appendChild(section);
  await initNearifyEventsPanel(section);
}

export function unmountNearifyEventsPanel() {
  document.getElementById(SECTION_ID)?.remove();
}

// Global exposure for non-module callers
window.NearifyEventsPanel = {
  render: renderNearifyEventsPanel,
  init: initNearifyEventsPanel,
  ensureStyles: ensureNearifyEventsPanelStyles,
  mount: mountNearifyEventsPanel,
  unmount: unmountNearifyEventsPanel,
};

export default window.NearifyEventsPanel;
