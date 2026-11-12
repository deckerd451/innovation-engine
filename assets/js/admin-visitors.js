import { BROWSER_KEY } from './site-visits-core.mjs';
export async function renderVisitors(container, openAnalytics) {
  container.innerHTML = `<section class="admin-visitors"><h2>Visitors</h2>
    <p>Visits to the main Innovation Engine app, including guests and signed-in members.</p>
    <div class="visitor-controls"><label>Period <select id="visitor-period"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option></select></label>
    <label><input type="checkbox" id="visitor-self"> Include my visits</label><button id="visitor-refresh">Refresh</button></div>
    <p>Your account and this browser are excluded by default. Other browsers you use while signed out cannot be recognized as you.</p>
    <div id="visitor-result" aria-live="polite"></div>
    <p>Browsers are estimates, not people. Privacy preferences, blockers and automated traffic can affect totals. Collection begins after database setup; there is no historical backfill.</p>
    <button id="visitor-analytics">Detailed member analytics →</button></section>`;
  container.querySelector('#visitor-analytics').onclick = openAnalytics;
  let request = 0;
  const load = async () => {
    const generation = ++request;
    const result = container.querySelector('#visitor-result');
    if (!result) return;
    result.textContent = 'Loading visits…';
    let browser = null;
    try { browser = localStorage.getItem(BROWSER_KEY); } catch { /* account exclusion still applies */ }
    try {
      const { data, error } = await window.supabase.rpc('get_admin_site_visits', {
        p_days: Number(container.querySelector('#visitor-period').value),
        p_exclude_self: !container.querySelector('#visitor-self').checked,
        p_excluded_browser_id: browser
      });
      if (generation !== request || !result.isConnected) return;
      if (error) {
        result.textContent = error.code === 'PGRST202' || error.code === '42883'
          ? 'Visitor logging needs database setup. Apply the documented site-visits migration first.'
          : 'Visits could not be loaded. Check your admin access and connection, then refresh.';
        return;
      }
      result.replaceChildren();
      const grid = document.createElement('div'); grid.className = 'visitor-metrics';
      for (const [label, key] of [['Visits', 'visits'], ['Estimated browsers', 'browsers'], ['Guest visits', 'guests'], ['Signed-in visits', 'members']]) {
        const card = document.createElement('div');
        const number = document.createElement('strong'); number.textContent = String(data[key]);
        const caption = document.createElement('span'); caption.textContent = label;
        card.append(number, caption); grid.append(card);
      }
      result.append(grid);
      const heading = document.createElement('h3'); heading.textContent = 'Recent visits'; result.append(heading);
      const list = document.createElement('ul');
      for (const visit of data.recent || []) {
        const row = document.createElement('li');
        row.textContent = `${new Date(visit.last_seen_at).toLocaleString()} — ${visit.signed_in ? 'Signed-in member' : 'Guest'}`;
        list.append(row);
      }
      if (!list.children.length) list.textContent = 'No recorded visits in this period.';
      result.append(list);
    } catch { if (generation === request && result.isConnected) result.textContent = 'Visits could not be loaded. Refresh to retry.'; }
  };
  for (const id of ['visitor-period', 'visitor-self']) container.querySelector('#' + id).onchange = load;
  container.querySelector('#visitor-refresh').onclick = load;
  await load();
}
