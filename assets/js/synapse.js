// assets/js/synapse.js
// ⚡️ Live Synapse Network Visualization (Supabase + D3 + Real-time)
import { supabaseClient as supabase } from "./supabaseClient.js";
const d3 = window.d3;

// ========== Globals ==========
let svg, simulation, link, node, tooltip;
let nodes = [], links = [];
let linkGroup, nodeGroup;
let channel;
let hoverNode = null;

// ========== Main Init ==========
export async function initSynapseView() {
  svg = d3.select("#synapse-svg");
  if (svg.empty()) return;
  svg.selectAll("*").remove();

  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;

  // ——— 1️⃣ Load data ———
  const { data: community, error: commError } = await supabase
    .from("community")
    .select("id, name, email, image_url, skills");
  if (commError) return console.error("❌ Error loading community:", commError);

  const { data: connData } = await supabase
    .from("connections")
    .select("from_user_id, to_user_id");

  nodes = community.map(u => ({
    id: u.id,
    name: u.name || "Anonymous",
    email: u.email,
    image_url: u.image_url,
    skills: Array.isArray(u.skills)
      ? u.skills.join(", ")
      : u.skills || "unspecified",
  }));

  links = (connData || []).map(c => ({
    source: c.from_user_id,
    target: c.to_user_id,
  }));

  // ——— 2️⃣ Setup simulation ———
  simulation = d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(100).strength(0.5))
    .force("charge", d3.forceManyBody().strength(-80))
    .force("center", d3.forceCenter(width / 2, height / 2));

  linkGroup = svg
    .append("g")
    .attr("stroke", "#00ffff")
    .attr("stroke-opacity", 0.25);

  nodeGroup = svg.append("g").attr("cursor", "pointer");

  drawGraph();
  setupRealtimeSubscription();
}

// ========== Draw / Update ==========
function drawGraph() {
  link = linkGroup.selectAll("line").data(links, d => d.source.id + "-" + d.target.id);
  link.exit().remove();
  link = link
    .enter()
    .append("line")
    .attr("stroke-width", 1)
    .merge(link);

  node = nodeGroup.selectAll("g").data(nodes, d => d.id);
  node.exit().remove();

  const nodeEnter = node.enter().append("g").call(drag(simulation));

  nodeEnter.each(function (d) {
    const g = d3.select(this);
    if (d.image_url) {
      g.append("image")
        .attr("xlink:href", d.image_url)
        .attr("width", 40)
        .attr("height", 40)
        .attr("x", -20)
        .attr("y", -20)
        .attr("clip-path", "circle(20px at 20px 20px)");
    } else {
      g.append("circle").attr("r", 20).attr("fill", "#00ffff");
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("font-size", 12)
        .text(d.name?.[0]?.toUpperCase() || "?");
    }
  });

  nodeEnter
    .on("mouseover", handleHover)
    .on("mouseout", clearHover)
    .on("click", openProfileModal);

  node = nodeEnter.merge(node);

  tooltip = d3.select("body").append("div").attr("class", "synapse-tooltip");

  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);
    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });
}

// ========== Drag Behavior ==========
function drag(sim) {
  function dragstarted(event, d) {
    if (!event.active) sim.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  function dragended(event, d) {
    if (!event.active) sim.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
  return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
}

// ========== Hover Highlight ==========
function handleHover(event, d) {
  hoverNode = d;
  link.attr("stroke-opacity", l => (l.source.id === d.id || l.target.id === d.id ? 0.8 : 0.05));
  node.selectAll("circle,image").attr("opacity", n => (n.id === d.id ? 1 : 0.4));

  tooltip
    .style("opacity", 1)
    .html(`<strong>${d.name}</strong><br>${d.skills}`)
    .style("left", event.pageX + 10 + "px")
    .style("top", event.pageY - 10 + "px");
}
function clearHover() {
  hoverNode = null;
  link.attr("stroke-opacity", 0.25);
  node.selectAll("circle,image").attr("opacity", 1);
  tooltip.style("opacity", 0);
}

// ========== Profile Modal ==========
async function openProfileModal(event, d) {
  document.querySelectorAll(".profile-modal").forEach(el => el.remove());
  const modal = document.createElement("div");
  modal.className = "profile-modal";
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close">&times;</button>
      <img src="${d.image_url || "images/default-avatar.png"}" alt="${d.name}" class="modal-avatar" />
      <h2>${d.name}</h2>
      <p><strong>Email:</strong> ${d.email}</p>
      <p><strong>Skills:</strong> ${d.skills}</p>
      <button id="connectBtn" class="connect-btn">Connect</button>
      <button id="disconnectBtn" class="disconnect-btn hidden">Disconnect</button>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());

  const connectBtn = modal.querySelector("#connectBtn");
  const disconnectBtn = modal.querySelector("#disconnectBtn");

  const session = (await supabase.auth.getSession()).data.session;
  const currentUserId = session?.user?.id;
  if (!currentUserId) {
    connectBtn.textContent = "Login to Connect";
    connectBtn.disabled = true;
    return;
  }

  const { data: existing } = await supabase
    .from("connections")
    .select("*")
    .eq("from_user_id", currentUserId)
    .eq("to_user_id", d.id)
    .maybeSingle();

  if (existing) {
    connectBtn.classList.add("hidden");
    disconnectBtn.classList.remove("hidden");
  }

  connectBtn.addEventListener("click", async () => {
    const { error } = await supabase
      .from("connections")
      .insert({ from_user_id: currentUserId, to_user_id: d.id });
    if (!error) {
      alert(`Connected with ${d.name}!`);
      connectBtn.classList.add("hidden");
      disconnectBtn.classList.remove("hidden");
    }
  });

  disconnectBtn.addEventListener("click", async () => {
    const { error } = await supabase
      .from("connections")
      .delete()
      .eq("from_user_id", currentUserId)
      .eq("to_user_id", d.id);
    if (!error) {
      alert(`Disconnected from ${d.name}.`);
      disconnectBtn.classList.add("hidden");
      connectBtn.classList.remove("hidden");
    }
  });
}

// ========== Realtime Updates ==========
function setupRealtimeSubscription() {
  if (channel) channel.unsubscribe();

  channel = supabase
    .channel("realtime-connections")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "connections" },
      payload => {
        console.log("🔄 Connection change:", payload);
        updateGraphFromRealtime(payload);
      }
    )
    .subscribe();
}

// Apply realtime graph updates
function updateGraphFromRealtime(payload) {
  if (payload.eventType === "INSERT") {
    const { from_user_id, to_user_id } = payload.new;
    if (!links.find(l => l.source.id === from_user_id && l.target.id === to_user_id)) {
      const source = nodes.find(n => n.id === from_user_id);
      const target = nodes.find(n => n.id === to_user_id);
      if (source && target) {
        links.push({ source, target });
        drawGraph();
        simulation.alpha(1).restart();
      }
    }
  }
  if (payload.eventType === "DELETE") {
    const { from_user_id, to_user_id } = payload.old;
    links = links.filter(l => !(l.source.id === from_user_id && l.target.id === to_user_id));
    drawGraph();
    simulation.alpha(1).restart();
  }
}

// ========== Tab Init Hook ==========
document.addEventListener("DOMContentLoaded", () => {
  const tab = document.querySelector('[data-tab="synapse"]');
  if (tab) tab.addEventListener("click", () => initSynapseView());
});
