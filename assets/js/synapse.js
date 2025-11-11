// assets/js/synapse.js
// Interactive Synapse Network Visualization (Supabase-powered)

import { supabaseClient as supabase } from "./supabaseClient.js";

const d3 = window.d3;
let selectedNode = null;
let userConnections = new Set();

// 🧩 Main Entry
export async function initSynapseView() {
  const svg = d3.select("#synapse-svg");
  if (svg.empty()) return;
  svg.selectAll("*").remove();

  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;

  // ===============================
  // 1️⃣ Load Data
  // ===============================
  const { data: community, error: commError } = await supabase
    .from("community")
    .select("id, name, email, image_url, skills");
  if (commError) return console.error("Community load error:", commError);

  const { data: connections } = await supabase
    .from("connections")
    .select("from_user_id, to_user_id");

  const nodes = community.map(u => ({
    id: u.id,
    name: u.name || "Anonymous",
    email: u.email,
    image_url: u.image_url,
    skills: Array.isArray(u.skills)
      ? u.skills.join(", ")
      : u.skills || "unspecified",
  }));

  const links = (connections || []).map(c => ({
    source: c.from_user_id,
    target: c.to_user_id,
  }));

  // ===============================
  // 2️⃣ Simulation Setup
  // ===============================
  const simulation = d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(80))
    .force("charge", d3.forceManyBody().strength(-70))
    .force("center", d3.forceCenter(width / 2, height / 2));

  const link = svg
    .append("g")
    .attr("stroke", "#0ff")
    .attr("stroke-opacity", 0.3)
    .selectAll("line")
    .data(links)
    .join("line");

  const nodeGroup = svg.append("g").attr("cursor", "pointer");

  const node = nodeGroup
    .selectAll("g")
    .data(nodes)
    .join("g")
    .call(drag(simulation));

  node.each(function (d) {
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

  // ===============================
  // 3️⃣ Tooltip & Modal
  // ===============================
  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "synapse-tooltip")
    .style("opacity", 0);

  node
    .on("mouseover", (event, d) => {
      tooltip
        .style("opacity", 1)
        .html(`<strong>${d.name}</strong><br>${d.skills}`);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 10 + "px");
    })
    .on("mouseout", () => tooltip.style("opacity", 0))
    .on("click", async (event, d) => {
      selectedNode = d;
      await openProfileModal(d);
    });

  // ===============================
  // 4️⃣ Simulation Loop
  // ===============================
  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });

  // ===============================
  // 5️⃣ Drag
  // ===============================
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
}

// =====================================================
// 🔹 Profile Modal with Connection Control
// =====================================================
async function openProfileModal(user) {
  // Remove any existing modal
  document.querySelectorAll(".profile-modal").forEach(el => el.remove());

  const modal = document.createElement("div");
  modal.className = "profile-modal";
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close">&times;</button>
      <img src="${user.image_url || "images/default-avatar.png"}" alt="${user.name}" class="modal-avatar" />
      <h2>${user.name}</h2>
      <p><strong>Email:</strong> ${user.email}</p>
      <p><strong>Skills:</strong> ${user.skills}</p>
      <button id="connectBtn" class="connect-btn">Connect</button>
      <button id="disconnectBtn" class="disconnect-btn hidden">Disconnect</button>
    </div>
  `;
  document.body.appendChild(modal);

  const closeBtn = modal.querySelector(".modal-close");
  closeBtn.addEventListener("click", () => modal.remove());

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
    .eq("to_user_id", user.id)
    .maybeSingle();

  if (existing) {
    connectBtn.classList.add("hidden");
    disconnectBtn.classList.remove("hidden");
  }

  connectBtn.addEventListener("click", async () => {
    const { error } = await supabase
      .from("connections")
      .insert({ from_user_id: currentUserId, to_user_id: user.id });
    if (!error) {
      alert(`Connected with ${user.name}!`);
      connectBtn.classList.add("hidden");
      disconnectBtn.classList.remove("hidden");
    }
  });

  disconnectBtn.addEventListener("click", async () => {
    const { error } = await supabase
      .from("connections")
      .delete()
      .eq("from_user_id", currentUserId)
      .eq("to_user_id", user.id);
    if (!error) {
      alert(`Disconnected from ${user.name}.`);
      disconnectBtn.classList.add("hidden");
      connectBtn.classList.remove("hidden");
    }
  });
}

// =====================================================
// 🧭 Tab Hook
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  const tab = document.querySelector('[data-tab="synapse"]');
  if (tab) {
    tab.addEventListener("click", () => initSynapseView());
  }
});
