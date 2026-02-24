// ================================================================
// COMPREHENSIVE FIXES MODULE
// ================================================================
// Fixes for UI/UX issues, level/streak calculations, clickable elements, etc.

(() => {
  'use strict';

  const GUARD = '__CH_COMPREHENSIVE_FIXES_LOADED__';
  if (window[GUARD]) {
    console.log('⚠️ Comprehensive fixes already loaded');
    return;
  }
  window[GUARD] = true;

  console.log('🔧 Loading comprehensive fixes...');

  // ================================================================
  // LEVEL & STREAK CALCULATIONS
  // ================================================================

  function calculateLevel(xp) {
    // Level formula: Level = floor(sqrt(XP / 100)) + 1
    return Math.floor(Math.sqrt(xp / 100)) + 1;
  }

  function getLevelTitle(level) {
    if (level >= 10) return 'Legend';
    if (level >= 8) return 'Master';
    if (level >= 6) return 'Leader';
    if (level >= 4) return 'Expert';
    if (level >= 2) return 'Explorer';
    return 'Newcomer';
  }

  function xpForNextLevel(currentLevel) {
    return (currentLevel * currentLevel) * 100;
  }

  function xpProgressPercent(currentXP, currentLevel) {
    const currentLevelXP = ((currentLevel - 1) * (currentLevel - 1)) * 100;
    const nextLevelXP = xpForNextLevel(currentLevel);
    const xpInLevel = currentXP - currentLevelXP;
    const xpNeeded = nextLevelXP - currentLevelXP;
    return Math.min(100, Math.max(0, (xpInLevel / xpNeeded) * 100));
  }

  async function getUserLevelAndStreak(userId) {
    try {
      const { data, error } = await window.supabase
        .from('community')
        .select('total_xp, level, current_streak, last_activity_date')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching level/streak:', error);
        return { level: 1, levelTitle: 'Newcomer', xp: 0, streak: 0 };
      }

      const xp = data.total_xp || 0;
      const level = data.level || calculateLevel(xp);
      const levelTitle = getLevelTitle(level);
      const streak = data.current_streak || 0;

      return { level, levelTitle, xp, streak };

    } catch (err) {
      console.error('Error getting level/streak:', err);
      return { level: 1, levelTitle: 'Newcomer', xp: 0, streak: 0 };
    }
  }

  // ================================================================
  // PROFILE OPENING HELPER
  // ================================================================

  function openProfile(userId) {
    console.log('👤 Opening profile for user:', userId);
    
    // Try multiple methods to open profile
    if (typeof window.openUserProfile === 'function') {
      window.openUserProfile(userId);
    } else if (typeof window.showUserProfile === 'function') {
      window.showUserProfile(userId);
    } else if (typeof window.NodePanel?.showUserProfile === 'function') {
      window.NodePanel.showUserProfile(userId);
    } else {
      console.warn('No profile opening function available');
      // Fallback: show alert
      alert('Profile viewing feature is being loaded. Please try again in a moment.');
    }
  }

  // ================================================================
  // SKILL CLICK HANDLER
  // ================================================================

  async function showPeopleWithSkill(skill) {
    console.log('🔍 Finding people with skill:', skill);

    try {
      const { data, error } = await window.supabase
        .from('community')
        .select('id, name, image_url, bio, skills')
        .contains('skills', [skill])
        .limit(50);

      if (error) throw error;

      const people = data || [];
      console.log(`Found ${people.length} people with skill: ${skill}`);

      // Show modal with results
      showPeopleModal(skill, people);

    } catch (err) {
      console.error('Error finding people with skill:', err);
      alert('Error finding people with this skill. Please try again.');
    }
  }

  function showPeopleModal(skill, people) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 1rem;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: linear-gradient(135deg, rgba(20,20,40,0.98), rgba(10,10,30,0.98));
      border: 1px solid rgba(0,224,255,0.3);
      border-radius: 16px;
      padding: 2rem;
      max-width: 600px;
      width: 100%;
      max-height: 80vh;
      overflow-y: auto;
    `;

    const header = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <h2 style="color: #00e0ff; margin: 0;">
          <i class="fas fa-users"></i> People with "${skill}"
        </h2>
        <button class="close-modal" style="
          background: transparent;
          border: none;
          color: rgba(255,255,255,0.6);
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
        ">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    let peopleHTML = '';
    if (people.length === 0) {
      peopleHTML = `
        <div style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.5);">
          <i class="fas fa-user-slash" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
          <p>No one has this skill yet</p>
        </div>
      `;
    } else {
      people.forEach(person => {
        const initials = person.name ? person.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
        peopleHTML += `
          <div onclick="window.ComprehensiveFixes.openProfile('${person.id}')" style="
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            background: rgba(0,224,255,0.05);
            border: 1px solid rgba(0,224,255,0.2);
            border-radius: 8px;
            margin-bottom: 0.75rem;
            cursor: pointer;
            transition: all 0.2s;
          " onmouseenter="this.style.background='rgba(0,224,255,0.15)'" onmouseleave="this.style.background='rgba(0,224,255,0.05)'">
            <div style="width: 48px; height: 48px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: linear-gradient(135deg, #00e0ff, #0080ff); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white;">
              ${person.image_url ? `<img src="${person.image_url}" style="width: 100%; height: 100%; object-fit: cover;">` : initials}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; color: white; margin-bottom: 0.25rem;">${person.name || 'Unknown'}</div>
              ${person.bio ? `<div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${person.bio}</div>` : ''}
            </div>
            <i class="fas fa-chevron-right" style="color: rgba(255,255,255,0.3);"></i>
          </div>
        `;
      });
    }

    content.innerHTML = header + peopleHTML;
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Close handlers
    const closeBtn = content.querySelector('.close-modal');
    closeBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  // ================================================================
  // PROJECT REQUEST MANAGEMENT
  // ================================================================

  async function checkProjectRequest(projectId, userId) {
    try {
      const { data, error } = await window.supabase
        .from('project_requests')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        console.error('Error checking project request:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Error checking project request:', err);
      return null;
    }
  }

  async function withdrawProjectRequest(requestId) {
    try {
      const { error } = await window.supabase
        .from('project_requests')
        .update({ status: 'withdrawn' })
        .eq('id', requestId);

      if (error) throw error;

      console.log('✅ Project request withdrawn');
      showToast('Request withdrawn successfully', 'success');
      
      // Refresh the panel
      if (typeof window.refreshCurrentPanel === 'function') {
        window.refreshCurrentPanel();
      }

    } catch (err) {
      console.error('Error withdrawing request:', err);
      showToast('Error withdrawing request', 'error');
    }
  }

  async function submitProjectRequest(projectId, userId, message = '') {
    try {
      const { data, error } = await window.supabase
        .from('project_requests')
        .insert([{
          project_id: projectId,
          user_id: userId,
          status: 'pending',
          message: message
        }])
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Project request submitted');
      showToast('Request submitted successfully!', 'success');

      // Create notification for project creator
      const { data: project } = await window.supabase
        .from('projects')
        .select('creator_id, title')
        .eq('id', projectId)
        .single();

      if (project) {
        await createNotification(
          project.creator_id,
          'project_request',
          'New Project Request',
          `Someone wants to join your project: ${project.title}`,
          `/?project=${projectId}`
        );
      }

      return data;

    } catch (err) {
      console.error('Error submitting project request:', err);
      showToast('Error submitting request', 'error');
      throw err;
    }
  }

  // ================================================================
  // ORGANIZATION JOIN REQUEST
  // ================================================================

  async function submitOrganizationJoinRequest(orgId, userId) {
    try {
      // Check if already a member or has pending request
      const { data: existing } = await window.supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', orgId)
        .eq('community_id', userId)
        .single();

      if (existing) {
        if (existing.status === 'active') {
          showToast('You are already a member of this organization', 'info');
          return;
        } else if (existing.status === 'pending') {
          showToast('You already have a pending request', 'info');
          return;
        }
      }

      // Submit join request
      const { error } = await window.supabase
        .from('organization_members')
        .insert([{
          organization_id: orgId,
          community_id: userId,
          role: 'member',
          status: 'pending'
        }]);

      if (error) throw error;

      console.log('✅ Organization join request submitted');
      showToast('Join request submitted! The organization will review your request.', 'success');

      // Get organization details and owner
      const { data: org } = await window.supabase
        .from('organizations')
        .select('name, created_by')
        .eq('id', orgId)
        .single();

      if (org && org.created_by) {
        // Notify organization owner
        await createNotification(
          org.created_by,
          'org_join_request',
          'New Organization Join Request',
          `Someone wants to join ${org.name}`,
          `/organization-admin.html?org=${orgId}`
        );
      }

    } catch (err) {
      console.error('Error submitting organization join request:', err);
      showToast('Error submitting join request', 'error');
    }
  }

  // ================================================================
  // NOTIFICATION HELPER
  // ================================================================

  async function createNotification(userId, type, title, message, link = null) {
    try {
      const { error } = await window.supabase
        .from('notifications')
        .insert([{
          user_id: userId,
          type: type,
          title: title,
          message: message,
          link: link,
          read: false
        }]);

      if (error) throw error;
      console.log('✅ Notification created');

    } catch (err) {
      console.error('Error creating notification:', err);
    }
  }

  // ================================================================
  // TOAST NOTIFICATIONS
  // ================================================================

  function showToast(message, type = 'info') {
    const colors = {
      success: { bg: 'rgba(0,255,136,0.9)', border: '#00ff88' },
      error: { bg: 'rgba(255,107,107,0.9)', border: '#ff6b6b' },
      info: { bg: 'rgba(0,224,255,0.9)', border: '#00e0ff' },
      warning: { bg: 'rgba(255,170,0,0.9)', border: '#ffaa00' }
    };

    const color = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: ${color.bg};
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      border: 2px solid ${color.border};
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10001;
      animation: slideInUp 0.3s ease;
      max-width: 400px;
      font-weight: 600;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOutDown 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ================================================================
  // FIX BLUE BAR ON PROFILE PAGES
  // ================================================================

  function fixBlueBarOverlay() {
    // Remove any blue bars or overlays that might be interfering
    const style = document.createElement('style');
    style.id = 'fix-blue-bar';
    style.textContent = `
      /* Remove blue bar overlay from profile pages */
      .profile-overlay-bar,
      .blue-bar-overlay {
        display: none !important;
      }

      /* Ensure profile modal content is not overlapped */
      #profile-modal .modal-content {
        z-index: 1000;
        position: relative;
      }

      /* Fix any absolute positioned elements that might overlap */
      .ch-profile-top {
        position: relative;
        z-index: 1;
      }
    `;
    document.head.appendChild(style);
  }

  // ================================================================
  // FIX PROJECTS PANEL SCROLLING
  // ================================================================

  function fixProjectsPanelScrolling() {
    const style = document.createElement('style');
    style.id = 'fix-projects-scrolling';
    style.textContent = `
      /* Make project details panel scrollable */
      .project-details-panel,
      .project-info-content {
        overflow-y: auto !important;
        max-height: calc(100vh - 200px) !important;
      }

      /* Ensure project members list is scrollable */
      .project-members-list {
        overflow-y: auto !important;
        max-height: 300px !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ================================================================
  // INITIALIZE FIXES
  // ================================================================

  function init() {
    console.log('🔧 Initializing comprehensive fixes...');

    // Apply CSS fixes
    fixBlueBarOverlay();
    fixProjectsPanelScrolling();

    // Add toast animation styles
    const animStyle = document.createElement('style');
    animStyle.textContent = `
      @keyframes slideInUp {
        from {
          transform: translateY(100px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      @keyframes slideOutDown {
        from {
          transform: translateY(0);
          opacity: 1;
        }
        to {
          transform: translateY(100px);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(animStyle);

    console.log('✅ Comprehensive fixes initialized');
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ================================================================
  // PUBLIC API
  // ================================================================

  window.ComprehensiveFixes = {
    // Level & Streak
    calculateLevel,
    getLevelTitle,
    xpForNextLevel,
    xpProgressPercent,
    getUserLevelAndStreak,

    // Profile
    openProfile,

    // Skills
    showPeopleWithSkill,

    // Projects
    checkProjectRequest,
    withdrawProjectRequest,
    submitProjectRequest,

    // Organizations
    submitOrganizationJoinRequest,

    // Notifications
    createNotification,
    showToast
  };

  console.log('✅ Comprehensive fixes module loaded');

})();
