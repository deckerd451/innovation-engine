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
// Only metrics backed by existing, reliable data are shown here. Retention/
// engagement (sessions, returning users, D1/D7/D30, activation, and
// action->return association) is computed by the separate
// get_admin_retention_analytics RPC (supabase/sql/migrations/
// 20260820_retention_instrumentation.sql) from the new product_sessions/
// product_events tables -- see that migration's header for the full
// definitions. Session duration and a full multi-stage activation funnel
// are still deliberately out of scope -- see the Admin Console Audit.

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
  analyticsModal.querySelector('#admin-analytics-retry-btn')?.addEventListener('click', () => {
    openAnalyticsModal();
  });
}

// Load and render analytics from the server-side aggregate RPCs. No raw
// connections/messages/activity_log/product_events/product_sessions rows
// are ever requested by the client.
async function loadAnalyticsData() {
  try {
    console.log('📊 Fetching analytics data...');

    // Supabase builders are awaitable but do not implement Promise.catch().
    // Normalize the optional RPC through the canonical awaited result shape.
    const retentionRequest = (async () => {
      try {
        const { data, error } = await supabase.rpc('get_admin_retention_analytics', {});
        return { data, error };
      } catch (error) {
        return { data: null, error };
      }
    })();

    const [networkResult, retentionResult] = await Promise.all([
      supabase.rpc('get_admin_network_analytics', { p_active_window_days: 30 }),
      // Retention is a separate, independently-failable RPC -- its absence
      // (e.g. the 20260820 migration not yet applied) must never prevent
      // the rest of the dashboard from rendering.
      retentionRequest
    ]);

    if (networkResult.error) {
      // Distinguish "you're not authorized" (RPC's fail-closed admin check,
      // Postgres 42501 / insufficient_privilege) from a generic data/network
      // failure, so the message tells the admin what actually happened.
      const isAuthError = networkResult.error.code === '42501' ||
        /not_authorized/i.test(networkResult.error.message || '');
      console.error('❌ Error loading analytics:', networkResult.error);
      renderError(
        isAuthError
          ? "You don't have admin access to network analytics."
          : 'Could not load analytics data. Please try again.',
        { retryable: !isAuthError }
      );
      return;
    }

    if (retentionResult.error) {
      console.warn('⚠️ Retention analytics unavailable:', retentionResult.error.message || retentionResult.error);
    }

    renderAnalyticsDashboard(networkResult.data, retentionResult.data || null);
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

/**
 * Turn descriptive metrics into a short, ordered admin work queue. The
 * recommendations are intentionally generic: the evidence comes from the RPC,
 * while the suggested next step never implies that an action already happened.
 */
export function buildAdminPriorities(m) {
  const priorities = [];
  const totalMembers = Number(m?.total_members) || 0;
  const isolatedMembers = Number(m?.isolated_members_count) || 0;
  const activeMembers = Number(m?.active_members) || 0;
  const emptyOpportunities = Number(m?.open_opportunities_no_applications) || 0;

  if (isolatedMembers > 0) {
    const share = totalMembers > 0 ? Math.round((isolatedMembers / totalMembers) * 100) : null;
    priorities.push({
      tone: 'urgent',
      title: 'Connect isolated members',
      evidence: `${isolatedMembers} member${isolatedMembers === 1 ? '' : 's'} have no connections${share == null ? '' : ` (${share}% of members)`}.`,
      action: 'Review the list below and introduce each person to a relevant connector or project.'
    });
  }

  if (emptyOpportunities > 0) {
    priorities.push({
      tone: 'attention',
      title: 'Unblock open opportunities',
      evidence: `${emptyOpportunities} open opportunit${emptyOpportunities === 1 ? 'y has' : 'ies have'} no applications.`,
      action: 'Check the brief, owner, and skills needed, then share it with matching members.'
    });
  }

  if (totalMembers > 0) {
    const inactiveMembers = Math.max(totalMembers - activeMembers, 0);
    const activeShare = Math.round((activeMembers / totalMembers) * 100);
    priorities.push({
      tone: activeMembers > 0 ? 'info' : 'attention',
      title: 'Grow active participation',
      evidence: `${activeMembers} of ${totalMembers} members were active in the selected window (${activeShare}%).`,
      action: inactiveMembers > 0
        ? `Re-engage the ${inactiveMembers} member${inactiveMembers === 1 ? '' : 's'} not active in this window with a specific reason to return.`
        : 'Participation reached every member; keep the current engagement rhythm going.'
    });
  }

  return priorities;
}

function formatShortDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_) {
    return '';
  }
}

