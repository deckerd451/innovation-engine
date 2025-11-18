// =============================================================
// CharlestonHacks Innovation Engine — Unified Search Engine 3.0
// Handles:
//   ✔ Skill-based search
//   ✔ Name search
//   ✔ Team builder
//   ✔ Robust skill normalization
//   ✔ Fuzzy matching
// =============================================================

// Dependencies
import { supabase } from "./supabaseClient.js";

import { generateUserCardHTML } from "./cardRenderer.js";
import { showNotification } from "./utils.js";
import { DOMElements } from "./globals.js";

// =============================================================
// 1) Normalize skills (handles messy real-world data)
// =============================================================
function normalizeSkills(str) {
  if (!str) return [];

  return str
    .toLowerCase()
    .replace(/;/g, ",")         // support semicolon-separated lists
    .split(",")
    .map(s =>
      s
        .replace(/\(.*?\)/g, "") // remove modifiers like (pom)
        .trim()
    )
    .filter(Boolean);
}

// =============================================================
// 2) Fuzzy skill matching
// =============================================================
function fuzzyMatch(userSkill, requiredSkill) {
  const a = userSkill.toLowerCase();
  const b = requiredSkill.toLowerCase();

  // Strong fuzzy logic
  return (
    a === b ||         // exact
    a.includes(b) ||   // userSkill contains requiredSkill
    b.includes(a)      // requiredSkill contains userSkill
  );
}

// =============================================================
// 3) Fetch all users from COMMUNITY table
// =============================================================
async function loadAllUsers() {
  const { data, error } = await supabase
    .from("community")
    .select("id, name, email, skills, bio, image_url, endorsements");

  if (error) throw error;
  return data || [];
}

// =============================================================
// 4) SKILL SEARCH (Individual search tab)
// =============================================================
export async function findMatchingUsers() {
  const rawInput = DOMElements.teamSkillsInput.value.trim().toLowerCase();

  if (!rawInput) {
    showNotification("Please enter at least one skill.", "warning");
    DOMElements.cardContainer.innerHTML = "";
    return;
  }

  const requiredSkills = rawInput
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  try {
    const users = await loadAllUsers();

    const matched = users.filter(user => {
      const userSkills = normalizeSkills(user.skills);
      return requiredSkills.every(req =>
        userSkills.some(skill => fuzzyMatch(skill, req))
      );
    });

    DOMElements.cardContainer.innerHTML = matched
      .map(generateUserCardHTML)
      .join("");

    if (matched.length > 0) {
      showNotification(`Found ${matched.length} matching user(s).`, "success");
    } else {
      DOMElements.noResults.textContent = "No matching users found.";
      DOMElements.noResults.style.display = "block";
    }
  } catch (err) {
    console.error(err);
    showNotification("Error fetching users.", "error");
  }
}

// =============================================================
// 5) NAME SEARCH
// =============================================================
export async function findByName() {
  const nameQuery = DOMElements.nameInput.value.trim().toLowerCase();

  if (!nameQuery) {
    showNotification("Please enter a name to search.", "warning");
    DOMElements.cardContainer.innerHTML = "";
    return;
  }

  try {
    const users = await loadAllUsers();

    const matched = users.filter(user => {
      const fullName = (user.name || "").toLowerCase();
      return fullName.includes(nameQuery);
    });

    DOMElements.cardContainer.innerHTML = matched
      .map(generateUserCardHTML)
      .join("");

    if (matched.length > 0) {
      showNotification(`Found ${matched.length} match(es).`, "success");
    } else {
      DOMElements.noResults.textContent = "No users found.";
      DOMElements.noResults.style.display = "block";
    }
  } catch (err) {
    console.error(err);
    showNotification("Error fetching users.", "error");
  }
}

// =============================================================
// 6) TEAM BUILDER
// =============================================================
export async function buildBestTeam() {
  const rawSkills = DOMElements.teamBuilderSkillsInput.value.trim().toLowerCase();
  const teamSize = parseInt(DOMElements.teamSizeInput.value, 10);

  if (!rawSkills || isNaN(teamSize) || teamSize < 1) {
    showNotification("Enter required skills and a valid team size.", "warning");
    DOMElements.bestTeamContainer.innerHTML = "";
    return;
  }

  const requiredSkills = rawSkills
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  try {
    const users = await loadAllUsers();

    const scored = users
      .map(user => {
        const userSkills = normalizeSkills(user.skills);

        const matched = requiredSkills.filter(req =>
          userSkills.some(skill => fuzzyMatch(skill, req))
        );

        return matched.length
          ? {
              ...user,
              matchingSkills: matched,
              matchCount: matched.length,
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) =>
        b.matchCount - a.matchCount ||
        ((b.endorsements?.length || 0) - (a.endorsements?.length || 0))
      )
      .slice(0, teamSize);

    DOMElements.bestTeamContainer.innerHTML = scored
      .map(generateUserCardHTML)
      .join("");

    if (scored.length) {
      showNotification(`Built a team of ${scored.length}.`, "success");
    } else {
      showNotification("No matching team members found.", "info");
    }
  } catch (err) {
    console.error(err);
    showNotification("Team builder error.", "error");
  }
}

// =============================================================
// END OF FILE
// =============================================================
