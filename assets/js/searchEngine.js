// ======================================================================
// CharlestonHacks Innovation Engine – SEARCH ENGINE (FINAL 2025)
// Works with Supabase community schema
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { DOMElements } from "./globals.js";

// ======================================================================
// HELPERS
// ======================================================================

function normalizeAvailability(status) {
  if (!status) return "Available";
  return status.replace(/\s+/g, "");
}

function createPersonCard(person) {
  const card = document.createElement("div");
  card.className = "result-card";

  const availability = normalizeAvailability(person.availability || "Available");

  const skillsArr = (person.skills || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

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

      ${person.bio ? `<p style="margin-top:8px; font-size:0.85rem; color:#ddd;">${person.bio}</p>` : ""}
    </div>
  `;

  return card;
}

// ======================================================================
// LOAD COMMUNITY
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

  return data.map(person => ({
    ...person,
    skillsArray: person.skills
      ? person.skills.split(",").map(s => s.trim().toLowerCase())
      : [],
    lowerName: person.name?.toLowerCase() || ""
  }));
}

let communityCache = null;

// ======================================================================
// RENDER CARDS
// ======================================================================

function renderCards(list, cardContainer, matchNotification, noResults) {
  cardContainer.innerHTML = "";

  if (!list.length) {
    noResults.classList.remove("hidden");
    matchNotification.classList.add("hidden");
    return;
  }

  noResults.classList.add("hidden");

  list.forEach(person => {
    const card = createPersonCard(person);
    cardContainer.appendChild(card);
  });
}

// ======================================================================
// NAME SEARCH
// ======================================================================

async function searchByName(nameInput, cardContainer, matchNotification, noResults) {
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

  renderCards(results, cardContainer, matchNotification, noResults);
}

// ======================================================================
// SKILL SEARCH
// ======================================================================

async function searchBySkills(teamSkillsInput, cardContainer, matchNotification, noResults) {
  const raw = teamSkillsInput.value.trim().toLowerCase();
  if (!raw) return;

  if (!communityCache) communityCache = await loadCommunity();

  const requiredSkills = raw.split(",").map(s => s.trim());

  const results = communityCache.filter(person =>
    requiredSkills.every(skill => person.skillsArray.includes(skill))
  );

  if (!results.length) {
    noResults.classList.remove("hidden");
    matchNotification.classList.add("hidden");
  } else {
    noResults.classList.add("hidden");
    matchNotification.classList.remove("hidden");
    matchNotification.textContent = `Found ${results.length} matching people`;
  }

  renderCards(results, cardContainer, matchNotification, noResults);
}

// ======================================================================
// INIT
// ======================================================================

export function initSearchEngine() {
  console.log("🔎 Initializing search engine…");

  // GET DOM REFERENCES (correct timing — main.js has populated DOMElements)
  const teamSkillsInput = DOMElements.teamSkillsInput;
  const nameInput = DOMElements.nameInput;
  const cardContainer = DOMElements.cardContainer;
  const noResults = DOMElements.noResults;
  const matchNotification = DOMElements.matchNotification;

  if (!teamSkillsInput || !nameInput) {
    console.error("❌ Search engine DOM not found");
    return;
  }

  document
    .getElementById("search-name-btn")
    .addEventListener("click", () =>
      searchByName(nameInput, cardContainer, matchNotification, noResults)
    );

  document
    .getElementById("find-team-btn")
    .addEventListener("click", () =>
      searchBySkills(teamSkillsInput, cardContainer, matchNotification, noResults)
    );

  console.log("🔍 Search engine ready");
}
