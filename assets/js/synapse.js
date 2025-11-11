// =============================================
// CharlestonHacks Synapse View (v2.2 Optimized)
// =============================================

import { supabase, ensureCommunityUser, showNotification } from "./supabaseClient.js";
const d3 = window.d3;

let svg, zoomGroup, simulation, link, node, tooltip, channel;
let nodes = [];
let links = [];
let width, height;
let theme = "dark";
let isSynapseActive = false;

// =======================
// MAIN INIT FUNCTION
// =======================
export async function initSynapseView() {
  const container = document.getElementById("synapse-container");
  if (!container) return;

  // Cleanup
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

  // Load data
  await ensureCommunityUser();
  await loadGraphData();
  drawGraph();
  setupRealtime();
  startPulseAnimation();
}

// =======================
// LOAD COMMUNITY DATA
// =======================
async function loadGraphData() {
  try {
    const [{ data: community, error: userError }, { data: connections, error: connError }] = await Promise.all([
      supabase.from("community").select("id, name, email, image_url, skills"),
      supabase.from("connections").select("from_user_id, to_user_id")
    ]);

    if (userError) throw userError;
    if (connError) throw connError;

    nodes = (community || []).map((u) => ({
      id: u.id,
      name: u.name || "Anonymous",
      email: u.email,
      image_url: u.image_url,
      skills: Array.isArray(u.skills)
        ? u.skills.join(", ")
        : u.skills || "unspecified"
    }));

    links = (connections || []).map((c) => ({
      source: c.from_user_id,
      target: c.to_user_id
    }));
  } catch (err) {
    console.error("[Synapse] Load error:", err);
    showNotification("Error loading network data", "error");
  }
}

// =======================
// DRAW FORCE GRAPH
// =======================
function drawGraph() {
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance(100))
    .force("charge", d3.forceManyBody().strength(-150))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .velocityDecay(0.4);

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
        .attr("width", 46)
        .attr("height", 46)
        .attr("x", -23)
        .attr("y", -23)
        .attr("clip-path", "circle(23px at 23px 23px)");
    } else {
      g.append("circle")
        .attr("r", 23)
        .attr("fill", theme === "dark" ? "#00ffff" : "#ff9900");
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("font-size", 13)
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
    .scaleExtent([0.3, 4])
    .on("zoom", (event) => zoomGroup.attr("transform", event.transform));

  svg.call(zoom).on("dblclick.zoom", null);
}

// =======================
// DRAG FUNCTION
// =======================
function drag(simulation) {
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
  return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
}

// =======================
// TOOLTIP LINK HIGHLIGHT
// =======================
function highlightLinks(nodeId, active) {
  link.transition().duration(150)
    .attr("stroke-opacity", (l) =>
      !active
        ? 0.3
        : l.source.id === nodeId || l.target.id === nodeId
        ? 0.8
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

// =======================
// PROFILE MODAL (CONNECT)
// =======================
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

  // ✅ Ensure community profile exists before connecting
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
    if (error) {
      console.error(error);
      alert("Error connecting: " + error.message);
      return;
    }
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
    if (error) {
      console.error(error);
      alert("Error disconnecting: " + error.message);
      return;
    }
    showNotification(`Disconnected from ${user.name}`);
    disconnectBtn.classList.add("hidden");
    connectBtn.classList.remove("hidden");
  });
}

// =======================
// REALTIME CONNECTIONS
// =======================
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

// =======================
// PULSE ANIMATION
// =======================
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

// =======================
// KEYBOARD SHORTCUTS
// =======================
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
  d3.selectAll(".profile-modal").remove();
  d3.select(".synapse-tooltip").remove();
  if (channel) channel.unsubscribe();
  console.log("🧩 Synapse View closed");
}
