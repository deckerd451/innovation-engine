// ================================================================
// NEARIFY EVENTS PANEL
// ================================================================
// Renders a "People you met at events" section in the profile modal.
// Calls get_nearify_event_peers() RPC and renders event groups with
// peer cards. Suggested (BLE) edges show a "Connect" button that
// calls promote_edge_to_connection().
//
// Usage:
//   import { renderNearifyEventsPanel, initNearifyEventsPanel } from './nearify-events-panel.js';
//
//   // 1. Inject placeholder HTML into the profile view:
//   container.insertAdjacentHTML('beforeend', renderNearifyEventsPanel());
//
//   // 2. Load data and wire interactions:
//   await initNearifyEventsPanel(container);
// ================================================================

const LOG = '[NearifyEventsPanel]';

// ----------------------------------------------------------------
// HTML skeleton (synchronous — inserted immediately on modal open)
// ----------------------------------------------------------------

export function renderNearifyEventsPanel() {
  return `
    <div class="ch-nearify-events-panel" id="nearify-events-panel">
      <div class="ch-nearify-events-header">
        <span class="ch-nearify-events-title">
          <i class="fas fa-map-marker-alt" style="color:#f43f5e;margin-right:.4rem"></i>
          People you met
        </span>
        <span class="ch-nearify-events-status" id="nearify-events-status">Loading…</span>
      </div>
      <div class="ch-nearify-events-body" id="nearify-events-body">
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
    ? root.querySelector('#nearify-events-panel')
    : document.getElementById('nearify-events-panel');
  if (!panel) return;

  const body = panel.querySelector('#nearify-events-body');
  const status = panel.querySelector('#nearify-events-status');

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

    if (events.length === 0) {
      if (body) body.innerHTML = '<p class="ch-nearify-events-empty">No event interactions yet. Attend a Nearify event to see people you\'ve met here.</p>';
      if (status) status.textContent = '';
      return;
    }

    const totalPeers = events.reduce((n, ev) => n + (ev.peers?.length || 0), 0);
    if (status) status.textContent = `${totalPeers} ${totalPeers === 1 ? 'person' : 'people'}`;

    if (body) {
      body.innerHTML = events.map(ev => _renderEventGroup(ev)).join('');
      _wireConnectButtons(panel, supabase);
    }

  } catch (err) {
    console.warn(LOG, 'Unexpected error:', err);
    if (body) body.innerHTML = '<p class="ch-nearify-events-empty">Could not load event data</p>';
    if (status) status.textContent = '';
  }
}

// ----------------------------------------------------------------
// Event group renderer
// ----------------------------------------------------------------

function _renderEventGroup(ev) {
  const peers = ev.peers || [];
  const date = ev.occurred_at ? _formatDate(ev.occurred_at) : '';
  const name = _esc(ev.event_name || 'Unknown Event');

  return `
    <div class="ch-nearify-event-group">
      <div class="ch-nearify-event-label">
        ${name}${date ? `<span class="ch-nearify-event-date">${_esc(date)}</span>` : ''}
      </div>
      <div class="ch-nearify-peer-list">
        ${peers.map(p => _renderPeer(p)).join('')}
      </div>
    </div>
  `;
}

function _renderPeer(peer) {
  const name = _esc(peer.name || 'Unknown');
  const headline = peer.headline ? `<div class="ch-peer-headline">${_esc(peer.headline)}</div>` : '';
  const avatar = peer.avatar_url
    ? `<img src="${_esc(peer.avatar_url)}" alt="${name}" class="ch-peer-avatar" loading="lazy">`
    : `<div class="ch-peer-avatar ch-peer-avatar-placeholder">${_initials(peer.name)}</div>`;

  const signalBadge = peer.signal_type === 'qr_confirmed'
    ? `<span class="ch-peer-badge ch-peer-badge-qr" title="Met via QR scan"><i class="fas fa-qrcode"></i></span>`
    : `<span class="ch-peer-badge ch-peer-badge-ble" title="Nearby at event"><i class="fas fa-bluetooth-b"></i></span>`;

  const isConnected = peer.status === 'promoted' || peer.status === 'confirmed';
  const action = isConnected
    ? `<span class="ch-peer-connected-badge"><i class="fas fa-check-circle"></i> Connected</span>`
    : `<button class="btn ch-btn-peer-connect" data-edge-id="${_esc(peer.edge_id)}" data-peer-name="${name}">Connect</button>`;

  return `
    <div class="ch-peer-card" data-edge-id="${_esc(peer.edge_id)}">
      <div class="ch-peer-left">
        ${avatar}
        ${signalBadge}
      </div>
      <div class="ch-peer-info">
        <div class="ch-peer-name">${name}</div>
        ${headline}
      </div>
      <div class="ch-peer-action">
        ${action}
      </div>
    </div>
  `;
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

        // Replace button with "Connected" badge
        const action = btn.closest('.ch-peer-action');
        if (action) {
          action.innerHTML = `<span class="ch-peer-connected-badge"><i class="fas fa-check-circle"></i> Connected</span>`;
        }

        // Fire event for Synapse graph to pick up new connection
        window.dispatchEvent(new CustomEvent('nearify-connection-promoted', {
          detail: { edgeId, peerName },
        }));

        console.log(LOG, '✅ Connected with', peerName);

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

function _esc(s) {
  if (!s) return '';
  const d = document.createElement('span');
  d.textContent = String(s);
  return d.innerHTML;
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
    .ch-peer-card{display:flex;align-items:center;gap:.55rem;padding:.45rem .55rem;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);}
    .ch-peer-left{position:relative;flex:0 0 auto;}
    .ch-peer-avatar{width:32px;height:32px;border-radius:50%;object-fit:cover;display:block;}
    .ch-peer-avatar-placeholder{width:32px;height:32px;border-radius:50%;background:rgba(244,63,94,.2);display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;color:#f43f5e;}
    .ch-peer-badge{position:absolute;bottom:-3px;right:-3px;width:14px;height:14px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.45rem;border:1.5px solid #1a1a2e;}
    .ch-peer-badge-qr{background:#f43f5e;color:#fff;}
    .ch-peer-badge-ble{background:#3b82f6;color:#fff;}
    .ch-peer-info{flex:1;min-width:0;}
    .ch-peer-name{font-size:.82rem;font-weight:600;color:#eee;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .ch-peer-headline{font-size:.72rem;color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .ch-peer-action{flex:0 0 auto;}
    .ch-btn-peer-connect{font-size:.72rem;padding:.3rem .65rem;border-radius:20px;background:rgba(244,63,94,.15);border:1px solid rgba(244,63,94,.4);color:#f43f5e;cursor:pointer;transition:background .2s;}
    .ch-btn-peer-connect:hover:not(:disabled){background:rgba(244,63,94,.28);}
    .ch-btn-peer-connect:disabled{opacity:.5;cursor:not-allowed;}
    .ch-peer-connected-badge{font-size:.72rem;color:#00ff88;display:flex;align-items:center;gap:.25rem;}
  `;
  document.head.appendChild(style);
}

// Global exposure for non-module callers
window.NearifyEventsPanel = {
  render: renderNearifyEventsPanel,
  init: initNearifyEventsPanel,
  ensureStyles: ensureNearifyEventsPanelStyles,
};

export default window.NearifyEventsPanel;
