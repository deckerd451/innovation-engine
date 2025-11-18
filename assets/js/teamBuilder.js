// src/teamBuilder.js

import { renderUserCards, showNotification } from './uiHelpers.js';
import { DOMElements, supabaseClient } from './globals.js';

/**
 * Builds the best team based on required skills and team size.
 */
export async function buildBestTeam() {
  const skillInputRaw = DOMElements.teamBuilderSkillsInput.value;
  const teamSize = parseInt(DOMElements.teamSizeInput.value, 10);

  const requiredSkills = skillInputRaw
    .toLowerCase()
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!requiredSkills.length || isNaN(teamSize) || teamSize < 1) {
    showNotification(
      'Please enter required skills and a valid team size (1 or more).',
      'warning'
    );
    DOMElements.bestTeamContainer.innerHTML = '';
    return;
  }

  try {
    // 🔥 Correct table
    const { data: users, error } = await supabaseClient
      .from('community')
      .select('user_id, name, skills, image_url, bio, endorsements');

    if (error) throw error;

    const scoredUsers = users
      .map(user => {
        const userSkills = (user.skills || '')
          .toLowerCase()
          .split(',')
          .map(s => s.trim());

        const matching = requiredSkills.filter(rs =>
          userSkills.includes(rs)
        );

        return matching.length
          ? {
              ...user,
              matchingSkills: matching,
              matchCount: matching.length
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) =>
        b.matchCount - a.matchCount ||
        (Object.keys(b.endorsements || {}).length) -
        (Object.keys(a.endorsements || {}).length)
      )
      .slice(0, teamSize);

    const cleaned = scoredUsers.map(user => ({
      ...user,
      avatar_url: user.image_url || 'https://via.placeholder.com/150',
      bio: user.bio || 'No bio provided.'
    }));

    renderUserCards(cleaned, DOMElements.bestTeamContainer);

    if (cleaned.length > 0) {
      showNotification(`Built a team of ${cleaned.length} member(s).`, 'success');
    } else {
      showNotification('No team members matched the required skills.', 'info');
    }
  } catch (error) {
    console.error('Error building team:', error);
    showNotification('Error loading users for team building.', 'error');
    DOMElements.bestTeamContainer.innerHTML =
      '<span style="color:white;">Error loading users.</span>';
  }
}
