/*
 * Endorsements Module - WITH INLINE CSS
 * File: assets/js/endorsements.js
 * 
 * REPLACE your current endorsements.js with this version
 * This includes the CSS inline to fix the invisible modal
 */

const EndorsementsModule = (function() {
  'use strict';
  
  let currentUser = null;
  let stylesInjected = false;
  
  // Inject CSS styles
  function injectStyles() {
    if (stylesInjected) return;
    
    const style = document.createElement('style');
    style.textContent = `
      /* Endorsement Modal */
      .endorse-modal {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex !important;
        align-items: center;
        justify-content: center;
        z-index: 15000;
        opacity: 0;
        transition: opacity 0.3s ease;
        padding: 1rem;
      }
      
      .endorse-modal.active {
        opacity: 1;
      }
      
      .endorse-modal-content {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid rgba(0, 224, 255, 0.3);
        border-radius: 12px;
        max-width: 500px;
        width: 100%;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        animation: modalSlideIn 0.3s ease;
      }
      
      @keyframes modalSlideIn {
        from { transform: scale(0.9) translateY(20px); opacity: 0; }
        to { transform: scale(1) translateY(0); opacity: 1; }
      }
      
      .endorse-modal .modal-header {
        padding: 1.5rem;
        border-bottom: 1px solid rgba(0, 224, 255, 0.2);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .endorse-modal .modal-header h3 {
        color: #ffd700;
        margin: 0;
        font-size: 1.5rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      
      .endorse-modal .modal-close {
        background: none;
        border: none;
        color: #888;
        font-size: 2rem;
        cursor: pointer;
        transition: color 0.3s ease;
        line-height: 1;
        padding: 0;
        width: 32px;
        height: 32px;
      }
      
      .endorse-modal .modal-close:hover {
        color: #fff;
      }
      
      .endorse-modal .modal-body {
        padding: 1.5rem;
        overflow-y: auto;
        flex: 1;
      }
      
      .skills-checklist {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      
      .skill-checkbox {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(0, 224, 255, 0.2);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s ease;
      }
      
      .skill-checkbox:hover:not(.disabled) {
        background: rgba(0, 224, 255, 0.05);
        border-color: #00e0ff;
      }
      
      .skill-checkbox.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .skill-checkbox input[type="checkbox"] {
        width: 20px;
        height: 20px;
        cursor: pointer;
        accent-color: #ffd700;
      }
      
      .skill-label {
        flex: 1;
        color: #fff;
        font-size: 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .already-endorsed {
        color: #ffd700;
        font-size: 0.85rem;
        font-weight: 600;
      }
      
      .endorse-modal .modal-footer {
        padding: 1.5rem;
        border-top: 1px solid rgba(0, 224, 255, 0.2);
        display: flex;
        gap: 1rem;
        justify-content: flex-end;
      }
      
      .btn-primary, .btn-secondary {
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        border: none;
        font-size: 1rem;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      
      .btn-primary {
        background: linear-gradient(135deg, #ffd700, #ffed4e);
        color: #000;
      }
      
      .btn-primary:hover {
        background: linear-gradient(135deg, #ffed4e, #ffd700);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(255, 215, 0, 0.4);
      }
      
      .btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }
      
      .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.15);
      }
      
      .endorsement-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.75rem;
        background: rgba(255, 215, 0, 0.1);
        border: 1px solid rgba(255, 215, 0, 0.3);
        border-radius: 12px;
        color: #ffd700;
        font-size: 0.85rem;
        font-weight: 600;
        margin-top: 0.5rem;
      }
      
      .endorse-btn {
        background: linear-gradient(135deg, #ffd700, #ffed4e);
        border: none;
        color: #000;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.3s ease;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
      }
      
      .endorse-btn:hover {
        background: linear-gradient(135deg, #ffed4e, #ffd700);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(255, 215, 0, 0.4);
      }
      
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
    
    document.head.appendChild(style);
    stylesInjected = true;
    console.log('✓ Endorsement styles injected');
  }
  
  // Initialize module
  async function init() {
    if (!window.supabase) {
      console.error('Supabase not available');
      return;
    }
    
    // Inject styles immediately
    injectStyles();
    
    const { data: { session } } = await window.supabase.auth.getSession();
    if (session) {
      currentUser = session.user;
    }
    
    console.log('✓ Endorsements module loaded');
  }
  
  // Show endorse modal
  async function showEndorseModal(userId, userName, skills) {
    // Make sure styles are injected
    injectStyles();
    
    if (!currentUser) {
      showToast('Please sign in to endorse', 'error');
      return;
    }
    
    if (userId === currentUser.id) {
      showToast('You cannot endorse yourself', 'error');
      return;
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      console.warn('Invalid user ID format:', userId);
      showToast('Invalid user ID', 'error');
      return;
    }
    
    // Parse skills
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
    
    // Check already endorsed
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
      const { data: endorserProfile, error: endorserError } = await window.supabase
        .from('community')
        .select('id')
        .eq('user_id', currentUser.id)
        .single();
      
      if (endorserError) {
        console.error('Error getting endorser profile:', endorserError);
        showToast('Could not find your profile', 'error');
        return;
      }
      
      const { data: endorsedProfile, error: endorsedError } = await window.supabase
        .from('community')
        .select('id')
        .eq('user_id', userId)
        .single();
      
      if (endorsedError) {
        console.error('Error getting endorsed profile:', endorsedError);
        showToast('Could not find user profile', 'error');
        return;
      }
      
      const endorsements = skills.map(skill => ({
        endorser_id: endorserProfile?.id,           // Use community table ID
        endorser_community_id: endorserProfile?.id,  // Keep for compatibility
        endorsed_id: endorsedProfile?.id,            // Use community table ID
        endorsed_community_id: endorsedProfile?.id,  // Keep for compatibility
        skill: skill
      }));
      
      const { error } = await window.supabase
        .from('endorsements')
        .insert(endorsements);
      
      if (error) {
        console.error('Insert error:', error);
        throw error;
      }
      
      closeModal();
      showToast(`✓ Successfully endorsed ${userName} for ${skills.length} skill(s)!`, 'success');
      
      window.dispatchEvent(new CustomEvent('endorsementAdded', { 
        detail: { userId, skills } 
      }));
      
    } catch (error) {
      console.error('Error submitting endorsements:', error);
      if (error.code === '23505') {
        showToast('You have already endorsed some of these skills', 'error');
      } else {
        showToast('Failed to submit endorsements', 'error');
      }
    }
  }
  
  // Get endorsed skills
  async function getEndorsedSkills(userId) {
    if (!currentUser) return [];
    
    try {
      const { data, error } = await window.supabase
        .from('endorsements')
        .select('skill')
        .eq('endorser_id', currentUser.id)
        .eq('endorsed_id', userId);
      
      if (error) {
        console.error('Error getting endorsed skills:', error);
        return [];
      }
      
      return data ? data.map(e => e.skill) : [];
    } catch (error) {
      console.error('Error getting endorsed skills:', error);
      return [];
    }
  }
  
  // Get endorsement count
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
  
  // Get skill endorsements
  async function getSkillEndorsements(userId) {
    try {
      const { data, error } = await window.supabase
        .from('endorsements')
        .select('skill, endorser_id, endorser_community_id, created_at')
        .eq('endorsed_id', userId);
      
      if (error) throw error;
      
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
  
  // Add endorse button
  function addEndorseButton(cardElement, userId, userName, skills) {
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
  
  // Add endorsement badge
  async function addEndorsementBadge(cardElement, userId) {
    const count = await getEndorsementCount(userId);
    
    if (count > 0) {
      const badge = document.createElement('div');
      badge.className = 'endorsement-badge';
      badge.innerHTML = `<i class="fas fa-star"></i> ${count} endorsement${count !== 1 ? 's' : ''}`;
      
      const nameElement = cardElement.querySelector('.card-name, .user-name, h3');
      if (nameElement) {
        nameElement.parentNode.insertBefore(badge, nameElement.nextSibling);
      }
    }
  }
  
  // Utility functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
  
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: ${type === 'error' ? '#f44' : type === 'success' ? '#4caf50' : '#00e0ff'};
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
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => EndorsementsModule.init());
  } else {
    EndorsementsModule.init();
  }
}
