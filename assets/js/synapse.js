// =====================================================
// Synapse View 3.0 — LIGHT VERSION (INLINE CSS)
// CharlestonHacks (2025)
// Fully functional, self-contained, no external CSS needed
// =====================================================

import { supabase } from "./supabaseClient.js";
const d3 = window.d3;

// ================================================
// INLINE CSS — injected automatically
// ================================================
(function injectSynapseCSS() {
  const css = `
    .synapse-tooltip {
      position: absolute;
      background: rgba(0,0,0,0.85);
      padding: 6px 10px;
      border-radius: 4px;
      color: #0ff;
      font-size: 13px;
      pointer-events: none;
      font-family: monospace;
      z-index: 9999;
    }

    .profile-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.92);
      padding: 20px;
      border-radius: 12px;
      z-index: 99999;
      color: white;
      width: 280px;
      text-align: center;
      box-shadow: 0 0 30px rgba(0,255,255,0.3);
      backdrop-filter: blur(6px);
    }

    .modal-content h2 {
      margin-top: 10px;
      margin-bottom: 8px;
      color: #0ff;
      font-size: 20px;
    }

    .modal-avatar {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      border: 2px solid #0ff;
      margin-bottom: 10px;
      object-fit: cover;
    }

    .modal-close {
      position: absolute;
      top: 6px;
      right: 10px;
      background: transparent;
      border: none;
      font-size: 28px;
      color: #0ff;
      cursor: pointer;
    }

    .connect-btn, .disconnect-btn {
      margin-top: 12px;
      padding: 8px 14px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      width: 100%;
    }

    .connect-btn {
      background: #00ccff;
      color: black;
    }

    .disconnect-btn {
      background: #ff0066;
      color: white;
    }

    .disconnect-btn.hidden,
    .connect-btn.hidden {
      display: none;
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

// ================================================
// MAIN VARIABLES
// ================================================
let svg, zoomGroup, simulation, link, node, tooltip, channel;
let nodes = [];
let links = [];
let width, height;
let isSynapseActive = false;

// ================================================
// MAIN ENTRY
// ================================================
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
  document.addEventListener("keydown", handleEscape);

  await loadGraphData();
  drawGraph();
  setupRealtime();
}

// ================================================
// LOAD USERS + CONNECTIONS
// ================================================
async function loadGraphData() {
  try {
    const [{ data: community }, { data: connections }] = await Promise.all([
      supabase.from("community").select("id, name, email, image_url, skills"),
      supabase.from("connections").select("from_user_id, to_user_id"),
    ]);

    nodes = community.map(u => ({
      id: u.id,
      name: u.name || "Anonymous",
      email: u.email,
      image_url: u.image_url,
      skills: Array.isArray(u.skills) ? u.skills.join(", ") : u.skills || ""
    }));

    links = connections.map(c => ({
      source: c.from_user_id,
      target: c.to_user_id
    }));

  } catch (err) {
    console.error("[Synapse] Load error:", err);
  }
}

// ================================================
// DRAW NETWORK
// ================================================
function drawGraph() {
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(110))
    .force("charge", d3.forceManyBody().strength(-160))
    .force("center", d3.forceCenter(width / 2, height / 2));

  const linkGroup = zoomGroup.append("g")
    .attr("stroke", "#0ff")
    .attr("stroke-opacity", 0.25);

  const nodeGroup = zoomGroup.append("g")
    .attr("cursor", "pointer");

  link = linkGroup.selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke-width", 1.1);

  node = nodeGroup.selectAll("g")
    .data(nodes)
    .join("g")
    .call(drag(simulation));

  // Draw avatars or initials
  node.each(function (d) {
    const g = d3.select(this);

    if (d.image_url) {
      g.append("image")
        .attr("href", d.image_url)
        .attr("width", 40)
        .attr("height", 40)
        .attr("x", -20)
        .attr("y", -20)
        .attr("clip-path", "circle(20px at 20px 20px)");
    } else {
      g.append("circle")
        .attr("r", 20)
        .attr("fill", "#0099cc");

      g.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("font-size", 14)
        .attr("fill", "white")
        .text(d.name?.[0]?.toUpperCase() || "?");
    }
  });

  // Tooltip
  node.on("mouseover", (ev, d) => {
    tooltip
      .style("opacity", 1)
      .html(`<strong>${d.name}</strong><br>${d.skills}`)
      .style("left", ev.pageX + 10 + "px")
      .style("top", ev.pageY - 10 + "px");

    highlightNode(d.id, true);
  });

  node.on("mouseout", () => {
    tooltip.style("opacity", 0);
    highlightNode(null, false);
  });

  // Modal
  node.on("click", openProfileModal);

  simulation.on("tick", () => {
    link.attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });

  svg.call(
    d3.zoom().scaleExtent([0.4, 4])
      .on("zoom", ev => zoomGroup.attr("transform", ev.transform))
  );
}

// ================================================
// DRAGGING
// ================================================
function drag(sim) {
  return d3.drag()
    .on("start", (e, d) => {
      if (!e.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on("end", (e, d) => {
      if (!e.active) sim.alphaTarget(0);
      d.fx = null; d.fy = null;
    });
}

// ================================================
// HIGHLIGHT LINKS
// ================================================
function highlightNode(nodeId, active) {
  link.attr("stroke-opacity", l =>
    !active
      ? 0.25
      : (l.source.id === nodeId || l.target.id === nodeId ? 0.9 : 0.06)
  );
}

// ================================================
// PROFILE MODAL + CONNECT/DISCONNECT
// ================================================
async function openProfileModal(ev, user) {
  document.querySelectorAll(".profile-modal").forEach(e => e.remove());

  const modal = document.createElement("div");
  modal.className = "profile-modal";
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close">&times;</button>
      <img src="${user.image_url || "images/default-avatar.png"}" class="modal-avatar" />
      <h2>${user.name}</h2>
      <p><strong>Email:</strong> ${user.email}</p>
      <p><strong>Skills:</strong> ${user.skills}</p>
      <button id="connectBtn" class="connect-btn">Connect</button>
      <button id="disconnectBtn" class="disconnect-btn hidden">Disconnect</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector(".modal-close").onclick = () => modal.remove();

  const connectBtn = modal.querySelector("#connectBtn");
  const disconnectBtn = modal.querySelector("#disconnectBtn");

  const { data: session } = await supabase.auth.getSession();
  const currentUser = session?.session?.user;

  if (!currentUser) {
    connectBtn.textContent = "Login Required";
    connectBtn.disabled = true;
    return;
  }

  // check if connected
  const { data: existing } = await supabase
    .from("connections")
    .select("*")
    .eq("from_user_id", currentUser.id)
    .eq("to_user_id", user.id)
    .maybeSingle();

  if (existing) {
    connectBtn.classList.add("hidden");
    disconnectBtn.classList.remove("hidden");
  }

  // CONNECT
  connectBtn.onclick = async () => {
    await supabase
      .from("connections")
      .insert({ from_user_id: currentUser.id, to_user_id: user.id });

    connectBtn.classList.add("hidden");
    disconnectBtn.classList.remove("hidden");
  };

  // DISCONNECT
  disconnectBtn.onclick = async () => {
    await supabase
      .from("connections")
      .delete()
      .eq("from_user_id", currentUser.id)
      .eq("to_user_id", user.id);

    disconnectBtn.classList.add("hidden");
    connectBtn.classList.remove("hidden");
  };
}

// ================================================
// REALTIME CONNECTIONS
// ================================================
function setupRealtime() {
  if (channel) channel.unsubscribe();

  channel = supabase
    .channel("realtime-connections")
    .on("postgres_changes", { event: "*", table: "connections" }, (p) => {
      if (p.eventType === "INSERT") {
        links.push({
          source: p.new.from_user_id,
          target: p.new.to_user_id
        });
        simulation.alpha(0.4).restart();
      }

      if (p.eventType === "DELETE") {
        links = links.filter(
          l => !(l.source.id === p.old.from_user_id && l.target.id === p.old.to_user_id)
        );
        simulation.alpha(0.4).restart();
      }
    })
    .subscribe();
}

// ================================================
// EXIT ON ESC
// ================================================
function handleEscape(e) {
  if (e.key === "Escape") exitSynapseView();
}

function exitSynapseView() {
  document.querySelector("header").style.display = "";
  document.querySelector("footer").style.display = "";
  document.getElementById("neural-bg").style.display = "";
  document.getElementById("synapse-container").classList.remove("active");

  tooltip?.remove();
  document.querySelectorAll(".profile-modal").forEach(e => e.remove());

  if (channel) channel.unsubscribe();
  isSynapseActive = false;
}