const RETURN_SIGNAL_LABELS = {
  connection_requested: { name: 'Members who made a connection', verb: 'make a connection' },
  message_sent: { name: 'Members who sent a message', verb: 'send a message' },
};

/**
 * One retention/activation metric card. Renders the real number when the
 * underlying cohort has data; otherwise a "collecting data" card -- never
 * a bare 0%, which would misrepresent "not measurable yet" as "measured
 * and zero" (see PHASE 7/11 of the retention instrumentation plan).
 */
function renderRetentionMetric({ label, ratePct, cohortN, retainedN, detailSuffix, collectingText }) {
  if (ratePct == null || !cohortN) {
    return `
      <div class="admin-metric-card" style="--metric-accent:#888;">
        <div class="admin-metric-label">${esc(label)}</div>
        <div class="admin-metric-sub" style="color:var(--admin-text-muted); margin-top:0.5rem;">${esc(collectingText)}</div>
      </div>
    `;
  }
  return `
    <div class="admin-metric-card" style="--metric-accent:#00e0ff">
      <div class="admin-metric-value">${ratePct}%</div>
      <div class="admin-metric-label">${esc(label)}</div>
      <div class="admin-metric-sub" style="color:var(--admin-text-muted)">${retainedN} of ${cohortN}${esc(detailSuffix)}</div>
    </div>
  `;
}

/**
 * Retention & Engagement section. Uses ONLY product_sessions/product_events
 * (via get_admin_retention_analytics) -- never last_seen_at or any other
 * pre-instrumentation snapshot field, so nothing here fabricates history
 * from before instrumentation existed.
 */
