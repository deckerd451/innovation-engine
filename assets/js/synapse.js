// =====================================================
// CharlestonHacks Synapse View 3.0 — Fullscreen Network
// =====================================================
// Features:
// ✅ Stable Supabase-backed community graph
// ✅ Auto-create users (no FK errors)
// ✅ Connect/disconnect between users
// ✅ Realtime updates & link pulses
// ✅ ESC key exit
// ✅ Performance HUD overlay
// =====================================================

import { supabase, ensureCommunityUser, showNotification } from "./supabaseClient.js";
const d3 = window.d3;

let svg, zoomGroup, simulation, link, node, tooltip, channel, hudInterval;
let nodes = [];
let links = [];
let width, height;
let theme = "dark";
let isSynapseActive = false;
let lastLatency = null;

// =============================
// MAIN ENTRY POINT
// =============================
export async function initSynapseView() {
  const container = document.getElementById("synapse-container");
  if (!container) return;

  d3.select("#synapse-svg").selectAll("*").remove();
  width = container.clientWidth;
  height = container.clientHeight;

  svg = d3.select("#synapse-svg")
    .attr("width", width)
    .attr("height", height)
    .style("cursor", "grab");

  zoomGroup = svg.append("g");
  tooltip = d3.select("body")
    .append("div")
    .attr("class", "synapse-tooltip")
    .style("opacity", 0);

  isSynapseActive = true;
  document.addEventListener("keydown", handleKeyPress);

  createHUD();
  await ensureCommunityUser();
  await loadGraphData();
  drawGraph();
  setupRealtime();
  startPulseAnimation();
  startHUDUpdates();
}

// =============================
// LOAD COMMUNITY & CONNECTIONS
// =============================
async function loadGraphData() {
  const t0 = performance.now();
  try {
    const [{ data: community, error: cErr }, { data: connections, error: connErr }] = await Promise.all([
      supabase.from("community").select("id, name, email, image_url, skills"),
      supabase.from("connections").select("from_user_id, to_user_id")
    ]);

    if (cErr) throw cErr;
    if (connErr) throw connErr;

    nodes = (community || []).map((u) => ({
      id: u.id,
      name: u.name || "Anonymous",
      email: u.email,
      image_url: u.image_url,
      skills: Array.isArray(u.skills) ? u.skills.join(", ") : (u.skills || "unspecified")
    }));

    links = (connections || []).map((c) => ({
      source: c.from_user_id,
      target: c.to_user_id
    }));
  } catch (err) {
    console.error("[Synapse] Load error:", err);
    showNotification("Error loading network data", "error");
  } finally {
    const t1 = performance.now();
    lastLatency = Math.round(t1 - t0);
  }
}

// =============================
// DRAW NETWORK
// =============================
function drawGraph() {
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance(110))
    .force("charge", d3.forceManyBody().strength(-180))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .velocityDecay(0.35);

  const linkGroup = zoomGroup.append("g")
    .attr("stroke", theme === "dark" ? "#0ff" : "#f90")
    .attr("stroke-opacity", 0.3);

  const nodeGroup = zoomGroup.append("g").attr("cursor", "pointer");

  link = linkGroup.selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke-width", 1.2)
    .attr("stroke-dasharray", "6 10");

  node = nodeGroup.selectAll("g")
    .data(nodes)
    .join("g")
    .call(drag(simulation));

  node.each(function (d) {
    const g = d3.select(this);
    if (d.image_url) {
      g.append("image")
        .attr("xlink:href", d.image_url)
        .attr("width", 48)
        .attr("height", 48)
        .attr("x", -24)
        .attr("y", -24)
        .attr("clip-path", "circle(24px at 24px 24px)");
    } else {
      g.append("circle")
        .attr("r", 24)
        .attr("fill", theme === "dark" ? "#00ffff" : "#ff9900");
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("font-size", 14)
        .text(d.name?.[0]?.toUpperCase() || "?");
    }
  });

  node
    .on("mouseover", (event, d) => {
      tooltip.transition().duration(150).style("opacity", 0.9);
      tooltip.html(`<strong>${d.name}</strong><br>${d.skills}`)
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 15 + "px");
      highlightLinks(d.id, true);
    })
    .on("mouseout", () => {
      tooltip.transition().duration(200).style("opacity", 0);
      highlightLinks(null, false);
    })
    .on("click", openProfileModal);

  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });

  const zoom = d3.zoom()
    .scaleExtent([0.3, 5])
    .on("zoom", (event) => zoomGroup.attr("transform", event.transform));

  svg.call(zoom).on("dblclick.zoom", null);
}

