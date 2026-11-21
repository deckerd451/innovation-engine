const node = (tag, text) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  return n;
};
const band = (value) => value === null ? 'Fewer than 5' : Number.isSafeInteger(value) && value >= 5 ? `${value}+` : 'Unavailable';
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : 'Unavailable';
function metric(host, label, value) {
  const card = node('article');
  card.append(node('strong', value), node('span', label));
  host.append(card);
}
function growth(host, data) {
  host.replaceChildren();
  let grouped = false, reported = false;
  for (const [label, value] of [['new visible profiles', data.new_profiles_band], ['new accepted connections', data.new_connections_band]]) {
    if (value === null) { grouped = true; continue; }
    host.append(node('p', `${band(value)} ${label} in the last 30 days.`));
    reported ||= Number.isSafeInteger(value) && value >= 5;
  }
  const months = node('ul'); months.className = 'pulse-months';
  if (Array.isArray(data.monthly)) {
    for (const month of data.monthly) {
      if (month.profiles_band === null) { grouped = true; continue; }
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month.month)) continue;
      const date = new Date(`${month.month}-01T00:00:00Z`);
      const label = date.toLocaleDateString(undefined, {month:'short',year:'numeric',timeZone:'UTC'});
      months.append(node('li', `${label}: ${band(month.profiles_band)} new visible profiles`));
      reported ||= Number.isSafeInteger(month.profiles_band) && month.profiles_band >= 5;
    }
    if (months.children.length) {
      host.append(node('p', 'New visible profiles by month · UTC dates.'), months);
    }
  } else host.append(node('p', 'Monthly growth is unavailable.'));
  if (grouped) host.append(node('p', reported ? 'Smaller growth counts are grouped for privacy.' : 'Growth is still small; detailed counts are grouped for privacy.'));
}
export async function renderCommunityPulse(host, client) {
  host.innerHTML = `
    <header class="pulse-heading"><h1>Community Pulse</h1><p>Find your next way to contribute to CharlestonHacks.</p></header>
    <nav class="pulse-actions" aria-label="Ways to participate">
      <a href="./index.html?campaign_resource=projects">Find a project <span aria-hidden="true">→</span></a>
      <a href="./index.html?campaign_resource=opportunities">Explore opportunities <span aria-hidden="true">→</span></a>
      <a href="./index.html?campaign_resource=people">Meet people <span aria-hidden="true">→</span></a>
    </nav>
    <section data-pulse-content hidden aria-labelledby="pulse-open-title"><h2 id="pulse-open-title">Open in the community</h2><div class="pulse-metrics"></div></section>
    <section data-pulse-content hidden aria-labelledby="pulse-skills-title"><h2 id="pulse-skills-title">Skills people bring</h2><ul class="pulse-skills"></ul></section>
    <details class="pulse-more" data-pulse-content hidden>
      <summary>More community stats</summary>
      <div class="pulse-secondary-metrics"></div>
      <section><h2>Community growth</h2><div class="pulse-growth"></div></section>
      <section><h2>About these counts</h2><p>Profile and connection figures are grouped in fives. Fewer than 5 includes zero. Only visible, enabled non-admin profiles are included; hidden profiles, visitor details, email addresses, claim status and admin activity stay private.</p><p>Projects are active, visible public projects. Opportunities are public, open and not past their deadline. Profile growth uses creation dates; connection growth uses creation dates for records currently accepted.</p></section>
    </details>
    <footer class="pulse-update"><p role="status">Loading community summary…</p><button type="button" class="pulse-refresh" id="pulse-refresh">Refresh</button></footer>`;
  const q = (s) => host.querySelector(s);
  let generation = 0;
  async function load() {
    const request = ++generation;
    q('#pulse-refresh').disabled = true;
    q('[role=status]').textContent = 'Loading community summary…';
    try {
      const {data, error} = await client.rpc('get_community_pulse');
      if (error) throw error;
      if (!data || typeof data !== 'object') throw Error('Summary unavailable');
      if (!host.isConnected || request !== generation) return;
      const metrics = q('.pulse-metrics'); metrics.replaceChildren();
      metric(metrics, 'Active projects', count(data.active_projects));
      metric(metrics, 'Open opportunities', count(data.open_opportunities));
      const secondary = q('.pulse-secondary-metrics'); secondary.replaceChildren();
      metric(secondary, 'Visible community profiles', band(data.member_band));
      metric(secondary, 'Accepted connections', band(data.connection_band));
      growth(q('.pulse-growth'), data);
      const skills = q('.pulse-skills'); skills.replaceChildren();
      for (const skill of (Array.isArray(data.popular_skills) ? data.popular_skills.slice(0, 8) : [])) {
        skills.append(node('li', `${skill.skill} · ${band(skill.members_band)} profiles`));
      }
      if (!skills.children.length) skills.append(node('li', 'No shared skill groups have reached the privacy threshold yet.'));
      host.querySelectorAll('[data-pulse-content]').forEach(n => {n.hidden = false;});
      const generated = new Date(data.generated_at);
      q('[role=status]').textContent = Number.isFinite(generated.getTime()) ? `Updated ${generated.toLocaleString()}.` : 'Summary updated.';
    } catch (error) {
      if (!host.isConnected || request !== generation) return;
      host.querySelectorAll('.pulse-metrics,.pulse-secondary-metrics,.pulse-growth,.pulse-skills').forEach(n => n.replaceChildren());
      host.querySelectorAll('[data-pulse-content]').forEach(n => {n.hidden = true;});
      q('[role=status]').textContent = error?.code === '42501'
        ? 'Sign in with an enabled community account to view this summary.'
        : error?.code === 'PGRST202' || error?.code === '42883'
          ? 'Community Pulse is awaiting its reporting setup. Please try again later.'
          : 'Community summary could not load. Try Refresh.';
    } finally {
      if (host.isConnected && request === generation) q('#pulse-refresh').disabled = false;
    }
  }
  q('#pulse-refresh').onclick = load;
  await load();
}
if (document.querySelector('#community-pulse')) {
  import('./supabaseClient.js?v=fc09b39b-1770146154f916933b2da').then(({supabase}) => renderCommunityPulse(document.querySelector('#community-pulse'), supabase)).catch(() => {
    document.querySelector('#community-pulse').textContent = 'Community summary could not load. Reload the page to retry.';
  });
}
