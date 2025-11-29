// ======================================================================
// CharlestonHacks Innovation Engine – SEARCH ENGINE (FINAL 2025)
// Fully aligned with existing Supabase schema
// community columns used:
//   id, name, email, skills, interests, bio,
//   availability, image_url, connection_count
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { DOMElements } from "./globals.js";

// DOM references from globals.js
const teamSkillsInput = DOMElements.teamSkillsInput;
const nameInput = DOMElements.nameInput;
const cardContainer = DOMElements.cardContainer;
const noResults = DOMElements.noResults;
const matchNotification = DOMElements.matchNotification;

// ======================================================================
// LOAD COMMUNITY MEMBERS
// ======================================================================
async function loadCommunity() {
  console.log("📡 Loading community for search…");

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
    console.error("❌ Error loading community:", error);
    return [];
  }

  // Normalize skills → array
  return data.map(person => ({
    ...person,
    skillsArray: person.skills
      ? person.skills.split(",").map(s => s.trim().toLowerCase())
      : [],
    lowerName: person.name?.toLowerCase() || ""
  }));
}

// Cache to avoid repeated DB hits
let communityCache = null;

// ======================================================================
// RENDER CARDS
// ======================================================================
function renderCards(list) {
  cardContainer.innerHTML = "";

  if (!list.length) {
    noResults.classList.remove("hidden");
    matchNotification.classList.add("hidden");
    return;
  }

  noResults.classList.add("hidden");

  list.forEach(person => {
    const card = document.createElement("div");
    card.className = "profile-card";

    card.innerHTML = `
      <div class="card-header">
        <img class="card-avatar" src="${person.image_url || "assets/default-avatar.png"}" alt="${person.name}">
        <div class="card-name">${person.name}</div>
      </div>

      <div class="card-info">
        <p><strong>Skills:</strong> ${person.skills || "—"}</p>
        <p><strong>Availability:</strong> ${person.availability || "—"}</p>
        <p><strong>Bio:</strong> ${person.bio || ""}</p>
      </div>
    `;

    cardContainer.appendChild(card);
  });
}

// ======================================================================
// NAME SEARCH
// ======================================================================
async function searchByName() {
  const query = nameInput.value.trim().toLowerCase();
  if (!query) return;

  if (!communityCache) communityCache = await loadCommunity();

  const results = communityCache.filter(p =>
    p.lowerName.includes(query)
  );

  if (results.length === 0) {
    noResults.classList.remove("hidden");
    matchNotification.classList.add("hidden");
  } else {
    noResults.classList.add("hidden");
    matchNotification.classList.remove("hidden");
    matchNotification.textContent = `Found ${results.length} match${results.length === 1 ? "" : "es"}`;
  }

  renderCards(results);
}

// ======================================================================
// SKILL SEARCH
// ======================================================================
async function searchBySkills() {
  const raw = teamSkillsInput.value.trim().toLowerCase();
  if (!raw) return;

  if (!communityCache) communityCache = await loadCommunity();

  const requiredSkills = raw.split(",").map(s => s.trim());

  const results = communityCache.filter(person =>
    requiredSkills.every(skill => person.skillsArray.includes(skill))
  );

  if (results.length === 0) {
    noResults.classList.remove("hidden");
    matchNotification.classList.add("hidden");
  } else {
    noResults.classList.add("hidden");
    matchNotification.classList.remove("hidden");
    matchNotification.textContent = `Found ${results.length} matching people`;
  }

  renderCards(results);
}

// ======================================================================
// EVENT LISTENERS
// ======================================================================
export function initSearchEngine() {
  console.log("🔎 Initializing search engine…");

  document
    .getElementById("search-name-btn")
    .addEventListener("click", searchByName);

  document
    .getElementById("find-team-btn")
    .addEventListener("click", searchBySkills);

  console.log("🔍 Search engine ready");
}
