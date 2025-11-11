// /assets/js/synapse.js
import ForceGraph2D from "https://cdn.jsdelivr.net/npm/force-graph@1.43.4/dist/force-graph.mjs";
import { supabaseClient as supabase } from "./supabaseClient.js";

const SKILL_COLORS = ["#FFD700", "#00FFFF", "#FF69B4", "#ADFF2F", "#FFA500", "#9370DB", "#00D1B2", "#F472B6"];

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

    el.innerHTML = ""; // clear loading text

    const Graph = ForceGraph2D()(el)
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

    Graph.zoomToFit(400, 40);
  } catch (err) {
    console.error("[Synapse] Error loading data:", err);
    el.innerHTML = `<div class="error">Failed to load network</div>`;
  }
}

// Auto-init if Synapse tab already visible
if (document.readyState !== "loading") initSynapseView();
else document.addEventListener("DOMContentLoaded", initSynapseView);
