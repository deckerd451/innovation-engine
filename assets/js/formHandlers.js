// formHandlers.js
import { DOMElements, appState } from './globals.js';
import { supabaseClient } from './supabaseClient.js';
import { showNotification } from './utils.js';
import { renderUserCards } from './utils.js';

export async function findMatchingUsers() {
  const skillsInput = DOMElements.teamSkillsInput.value.trim();
  const requiredSkills = skillsInput.toLowerCase().split(',').map(skill => skill.trim()).filter(Boolean);
  try {
    const { data } = await supabaseClient.from('skills').select('*');
    const matchedUsers = data.filter(user => {
      const userSkillsRaw = user.skills.split(',').map(s => s.trim());
      return requiredSkills.every(skill =>
        userSkillsRaw.some(us => us.toLowerCase().includes(skill))
      );
    });
    renderUserCards(matchedUsers, DOMElements.cardContainer);
    if (matchedUsers.length > 0) {
      showNotification(\`Found \${matchedUsers.length} matching user(s).\`, 'success');
    }
  } catch (error) {
    showNotification('Error fetching user data.', 'error');
  }
}

export async function searchUserByName() {
  const nameInput = DOMElements.nameInput.value.trim().toLowerCase();
  try {
    const { data } = await supabaseClient.from('skills').select('*');
    const matchedUsers = data.filter(user => {
      const fullName = \`\${user.first_name} \${user.last_name}\`.toLowerCase();
      return fullName.includes(nameInput);
    });
    renderUserCards(matchedUsers, DOMElements.cardContainer);
    if (matchedUsers.length > 0) {
      showNotification(\`Found \${matchedUsers.length} user(s) matching "\${nameInput}".\`, 'success');
    }
  } catch (error) {
    showNotification('Error fetching user data.', 'error');
  }
}
