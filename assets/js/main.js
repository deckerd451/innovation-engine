// PUBLIC VERSION: assets/js/main.js
// Removed all Supabase Auth logic — site loads immediately for everyone.

import { supabaseClient as supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";
import { loadLeaderboard } from "./leaderboard.js";
import { initSynapseView } from "./synapse.js";
import { initProfileForm } from "./profile.js";

/* =========================================================
0) Helpers + Globals
========================================================= */
let SKILL_SUGGESTIONS = [];
let SKILL_COLORS = {}; // { skill: hexColor }

async function loadSkillColors() {
  try {
    const { data, error } = await supabase.from("skill_colors").select("skill, color");
    if (error) throw error;
    SKILL_COLORS = {};
    data?.forEach((row) => {
      if (row.skill && row.color) SKILL_COLORS[row.skill.toLowerCase()] = row.color;
    });
  } catch (err) {
    console.warn("[Skill Colors] Load error:", err);
  }
}

function normalizeField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "object") return Object.values(value).map((s) => String(s).trim()).filter(Boolean);
  return [];
}

function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function normaliseArray(a) {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : a.toString().split(",");
  return arr.map((s) => s && s.toString().trim().toLowerCase()).filter(Boolean);
}

function parseRequiredSkills(raw) {
  return (raw || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function filterAllOfRequired(candidates, requiredSkills) {
  return (candidates || []).filter((p) => {
    const have = new Set([
      ...normaliseArray(p.skills),
      ...normaliseArray(p.interests),
    ]);
    return requiredSkills.every((req) => have.has(req));
  });
}

async function loadSkillSuggestions() {
  try {
    const { data, error } = await supabase.from("community").select("skills, interests");
    if (error) return console.warn("[Suggest] load error:", error.message);
    const bag = new Set();
    (data || []).forEach((r) => {
      const allVals = [].concat(r.skills || []).concat(r.interests || []);
      allVals.forEach((val) => {
        if (!val) return;
        normalizeField(val).forEach((skill) => bag.add(skill.toLowerCase()));
      });
    });
    SKILL_SUGGESTIONS = Array.from(bag).sort();
  } catch (e) {
    console.warn("[Suggest] unexpected:", e);
  }
}

function attachAutocomplete(rootId, inputId, boxSelector) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const input = root.querySelector(`#${inputId}`);
  const box = root.querySelector(boxSelector);
  if (!input || !box) return;

  const wrapper = input.parentElement;
  if (getComputedStyle(wrapper).position === "static")
    wrapper.style.position = "relative";

  const closeBox = () => {
    box.innerHTML = "";
    box.style.display = "none";
  };
  const openBox = () => {
    box.style.display = "block";
  };

  const render = debounce(() => {
    const parts = (input.value || "").split(",");
    const lastRaw = parts[parts.length - 1].trim().toLowerCase();
    if (!lastRaw) return closeBox();
    const matches = SKILL_SUGGESTIONS.filter((s) => s.startsWith(lastRaw)).slice(0, 8);
    if (!matches.length) return closeBox();

    box.innerHTML = matches
      .map((s) => `<div class="autocomplete-item" data-skill="${s}">${s}</div>`)
      .join("");
    openBox();
    box.querySelectorAll(".autocomplete-item").forEach((el) => {
      el.addEventListener("click", () => {
        parts[parts.length - 1] = " " + el.dataset.skill;
        input.value = parts.map((p) => p.trim()).filter(Boolean).join(", ") + ", ";
        input.focus();
        closeBox();
      });
    });
  }, 120);

  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  input.addEventListener("blur", () => setTimeout(closeBox, 120));
}

/* =========================================================
1) Simplified User Connections / Endorsements (no auth)
========================================================= */
async function connectToUser(targetId) {
  showNotification("Connection feature requires login (currently disabled).", "info");
}

async function endorseSkill(userId, skill) {
  showNotification(`You endorsed ${skill} (mock mode, no login required).`, "success");
}

/* =========================================================
2) Notifications (mocked)
========================================================= */
function initNotifications() {
  console.log("[Notifications] Disabled in public mode");
}
function initNotificationsRealtime() {
  console.log("[Realtime Notifications] Disabled in public mode");
}

/* =========================================================
3) Helper: User Cards
========================================================= */
function generateUserCard(person) {
  const card = document.createElement("div");
  card.className = "user-card";
  const avatar = person.image_url || "https://via.placeholder.com/80";
  const name = person.name || "Anonymous User";
  const email = person.email || "";
  const availability = person.availability || "Unknown";

  const skills = normalizeField(person.skills);
  const interests = normalizeField(person.interests);

  const skillChips = [...skills, ...interests]
    .map((skill) => {
      const lower = skill.toLowerCase();
      const color = SKILL_COLORS[lower] || "#555";
      return `
      <div class="skill-chip" style="background-color:${color}">
        <span>${skill}</span>
        <button class="endorse-btn" data-user-id="${person.id}" data-skill="${skill}">+</button>
      </div>`;
    })
    .join("");

  card.innerHTML = `
    <img src="${avatar}" alt="${name}" class="user-avatar">
    <h3>${name}</h3>
    ${email ? `<p class="email">${email}</p>` : ""}
    <p class="availability">Availability: ${availability}</p>
    <div class="skills-list">${skillChips}</div>
    <button class="connect-btn" data-user-id="${person.id}">🤝 Connect</button>
  `;

  card.querySelectorAll(".endorse-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await endorseSkill(btn.dataset.userId, btn.dataset.skill);
    });
  });

  card.querySelector(".connect-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    await connectToUser(e.target.dataset.userId);
  });

  return card;
}

