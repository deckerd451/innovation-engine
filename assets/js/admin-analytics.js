// ================================================================
// ADMIN ANALYTICS DASHBOARD
// ================================================================
// Ecosystem insights for organizers and community leaders.
//
// Metrics are computed entirely server-side by the get_admin_network_analytics
// RPC (supabase/sql/migrations/20260819_admin_analytics_privacy.sql) rather
// than downloading raw connections/messages/activity_log rows to the browser.
// The RPC fails closed (raises) for any caller who is not
// community.user_role = 'Admin' -- privileged access is authorized
// server-side, not solely by the client-side email allowlist in
// dashboard-actions.js's isAdminUser().
//
// Only metrics backed by existing, reliable data are shown here. Returning-
// user rate, retention cohorts, session duration, and the full activation
// funnel are deliberately NOT implemented -- see the Admin Console Audit.

console.log("%c📊 Admin Analytics Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let analyticsModal = null;
let supabase = null;
let currentUserProfile = null;

// Initialize analytics
let adminAnalyticsInitialized = false;

export function initAdminAnalytics() {
  if (adminAnalyticsInitialized) {
    console.log('⚠️ Admin Analytics already initialized, skipping');
    return;
  }
  adminAnalyticsInitialized = true;

  supabase = window.supabase;

  function handleProfile(profile) {
    currentUserProfile = profile;
  }

  window.addEventListener('profile-loaded', (e) => {
    handleProfile(e.detail.profile);
  });

  // This module is injected post-AUTH_READY, which races with auth.js's
  // profile-loaded dispatch — profile-loaded may already have fired before
  // this listener was registered. Use the already-available profile if so.
  if (window.currentUserProfile) {
    handleProfile(window.currentUserProfile);
  }

  createAnalyticsModal();

  // Expose functions globally immediately
  window.openAnalyticsModal = openAnalyticsModal;
  window.closeAnalyticsModal = closeAnalyticsModal;

  console.log('✅ Admin analytics initialized');
}

// Create analytics modal
function createAnalyticsModal() {
  analyticsModal = document.createElement('div');
  analyticsModal.id = 'admin-analytics-modal';
  analyticsModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(10px);
    z-index: 5000;
    display: none;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s;
    padding: 1rem;
    box-sizing: border-box;
  `;

  document.body.appendChild(analyticsModal);
}

function frameHtml(innerHtml) {
  return `
    <div style="background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98)); border: 2px solid rgba(255, 107, 107, 0.5); border-radius: 16px; padding: 2rem; max-width: 95vw; width: 1200px; max-height: 90vh; overflow-y: auto; position: relative; box-sizing: border-box;">
      ${innerHtml}
    </div>
  `;
}

// Open analytics modal
async function openAnalyticsModal() {
  console.log('📊 Opening admin analytics');

  analyticsModal.style.display = 'flex';
  setTimeout(() => {
    analyticsModal.style.opacity = '1';
  }, 10);

  analyticsModal.innerHTML = frameHtml(`
    <div class="admin-analytics-empty">
      <i class="fas fa-spinner fa-spin" style="font-size: 2.5rem;"></i>
      <p style="margin-top: 1rem; font-size: 1.1rem;">Loading analytics...</p>
    </div>
  `);

  await loadAnalyticsData();
}

function renderError(message, { retryable = true } = {}) {
  analyticsModal.innerHTML = frameHtml(`
    <div class="admin-analytics-error">
      <i class="fas fa-exclamation-circle" style="font-size: 2.5rem;"></i>
      <p style="margin-top: 1rem; color: white;">${message}</p>
      <div style="display:flex; gap:0.75rem; justify-content:center; margin-top:1rem;">
        ${retryable ? `<button class="admin-retry-btn" id="admin-analytics-retry-btn">Try again</button>` : ''}
        <button onclick="closeAnalyticsModal()" class="admin-retry-btn" style="background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.25); color:white;">Close</button>
      </div>
    </div>
  `);
  document.getElementById('admin-analytics-retry-btn')?.addEventListener('click', () => {
    openAnalyticsModal();
  });
}

// Load and render analytics from the server-side aggregate RPC. No raw
// connections/messages/activity_log rows are ever requested by the client.
async function loadAnalyticsData() {
  try {
    console.log('📊 Fetching analytics data...');

    const { data, error } = await supabase.rpc('get_admin_network_analytics', {
      p_active_window_days: 30
    });

    if (error) {
      // Distinguish "you're not authorized" (RPC's fail-closed admin check,
      // Postgres 42501 / insufficient_privilege) from a generic data/network
      // failure, so the message tells the admin what actually happened.
      const isAuthError = error.code === '42501' ||
        /not_authorized/i.test(error.message || '');
      console.error('❌ Error loading analytics:', error);
      renderError(
        isAuthError
          ? "You don't have admin access to network analytics."
          : 'Could not load analytics data. Please try again.',
        { retryable: !isAuthError }
      );
      return;
    }

    renderAnalyticsDashboard(data);
  } catch (error) {
    console.error('❌ Error loading analytics:', error);
    renderError('Could not load analytics data. Please try again.');
  }
}

function initials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Deterministic, non-estimated observations derived from already-computed
 * metrics. No metric is invented here -- each line only fires when the
 * underlying count is present and non-zero.
 * @param {object} m - the RPC's JSON response
 * @returns {string[]}
 */
export function buildAdminIntelligence(m) {
  const items = [];

  if ((m?.isolated_members_count || 0) > 0) {
    const n = m.isolated_members_count;
    items.push(`${n} member${n === 1 ? '' : 's'} ${n === 1 ? 'has' : 'have'} zero connections.`);
  }

  if ((m?.open_opportunities_no_applications || 0) > 0) {
    const n = m.open_opportunities_no_applications;
    items.push(`${n} open opportunit${n === 1 ? 'y has' : 'ies have'} zero applications.`);
  }

  if ((m?.new_members_30d || 0) > 0 || (m?.new_connections_30d || 0) > 0) {
    const nm = m.new_members_30d || 0;
    const nc = m.new_connections_30d || 0;
    items.push(`${nm} new member${nm === 1 ? '' : 's'} and ${nc} new connection${nc === 1 ? '' : 's'} in the last 30 days.`);
  }

  return items;
}

function renderAnalyticsDashboard(metrics) {
  const isolated = metrics.isolated_members_sample || [];
  const connectors = metrics.key_connectors || [];
  const topSkills = metrics.top_skills || [];
  const intelligence = buildAdminIntelligence(metrics);

  analyticsModal.innerHTML = frameHtml(`
    <div class="admin-analytics">
      <div class="admin-analytics-header">
        <h1><i class="fas fa-chart-line"></i> Ecosystem Analytics</h1>
        <span class="admin-analytics-window">Active window: last ${esc(metrics.active_window_days)} days</span>
        <button class="admin-analytics-close" onclick="closeAnalyticsModal()"><i class="fas fa-times"></i></button>
      </div>

      <div class="admin-metric-grid">
        <div class="admin-metric-card" style="--metric-accent:#00e0ff">
          <div class="admin-metric-value">${metrics.total_members}</div>
          <div class="admin-metric-label">Total Members</div>
          ${metrics.new_members_30d > 0 ? `<div class="admin-metric-sub">+${metrics.new_members_30d} in last 30 days</div>` : ''}
        </div>
        <div class="admin-metric-card" style="--metric-accent:#00ff88">
          <div class="admin-metric-value">${metrics.active_members}</div>
          <div class="admin-metric-label">Active Users</div>
          <div class="admin-metric-sub" style="color:var(--admin-text-muted)">Active in last ${esc(metrics.active_window_days)} days</div>
        </div>
        <div class="admin-metric-card" style="--metric-accent:#ff6bff">
          <div class="admin-metric-value">${metrics.total_connections}</div>
          <div class="admin-metric-label">Connections</div>
          ${metrics.new_connections_30d > 0 ? `<div class="admin-metric-sub">+${metrics.new_connections_30d} in last 30 days</div>` : ''}
        </div>
        <div class="admin-metric-card" style="--metric-accent:#ffaa00">
          <div class="admin-metric-value">${metrics.network_density_pct}%</div>
          <div class="admin-metric-label">Network Density</div>
        </div>
        <div class="admin-metric-card" style="--metric-accent:#ff6b6b">
          <div class="admin-metric-value">${metrics.active_projects}</div>
          <div class="admin-metric-label">Active Projects</div>
          <div class="admin-metric-sub" style="color:var(--admin-text-muted)">${metrics.total_projects} total</div>
        </div>
        <div class="admin-metric-card" style="--metric-accent:#ffd700">
          <div class="admin-metric-value">${metrics.open_opportunities}</div>
          <div class="admin-metric-label">Open Opportunities</div>
        </div>
      </div>

      <div class="admin-analytics-columns">
        <div class="admin-panel-section">
          <h3><i class="fas fa-exclamation-triangle" style="color:#ff6b6b"></i> Isolated Members (${metrics.isolated_members_count})</h3>
          <p class="admin-panel-section-sub">Members with zero connections</p>
          ${isolated.length === 0 ? `
            <div class="admin-analytics-empty" style="padding:1.5rem;">
              <i class="fas fa-check-circle" style="color:#00ff88;"></i>
              <p style="margin-top:0.5rem;">No isolated members.</p>
            </div>
          ` : `
            <div class="admin-list">
              ${isolated.map(u => `
                <div class="admin-list-row">
                  <div class="admin-list-avatar">${esc(initials(u.name))}</div>
                  <div>
                    <div class="admin-list-name">${esc(u.name || 'Unnamed')}</div>
                    <div class="admin-list-meta">${esc(u.skills || 'No skills listed')}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <div class="admin-panel-section">
          <h3><i class="fas fa-star" style="color:#00ff88"></i> Key Connectors</h3>
          <p class="admin-panel-section-sub">Top network hubs by connection count</p>
          ${connectors.length === 0 ? `
            <div class="admin-analytics-empty" style="padding:1.5rem;">No connectors yet.</div>
          ` : `
            <div class="admin-list">
              ${connectors.map((c, i) => `
                <div class="admin-list-row">
                  <div class="admin-list-rank">${i + 1}</div>
                  <div class="admin-list-avatar">${esc(initials(c.name))}</div>
                  <div>
                    <div class="admin-list-name">${esc(c.name || 'Unnamed')}</div>
                    <div class="admin-list-meta">${c.connection_count} connections</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>

      <div class="admin-panel-section" style="margin-bottom:1.75rem;">
        <h3><i class="fas fa-code" style="color:#00e0ff"></i> Top Skills in Network</h3>
        ${topSkills.length === 0 ? `
          <p class="admin-panel-section-sub" style="margin:0;">Not enough skills data yet.</p>
        ` : `
          <div class="admin-skill-chips">
            ${topSkills.map(s => `<div class="admin-skill-chip"><b>${s.members}</b> ${esc(s.skill)}</div>`).join('')}
          </div>
        `}
      </div>

      <div class="admin-panel-section">
        <h3><i class="fas fa-lightbulb" style="color:#ffaa00"></i> Admin Intelligence</h3>
        <p class="admin-panel-section-sub">Deterministic observations from current data -- nothing estimated</p>
        ${intelligence.length === 0 ? `
          <p class="admin-panel-section-sub" style="margin:0;">No notable observations right now.</p>
        ` : `
          <ul class="admin-intelligence-list">
            ${intelligence.map(text => `<li><i class="fas fa-circle-info"></i> ${esc(text)}</li>`).join('')}
          </ul>
        `}
      </div>
    </div>
  `);
}

// Close analytics modal
function closeAnalyticsModal() {
  if (!analyticsModal) return;

  analyticsModal.style.opacity = '0';
  setTimeout(() => {
    analyticsModal.style.display = 'none';
  }, 300);
}

// Auto-initialize. This module is loaded dynamically by the post-auth
// module loader in index.html, long after DOMContentLoaded has already
// fired, so a DOMContentLoaded listener here would never run — call
// directly instead (the DOM is guaranteed ready by the time this file
// is injected).
initAdminAnalytics();

console.log('✅ Admin analytics ready');
