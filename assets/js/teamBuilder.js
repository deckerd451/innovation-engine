// ======================================================================
// CharlestonHacks Innovation Engine – TEAM BUILDER (FINAL 2025)
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { DOMElements } from "./globals.js";

// Cached community list
let communityCache = null;

// Load all community members (same normalization as searchEngine.js)
async function loadCommunity() {
  const { data, error } = await supabase
    .from("community")
    .select(`
      id,
      name,
      email,
      skills,
      interests,
      bio,
      availability,
      image_url,
      connection_count
    `);

  if (error) {
    console.error("❌ TeamBuilder: failed loading community:", error);
    return [];
  }

  return data.map(person => ({
    ...person,
    skillsArray: person.skills
      ? person.skills.split(",").map(s => s.trim().toLowerCase())
      : [],
    lowerName: person.name?.toLowerCase() || ""
  }));
}

// Core team building algorithm
function buildBestTeam(community, requiredSkills, teamSize) {
  if (!community.length) return [];

  // Simple scoring: each member gets points for each required skill they cover
  return community
    .map(person => {
      let score = 0;
      requiredSkills.forEach(skill => {
        if (person.skillsArray.includes(skill)) score++;
      });
      return { ...person, score };
    })
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, teamSize);
}

// Render card UI (same styling as searchEngine.js)
function createPersonCard(person) {
  const card = document.createElement("div");
  card.className = "result-card";

  const availability = (person.availability || "Available").replace(/\s+/g, "");

  const skillsArr = (person.skills || "")
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0);

  card.innerHTML = `
    <img 
      src="${person.image_url || "assets/default-avatar.png"}"
      class="profile-avatar"
      alt="${person.name || "Profile"}"
    />

    <div class="result-info">
      <div class="result-name">
        <span class="availability-dot status-${availability}"></span>
        ${person.name || "Unnamed"}
      </div>

      <div class="skills-chips">
        ${skillsArr.map(skill => `<span class="skill-chip">${skill}</span>`).join("")}
      </div>
    </div>
  `;

  return card;
}

// Render team
function renderTeam(team) {
  const container = DOMElements.bestTeamContainer;
  container.innerHTML = "";

  if (!team.length) {
    container.innerHTML = `<p class="notification">No matching teammates found.</p>`;
    return;
  }

  team.forEach(person => {
    container.appendChild(createPersonCard(person));
  });
}

// ======================================================================
// Initialize Team Builder
// ======================================================================
export function initTeamBuilder() {
  console.log("🤝 Initializing Team Builder…");

  const input = DOMElements.teamBuilderInput;
  const sizeInput = DOMElements.teamSize;
  const btn = DOMElements.buildTeamBtn;

  btn.addEventListener("click", async () => {
    const raw = input.value.trim().toLowerCase();
    const teamSize = Math.min(Math.max(parseInt(sizeInput.value) || 1, 1), 6);

    if (!raw) return;

    if (!communityCache) communityCache = await loadCommunity();
    if (!communityCache.length) return;

    const requiredSkills = raw.split(",").map(s => s.trim());

    const team = buildBestTeam(communityCache, requiredSkills, teamSize);
    renderTeam(team);
  });

  console.log("🤝 TeamBuilder initialized");
}