/* =========================================================
4) Tabs + Search
========================================================= */
function initTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const panes = document.querySelectorAll(".tab-content-pane");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      panes.forEach((p) => p.classList.remove("active-tab-pane"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab)?.classList.add("active-tab-pane");
    });
  });
}

function initSearch() {
  const root = document.getElementById("search");
  if (!root) return;

  const findTeamBtn = root.querySelector("#find-team-btn");
  const searchNameBtn = root.querySelector("#search-name-btn");
  const skillsInput = root.querySelector("#teamSkillsInput");

  if (findTeamBtn && skillsInput) {
    findTeamBtn.addEventListener("click", async () => {
      const required = parseRequiredSkills(skillsInput.value);
      if (!required.length) return;

      try {
        const orFilters = required
          .map((skill) => `skills.ilike.%${skill}%,interests.ilike.%${skill}%`)
          .join(",");

        const { data, error } = await supabase.from("community").select("*").or(orFilters);

        if (error) {
          console.error("[Search] Supabase error:", error);
          showNotification("Search failed: " + error.message, "error");
          return;
        }

        const strictMatches = filterAllOfRequired(data, required);
        await renderResults(strictMatches);
      } catch (err) {
        console.error("[Search] Unexpected error:", err);
        showNotification("Unexpected search error", "error");
      }
    });
  }

  if (searchNameBtn) {
    searchNameBtn.addEventListener("click", async () => {
      const name = root.querySelector("#nameInput")?.value.trim();
      if (!name) return;

      try {
        const { data, error } = await supabase.from("community").select("*").ilike("name", `%${name}%`);

        if (error) {
          console.error("[Search] Name error:", error);
          showNotification("Name search failed: " + error.message, "error");
          return;
        }

        await renderResults(data);
      } catch (err) {
        console.error("[Search] Unexpected name search error:", err);
        showNotification("Unexpected name search error", "error");
      }
    });
  }

  attachAutocomplete("search", "teamSkillsInput", "#autocomplete-team-skills");
}

/* =========================================================
5) Render Results
========================================================= */
async function renderResults(data) {
  const cardContainer = document.getElementById("cardContainer");
  const noResults = document.getElementById("noResults");
  const matchNotification = document.getElementById("matchNotification");

  if (!cardContainer || !noResults || !matchNotification) return;

  cardContainer.innerHTML = "";
  noResults.classList.add("hidden");
  matchNotification.classList.add("hidden");

  if (!data || data.length === 0) {
    noResults.textContent = "No matching users found.";
    noResults.classList.remove("hidden");
    return;
  }

  matchNotification.textContent = `Found ${data.length} result(s).`;
  matchNotification.classList.remove("hidden");

  data.forEach((person) => {
    cardContainer.appendChild(generateUserCard(person));
  });
}

/* =========================================================
6) Bootstrap (no auth)
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[Main] Public Mode Initialized");

  initTabs();
  initSynapseView();
  initProfileForm();

  loadLeaderboard();
  await loadSkillSuggestions();
  initSearch();

  initNotifications();
  initNotificationsRealtime();
});