function renderRetentionSection(retention) {
  if (!retention || !retention.instrumentation_since) {
    return `
      <div class="admin-panel-section" style="margin-bottom:1.75rem;">
        <h3><i class="fas fa-arrow-rotate-left" style="color:#00e0ff"></i> Retention &amp; Engagement</h3>
        <p class="admin-panel-section-sub" style="margin:0;">Collecting data -- retention metrics will appear here once members start returning after this instrumentation's launch.</p>
      </div>
    `;
  }

  const since = formatShortDate(retention.instrumentation_since);
  const activation = retention.activation || {};
  const d1 = retention.d1_retention || {};
  const d7 = retention.d7_retention || {};
  const d30 = retention.d30_retention || {};
  const signals = (retention.return_signals || []).filter(s => RETURN_SIGNAL_LABELS[s.action]);

  return `
    <div class="admin-panel-section" style="margin-bottom:1.75rem;">
      <h3><i class="fas fa-arrow-rotate-left" style="color:#00e0ff"></i> Retention &amp; Engagement</h3>
      <p class="admin-panel-section-sub">Measured since ${esc(since)}. Early numbers will be small while data accumulates.</p>

      <div class="admin-metric-grid" style="margin-bottom:1rem;">
        <div class="admin-metric-card" style="--metric-accent:#00ff88">
          <div class="admin-metric-value">${retention.active_users_7d ?? 0}</div>
          <div class="admin-metric-label">Active Users (7d)</div>
          <div class="admin-metric-sub" style="color:var(--admin-text-muted)">${retention.sessions_7d ?? 0} sessions</div>
        </div>
        <div class="admin-metric-card" style="--metric-accent:#00e0ff">
          <div class="admin-metric-value">${retention.active_users_30d ?? 0}</div>
          <div class="admin-metric-label">Active Users (30d)</div>
          <div class="admin-metric-sub" style="color:var(--admin-text-muted)">${retention.sessions_30d ?? 0} sessions</div>
        </div>
        <div class="admin-metric-card" style="--metric-accent:#ff6bff">
          <div class="admin-metric-value">${retention.returning_users ?? 0}</div>
          <div class="admin-metric-label">Returning Users</div>
          <div class="admin-metric-sub" style="color:var(--admin-text-muted)">2+ separate visits, ever</div>
        </div>
        ${renderRetentionMetric({
          label: 'Activation',
          ratePct: activation.rate_pct,
          cohortN: activation.eligible_users,
          retainedN: activation.activated_users,
          detailSuffix: ' instrumented members completed a meaningful action',
          collectingText: "Collecting data -- activation will appear once members have instrumented sessions."
        })}
      </div>

      <div class="admin-metric-grid">
        ${renderRetentionMetric({
          label: 'D1 Retention',
          ratePct: d1.rate_pct, cohortN: d1.cohort_n, retainedN: d1.retained_n,
          detailSuffix: ' returned the day after joining',
          collectingText: 'Collecting data -- D1 retention needs at least one full day-after-join window to elapse.'
        })}
        ${renderRetentionMetric({
          label: '7-Day Retention',
          ratePct: d7.rate_pct, cohortN: d7.cohort_n, retainedN: d7.retained_n,
          detailSuffix: ' eligible members returned within 7 days',
          collectingText: '7-day retention will become available after enough members have completed a 7-day observation window.'
        })}
        ${renderRetentionMetric({
          label: '30-Day Retention',
          ratePct: d30.rate_pct, cohortN: d30.cohort_n, retainedN: d30.retained_n,
          detailSuffix: ' eligible members returned within 30 days',
          collectingText: '30-day retention will become available after enough members have completed a 30-day observation window.'
        })}
      </div>

      ${signals.length > 0 ? `
        <div style="margin-top:1.25rem;">
          <h4 style="margin:0 0 0.6rem; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--admin-text-muted);">
            What drives return? <span style="text-transform:none; letter-spacing:normal;">(observed association, not causation)</span>
          </h4>
          <div class="admin-list">
            ${signals.map(s => `
              <div class="admin-list-row" style="align-items:flex-start;">
                <div style="flex:1;">
                  <div class="admin-list-name">${esc(RETURN_SIGNAL_LABELS[s.action].name)}</div>
                  <div class="admin-list-meta">${s.did_return_pct}% returned within 7 days, vs ${s.not_return_pct}% who didn't ${esc(RETURN_SIGNAL_LABELS[s.action].verb)} (N=${s.did_n} vs N=${s.not_n})</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAnalyticsDashboard(metrics, retention) {
  const isolated = metrics.isolated_members_sample || [];
  const connectors = metrics.key_connectors || [];
  const topSkills = metrics.top_skills || [];
  const intelligence = buildAdminIntelligence(metrics);
  const priorities = buildAdminPriorities(metrics);
  const activeShare = metrics.total_members > 0
    ? Math.round((metrics.active_members / metrics.total_members) * 100)
    : null;

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
          <div class="admin-metric-sub" style="color:var(--admin-text-muted)">Active in last ${esc(metrics.active_window_days)} days${activeShare == null ? '' : ` · ${activeShare}% of members`}</div>
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

      <div class="admin-panel-section admin-priorities" style="margin-bottom:1.75rem;">
        <div class="admin-priorities-heading">
          <div>
            <h3><i class="fas fa-list-check" style="color:#ffaa00"></i> Recommended next steps</h3>
            <p class="admin-panel-section-sub">A prioritized work queue based on the current snapshot</p>
          </div>
          <span class="admin-priorities-count">${priorities.length} action${priorities.length === 1 ? '' : 's'}</span>
        </div>
        ${priorities.length === 0 ? `
          <p class="admin-panel-section-sub" style="margin:0;">No immediate follow-up is suggested by the available metrics.</p>
        ` : `
          <ol class="admin-priority-list">
            ${priorities.map(item => `
              <li class="admin-priority-item admin-priority-${esc(item.tone)}">
                <div class="admin-priority-marker" aria-hidden="true"></div>
                <div>
                  <div class="admin-priority-title">${esc(item.title)}</div>
                  <div class="admin-priority-evidence">${esc(item.evidence)}</div>
                  <div class="admin-priority-action"><b>Next:</b> ${esc(item.action)}</div>
                </div>
              </li>
            `).join('')}
          </ol>
        `}
      </div>

      ${renderRetentionSection(retention)}

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
