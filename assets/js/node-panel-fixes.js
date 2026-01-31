// ================================================================
// NODE PANEL FIXES
// ================================================================
// Patches for node-panel.js to fix hardcoded values and add clickable elements

(() => {
  'use strict';

  const GUARD = '__CH_NODE_PANEL_FIXES_LOADED__';
  if (window[GUARD]) {
    console.log('⚠️ Node panel fixes already loaded');
    return;
  }
  window[GUARD] = true;

  console.log('🔧 Loading node panel fixes...');

  // Wait for NodePanel to be available
  const waitForNodePanel = setInterval(() => {
    if (window.NodePanel || window.showUserProfile) {
      clearInterval(waitForNodePanel);
      applyFixes();
    }
  }, 100);

  function applyFixes() {
    console.log('🔧 Applying node panel fixes...');

    // ================================================================
    // OVERRIDE: Show User Profile with Dynamic Level/Streak
    // ================================================================

    const originalShowUserProfile = window.showUserProfile || window.NodePanel?.showUserProfile;

    if (originalShowUserProfile) {
      const enhancedShowUserProfile = async function(userId) {
        console.log('👤 Enhanced user profile view for:', userId);

        // Get user data with level and streak
        const { data: user, error } = await window.supabase
          .from('community')
          .select('*')
          .eq('id', userId)
          .single();

        if (error || !user) {
          console.error('Error loading user:', error);
          return originalShowUserProfile.call(this, userId);
        }

        // Get dynamic level and streak
        const levelData = await window.ComprehensiveFixes.getUserLevelAndStreak(userId);

        // Create enhanced profile panel
        showEnhancedUserProfile(user, levelData);
      };

      // Replace the function
      if (window.NodePanel) {
        window.NodePanel.showUserProfile = enhancedShowUserProfile;
      }
      window.showUserProfile = enhancedShowUserProfile;
    }

    // ================================================================
    // OVERRIDE: Show Project Details with Clickable Elements
    // ================================================================

    const originalShowProjectDetails = window.showProjectDetails || window.NodePanel?.showProjectDetails;

    if (originalShowProjectDetails) {
      const enhancedShowProjectDetails = async function(projectId) {
        console.log('📋 Enhanced project details view for:', projectId);

        // Get project data
        const { data: project, error } = await window.supabase
          .from('projects')
          .select(`
            *,
            creator:community!projects_creator_id_fkey(id, name, image_url)
          `)
          .eq('id', projectId)
          .single();

        if (error || !project) {
          console.error('Error loading project:', error);
          return originalShowProjectDetails.call(this, projectId);
        }

        // Get project members
        const { data: members } = await window.supabase
          .from('project_members')
          .select(`
            *,
            user:community(id, name, image_url, skills)
          `)
          .eq('project_id', projectId);

        // Check if current user has a request
        const currentUser = window.currentUserProfile;
        let userRequest = null;
        if (currentUser) {
          userRequest = await window.ComprehensiveFixes.checkProjectRequest(projectId, currentUser.id);
        }

        // Show enhanced project panel
        showEnhancedProjectPanel(project, members || [], userRequest);
      };

      // Replace the function
      if (window.NodePanel) {
        window.NodePanel.showProjectDetails = enhancedShowProjectDetails;
      }
      window.showProjectDetails = enhancedShowProjectDetails;
    }

    console.log('✅ Node panel fixes applied');
  }

  // ================================================================
  // ENHANCED USER PROFILE PANEL
  // ================================================================

  function showEnhancedUserProfile(user, levelData) {
    const panel = document.getElementById('node-info-panel');
    if (!panel) return;

    const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
    const xpProgress = window.ComprehensiveFixes.xpProgressPercent(levelData.xp, levelData.level);
    const nextLevelXP = window.ComprehensiveFixes.xpForNextLevel(levelData.level);

    panel.innerHTML = `
      <div style="padding: 1.5rem; height: 100%; overflow-y: auto;">
        <!-- Close Button -->
        <button onclick="document.getElementById('node-info-panel').classList.remove('active')" style="
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: rgba(255,255,255,0.6);
          transition: all 0.2s;
          z-index: 10;
        " onmouseenter="this.style.background='rgba(255,255,255,0.2)'" onmouseleave="this.style.background='rgba(255,255,255,0.1)'">
          <i class="fas fa-times"></i>
        </button>

        <!-- Avatar -->
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <div style="width: 100px; height: 100px; border-radius: 50%; margin: 0 auto; overflow: hidden; border: 3px solid rgba(0,224,255,0.3); background: linear-gradient(135deg, #00e0ff, #0080ff); display: flex; align-items: center; justify-content: center; font-size: 2.5rem; color: white; font-weight: bold;">
            ${user.image_url ? `<img src="${user.image_url}" style="width: 100%; height: 100%; object-fit: cover;">` : initials}
          </div>
        </div>

        <!-- Name -->
        <h2 style="color: #00e0ff; text-align: center; margin-bottom: 0.5rem; font-size: 1.5rem;">
          ${user.name || 'Unknown User'}
        </h2>

        <!-- Stats Row -->
        <div style="display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 1.5rem; flex-wrap: wrap;">
          <!-- Level Badge -->
          <div style="padding: 0.5rem 1rem; background: rgba(0,224,255,0.15); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; display: flex; flex-direction: column; align-items: center; min-width: 120px;">
            <div style="color: #00e0ff; font-size: 0.75rem; font-weight: 600;">Level ${levelData.level}</div>
            <div style="color: #aaa; font-size: 0.65rem;">${levelData.levelTitle}</div>
            <div style="color: #888; font-size: 0.6rem; margin-top: 0.25rem;">${levelData.xp} / ${nextLevelXP} XP</div>
          </div>

          <!-- Streak Badge -->
          ${levelData.streak > 0 ? `
            <div style="padding: 0.5rem 1rem; background: rgba(255,59,48,0.15); border: 1px solid rgba(255,59,48,0.3); border-radius: 8px; display: flex; align-items: center; gap: 0.5rem;">
              <i class="fas fa-fire" style="color: #ff3b30; font-size: 1rem;"></i>
              <div style="display: flex; flex-direction: column;">
                <div style="color: #ff3b30; font-size: 0.85rem; font-weight: 700;">${levelData.streak} Day Streak</div>
                <div style="color: #ff8a80; font-size: 0.6rem;">Keep it going!</div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- XP Progress Bar -->
        <div style="margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.75rem; color: #aaa;">
            <span>Level ${levelData.level}</span>
            <span>${Math.round(xpProgress)}%</span>
            <span>Level ${levelData.level + 1}</span>
          </div>
          <div style="height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
            <div style="height: 100%; background: linear-gradient(90deg, #00e0ff, #00ff88); width: ${xpProgress}%; transition: width 0.3s;"></div>
          </div>
        </div>

        <!-- Bio -->
        ${user.bio ? `
          <div style="margin-bottom: 1.5rem;">
            <h4 style="color: rgba(255,255,255,0.8); font-size: 0.9rem; margin-bottom: 0.5rem;">About</h4>
            <p style="color: rgba(255,255,255,0.6); font-size: 0.9rem; line-height: 1.5;">${user.bio}</p>
          </div>
        ` : ''}

        <!-- Skills -->
        ${user.skills && user.skills.length > 0 ? `
          <div style="margin-bottom: 1.5rem;">
            <h4 style="color: rgba(255,255,255,0.8); font-size: 0.9rem; margin-bottom: 0.75rem;">Skills</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              ${user.skills.map(skill => `
                <span onclick="window.ComprehensiveFixes.showPeopleWithSkill('${skill}')" style="
                  padding: 0.4rem 0.75rem;
                  background: rgba(0,224,255,0.15);
                  border: 1px solid rgba(0,224,255,0.3);
                  border-radius: 12px;
                  font-size: 0.8rem;
                  color: #00e0ff;
                  cursor: pointer;
                  transition: all 0.2s;
                " onmouseenter="this.style.background='rgba(0,224,255,0.25)'" onmouseleave="this.style.background='rgba(0,224,255,0.15)'">
                  ${skill}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Interests -->
        ${user.interests && user.interests.length > 0 ? `
          <div style="margin-bottom: 1.5rem;">
            <h4 style="color: rgba(255,255,255,0.8); font-size: 0.9rem; margin-bottom: 0.75rem;">Interests</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              ${user.interests.map(interest => `
                <span style="padding: 0.4rem 0.75rem; background: rgba(255,170,0,0.15); border: 1px solid rgba(255,170,0,0.3); border-radius: 12px; font-size: 0.8rem; color: #ffaa00;">
                  ${interest}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Actions -->
        <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 2rem;">
          <button onclick="sendConnectionRequest('${user.id}')" style="
            width: 100%;
            padding: 0.75rem;
            background: linear-gradient(135deg, #00e0ff, #0080ff);
            border: none;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
          " onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform='translateY(0)'">
            <i class="fas fa-user-plus"></i> Connect
          </button>
          
          <button onclick="if(window.handleLogout) window.handleLogout()" style="
            width: 100%;
            padding: 0.75rem;
            background: rgba(255,107,107,0.2);
            border: 1px solid rgba(255,107,107,0.4);
            border-radius: 8px;
            color: #ff6b6b;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
          " onmouseenter="this.style.background='rgba(255,107,107,0.3)'" onmouseleave="this.style.background='rgba(255,107,107,0.2)'">
            <i class="fas fa-sign-out-alt"></i> Logout
          </button>
        </div>
      </div>
    `;

    panel.classList.add('active');
  }

  // ================================================================
  // ENHANCED PROJECT PANEL
  // ================================================================

  function showEnhancedProjectPanel(project, members, userRequest) {
    const panel = document.getElementById('node-info-panel');
    if (!panel) return;

    const currentUser = window.currentUserProfile;
    const isCreator = currentUser && project.creator_id === currentUser.id;

    panel.innerHTML = `
      <div style="padding: 1.5rem; height: 100%; overflow-y: auto; display: flex; flex-direction: column;">
        <!-- Close Button -->
        <button onclick="document.getElementById('node-info-panel').classList.remove('active')" style="
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: rgba(255,255,255,0.6);
          transition: all 0.2s;
          z-index: 10;
        " onmouseenter="this.style.background='rgba(255,255,255,0.2)'" onmouseleave="this.style.background='rgba(255,255,255,0.1)'">
          <i class="fas fa-times"></i>
        </button>

        <!-- Project Title -->
        <h2 style="color: #00e0ff; margin-bottom: 0.5rem; font-size: 1.5rem; padding-right: 2rem;">
          ${project.title}
        </h2>

        <!-- Created By (Clickable) -->
        <div onclick="window.ComprehensiveFixes.openProfile('${project.creator?.id || project.creator_id}')" style="
          color: rgba(255,255,255,0.6);
          font-size: 0.85rem;
          margin-bottom: 1.5rem;
          cursor: pointer;
          display: inline-block;
          transition: color 0.2s;
        " onmouseenter="this.style.color='#00e0ff'" onmouseleave="this.style.color='rgba(255,255,255,0.6)'">
          <i class="fas fa-user"></i> Created by ${project.creator?.name || 'Unknown'}
        </div>

        <!-- Description -->
        <div style="margin-bottom: 1.5rem; flex: 1; overflow-y: auto;">
          <h4 style="color: rgba(255,255,255,0.8); font-size: 0.9rem; margin-bottom: 0.5rem;">Description</h4>
          <p style="color: rgba(255,255,255,0.6); font-size: 0.9rem; line-height: 1.5;">${project.description}</p>
        </div>

        <!-- Required Skills (Clickable) -->
        ${project.required_skills && project.required_skills.length > 0 ? `
          <div style="margin-bottom: 1.5rem;">
            <h4 style="color: rgba(255,255,255,0.8); font-size: 0.9rem; margin-bottom: 0.75rem;">Required Skills</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              ${project.required_skills.map(skill => `
                <span onclick="window.ComprehensiveFixes.showPeopleWithSkill('${skill}')" style="
                  padding: 0.4rem 0.75rem;
                  background: rgba(255,107,107,0.15);
                  border: 1px solid rgba(255,107,107,0.3);
                  border-radius: 12px;
                  font-size: 0.8rem;
                  color: #ff6b6b;
                  cursor: pointer;
                  transition: all 0.2s;
                " onmouseenter="this.style.background='rgba(255,107,107,0.25)'" onmouseleave="this.style.background='rgba(255,107,107,0.15)'" title="Click to see people with this skill">
                  ${skill}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Project Members (Clickable) -->
        ${members.length > 0 ? `
          <div style="margin-bottom: 1.5rem; max-height: 200px; overflow-y: auto;">
            <h4 style="color: rgba(255,255,255,0.8); font-size: 0.9rem; margin-bottom: 0.75rem;">Team Members (${members.length})</h4>
            ${members.map(member => {
              const user = member.user;
              if (!user) return '';
              const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
              return `
                <div onclick="window.ComprehensiveFixes.openProfile('${user.id}')" style="
                  display: flex;
                  align-items: center;
                  gap: 0.75rem;
                  padding: 0.75rem;
                  background: rgba(0,224,255,0.05);
                  border: 1px solid rgba(0,224,255,0.2);
                  border-radius: 8px;
                  margin-bottom: 0.5rem;
                  cursor: pointer;
                  transition: all 0.2s;
                " onmouseenter="this.style.background='rgba(0,224,255,0.15)'" onmouseleave="this.style.background='rgba(0,224,255,0.05)'">
                  <div style="width: 36px; height: 36px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: linear-gradient(135deg, #00e0ff, #0080ff); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 0.9rem;">
                    ${user.image_url ? `<img src="${user.image_url}" style="width: 100%; height: 100%; object-fit: cover;">` : initials}
                  </div>
                  <div style="flex: 1;">
                    <div style="font-weight: 600; color: white; font-size: 0.9rem;">${user.name || 'Unknown'}</div>
                    <div style="color: rgba(255,255,255,0.5); font-size: 0.75rem;">${member.role || 'Member'}</div>
                  </div>
                  <i class="fas fa-chevron-right" style="color: rgba(255,255,255,0.3);"></i>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        <!-- Action Button -->
        ${!isCreator ? `
          <div style="margin-top: auto; padding-top: 1rem;">
            ${userRequest && userRequest.status === 'pending' ? `
              <button onclick="window.ComprehensiveFixes.withdrawProjectRequest('${userRequest.id}')" style="
                width: 100%;
                padding: 0.75rem;
                background: rgba(255,107,107,0.2);
                border: 1px solid rgba(255,107,107,0.4);
                border-radius: 8px;
                color: #ff6b6b;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
              " onmouseenter="this.style.background='rgba(255,107,107,0.3)'" onmouseleave="this.style.background='rgba(255,107,107,0.2)'">
                <i class="fas fa-times"></i> Withdraw Request
              </button>
            ` : `
              <button onclick="window.ComprehensiveFixes.submitProjectRequest('${project.id}', '${currentUser?.id || ''}')" style="
                width: 100%;
                padding: 0.75rem;
                background: linear-gradient(135deg, #00e0ff, #0080ff);
                border: none;
                border-radius: 8px;
                color: white;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
              " onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform='translateY(0)'">
                <i class="fas fa-hand-paper"></i> Request to Join
              </button>
            `}
          </div>
        ` : ''}
      </div>
    `;

    panel.classList.add('active');
  }

  console.log('✅ Node panel fixes module loaded');

})();
