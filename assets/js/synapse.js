// assets/js/synapse.js
// CharlestonHacks Synapse View
// Live D3 graph with Supabase integration, controls, and real-time sync

import { supabaseClient as supabase } from "./supabaseClient.js";
const d3 = window.d3;

// === Global Variables ===
let svg, zoom, simulation, link, node, tooltip;
let nodes = [], links = [];
let theme = "dark"; // default
let channel;
let zoomGroup;

// === Initialize Synapse View ===
export async function initSynapseView() {
  const container = document.getElementById("synapse-container");
  if (!container) return;

  // Clear previous SVG
  d3.select("#synapse-svg").selectAll("*").remove();

  const width = container.clientWidth;
  const height = container.clientHeight;

  svg = d3.select("#synapse-svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .style("cursor", "grab");

  zoomGroup = svg.append("g");

  tooltip = d3.select("body").append("div")
    .attr("class", "synapse-tooltip")
    .style("opacity", 0);

  // Load data
  const { data: community, error: communityError } = await supabase
    .from("community")
    .select("id, name, email, image_url, skills");
  if (communityError) return console.error("Community load error:", communityError);

  const { data: connections } = await supabase
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

  links = (connections || []).map(c => ({
    source: c.from_user_id,
    target: c.to_user_id,
  }));

  drawGraph(width, height);
  setupRealtime();
  setupControls();
  setupKeyboardShortcuts();
}

// === Draw Graph ===
function drawGraph(width, height) {
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(90))
    .force("charge", d3.forceManyBody().strength(-120))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .velocityDecay(0.4);

  const linkGroup = zoomGroup.append("g")
    .attr("stroke", theme === "dark" ? "#0ff" : "#f90")
    .attr("stroke-opacity", 0.25)
    .attr("stroke-width", 1.2);

  const nodeGroup = zoomGroup.append("g").attr("cursor", "pointer");

  link = linkGroup.selectAll("line")
    .data(links)
    .join("line");

  node = nodeGroup.selectAll("g")
    .data(nodes)
    .join("g")
    .call(drag(simulation));

  node.each(function (d) {
    const g = d3.select(this);
    if (d.image_url) {
      g.append("image")
        .attr("xlink:href", d.image_url)
        .attr("width", 44)
        .attr("height", 44)
        .attr("x", -22)
        .attr("y", -22)
        .attr("clip-path", "circle(22px at 22px 22px)");
    } else {
      g.append("circle").attr("r", 22).attr("fill", theme === "dark" ? "#00ffff" : "#ff9900");
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("font-size", 13)
        .text(d.name?.[0]?.toUpperCase() || "?");
    }
  });

  node.on("mouseover", (event, d) => {
    tooltip.transition().duration(150).style("opacity", 0.9);
    tooltip.html(`<strong>${d.name}</strong><br>${d.skills}`)
      .style("left", event.pageX + 10 + "px")
      .style("top", event.pageY - 15 + "px");
  }).on("mouseout", () => tooltip.transition().duration(200).style("opacity", 0))
    .on("click", openProfileModal);

  simulation.on("tick", () => {
    link.attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });

  // Smooth zoom
  zoom = d3.zoom()
    .scaleExtent([0.3, 4])
    .on("zoom", (event) => zoomGroup.attr("transform", event.transform));

  svg.call(zoom).on("dblclick.zoom", null);
}

// === Drag Behavior ===
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

// === Profile Modal + Connect ===
async function openProfileModal(event, user) {
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

  // Check if already connected
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

  // === Connect ===
  connectBtn.addEventListener("click", async () => {
    const { error } = await supabase
      .from("connections")
      .insert({ from_user_id: currentUserId, to_user_id: user.id });
    if (error) return alert("Error connecting: " + error.message);
    alert(`Connected with ${user.name}!`);
    connectBtn.classList.add("hidden");
    disconnectBtn.classList.remove("hidden");
  });

  // === Disconnect ===
  disconnectBtn.addEventListener("click", async () => {
    const { error } = await supabase
      .from("connections")
      .delete()
      .eq("from_user_id", currentUserId)
      .eq("to_user_id", user.id);
    if (error) return alert("Error disconnecting: " + error.message);
    alert(`Disconnected from ${user.name}.`);
    disconnectBtn.classList.add("hidden");
    connectBtn.classList.remove("hidden");
  });
}

// === Real-Time Updates ===
function setupRealtime() {
  if (channel) channel.unsubscribe();

  channel = supabase
    .channel("realtime-connections")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "connections" },
      (payload) => {
        console.log("🔄 Live update:", payload);
        if (payload.eventType === "INSERT") {
          const s = nodes.find(n => n.id === payload.new.from_user_id);
          const t = nodes.find(n => n.id === payload.new.to_user_id);
          if (s && t) {
            links.push({ source: s, target: t });
            restartSimulation();
          }
        }
        if (payload.eventType === "DELETE") {
          links = links.filter(l => !(l.source.id === payload.old.from_user_id && l.target.id === payload.old.to_user_id));
          restartSimulation();
        }
      }
    )
    .subscribe();
}

// === Restart Graph Simulation After Update ===
function restartSimulation() {
  d3.select("#synapse-svg").selectAll("*").remove();
  drawGraph(window.innerWidth, window.innerHeight);
  simulation.alpha(1).restart();
}

// === Controls ===
function setupControls() {
  const zoomFitBtn = document.getElementById("zoom-fit");
  const centerBtn = document.getElementById("center-graph");
  const themeBtn = document.getElementById("toggle-theme");

  if (zoomFitBtn) zoomFitBtn.onclick = () => zoomToFit();
  if (centerBtn) centerBtn.onclick = () => centerGraph();
  if (themeBtn) themeBtn.onclick = () => toggleTheme();
}

function zoomToFit() {
  const bounds = zoomGroup.node().getBBox();
  const fullWidth = +svg.attr("width");
  const fullHeight = +svg.attr("height");
  const scale = 0.85 / Math.max(bounds.width / fullWidth, bounds.height / fullHeight);
  const translate = [
    fullWidth / 2 - scale * (bounds.x + bounds.width / 2),
    fullHeight / 2 - scale * (bounds.y + bounds.height / 2)
  ];
  svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(...translate).scale(scale));
}

function centerGraph() {
  svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
}

function toggleTheme() {
  theme = theme === "dark" ? "light" : "dark";
  document.body.style.background = theme === "dark" ? "#000" : "#fafafa";
  d3.select("#synapse-svg").style("background", theme === "dark" ? "none" : "#fff");
  d3.selectAll("circle").attr("fill", theme === "dark" ? "#00ffff" : "#ff9900");
  d3.selectAll("line").attr("stroke", theme === "dark" ? "#0ff" : "#f90");
  console.log("🎨 Theme toggled:", theme);
}

// === Keyboard Shortcuts ===
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "z" || e.key === "Z") zoomToFit();
    if (e.key === "c" || e.key === "C") centerGraph();
    if (e.key === "t" || e.key === "T") toggleTheme();
  });
}
