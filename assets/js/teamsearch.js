// src/teamSearch.js

import { supabaseClient } from './supabaseClient.js';
import { generateUserCardHTML } from './cardRenderer.js';
import { showNotification } from './notifications.js';
import { DOMElements } from './domElements.js';

export async function findMatchingUsers() {
  const raw = DOMElements.teamSkillsInput.value.trim();
  if (!raw) {
    showNotification('Please enter at least one skill.', 'warning');
    DOMElements.cardContainer.innerHTML = '';
    return;
  }

  const requiredSkills = raw
    .toLowerCase()
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  try {
    // 🔥 Must read from community table
    const { data: users, error } = await supabaseClient
      .from('community')
      .select('user_id, name, skills, image_url, bio, endorsements');

    if (error) throw error;

    const matched = users.filter(user => {
      const userSkills = (user.skills || '')
        .toLowerCase()
        .split(',')
        .map(s => s.trim());

      return requiredSkills.every(reqSkill =>
        userSkills.includes(reqSkill)
      );
    });

    if (matched.length === 0) {
      DOMElements.noResults.textContent = 'No matching users found.';
      DOMElements.noResults.style.display = 'block';
      DOMElements.cardContainer.innerHTML = '';
      return;
    }

    // Normalize fields to match card renderer
    const cleaned = matched.map(user => ({
      ...user,
      avatar_url: user.image_url,
      bio: user.bio || 'No bio provided.'
    }));

    DOMElements.cardContainer.innerHTML =
      cleaned.map(generateUserCardHTML).join('');

    showNotification(`Found ${cleaned.length} matching user(s).`, 'success');
  } catch (error) {
    console.error("Error finding matching users:", error);
    showNotification('Error fetching user data. Please try again.', 'error');
    DOMElements.cardContainer.innerHTML =
      '<span style="color:red;">Error fetching data.</span>';
  }
}
