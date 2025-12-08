// ======================================================================
// CharlestonHacks Innovation Engine — LEADERBOARD (FINAL 2025 REWRITE)
// Clean • Predictable • Matches CSS • Fully Synced With UI
// ======================================================================

import { supabase } from "./supabaseClient.js";

// ======================================================================
// 1) LOAD COMMUNITY DATA
// ======================================================================
async function loadCommunity() {
  const { data, error } = await supabase
    .from("community")
    .select(`
      id,
      name,
      email,
      skills,
      connection_count,
      image_url,
      availability
    `);

  if (error) {
    console.error("❌ Leaderboard: Failed to load community:", error);
    return [];
  }

  // Normalize rows
  return data.map(person => ({
    ...person,
    skillsArray: person.skills
      ? person.skills.split(",").map(s => s.trim().toLowerCase())
      : []
  }));
}

// ======================================================================
// 2) LOAD ENDORSEMENTS DATA
// ======================================================================
async function loadEndorsements() {
  const { data, error } = await supabase
    .from("endorsements")
    .select("endorsed_user_id, endorsed_by_user_id, skill");

  if (error) {
    console.warn("⚠️ Could not load endorsements:", error.message);
    return [];
  }

  return data || [];
}

// ======================================================================
// 3) RENDER LEADERBOARD ROWS
// ======================================================================
function renderLeaderboardRows(list) {
  const rows = document.getElementById("leaderboard-rows");
  if (!rows) {
    console.error("❌ Missing #leaderboard-rows container.");
    return;
  }

  rows.innerHTML = "";

  if (list.length === 0) {
    rows.innerHTML = `
      <div class="lb-empty">
        <p>No data available yet.</p>
      </div>
    `;
    return;
  }

  list.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "lb-row";

    const avatar = item.image_url || "assets/default-avatar.png";
    const sub = item.subtext || "";
    const score = item.score ?? 0;
    const rank = index + 1;

    row.innerHTML = `
      <div class="lb-rank">${rank}</div>
      <img src="${avatar}" class="lb-avatar" onerror="this.src='assets/default-avatar.png'" />
      <div class="lb-info">
        <div class="lb-name">${item.name}</div>
        <div class="lb-sub">${sub}</div>
      </div>
      <div class="lb-score">${score}</div>
    `;

    rows.appendChild(row);
  });
}

// ======================================================================
// 4) LEADERBOARD MODES
// ======================================================================

// --- TOP SKILLS -------------------------------------------------------
function makeTopSkills(data) {
  const freq = {};

  data.forEach(person => {
    person.skillsArray.forEach(skill => {
      freq[skill] = (freq[skill] || 0) + 1;
    });
  });

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([skill, count]) => ({
      name: skill.toUpperCase(),
      image_url: "assets/icons/skill.png",
      subtext: "Skill Frequency",
      score: count
    }));
}

// --- TOP CONNECTORS ---------------------------------------------------
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

// --- MOST ENDORSED ----------------------------------------------------
async function makeMostEndorsed(communityData) {
  const endorsements = await loadEndorsements();
  
  if (endorsements.length === 0) {
    // Return community members with 0 endorsements
    return communityData.slice(0, 15).map(person => ({
      name: person.name,
      image_url: person.image_url,
      subtext: "Endorsements",
      score: 0
    }));
  }

  // Count endorsements per user (using endorsed_user_id)
  const endorsementCount = {};
  endorsements.forEach(e => {
    endorsementCount[e.endorsed_user_id] = (endorsementCount[e.endorsed_user_id] || 0) + 1;
  });

  // Map community data with endorsement counts
  return communityData
    .map(person => ({
      name: person.name,
      image_url: person.image_url,
      subtext: "Endorsements",
      score: endorsementCount[person.id] || 0
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
}

// --- RISING STARS -----------------------------------------------------
function makeRisingStars(data) {
  return data
    .map(person => ({
      name: person.name,
      image_url: person.image_url,
      subtext: "Potential Score",
      score: (person.skillsArray.length || 0) * 2 - (person.connection_count || 0)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
}

// ======================================================================
// 5) INIT LEADERBOARD
// ======================================================================
export async function initLeaderboard() {
  console.log("🏆 Initializing Leaderboard…");

  const tabs = document.querySelectorAll(".lb-tab");
  if (!tabs.length) {
    console.error("❌ No .lb-tab buttons found.");
    return;
  }

  tabs.forEach(btn => {
    btn.addEventListener("click", async () => {
      // Highlight active tab
      tabs.forEach(t => t.classList.remove("active"));
      btn.classList.add("active");

      const mode = btn.dataset.type;
      const data = await loadCommunity();
      if (!data.length) {
        renderLeaderboardRows([]);
        return;
      }

      let list = [];

      switch (mode) {
        case "skills":
          list = makeTopSkills(data);
          break;

        case "connectors":
          list = makeTopConnectors(data);
          break;

        case "endorsed":
          list = await makeMostEndorsed(data);
          break;

        case "rising":
          list = makeRisingStars(data);
          break;

        default:
          console.warn("⚠️ Unknown leaderboard mode:", mode);
          list = [];
      }

      renderLeaderboardRows(list);
    });
  });

  // Auto-click the first tab to load initial data
  const firstTab = tabs[0];
  if (firstTab) {
    firstTab.click();
  }

  console.log("🏆 Leaderboard ready");
}
