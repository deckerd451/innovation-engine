// ===============================
// PUBLIC MODE MAIN.JS — CharlestonHacks Innovation Engine
// ===============================
// Supports: Profile creation, skill search, endorsements, and leaderboard
// Works without Supabase Auth (anonymous use)
// ===============================

import { supabaseClient as supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";
import { loadLeaderboard } from "./leaderboard.js";
import { initProfileForm } from "./profile.js";

/* =========================================================
   Inject Inline CSS for Self-Contained Styling
========================================================= */
const style = document.createElement("style");
style.textContent = `
.user-card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px;
  padding: 16px;
  margin: 10px 0;
  text-align: center;
  color: #fff;
  transition: background 0.25s ease, transform 0.25s ease;
}
.user-card:hover { background: rgba(255,255,255,0.12); transform: scale(1.02); }

.user-avatar {
  width: 80px; height: 80px; border-radius: 50%;
  object-fit: cover; margin-bottom: 8px; border: 2px solid rgba(255,255,255,0.3);
}

.user-card h3 { font-size: 18px; margin-bottom: 4px; color: #fff; }
.user-card .email { color: #ccc; font-size: 13px; margin-bottom: 6px; }

.skills-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 8px; }

.skill-chip {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(255,255,255,0.1);
  color: #fff;
  border-radius: 20px;
  padding: 4px 10px;
  font-size: 13px;
  transition: background 0.2s ease;
}
.skill-chip:hover { background: rgba(255,255,255,0.25); }

.skill-chip .endorse-btn {
  background: rgba(255,255,255,0.15);
  border: none;
  color: #fff;
  font-weight: bold;
  border-radius: 50%;
  width: 18px; height: 18px;
  line-height: 16px;
  text-align: center;
  cursor: pointer;
  transition: background 0.25s ease;
}
.skill-chip .endorse-btn:hover { background: #ff5757; }

.notification { text-align: center; margin: 10px auto; color: #ffcc00; }
.no-results-notification { color: #f55; }
.match-notification { color: #9f9; }

.autocomplete-box {
  position: absolute; background: #222; border: 1px solid #555;
  border-radius: 6px; z-index: 10; width: 100%; display: none; max-height: 200px; overflow-y: auto;
}
.autocomplete-item {
  padding: 6px 10px; cursor: pointer; color: #eee;
}
.autocomplete-item:hover { background: #444; color: #fff; }
`;
document.head.appendChild(style);

/* =========================================================
   0) Globals + Helpers
========================================================= */
let SKILL_SUGGESTIONS = [];
let SKILL_COLORS = {};

function normalizeField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "object") return Object.values(value).map((s) => String(s).trim()).filter(Boolean);
  return [];
}

function debounce(fn, ms = 150) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadSkillColors() {
  try {
    const { data, error } = await supabase.from("skill_colors").select("skill, color");
    if (error) throw error;
    SKILL_COLORS = {};
    data?.forEach((row) => {
      if (row.skill && row.color) SKILL_COLORS[row.skill.toLowerCase()] = row.color;
    });
  } catch (err) { console.warn("[Skill Colors] Load error:", err); }
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
  } catch (e) { console.warn("[Suggest] unexpected:", e); }
}

