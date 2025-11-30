// ======================================================================
// CharlestonHacks Innovation Engine – LEADERBOARD (FINAL 2025)
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { DOMElements } from "./globals.js";

// Load all community members
async function loadCommunity() {
  const { data, error } = await supabase
    .from("community")
    .select(`
      id,
      name,
      skills,
      connection_count,
      image_url,
      availability
    `);

  if (error) {
    console.error("❌ Leaderboard load error:", error);
    return [];
  }

  return data.map(person => ({
    ...person,
    skillsArray: person.skills
      ? person.skills.split(",").map(s => s.trim().toLowerCase())
      : []
  }));
}

// Generate Leaderboard Rows
function renderLeaderboardRows(list) {
  const rowsContainer = document.getElementById("leaderboard-rows");
  rowsContainer.innerHTML = "";

  list.forEach(item => {
    const row = document.createElement("div");
    row.className = "lb-row";

    row.innerHTML = `
      <img 
        src="${item.image_url || "assets/default-avatar.png"}"
        class="lb-avatar"
      />

      <div class="lb-info">
        <div class="lb-name">${item.name}</div>
        <div class="lb-sub">${item.subtext}</div>
      </div>

      <div class="lb-score">${item.score}</div>
    `;

    rowsContainer.appendChild(row);
  });
}

// Top Skills
function makeTopSkills(data) {
  const counter = {};

  data.forEach(person => {
    person.skillsArray.forEach(skill => {
      counter[skill] = (counter[skill] || 0) + 1;
    });
  });

  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([skill, count]) => ({
      name: skill.toUpperCase(),
      image_url: "assets/icons/skill.png",
      subtext: "Skill Frequency",
      score: count
    }));
}

// Top Connectors
function makeTopConnectors(data) {
  return data
    .sort((a, b) => (b.connection_count || 0) - (a.connection_count || 0))
    .slice(0, 15)
    .map(person => ({
      name: person.name,
      image_url: person.image_url,
      subtext: "Connections",
      score: person.connection_count || 0
    }));
}

// Rising Stars (skills high, connections low)
function makeRisingStars(data) {
  return data
    .map(person => ({
      name: person.name,
      image_url: person.image_url,
      subtext: "Potential",
      score: (person.skillsArray.length || 0) * 2 - (person.connection_count || 0)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
}

// ======================================================================
// INIT
// ======================================================================
export function initLeaderboard() {
  console.log("🏆 Initializing Leaderboard…");

  const tabs = document.querySelectorAll(".lb-tab");

  tabs.forEach(btn => {
    btn.addEventListener("click", async () => {
      tabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const type = btn.dataset.type;

      const data = await loadCommunity();
      if (!data.length) return;

      let list = [];

      if (type === "skills") list = makeTopSkills(data);
      if (type === "connectors") list = makeTopConnectors(data);
      if (type === "rising") list = makeRisingStars(data);

      renderLeaderboardRows(list);
    });
  });

  console.log("🏆 Leaderboard ready");
}
