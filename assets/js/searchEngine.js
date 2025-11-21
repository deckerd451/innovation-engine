// ======================================================================
// CharlestonHacks – SearchEngine 3.0 (FINAL PRODUCTION VERSION)
// Fully compatible with:
//   ✔ user_id–based profiles
//   ✔ new login + backfill system
//   ✔ 2card.html DOM structure
//   ✔ RLS policies on community + connections
//   ✔ Leaderboard + Team Builder + Skill Search
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { DOMElements } from "./globals.js";
import { showNotification } from "./utils.js";

// =============================================================
// UTILS
// =============================================================
function normalizeSkillString(str) {
  if (!str) return [];
  return str
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function includesAnySkills(userSkills, requiredSkills) {
  return requiredSkills.every(req => userSkills.includes(req));
}

function safeName(str) {
  return (str || "").trim().toLowerCase();
}

// =============================================================
// 1) LOAD ALL USERS FROM COMMUNITY
// =============================================================
async function loadAllCommunity() {
  const { data, error } = await supabase
    .from("community")
    .select("id, name, email, skills, image_url, availability, user_id");

  if (error) {
    console.error("[SearchEngine] load error:", error);
    showNotification("Error loading profiles.", "error");
    return [];
  }

  return data.map(u => ({
    ...u,
    parsedSkills: normalizeSkillString(u.skills),
    safeName: (u.name || "").toLowerCase(),
  }));
}

// =============================================================
// 2) INDIVIDUAL SKILL SEARCH
// =============================================================
export async function findMatchingUsers() {
  const skillInput = DOMElements.teamSkillsInput?.value.trim().toLowerCase();
  if (!skillInput) {
    showNotification("Enter required skills.", "error");
    return;
  }

  const requiredSkills = normalizeSkillString(skillInput);
  const users = await loadAllCommunity();

  const matches = users.filter(u =>
    includesAnySkills(u.parsedSkills, requiredSkills)
  );

  displayResults(matches);
}

// =============================================================
// 3) NAME SEARCH
// =============================================================
export async function findByName() {
  const name = safeName(DOMElements.nameInput?.value);
  if (!name) {
    showNotification("Enter a name.", "error");
    return;
  }

  const users = await loadAllCommunity();

  const matches = users.filter(
    u => u.safeName.includes(name) || (u.email || "").toLowerCase().includes(name)
  );

  displayResults(matches);
}

// =============================================================
// 4) TEAM BUILDER
// =============================================================
export async function buildBestTeam() {
  const reqSkills = normalizeSkillString(
    DOMElements.teamBuilderSkillsInput?.value
  );

  const teamSize = parseInt(DOMElements.teamSizeInput?.value);
  if (!reqSkills.length || !teamSize || teamSize < 1) {
    showNotification("Enter skills + team size.", "error");
    return;
  }

  const users = await loadAllCommunity();

  let matches = users.filter(u =>
    includesAnySkills(u.parsedSkills, reqSkills)
  );

  matches = matches.slice(0, teamSize); // pick best N

  displayTeam(matches);
}

// =============================================================
// 5) RENDER RESULTS (Cards)
// =============================================================
function createCard(user) {
  const img = user.image_url || "images/default-avatar.png";
  const name = user.name || "Unnamed";
  const skills = user.skills || "No skills";
  const email = user.email || "(no email)";
  const avail = user.availability || "Available";

  return `
    <div class="result-card">
      <img src="${img}" class="card-avatar" />
      <h3>${name}</h3>
      <p><strong>Skills:</strong> ${skills}</p>
      <p><strong>Email:</strong> ${email}</p>
      <span class="availability-tag">${avail}</span>
    </div>
  `;
}

function displayResults(matches) {
  const cardContainer = DOMElements.cardContainer;
  const noResults = DOMElements.noResults;
  const matchNotification = DOMElements.matchNotification;

  if (!matches.length) {
    cardContainer.innerHTML = "";
    noResults.classList.remove("hidden");
    matchNotification.classList.add("hidden");
    return;
  }

  noResults.classList.add("hidden");
  matchNotification.classList.remove("hidden");
  matchNotification.textContent = `${matches.length} match${matches.length === 1 ? "" : "es"} found`;

  cardContainer.innerHTML = matches.map(createCard).join("");
}

function displayTeam(users) {
  const container = DOMElements.bestTeamContainer;
  container.innerHTML = users.map(createCard).join("");
}

// =============================================================
// EXPORTS
// =============================================================
export default {
  findMatchingUsers,
  findByName,
  buildBestTeam
};