/* =========================================================
   1) Tabs
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

/* =========================================================
   2) User Card Rendering
========================================================= */
function generateUserCard(person) {
  const card = document.createElement("div");
  card.className = "user-card";
  const avatar = person.image_url || "images/default-avatar.png";
  const name = person.name || "Anonymous User";
  const email = person.email || "";
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
    <div class="skills-list">${skillChips}</div>
  `;

  card.querySelectorAll(".endorse-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await endorseSkill(btn.dataset.userId, btn.dataset.skill);
    });
  });

  return card;
}

/* =========================================================
   3) Skill Search (Fixed for JSON Columns)
========================================================= */
function parseRequiredSkills(raw) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function filterAllOfRequired(candidates, requiredSkills) {
  return (candidates || []).filter((p) => {
    const have = new Set([...normalizeField(p.skills), ...normalizeField(p.interests)]);
    return requiredSkills.every((req) => have.has(req));
  });
}

function attachAutocomplete(rootId, inputId, boxSelector) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const input = root.querySelector(`#${inputId}`);
  const box = root.querySelector(boxSelector);
  if (!input || !box) return;
  const closeBox = () => { box.innerHTML = ""; box.style.display = "none"; };

  const render = debounce(() => {
    const parts = (input.value || "").split(",");
    const lastRaw = parts[parts.length - 1].trim().toLowerCase();
    if (!lastRaw) return closeBox();
    const matches = SKILL_SUGGESTIONS.filter((s) => s.startsWith(lastRaw)).slice(0, 8);
    if (!matches.length) return closeBox();
    box.innerHTML = matches.map((s) => `<div class="autocomplete-item" data-skill="${s}">${s}</div>`).join("");
    box.style.display = "block";
    box.querySelectorAll(".autocomplete-item").forEach((el) => {
      el.addEventListener("click", () => {
        parts[parts.length - 1] = " " + el.dataset.skill;
        input.value = parts.map((p) => p.trim()).filter(Boolean).join(", ") + ", ";
        input.focus(); closeBox();
      });
    });
  }, 120);
  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  input.addEventListener("blur", () => setTimeout(closeBox, 120));
}

function initSearch() {
  const root = document.getElementById("search");
  if (!root) return;
  const findTeamBtn = root.querySelector("#find-team-btn");
  const searchNameBtn = root.querySelector("#search-name-btn");
  const skillsInput = root.querySelector("#teamSkillsInput");

  // --- Search by Skills ---
  if (findTeamBtn && skillsInput) {
    findTeamBtn.addEventListener("click", async () => {
      const required = parseRequiredSkills(skillsInput.value);
      if (!required.length) return showNotification("Enter at least one skill.", "warning");
      try {
        // ✅ JSON-safe query: cast jsonb to text
        const orFilters = required
          .map((skill) => `skills::text.ilike.%${skill}%,interests::text.ilike.%${skill}%`)
          .join(",");
        const { data, error } = await supabase.from("community").select("*").or(orFilters);
        if (error) {
          console.error("[Search] Supabase error:", error);
          showNotification("Search failed. Check console.", "error");
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

  // --- Search by Name ---
  if (searchNameBtn) {
    searchNameBtn.addEventListener("click", async () => {
      const name = root.querySelector("#nameInput")?.value.trim();
      if (!name) return;
      try {
        const { data, error } = await supabase.from("community").select("*").ilike("name", `%${name}%`);
        if (error) {
          console.error("[Search] Name error:", error);
          showNotification("Name search failed.", "error");
          return;
        }
        await renderResults(data);
      } catch (err) {
        console.error("[Search] Unexpected name search error:", err);
      }
    });
  }

  attachAutocomplete("search", "teamSkillsInput", "#autocomplete-team-skills");
}

/* =========================================================
   4) Endorsements
========================================================= */
async function endorseSkill(userId, skill) {
  if (!skill || !userId) return showNotification("Invalid skill.", "error");
  try {
    const { error } = await supabase.from("endorsements").insert({
      endorsed_user_id: userId,
      endorsed_by_user_id: "public_user",
      skill,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    showNotification(`✅ Endorsed ${skill}!`, "success");
  } catch (err) {
    console.error("[Endorse] Error:", err);
    showNotification("Could not endorse.", "error");
  }
}

/* =========================================================
   5) Render Search Results
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
  data.forEach((person) => cardContainer.appendChild(generateUserCard(person)));
}

/* =========================================================
   6) Bootstrap
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[Main] Public Mode Initialized");
  await loadSkillColors();
  await loadSkillSuggestions();
  initTabs();
  initProfileForm();
  initSearch();
  loadLeaderboard();
});
