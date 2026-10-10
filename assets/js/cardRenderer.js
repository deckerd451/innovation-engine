// =============================================================
// CharlestonHacks Innovation Engine — Card Renderer (Patched)
// Uses supabase instead of deprecated supabaseClient
// =============================================================

import { supabase } from "./supabaseClient.js";

import { showNotification } from "./utils.js";
import { getCardAvatarUrl } from "./avatar-utils.js";

// Creates user card HTML
export function generateUserCardHTML(user) {
  const name = user.name || "Unnamed User";
  const skills = user.skills || "No skills listed";
  const bio = user.bio || "";
  const image = getCardAvatarUrl(user);

  return `
    <div class="user-card">
      ${image ? `<img src="${image}" class="user-avatar" alt="${name}">` : `<div class="user-avatar user-avatar-initials" aria-label="${name}">${window.profileInitials?.(user) || '?'}</div>`}
      <h3>${name}</h3>
      <p class="skills"><strong>Skills:</strong> ${skills}</p>
      ${bio ? `<p class="bio">${bio}</p>` : ""}
    </div>
  `;
}
