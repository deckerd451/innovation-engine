const node = (tag, text) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  return n;
};
const band = (value) =>
  value === null
    ? "Fewer than 5"
    : Number.isSafeInteger(value) && value >= 5
      ? `${value}+`
      : "Unavailable";
export async function renderCommunityPulse(host, client) {
  host.innerHTML =
    '<h1>Community Pulse</h1><p>Find a way to participate in the CharlestonHacks community.</p><p role="status">Loading community summary…</p><div class="pulse-metrics"></div><section><h2>Community milestones · last 30 days</h2><div class="pulse-milestones"></div></section><section><h2>Community growth</h2><p>New visible profiles by UTC month. Small counts are grouped for privacy.</p><ul class="pulse-months"></ul></section><section><h2>Skills in the community</h2><ul class="pulse-skills"></ul></section><nav aria-label="Ways to participate"><a href="./index.html?campaign_resource=projects">Find a project</a><a href="./index.html?campaign_resource=opportunities">Explore opportunities</a><a href="./index.html">Meet the community</a></nav><details><summary>About this summary</summary><p>Only aggregate information about visible, enabled non-admin profiles is included. Profile and connection figures are grouped in fives; fewer than five includes zero. Hidden profiles, visitor logs, email addresses, account claim status and admin activity are not shared. Opportunities are public, open and not past their deadline. Project totals count active, visible public projects.</p></details><button type="button" id="pulse-refresh">Refresh summary</button>';
  const q = (s) => host.querySelector(s);
  let generation = 0;
  async function load() {
    const request = ++generation;
    q("#pulse-refresh").disabled = true;
    q("[role=status]").textContent = "Loading community summary…";
    try {
      const { data, error } = await client.rpc("get_community_pulse");
      if (error) throw error;
      if (!host.isConnected || request !== generation) return;
      const metrics = q(".pulse-metrics");
      metrics.replaceChildren();
      for (const [label, value] of [
        ["Visible community profiles", band(data.member_band)],
        ["Accepted connections", band(data.connection_band)],
        [
          "Active projects",
          Number.isSafeInteger(data.active_projects)
            ? data.active_projects
            : "Unavailable",
        ],
        [
          "Open opportunities",
          Number.isSafeInteger(data.open_opportunities)
            ? data.open_opportunities
            : "Unavailable",
        ],
      ]) {
        const card = node("article");
        card.append(node("strong", value), node("span", label));
        metrics.append(card);
      }
      q(".pulse-milestones").replaceChildren(
        node(
          "p",
          `${band(data.new_profiles_band)} new visible profiles and ${band(data.new_connections_band)} new accepted connections.`,
        ),
      );
      const months = q(".pulse-months");
      months.replaceChildren();
      for (const month of data.monthly || [])
        months.append(
          node(
            "li",
            `${month.month}: ${band(month.profiles_band)} new visible profiles`,
          ),
        );
      const skills = q(".pulse-skills");
      skills.replaceChildren();
      for (const skill of data.popular_skills || [])
        skills.append(
          node("li", `${skill.skill} · ${band(skill.members_band)} profiles`),
        );
      if (!skills.children.length)
        skills.append(
          node("li", "No skill groups have reached the sharing threshold yet."),
        );
      q("[role=status]").textContent =
        `Updated ${new Date(data.generated_at).toLocaleString()}.`;
    } catch (error) {
      if (!host.isConnected || request !== generation) return;
      host
        .querySelectorAll(
          ".pulse-metrics,.pulse-milestones,.pulse-months,.pulse-skills",
        )
        .forEach((n) => n.replaceChildren());
      q("[role=status]").textContent =
        error.code === "42501"
          ? "Sign in with an enabled community account to view this summary."
          : error.code === "PGRST202" || error.code === "42883"
            ? "Community Pulse is awaiting its reporting setup. Please try again later."
            : "Community summary could not load. Try Refresh.";
    } finally {
      if (host.isConnected && request === generation)
        q("#pulse-refresh").disabled = false;
    }
  }
  q("#pulse-refresh").onclick = load;
  await load();
}
if (document.querySelector("#community-pulse"))
  import("./supabaseClient.js?v=fc09b39b-1770146154f916933b2da").then(
    ({ supabase }) =>
      renderCommunityPulse(
        document.querySelector("#community-pulse"),
        supabase,
      ),
  );
