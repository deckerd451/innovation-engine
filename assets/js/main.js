// ===============================
// PUBLIC MODE MAIN.JS — CharlestonHacks Innovation Engine
// ===============================
// Supports: Profile creation, skill search, connections, endorsements, and leaderboard
// Works without Supabase Auth (anonymous use)
// ===============================

import { supabaseClient as supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";
import { loadLeaderboard } from "./leaderboard.js";
import { initProfileForm } from "./profile.js";

/* =========================================================
   0) Globals + Helpers
========================================================= */
let SKILL_SUGGESTIONS = [];
let SKILL_COLORS = {};

function normalizeField(value) {
  if (!value) return [];
  if (Array.isArray(value))
    return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value === "string")
    return value.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "object")
    return Object.values(value).map((s) => String(s).trim()).filter(Boolean);
  return [];
}

function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function loadSkillColors() {
  try {
    const { data, error } = await supabase.from("skill_colors").select("skill, color");
    if (error) throw error;
    SKILL_COLORS = {};
    data?.forEach((row) => {
      if (row.skill && row.color)
        SKILL_COLORS[row.skill.toLowerCase()] = row.color;
    });
  } catch (err) {
    console.warn("[Skill Colors] Load error:", err);
  }
}

async function loadSkillSuggestions() {
  try {
    const { data, error } = await supabase
      .from("community")
      .select("skills, interests");
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
      document
        .getElementById(btn.dataset.tab)
        ?.classList.add("active-tab-pane");
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
   3) Skill Search (Fixed)
========================================================= */
function parseRequiredSkills(raw) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function filterAllOfRequired(candidates, requiredSkills) {
  return (candidates || []).filter((p) => {
    const have = new Set([
      ...normalizeField(p.skills),
      ...normalizeField(p.interests),
    ]);
    return requiredSkills.every((req) => have.has(req));
  });
}

function attachAutocomplete(rootId, inputId, boxSelector) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const input = root.querySelector(`#${inputId}`);
  const box = root.querySelector(boxSelector);
  if (!input || !box) return;

  const closeBox = () => {
    box.innerHTML = "";
    box.style.display = "none";
  };

  const render = debounce(() => {
    const parts = (input.value || "").split(",");
    const lastRaw = parts[parts.length - 1].trim().toLowerCase();
    if (!lastRaw) return closeBox();
    const matches = SKILL_SUGGESTIONS.filter((s) =>
      s.startsWith(lastRaw)
    ).slice(0, 8);
    if (!matches.length) return closeBox();

    box.innerHTML = matches
      .map(
        (s) => `<div class="autocomplete-item" data-skill="${s}">${s}</div>`
      )
      .join("");
    box.style.display = "block";
    box.querySelectorAll(".autocomplete-item").forEach((el) => {
      el.addEventListener("click", () => {
        parts[parts.length - 1] = " " + el.dataset.skill;
        input.value =
          parts
            .map((p) => p.trim())
            .filter(Boolean)
            .join(", ") + ", ";
        input.focus();
        closeBox();
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

  // --- Search by skills ---
  if (findTeamBtn && skillsInput) {
    findTeamBtn.addEventListener("click", async () => {
      const required = parseRequiredSkills(skillsInput.value);
      if (!required.length)
        return showNotification("Enter at least one skill.", "warning");

      try {
        // ✅ Fixed query — NO double encoding
        const orFilters = required
          .map(
            (skill) =>
              `skills.ilike.%${skill}%,interests.ilike.%${skill}%`
          )
          .join(",");

        const { data, error } = await supabase
          .from("community")
          .select("*")
          .or(orFilters);

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

  // --- Search by name ---
  if (searchNameBtn) {
    searchNameBtn.addEventListener("click", async () => {
      const name = root.querySelector("#nameInput")?.value.trim();
      if (!name) return;
      try {
        const { data, error } = await supabase
          .from("community")
          .select("*")
          .ilike("name", `%${name}%`);

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
async function
