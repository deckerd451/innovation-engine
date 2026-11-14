import { BROWSER_KEY } from './site-visits-core.mjs';
import { getClaimStats } from './adminPeopleService.js?v=claim-email-20261113';
import { renderUnconnectedReview } from './admin-unconnected-review.js?v=20261113';

// Read only aggregate reports. No new events, personal data or email sends.
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
async function bounded(task) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(task), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Report timed out')), 12000);
    })]);
  } finally { clearTimeout(timer); }
}
function card(host, label, value, note) {
  const article = node('article', undefined, 'admin-hub-metric');
  article.append(node('span', label), node('strong', count(value) === null ? 'Unavailable' : value.toLocaleString()), node('small', note));
  host.append(article);
}
function action(host, label, description, callback) {
  const button = node('button', undefined, 'admin-hub-action'); button.type = 'button';
  button.append(node('strong', label), node('span', description)); button.onclick = callback;
  host.append(button);
}
function reportError(result) {
  return result.status !== 'fulfilled' || result.value?.error || !result.value?.data;
}
export async function renderAdminOverview(container, {section = 'overview', navigate}) {
  const root = node('section', undefined, 'admin-hub');
  container.replaceChildren(root);
  const community = section === 'community';
  root.innerHTML = `<header class="admin-hub-heading"><div><p class="admin-hub-eyebrow">${community ? 'Community health' : 'At a glance'}</p><h2>${community ? 'Help the community connect' : 'Is the community growing and connecting?'}</h2><p class="admin-hub-lede">${community ? 'Review participation and follow up where people need support.' : 'Community traffic, account adoption, and the next useful actions.'}</p></div><button type="button" class="admin-hub-refresh">Refresh overview</button></header><p class="admin-hub-status" role="status">Loading reports…</p><div class="admin-hub-metrics"></div><div class="admin-hub-columns"><section class="admin-hub-section admin-hub-primary"><h3>${community ? 'Community tools' : 'Daily community visits'}</h3><div class="admin-hub-trend"></div></section><section class="admin-hub-section"><h3>Needs attention</h3><div class="admin-hub-attention"></div></section></div><section class="admin-hub-section"><h3>${community ? 'Participation snapshot' : 'Community snapshot'}</h3><p class="admin-hub-note">Profile and network metrics include admin profiles. Their windows differ from the traffic report.</p><div class="admin-hub-network"></div><div class="admin-hub-links"></div></section><details class="admin-about admin-hub-planned"><summary>Measurement coverage</summary><p>Returning-browser rates, campaign sources, and new claims over time: Not yet available. These are not counted as zero.</p><p>Visits cover recorded app sessions, not distinct people. Daily counts use the most recent recorded visit timestamp. Traffic excludes recognized admin accounts and browsers; private-window tests and separate test accounts may still appear as community traffic.</p><p>Active profiles reflect the existing last-seen measure over 30 days. Connections are accepted connections. These are not proof that someone completed a useful action during this visit.</p></details><div class="admin-hub-review" hidden></div>`;
  const refresh = root.querySelector('.admin-hub-refresh');
  let generation = 0;
  const mounted = () => root.isConnected;
  const go = (target, filters = null) => {
    navigate(target, null, filters);
    // Move keyboard users to the destination without changing the dialog focus trap.
    const heading = container.querySelector('h2, h3') || container;
    heading.tabIndex = -1; heading.focus({preventScroll:true});
  };
  async function load() {
    const request = ++generation;
    refresh.disabled = true;
    root.querySelector('.admin-hub-status').textContent = 'Loading reports…';
    let browser = null;
    try { browser = localStorage.getItem(BROWSER_KEY); } catch { /* server still separates admin accounts */ }
    const results = await Promise.allSettled([
      bounded(() => window.supabase.rpc('get_admin_site_visit_report', {p_days:7, p_view:'community', p_excluded_browser_id:browser})),
      bounded(() => window.supabase.rpc('get_admin_network_analytics', {p_active_window_days:30})),
      bounded(getClaimStats)
    ]);
    if (!mounted() || request !== generation) return;
    const [trafficResult, networkResult, claimsResult] = results;
    const traffic = reportError(trafficResult) ? null : trafficResult.value.data;
    const network = reportError(networkResult) ? null : networkResult.value.data;
    const claims = claimsResult.status === 'fulfilled' && !claimsResult.value?.error ? claimsResult.value : null;
    const metrics = root.querySelector('.admin-hub-metrics'); metrics.replaceChildren();
    if (!community) {
      card(metrics, 'Community visits', traffic?.visits, 'Last 7 days · recognized admin/browser activity excluded');
      card(metrics, 'Member visits', traffic?.members, 'Last 7 days · signed-in sessions, not unique members');
      card(metrics, 'Claimed accounts', claims?.claimed, 'Current total · includes admin accounts');
      card(metrics, 'Active profiles', network?.active_members, 'Last 30 days · includes admin profiles');
    } else {
      card(metrics, 'Active projects', network?.active_projects, 'Current projects marked active');
      card(metrics, 'Open opportunities', network?.open_opportunities, 'Current open opportunities');
      card(metrics, 'Accepted connections', network?.total_connections, 'Current network total');
      card(metrics, 'Unconnected profiles', network?.isolated_members_count, 'No recorded connections · current snapshot');
    }
    const trend = root.querySelector('.admin-hub-trend'); trend.replaceChildren();
    if (community) {
      action(trend, 'Manage projects', 'Review projects, participation and theme assignments.', () => go('projects'));
      action(trend, 'Manage organizations', 'Review organizations and their community presence.', () => go('organizations'));
      action(trend, 'Open network analytics', 'Explore connections, skills, opportunities and engagement reports.', () => go('analytics'));
    } else if (Array.isArray(traffic?.daily) && traffic.daily.length && traffic.daily.every(day => /^\d{4}-\d{2}-\d{2}$/.test(day.day) && count(day.visits) !== null)) {
      trend.append(node('p', 'Rolling 7 days · UTC dates · first and last days are partial.', 'admin-hub-note'));
      const bars = node('ol', undefined, 'admin-hub-chart');
      const max = Math.max(1, ...traffic.daily.map(day => day.visits));
      for (const day of traffic.daily) {
        const item = node('li');
        const bar = node('div', undefined, 'admin-hub-bar');
        bar.style.height = `${Math.max(2, day.visits / max * 110)}px`;
        bar.setAttribute('aria-hidden','true');
        item.append(node('strong', String(day.visits)), bar, node('span', day.day.slice(5)));
        item.setAttribute('aria-label', `${day.day}: ${day.visits} visits`);
        bars.append(item);
      }
      trend.append(bars);
      if (traffic.daily.every(day => day.visits === 0)) trend.append(node('p', 'No recorded community visits in this period.'));
    } else {
      trend.append(node('p', traffic ? 'Daily trend: Not yet available. The reporting update has not been applied.' : 'Traffic report unavailable. Refresh or check Traffic for setup and access details.', 'admin-hub-note'));
    }
    if (!community) action(trend, 'Explore traffic', 'Choose a period or compare Community, Admin/browser and All activity.', () => go('visitors'));
    const attention = root.querySelector('.admin-hub-attention'); attention.replaceChildren();
    if (count(claims?.unclaimed) > 0) action(attention, `${claims.unclaimed} unclaimed accounts`, 'Review account adoption in People. Claim emails are sent only when you choose recipients.', () => go('manage', {claimed:false}));
    if (count(network?.isolated_members_count) > 0) action(attention, `${network.isolated_members_count} profiles without connections`, 'Review the full list and open an individual profile to help them connect.', () => {
      renderUnconnectedReview(root.querySelector('.admin-hub-review'), network.isolated_members_count);
    });
    if (count(network?.open_opportunities) > 0) action(attention, `${network.open_opportunities} open opportunities`, 'Inspect opportunities and follow-up recommendations in network analytics.', () => go('analytics'));
    if (!attention.children.length) attention.append(node('p', claims && network ? 'No follow-up items from the available account and connection counts.' : 'Attention items could not be loaded. Refresh to retry.'));
    const snapshot = root.querySelector('.admin-hub-network'); snapshot.replaceChildren();
    card(snapshot, 'Community profiles', network?.total_members, 'Current total');
    card(snapshot, 'New profiles', network?.new_members_30d, 'Created in the last 30 days · not new claims');
    card(snapshot, 'New connections', network?.new_connections_30d, 'Accepted connections created in the last 30 days');
    const links = root.querySelector('.admin-hub-links'); links.replaceChildren();
    action(links, community ? 'People directory' : 'Community tools', community ? 'Find members and manage profiles or claim emails.' : 'Manage projects and organizations, or open detailed analytics.', () => go(community ? 'manage' : 'community'));
    const partial = !traffic || !network || !claims;
    root.querySelector('.admin-hub-status').textContent = `${partial ? 'Some reports are unavailable; available figures are shown.' : 'Reports updated.'} ${new Date().toLocaleTimeString()}. Refresh to update.`;
    refresh.disabled = false;
  }
  refresh.onclick = load;
  await load();
}