// =============================
// DRAGGING
// =============================
function drag(simulation) {
  return d3.drag()
    .on("start", (e, d) => {
      if (!e.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on("drag", (e, d) => {
      d.fx = e.x; d.fy = e.y;
    })
    .on("end", (e, d) => {
      if (!e.active) simulation.alphaTarget(0);
      d.fx = null; d.fy = null;
    });
}

// =============================
// LINK HIGHLIGHT
// =============================
function highlightLinks(nodeId, active) {
  link.transition().duration(150)
    .attr("stroke-opacity", (l) =>
      !active
        ? 0.3
        : l.source.id === nodeId || l.target.id === nodeId
        ? 0.9
        : 0.05
    )
    .attr("stroke", (l) =>
      !active
        ? theme === "dark" ? "#0ff" : "#f90"
        : l.source.id === nodeId || l.target.id === nodeId
        ? "#ff00ff"
        : theme === "dark" ? "#0ff" : "#f90"
    );
}

// =============================
// PROFILE MODAL + CONNECT
// =============================
async function openProfileModal(event, user) {
  document.querySelectorAll(".profile-modal").forEach((el) => el.remove());
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
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());

  const connectBtn = modal.querySelector("#connectBtn");
  const disconnectBtn = modal.querySelector("#disconnectBtn");

  const { data: session } = await supabase.auth.getSession();
  const currentUserId = session?.session?.user?.id;
  if (!currentUserId) {
    connectBtn.textContent = "Login to Connect";
    connectBtn.disabled = true;
    return;
  }

  await ensureCommunityUser();

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
    await ensureCommunityUser();
    const { error } = await supabase
      .from("connections")
      .insert({ from_user_id: currentUserId, to_user_id: user.id });
    if (error) return alert("Error connecting: " + error.message);
    showNotification(`Connected with ${user.name}!`);
    triggerPulse(user.id);
    connectBtn.classList.add("hidden");
    disconnectBtn.classList.remove("hidden");
  });

  disconnectBtn.addEventListener("click", async () => {
    const { error } = await supabase
      .from("connections")
      .delete()
      .eq("from_user_id", currentUserId)
      .eq("to_user_id", user.id);
    if (error) return alert("Error disconnecting: " + error.message);
    showNotification(`Disconnected from ${user.name}`);
    disconnectBtn.classList.add("hidden");
    connectBtn.classList.remove("hidden");
  });
}

// =============================
// REALTIME LISTENERS
// =============================
function setupRealtime() {
  if (channel) channel.unsubscribe();
  channel = supabase
    .channel("realtime-connections")
    .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, (payload) => {
      if (payload.eventType === "INSERT") {
        const s = nodes.find((n) => n.id === payload.new.from_user_id);
        const t = nodes.find((n) => n.id === payload.new.to_user_id);
        if (s && t) {
          links.push({ source: s, target: t });
          triggerPulse(t.id);
          simulation.alpha(0.5).restart();
        }
      }
      if (payload.eventType === "DELETE") {
        links = links.filter(
          (l) =>
            !(l.source.id === payload.old.from_user_id &&
              l.target.id === payload.old.to_user_id)
        );
        simulation.alpha(0.5).restart();
      }
    })
    .subscribe();
}

// =============================
// PULSE ANIMATION
// =============================
function startPulseAnimation() {
  function animate() {
    link.each(function () {
      const l = d3.select(this);
      const current = parseFloat(l.attr("stroke-dashoffset")) || 0;
      l.attr("stroke-dashoffset", (current - 0.6) % 20);
    });
    requestAnimationFrame(animate);
  }
  animate();
}

function triggerPulse(nodeId) {
  const pulseColor = theme === "dark" ? "#ff0099" : "#0066ff";
  link.filter((l) => l.source.id === nodeId || l.target.id === nodeId)
    .transition()
    .duration(800)
    .attr("stroke", pulseColor)
    .attr("stroke-opacity", 1)
    .transition()
    .duration(800)
    .attr("stroke", theme === "dark" ? "#0ff" : "#f90")
    .attr("stroke-opacity", 0.3);
}

// =============================
// HUD: Performance Overlay
// =============================
function createHUD() {
  const hud = document.createElement("div");
  hud.id = "synapse-hud";
  hud.style.cssText = `
    position: fixed;
    top: 10px;
    left: 14px;
    background: rgba(0, 10, 20, 0.7);
    color: #0ff;
    font-family: monospace;
    font-size: 13px;
    padding: 8px 12px;
    border-radius: 8px;
    z-index: 1000;
    backdrop-filter: blur(6px);
    box-shadow: 0 0 10px rgba(0,255,255,0.2);
  `;
  hud.innerHTML = `<div>🧠 Synapse HUD</div><div>Nodes: 0</div><div>Connections: 0</div><div>Latency: …</div>`;
  document.body.appendChild(hud);
}

function startHUDUpdates() {
  const hud = document.getElementById("synapse-hud");
  if (!hud) return;
  hudInterval = setInterval(() => {
    const latencyDisplay = lastLatency ? `${lastLatency} ms` : "–";
    hud.innerHTML = `
      <div>🧠 Synapse HUD</div>
      <div>Nodes: ${nodes.length}</div>
      <div>Connections: ${links.length}</div>
      <div>Latency: ${latencyDisplay}</div>
      <div style="font-size:11px;opacity:0.6;">Press Esc to exit</div>
    `;
  }, 1500);
}

// =============================
// EXIT HANDLER
// =============================
function handleKeyPress(e) {
  if (e.key === "Escape" && isSynapseActive) {
    exitSynapseView();
  }
}

function exitSynapseView() {
  document.querySelector("header").style.display = "";
  document.querySelector("footer").style.display = "";
  document.getElementById("neural-bg").style.display = "";
  document.querySelector("#synapse").classList.remove("active-tab-pane");
  document.querySelector("#profile-section").classList.remove("hidden");
  isSynapseActive = false;
  clearInterval(hudInterval);
  d3.selectAll(".profile-modal").remove();
  d3.select(".synapse-tooltip").remove();
  document.getElementById("synapse-hud")?.remove();
  if (channel) channel.unsubscribe();
  console.log("🧩 Synapse View closed");
}
