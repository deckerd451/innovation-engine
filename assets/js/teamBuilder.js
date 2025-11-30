// ======================================================================
// CharlestonHacks Innovation Engine – TEAM BUILDER (FINAL 2025)
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { DOMElements } from "./globals.js";

// Pull dom references from globals
const input = DOMElements.teamBuilderInput;
const teamSizeInput = DOMElements.teamSize;
const container = DOMElements.bestTeamContainer;

// Helper: convert "aws, python" → ["aws", "python"]
function normalizeSkills(str) {
  return str
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);
}

// Load full community only once
let teamCommunityCache = null;

async function loadCommunity() {
  if (teamCommunityCache) return teamCommunityCache;

  const { data, error } = await supabase
    .from("community")
    .select(`
      id,
      name,
      email,
      skills,
      availability,
      image_url,
      connection_count
    `);

  if (error) {
    console.error("❌ TeamBuilder load error:", error);
    return [];
  }

  teamCommunityCache = data.map(person => ({
    ...person,
    skillsArray: person.skills
      ? person.skills.split(",").map(s => s.trim().toLowerCase())
      : []
  }));

  return teamCommunityCache;
}

// Create card HTML
function createTeamCard(person, matchedSkills) {
  const img = person.image_url || "assets/default-avatar.png";

  return `
    <div class="team-card">
      <img src="${img}" class="team-avatar" />

      <div class="team-info">
        <div class="team-name">${person.name}</div>

        <div class="team-sub">
          <span class="availability ${person.availability?.replace(/\s+/g, "")}">
            ${person.availability || "Available"}
          </span>
          •
          <span class="connections">${person.connection_count || 0} connections</span>
        </div>

        <div class="team-skills">
          ${matchedSkills.map(s => `<span class="matched-skill">${s}</span>`).join("")}
        </div>
      </div>
    </div>
  `;
}

// Main builder logic
async function buildTeam() {
  const req = normalizeSkills(input.value);
  const size = parseInt(teamSizeInput.value || "3", 10);

  if (req.length === 0) {
    container.innerHTML = `<div class="notification">Enter required skills.</div>`;
    return;
  }

  const people = await loadCommunity();

  // Each person gets a score based on # of matched skills
  const scored = people.map(p => {
    const match = req.filter(skill => p.skillsArray.includes(skill));
    return {
      ...p,
      matchedSkills: match,
      score: match.length
    };
  });

  // Sort: score, then connection_count
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.connection_count || 0) - (a.connection_count || 0);
  });

  const best = scored.slice(0, size);

  // Render
  container.innerHTML = best
    .map(p => createTeamCard(p, p.matchedSkills))
    .join("");

  if (best.length === 0) {
    container.innerHTML = `<div class="notification">No matches found.</div>`;
  }
}

// Event listeners
export function initTeamBuilder() {
  console.log("🧩 TeamBuilder initialized");

  const btn = DOMElements.buildTeamBtn;
  if (!btn) {
    console.error("❌ buildTeamBtn missing in DOM");
    return;
  }

  btn.addEventListener("click", buildTeam);
}
