// ======================================================================
// CharlestonHacks Innovation Engine – LEADERBOARD (FINAL 2025)
// ======================================================================

import { supabase } from "./supabaseClient.js";

const rowsContainer = document.getElementById("leaderboard-rows");
const tabs = document.querySelectorAll(".lb-tab");

async function loadCommunity() {
  const { data, error } = await supabase
    .from("community")
    .select(`
      id,
      name,
      image_url,
      skills,
      connection_count,
      created_at
    `);

  if (error) {
    console.error("❌ Leaderboard error:", error);
    return [];
  }

  return data.map(p => ({
    ...p,
    skillsArray: p.skills ? p.skills.split(",").map(s => s.trim()) : []
  }));
}

function renderLeaderboard(list, label) {
  rowsContainer.innerHTML = "";

  list.forEach((p, i) => {
    const img = p.image_url || "assets/default-avatar.png";

    rowsContainer.innerHTML += `
      <div class="lb-row">
        <div class="lb-rank">${i + 1}</div>

        <img src="${img}" class="lb-avatar" />

        <div class="lb-info">
          <div class="lb-name">${p.name}</div>
          <div class="lb-sub">${label(p)}</div>
        </div>
      </div>
    `;
  });
}

async function handleLeaderboard(type) {
  const community = await loadCommunity();

  if (type === "skills") {
    const sorted = community
      .sort((a, b) => b.skillsArray.length - a.skillsArray.length)
      .slice(0, 20);

    renderLeaderboard(sorted, p => `${p.skillsArray.length} skills`);
  }

  if (type === "connectors") {
    const sorted = community
      .sort((a, b) => (b.connection_count || 0) - (a.connection_count || 0))
      .slice(0, 20);

    renderLeaderboard(sorted, p => `${p.connection_count || 0} connections`);
  }

  if (type === "rising") {
    const sorted = community
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 20);

    renderLeaderboard(sorted, p => `Joined ${new Date(p.created_at).toLocaleDateString()}`);
  }
}

export function initLeaderboard() {
  console.log("🏆 Leaderboard ready");

  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      handleLeaderboard(btn.dataset.type);
    });
  });

  handleLeaderboard("skills");
}
