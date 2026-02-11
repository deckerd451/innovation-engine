// /assets/js/renderUserCards.js
import { generateUserCardHTML } from './cardRenderer.js';
import { appState } from './globals.js';

/**
 * Normalize a user row to what cardRenderer expects.
 * Supports:
 *  - { name, email, skills: string[]|string, availability, bio, image_url, endorsements }
 *  - { first_name, last_name, email, skills: 'skill(level), ...', Availability, Bio }
 */
function normalizeUser(u) {
  // Name handling
  let first = u.first_name || '';
  let last  = u.last_name || '';
  let name  = u.name || `${first} ${last}`.trim();

  // Skills: allow array or string; convert to renderer’s string with levels defaulted
  let skillsStr;
  if (Array.isArray(u.skills)) {
    skillsStr = u.skills.map(s => {
      if (!s) return '';
      // accept 'python(Advanced)' already as-is
      return /\(.+\)$/.test(s) ? s : `${s}(Intermediate)`;
    }).join(', ');
  } else if (typeof u.skills === 'string') {
    skillsStr = u.skills;
  } else {
    skillsStr = '';
  }

  // Availability & Bio mapping (renderer looks for specific caps sometimes)
  const Availability = u.Availability || u.availability || '';
  const Bio = u.Bio || u.bio || '';

  return {
    ...u,
    first_name: first || (name ? name.split(' ')[0] : ''),
    last_name : last  || (name ? name.split(' ').slice(1).join(' ') : ''),
    skills    : skillsStr,
    Availability,
    Bio
  };
}

/**
 * Render a list of users into a container as cards.
 */
export function renderUserCards(users = [], container) {
  if (!container) return;
  container.innerHTML = '';
  users.forEach(u => {
    const norm = normalizeUser(u);
    container.insertAdjacentHTML('beforeend', generateUserCardHTML(norm));
  });

  // Wire up the "+ Endorse" buttons (no-op if user endorses self)
  container.querySelectorAll('.endorse-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetEmail = btn.getAttribute('data-email');
      if (!targetEmail || targetEmail === appState.currentUserEmail) return;
      // In a fuller flow we’d call Supabase to increment endorsements.
      btn.disabled = true;
      btn.textContent = 'Endorsed!';
      setTimeout(() => { btn.disabled = false; btn.textContent = '+ Endorse'; }, 1800);
    });
  });
}

export default { renderUserCards };
