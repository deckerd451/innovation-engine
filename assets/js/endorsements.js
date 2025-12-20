/*
 * Endorsements Module
 * File: assets/js/endorsements.js
 * Handles skill endorsements between users
 */

const EndorsementsModule = (function() {
  'use strict';
  
  let currentUser = null;
  
  // Initialize module
  async function init() {
    if (!window.supabase) {
      console.error('Supabase not available');
      return;
    }
    
    const { data: { session } } = await window.supabase.auth.getSession();
    if (session) {
      currentUser = session.user;
    }
  }
  
  // Show endorse modal
  async function showEndorseModal(userId, userName, skills) {
    if (!currentUser) {
      showToast('Please sign in to endorse', 'error');
      return;
    }
    
    if (userId === currentUser.id) {
      showToast('You cannot endorse yourself', 'error');
      return;
    }
    
    // Parse skills if it's a string
    let skillsList = skills;
    if (typeof skills === 'string') {
      try {
        skillsList = skills.split(',').map(s => s.trim()).filter(s => s);
      } catch (e) {
        skillsList = [skills];
      }
    }
    
    if (!skillsList || skillsList.length === 0) {
      showToast('No skills listed for this user', 'info');
      return;
    }
    
    // Check which skills already endorsed
    const alreadyEndorsed = await getEndorsedSkills(userId);
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'endorse-modal';
    modal.innerHTML = `
      <div class="endorse-modal-content">
        <div class="modal-header">
          <h3><i class="fas fa-star"></i> Endorse ${escapeHtml(userName)}</h3>
          <button class="modal-close" onclick="EndorsementsModule.closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 1rem; color: #aaa;">
            Select the skills you want to endorse for ${escapeHtml(userName)}:
          </p>
          <div class="skills-checklist" id="endorse-skills-list">
            ${skillsList.map(skill => {
              const isEndorsed = alreadyEndorsed.includes(skill);
              return `
                <label class="skill-checkbox ${isEndorsed ? 'disabled' : ''}">
                  <input type="checkbox" 
                         value="${escapeHtml(skill)}" 
                         ${isEndorsed ? 'disabled checked' : ''}
                         data-skill="${escapeHtml(skill)}">
                  <span class="skill-label">
                    ${escapeHtml(skill)}
                    ${isEndorsed ? '<span class="already-endorsed">✓ Already endorsed</span>' : ''}
                  </span>
                </label>
              `;
            }).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="EndorsementsModule.closeModal()">Cancel</button>
          <button class="btn-primary" onclick="EndorsementsModule.submitEndorsements('${userId}', '${escapeHtml(userName)}')">
            <i class="fas fa-star"></i> Endorse Selected
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 10);
  }
  
  // Close modal
  function closeModal() {
    const modal = document.querySelector('.endorse-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    }
  }
  
  // Submit endorsements
  async function submitEndorsements(userId, userName) {
    const checkboxes = document.querySelectorAll('#endorse-skills-list input[type="checkbox"]:checked:not(:disabled)');
    const skills = Array.from(checkboxes).map(cb => cb.value);
    
    if (skills.length === 0) {
      showToast('Please select at least one skill to endorse', 'info');
      return;
    }
    
    try {
      // Get current user's community ID
      const { data: endorserProfile } = await window.supabase
        .from('community')
        .select('id')
        .eq('user_id', currentUser.id)
        .single();
      
      // Get endorsed user's community ID
      const { data: endorsedProfile } = await window.supabase
        .from('community')
        .select('id')
        .eq('user_id', userId)
        .single();
      
      // Insert endorsements
      const endorsements = skills.map(skill => ({
        endorser_id: currentUser.id,
        endorser_community_id: endorserProfile?.id,
        endorsed_id: userId,
        endorsed_community_id: endorsedProfile?.id,
        skill: skill
      }));
      
      const { error } = await window.supabase
        .from('endorsements')
        .insert(endorsements);
      
      if (error) throw error;
      
      closeModal();
      showToast(`✓ Successfully endorsed ${userName} for ${skills.length} skill(s)!`, 'success');
      
      // Dispatch event for UI updates
      window.dispatchEvent(new CustomEvent('endorsementAdded', { 
        detail: { userId, skills } 
      }));
      
    } catch (error) {
      console.error('Error submitting endorsements:', error);
      if (error.code === '23505') { // Unique constraint violation
        showToast('You have already endorsed some of these skills', 'error');
      } else {
        showToast('Failed to submit endorsements', 'error');
      }
    }
  }
  
  // Get skills already endorsed by current user for target user
  async function getEndorsedSkills(userId) {
    if (!currentUser) return [];
    
    try {
      const { data, error } = await window.supabase
        .from('endorsements')
        .select('skill')
        .eq('endorser_id', currentUser.id)
        .eq('endorsed_id', userId);
      
      if (error) throw error;
      return data ? data.map(e => e.skill) : [];
    } catch (error) {
      console.error('Error getting endorsed skills:', error);
      return [];
    }
  }
  
  // Get total endorsement count for a user
  async function getEndorsementCount(userId) {
    try {
      const { data, error } = await window.supabase
        .rpc('get_endorsement_count', { user_uuid: userId });
      
      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error getting endorsement count:', error);
      return 0;
    }
  }
  
  // Get endorsements grouped by skill for a user
  async function getSkillEndorsements(userId) {
    try {
      const { data, error } = await window.supabase
        .from('endorsements')
        .select('skill, endorser_id, endorser_community_id, created_at')
        .eq('endorsed_id', userId);
      
      if (error) throw error;
      
      // Group by skill
      const grouped = {};
      (data || []).forEach(endorsement => {
        if (!grouped[endorsement.skill]) {
          grouped[endorsement.skill] = [];
        }
        grouped[endorsement.skill].push(endorsement);
      });
      
      return grouped;
    } catch (error) {
      console.error('Error getting skill endorsements:', error);
      return {};
    }
  }
  
  // Add endorse button to user card
  function addEndorseButton(cardElement, userId, userName, skills) {
    // Check if button already exists
    if (cardElement.querySelector('.endorse-btn')) return;
    
    const actionsContainer = cardElement.querySelector('.card-actions, .user-card-actions');
    if (!actionsContainer) return;
    
    const endorseBtn = document.createElement('button');
    endorseBtn.className = 'action-btn endorse-btn';
    endorseBtn.innerHTML = '<i class="fas fa-star"></i> Endorse';
    endorseBtn.onclick = (e) => {
      e.stopPropagation();
      showEndorseModal(userId, userName, skills);
    };
    
    actionsContainer.appendChild(endorseBtn);
  }
  
  // Add endorsement badge to user card
  async function addEndorsementBadge(cardElement, userId) {
    const count = await getEndorsementCount(userId);
    
    if (count > 0) {
      const badge = document.createElement('div');
      badge.className = 'endorsement-badge';
      badge.innerHTML = `<i class="fas fa-star"></i> ${count} endorsement${count !== 1 ? 's' : ''}`;
      
      // Find where to insert badge
      const nameElement = cardElement.querySelector('.card-name, .user-name, h3');
      if (nameElement) {
        nameElement.parentNode.insertBefore(badge, nameElement.nextSibling);
      }
    }
  }
  
  // Utility: Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Utility: Show toast notification
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: ${type === 'error' ? '#f44' : type === 'success' ? '#0f0' : '#00e0ff'};
      color: ${type === 'error' || type === 'success' ? '#fff' : '#000'};
      padding: 1rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      z-index: 10000;
      animation: slideIn 0.3s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
  
  // Public API
  return {
    init,
    showEndorseModal,
    closeModal,
    submitEndorsements,
    getEndorsementCount,
    getSkillEndorsements,
    getEndorsedSkills,
    addEndorseButton,
    addEndorsementBadge
  };
})();

// Auto-initialize
if (typeof window !== 'undefined') {
  window.EndorsementsModule = EndorsementsModule;
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => EndorsementsModule.init());
  } else {
    EndorsementsModule.init();
  }
}
