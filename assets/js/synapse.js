// /assets/js/synapse.js
import ForceGraph2D from "https://cdn.jsdelivr.net/npm/force-graph@1.43.4/dist/force-graph.mjs";
import { supabaseClient as supabase } from "./supabaseClient.js";

const LS_KEY_CAMERA = "synapse_camera_v1";
const SKILL_COLORS = ["#FFD700","#00FFFF","#FF69B4","#ADFF2F","#FFA500","#9370DB","#00D1B2","#F472B6"];

function colorForGroup(group) {
  const idx = Math.abs([...group].reduce((a, c) => a + c.charCodeAt(0), 0)) % SKILL_COLORS.length;
  return SKILL_COLORS[idx];
}
function parseSkills(sk) {
  if (!sk) return [];
  if (Array.isArray(sk)) return sk.map(s => `${s}`.trim()).filter(Boolean);
  const raw = `${sk}`.trim();
  try {
    const maybe = JSON.parse(raw);
    if (Array.isArray(maybe)) return maybe.map(s => `${s}`.trim()).filter(Boolean);
  } catch {}
  return raw.replace(/^\{|\}$/g, "")
    .split(",")
    .map(s => s.replace(/^"(.*)"$/, "$1").trim())
    .filter(Boolean);
}

export async function initSynapseView() {
  const el = document.getElementById("synapseCanvas");
  if (!el) return;
  el.innerHTML = `<div class="loading">Loading network…</div>`;

  try {
    const [{ data: profiles, error: pErr }, { data: conns, error: cErr }] = await Promise.all([
      supabase.from("community").select("id,name,image_url,skills"),
      supabase.from("connections").select("id,from_user_id,to_user_id")
    ]);
    if (pErr) throw pErr;
    if (cErr) throw cErr;

    const nodes = (profiles || []).map((p, idx, all) => {
      const skills = parseSkills(p.skills);
      const group = skills[0] || "General";
      const color = colorForGroup(group);
      const angle = (idx / Math.max(1, all.length)) * Math.PI * 2;
      const radius = 400;
      return {
        id: p.id,
        name: p.name || "Unnamed",
        group,
        color,
        fx: Math.cos(angle) * radius,
        fy: Math.sin(angle) * radius
      };
    });
    const links = (conns || []).map(c => ({
      source: c.from_user_id,
      target: c.to_user_id
    }));

    el.innerHTML = ""; // clear loading

    // Create container for graph + HUD
    const wrapper = document.createElement("div");
    wrapper.className = "synapse-wrapper";
    el.appendChild(wrapper);

    const hud = document.createElement("div");
    hud.className = "synapse-hud";
    hud.innerHTML = `
      <button id="zoomOut">−</button>
      <button id="zoomIn">+</button>
      <button id="reset">⟳</button>
      <button id="snapshot">📸</button>
      <label><input type="checkbox" id="energy" checked> ⚡</label>
      <label><input type="checkbox" id="freeze"> ❄️</label>
      <label><input type="checkbox" id="cluster" checked> 🧩</label>
      <span id="readout"></span>
    `;
    el.appendChild(hud);

    const Graph = ForceGraph2D()(wrapper)
      .graphData({ nodes, links })
      .nodeLabel(n => `${n.name}\n${n.group}`)
      .nodeCanvasObject((n, ctx, scale) => {
        const r = 4;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(0,207,255,0.25)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = n.color;
        ctx.fill();
        ctx.font = `${Math.max(8, 12 / scale)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(229,231,235,0.9)";
        ctx.fillText(n.name, n.x, n.y + r + 2);
      })
      .linkColor(() => "rgba(0,207,255,0.35)")
      .linkDirectionalParticles(1)
      .linkDirectionalParticleSpeed(() => 0.006 + Math.random() * 0.01);

    // Restore camera if saved
    const saved = localStorage.getItem(LS_KEY_CAMERA);
    if (saved) {
      try {
        const { k, x, y } = JSON.parse(saved);
        setTimeout(() => {
          Graph.zoom(k, 0);
          Graph.centerAt((-x + wrapper.clientWidth / 2) / k, (-y + wrapper.clientHeight / 2) / k, 0);
        }, 100);
      } catch {}
    }

    // HUD actions
    const zoomIn = document.getElementById("zoomIn");
    const zoomOut = document.getElementById("zoomOut");
    const reset = document.getElementById("reset");
    const snapshot = document.getElementById("snapshot");
    const energy = document.getElementById("energy");
    const freeze = document.getElementById("freeze");
    const cluster = document.getElementById("cluster");
    const readout = document.getElementById("readout");

    let zoomK = 1;
    Graph.onZoom(({ k, x, y }) => {
      zoomK = k;
      readout.textContent = `Zoom: ${k.toFixed(2)} | ${freeze.checked ? "Physics: OFF" : "Physics: ON"} | ${cluster.checked ? "Clustered" : "Free"}`;
      localStorage.setItem(LS_KEY_CAMERA, JSON.stringify({ k, x, y }));
    });

    zoomIn.onclick = () => Graph.zoom(Math.min(8, zoomK * 1.25), 200);
    zoomOut.onclick = () => Graph.zoom(Math.max(0.15, zoomK * 0.8), 200);
    reset.onclick = () => {
      Graph.zoomToFit(400, 40);
      localStorage.removeItem(LS_KEY_CAMERA);
    };
    snapshot.onclick = () => {
      const canvas = wrapper.querySelector("canvas");
      if (!canvas) return;
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "synapse-snapshot.png";
      a.click();
    };

    // Energy toggle (particles)
    energy.onchange = () => {
      const active = energy.checked;
      Graph.linkDirectionalParticles(active ? 1 : 0);
      Graph.linkDirectionalParticleSpeed(() => (active ? 0.006 + Math.random() * 0.01 : 0));
    };

    // Freeze toggle (physics)
    freeze.onchange = () => {
      const f = Graph.d3Force("charge");
      const linkF = Graph.d3Force("link");
      if (freeze.checked) {
        f && f.strength(0);
        linkF && linkF.distance(0).strength(0);
      } else {
        f && f.strength(-60);
        linkF && linkF.distance(50).strength(0.1);
      }
      Graph.d3ReheatSimulation && Graph.d3ReheatSimulation();
    };

    // Cluster toggle
    cluster.onchange = () => {
      const clustered = cluster.checked;
      nodes.forEach((n, i) => {
        if (clustered) {
          const angle = (i / nodes.length) * Math.PI * 2;
          const radius = 400;
          n.fx = Math.cos(angle) * radius;
          n.fy = Math.sin(angle) * radius;
        } else {
          n.fx = n.fy = undefined;
        }
      });
      Graph.graphData({ nodes, links });
    };

    Graph.zoomToFit(400, 40);
  } catch (err) {
    console.error("[Synapse] Error loading data:", err);
    el.innerHTML = `<div class="error">Failed to load network</div>`;
  }
}

if (document.readyState !== "loading") initSynapseView();
else document.addEventListener("DOMContentLoaded", initSynapseView);
