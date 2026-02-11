// UPDATED FILE: assets/js/eventListeners.js
// This version of eventListeners.js updates the Supabase query to use
// maybeSingle() instead of single() when looking up a skill record. This
// prevents 406 errors when no matching row exists and logs unexpected
// errors for easier debugging.

import { DOMElements } from './globals.js';
import { findMatchingUsers, searchUserByName } from './formHandlers.js';
import { showEndorseSkillModal } from './endorsements.js';
import { supabaseClient } from './supabaseClient.js';
import { fetchUniqueSkills } from './skillsFetcher.js';
import { loadLeaderboard } from './leaderboard.js';
import { updateProfileProgress } from './profileProgress.js';

export function setupEventListeners() {
  // Attach handlers for team search and name search
  DOMElements.findTeamBtn.addEventListener('click', findMatchingUsers);
  DOMElements.searchNameBtn.addEventListener('click', searchUserByName);

  // Delegate click events on card container for endorse buttons
  DOMElements.cardContainer.addEventListener('click', async (event) => {
    const endorseButton = event.target.closest('.endorse-btn');
    if (endorseButton && !endorseButton.disabled) {
      const emailToEndorse = endorseButton.dataset.email;
      // Use maybeSingle() to avoid 406 errors when no row exists
      const { data, error, status } = await supabaseClient
        .from('skills')
        .select('*')
        .eq('email', emailToEndorse)
        .maybeSingle();

      // Log unexpected errors (status not 406) and proceed only when data exists
      if (error && status !== 406) {
        console.warn('[Endorse] Error fetching skill record:', error.message);
      } else if (data) {
        showEndorseSkillModal(
          data.email,
          data.first_name,
          data.last_name,
          data.skills
        );
      }
    }
  });

  // Initial load
  fetchUniqueSkills();
  loadLeaderboard();
  updateProfileProgress();
}