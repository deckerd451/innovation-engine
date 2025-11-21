// ======================================================================
// CharlestonHacks – Search Engine 3.0 (Final Production Build)
// Supports:
//   ✔ Skill-based search
//   ✔ Name search
//   ✔ Team Builder
//   ✔ Clean card rendering
//   ✔ user_id-based RLS
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { DOMElements } from "./globals.js";
import { showNotification } from "./utils.js";

/* ============================================================
   CLEAN CARD RENDERER
============================================================ */
function createUserCard(user) {
  const div = document.createElement("div");
  div.className = "user-card";

  const img = user.image_url
    ? `<img class="user-photo" src="${user.image_url}" alt="${user.name}">`
    : `<div class="user-photo placeholder"></div>`;

  div.innerHTML = `
    ${img}
    <h3>${user.name || "Unnamed"}</h3>
    <p><strong>Skills:</strong> ${user.skills || "None listed"}</p>
    <p><strong>Email:</strong> ${user.email}</p>
  `;

  return div;
}

/* ============================================================
   QUERY HELPERS
============================================================ */
async function fetchCommunity() {
  const { data, error } = await supabase
    .from("community")
    .select("id, name, email, skills, image_url, availability");

  if (error) {
    console.error("[SearchEngine] Fetch error:", error);
    return [];
  }

  return data || [];
}

function normalizeSkills(str) {
  if (!str) return [];
  return str
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

/* ============================================================
   SKILL SEARCH
============================================================ */
export async function findMatchingUsers() {
  const skillText = DOMElements.teamSkillsInput.value.trim().toLowerCase();
  const skillList = normalizeSkills(skillText);

  if (skillList.length === 0) {
    showNotification("Enter at least one skill.", "error");
    return;
  }

  const allUsers = await fetchCommunity();

  const matches = allUsers.filter(user => {
    const userSkills = normalizeSkills(user.skills);
    return skillList.every(s => userSkills.includes(s));
  });

  DOMElements.cardContainer.innerHTML = "";

  if (matches.length === 0) {
    DOMElements.noResults.classList.remove("hidden");
    DOMElements.matchNotification.classList.add("hidden");
    return;
  }

  DOMElements.noResults.classList.add("hidden");
  DOMElements.matchNotification.classList.remove("hidden");
  DOMElements.matchNotification.textContent = `Found ${matches.length} matches!`;

  matches.forEach(u => {
    const card = createUserCard(u);
    DOMElements.cardContainer.appendChild(card);
  });
}

/* ============================================================
   NAME SEARCH
============================================================ */
export async function findByName() {
  const nameText = DOMElements.nameInput.value.trim().toLowerCase();

  if (!nameText) {
    showNotification("Enter a name to search.", "error");
    return;
  }

  const allUsers = await fetchCommunity();

  const matches = allUsers.filter(u =>
    (u.name || "").toLowerCase().includes(nameText)
  );

  DOMElements.cardContainer.innerHTML = "";

  if (matches.length === 0) {
    DOMElements.noResults.classList.remove("hidden");
    return;
  }

  DOMElements.noResults.classList.add("hidden");

  matches.forEach(u => {
    const card = createUserCard(u);
    DOMElements.cardContainer.appendChild(card);
  });
}

/* ============================================================
   TEAM BUILDER — SIMPLE MATCHING
============================================================ */
export async function buildBestTeam() {
  const skillText = DOMElements.teamBuilderSkillsInput.value.trim().toLowerCase();
  const skillList = normalizeSkills(skillText);

  const teamSize = parseInt(DOMElements.teamSizeInput.value || "0", 10);

  if (skillList.length === 0) {
    showNotification("Enter required skills.", "error");
    return;
  }

  if (teamSize < 1 || teamSize > 6) {
    showNotification("Team size must be between 1 and 6.", "error");
    return;
  }

  const allUsers = await fetchCommunity();

  // Score each user based on required skills they match
  const scored = allUsers.map(user => {
    const userSkills = normalizeSkills(user.skills);
    const score = skillList.filter(s => userSkills.includes(s)).length;
    return { ...user, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const bestTeam = scored.slice(0, teamSize);

  const container = DOMElements.bestTeamContainer;
  container.innerHTML = "";

  bestTeam.forEach(u => {
    const card = createUserCard(u);
    container.appendChild(card);
  });
}

/* ============================================================
   AUTOCOMPLETE HELPERS (Optional Future)
============================================================ */
// Could add advanced autocomplete here later.

console.log("🔎 SearchEngine 3.0 ready.");
