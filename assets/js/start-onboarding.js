// ================================================================
// START SEQUENCE - ONBOARDING FLOW
// ================================================================
// Multi-step wizard for first-time users
// Guides users through profile → themes → connections → projects
// ================================================================

console.log('%c🎯 START Onboarding - Loading', 'color:#0f8; font-weight:bold;');

class StartOnboarding {
  constructor() {
    this.currentStep = 0;
    this.totalSteps = 4;
    this.userData = null;
  }

  /**
   * Render the onboarding flow
   */
  async render(data) {
    this.userData = data;
    const step = data.profile?.onboarding_step || 0;
    this.currentStep = step;

    return `
      <div class="onboarding-container">
        ${this.renderProgress()}
        ${this.renderCurrentStep()}
      </div>
    `;
  }

  /**
   * Render progress indicator
   */
  renderProgress() {
    const steps = [
      { num: 1, label: 'Profile', icon: 'user' },
      { num: 2, label: 'Interests', icon: 'bullseye' },
      { num: 3, label: 'Connect', icon: 'users' },
      { num: 4, label: 'Explore', icon: 'rocket' }
    ];

    return `
      <div class="onboarding-progress" style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
        padding: 0 1rem;
      ">
        ${steps.map((step, index) => {
          const isActive = index === this.currentStep;
          const isCompleted = index < this.currentStep;

          return `
            <div class="progress-step" style="
              display: flex;
              flex-direction: column;
              align-items: center;
              flex: 1;
              position: relative;
            ">
              ${index > 0 ? `
                <div style="
                  position: absolute;
                  top: 20px;
                  right: 50%;
                  width: 100%;
                  height: 3px;
                  background: ${isCompleted ? '#00ff88' : 'rgba(255,255,255,0.1)'};
                  z-index: 0;
                "></div>
              ` : ''}

              <div style="
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: ${isActive ? 'linear-gradient(135deg, #00ff88, #00e0ff)' : isCompleted ? '#00ff88' : 'rgba(255,255,255,0.1)'};
                border: 2px solid ${isActive ? '#00ff88' : isCompleted ? '#00ff88' : 'rgba(255,255,255,0.2)'};
                display: flex;
                align-items: center;
                justify-content: center;
                color: ${isActive || isCompleted ? '#000' : 'rgba(255,255,255,0.5)'};
                font-weight: 700;
                z-index: 1;
                position: relative;
                transition: all 0.3s ease;
              ">
                ${isCompleted ? '<i class="fas fa-check"></i>' : `<i class="fas fa-${step.icon}"></i>`}
              </div>

              <span style="
                margin-top: 0.5rem;
                font-size: 0.75rem;
                color: ${isActive ? '#00ff88' : isCompleted ? '#00e0ff' : 'rgba(255,255,255,0.5)'};
                font-weight: ${isActive ? '600' : '400'};
              ">
                ${step.label}
              </span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * Render the current step
   */
  renderCurrentStep() {
    switch (this.currentStep) {
      case 0:
        return this.renderStep1_Profile();
      case 1:
        return this.renderStep2_Interests();
      case 2:
        return this.renderStep3_Connect();
      case 3:
        return this.renderStep4_Explore();
      default:
        return this.renderComplete();
    }
  }

  /**
   * Step 1: Complete Profile
   */
  renderStep1_Profile() {
    const profile = this.userData.profile || {};
    const hasBasicInfo = profile.name && profile.bio;
    const hasSkills = profile.skills && profile.skills.length > 0;

    return `
      <div class="onboarding-step">
        <div style="text-align: center; margin-bottom: 2rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">👋</div>
          <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0;">Welcome to CharlestonHacks!</h2>
          <p style="color: rgba(255,255,255,0.7);">
            Let's start by setting up your profile so others can find and connect with you.
          </p>
        </div>

        <div style="
          background: linear-gradient(135deg, rgba(0,255,136,0.1), rgba(0,224,255,0.05));
          border: 2px solid rgba(0,255,136,0.3);
          border-radius: 16px;
          padding: 2rem;
          margin-bottom: 2rem;
        ">
          <h3 style="color: #00ff88; margin: 0 0 1rem 0; font-size: 1.1rem;">
            <i class="fas fa-user-circle"></i> Your Profile
          </h3>

          <div style="display: flex; flex-direction: column; gap: 1rem;">
            <div class="profile-check" style="
              display: flex;
              align-items: center;
              gap: 1rem;
              padding: 1rem;
              background: rgba(0,0,0,0.3);
              border-radius: 12px;
              border: 1px solid ${hasBasicInfo ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.1)'};
            ">
              <div style="
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: ${hasBasicInfo ? '#00ff88' : 'rgba(255,255,255,0.1)'};
                display: flex;
                align-items: center;
                justify-content: center;
                color: #000;
                flex-shrink: 0;
              ">
                ${hasBasicInfo ? '<i class="fas fa-check"></i>' : '<i class="fas fa-user"></i>'}
              </div>
              <div style="flex: 1;">
                <div style="color: #fff; font-weight: 600; margin-bottom: 0.25rem;">
                  Basic Information
                </div>
                <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem;">
                  ${hasBasicInfo ? 'Name and bio added' : 'Add your name and a short bio'}
                </div>
              </div>
            </div>

            <div class="profile-check" style="
              display: flex;
              align-items: center;
              gap: 1rem;
              padding: 1rem;
              background: rgba(0,0,0,0.3);
              border-radius: 12px;
              border: 1px solid ${hasSkills ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.1)'};
            ">
              <div style="
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: ${hasSkills ? '#00ff88' : 'rgba(255,255,255,0.1)'};
                display: flex;
                align-items: center;
                justify-content: center;
                color: #000;
                flex-shrink: 0;
              ">
                ${hasSkills ? '<i class="fas fa-check"></i>' : '<i class="fas fa-code"></i>'}
              </div>
              <div style="flex: 1;">
                <div style="color: #fff; font-weight: 600; margin-bottom: 0.25rem;">
                  Skills & Interests
                </div>
                <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem;">
                  ${hasSkills ? `${profile.skills.length} skills added` : 'Add your skills and interests'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
          <button onclick="window.StartOnboarding.editProfile()" style="
            background: linear-gradient(135deg, #00e0ff, #0080ff);
            border: none;
            border-radius: 12px;
            color: #000;
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            min-width: 200px;
          ">
            <i class="fas fa-edit"></i> ${hasBasicInfo ? 'Edit Profile' : 'Complete Profile'}
          </button>

          ${hasBasicInfo && hasSkills ? `
            <button onclick="window.StartOnboarding.nextStep()" style="
              background: linear-gradient(135deg, #00ff88, #00e0ff);
              border: none;
              border-radius: 12px;
              color: #000;
              padding: 1rem 2rem;
              font-size: 1.1rem;
              font-weight: 700;
              cursor: pointer;
              transition: all 0.2s;
              min-width: 200px;
            ">
              Next: Choose Interests <i class="fas fa-arrow-right"></i>
            </button>
          ` : ''}
        </div>

        <div style="text-align: center; margin-top: 1.5rem;">
          <button onclick="window.StartOnboarding.skip()" style="
            background: transparent;
            border: none;
            color: rgba(255,255,255,0.5);
            padding: 0.5rem 1rem;
            font-size: 0.9rem;
            cursor: pointer;
          ">
            Skip for now
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Step 2: Choose Interests / Themes
   */
  renderStep2_Interests() {
    const opportunities = this.userData.opportunities || {};
    const themeCount = opportunities.active_themes?.count || 0;

    return `
      <div class="onboarding-step">
        <div style="text-align: center; margin-bottom: 2rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🎯</div>
          <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0;">Choose Your Interests</h2>
          <p style="color: rgba(255,255,255,0.7);">
            Follow themes that match your interests to discover projects and connect with like-minded people.
          </p>
        </div>

        <div style="
          background: linear-gradient(135deg, rgba(255,170,0,0.1), rgba(255,136,0,0.05));
          border: 2px solid rgba(255,170,0,0.3);
          border-radius: 16px;
          padding: 2rem;
          margin-bottom: 2rem;
          text-align: center;
        ">
          <div style="font-size: 2.5rem; margin-bottom: 1rem;">
            <i class="fas fa-bullseye" style="color: #ffaa00;"></i>
          </div>
          <h3 style="color: #ffaa00; margin: 0 0 1rem 0;">
            ${themeCount > 0 ? `${themeCount} Active Themes` : 'Themes Coming Soon'}
          </h3>
          <p style="color: rgba(255,255,255,0.7); margin-bottom: 2rem;">
            ${themeCount > 0
              ? 'Browse and follow themes to stay updated on projects, discussions, and opportunities.'
              : 'Themes will be created by community leaders. Check back soon to join conversations!'}
          </p>

          ${themeCount > 0 ? `
            <button onclick="window.StartOnboarding.browseThemes()" style="
              background: linear-gradient(135deg, #ffaa00, #ff8800);
              border: none;
              border-radius: 12px;
              color: #000;
              padding: 1rem 2rem;
              font-size: 1.1rem;
              font-weight: 700;
              cursor: pointer;
              min-width: 200px;
            ">
              <i class="fas fa-search"></i> Browse Themes
            </button>
          ` : ''}
        </div>

        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
          <button onclick="window.StartOnboarding.previousStep()" style="
            background: transparent;
            border: 2px solid rgba(0,224,255,0.4);
            border-radius: 12px;
            color: #00e0ff;
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            min-width: 150px;
          ">
            <i class="fas fa-arrow-left"></i> Back
          </button>

          <button onclick="window.StartOnboarding.nextStep()" style="
            background: linear-gradient(135deg, #00ff88, #00e0ff);
            border: none;
            border-radius: 12px;
            color: #000;
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 700;
            cursor: pointer;
            min-width: 200px;
          ">
            Next: Connect with People <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Step 3: Connect with People
   */
  renderStep3_Connect() {
    const network = this.userData.network_insights || {};
    const connectionCount = network.connections?.total || 0;

    return `
      <div class="onboarding-step">
        <div style="text-align: center; margin-bottom: 2rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">👥</div>
          <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0;">Build Your Network</h2>
          <p style="color: rgba(255,255,255,0.7);">
            Connect with innovators, creators, and collaborators in the CharlestonHacks community.
          </p>
        </div>

        <div style="
          background: linear-gradient(135deg, rgba(168,85,247,0.1), rgba(139,92,246,0.05));
          border: 2px solid rgba(168,85,247,0.3);
          border-radius: 16px;
          padding: 2rem;
          margin-bottom: 2rem;
          text-align: center;
        ">
          <div style="font-size: 2.5rem; margin-bottom: 1rem;">
            <i class="fas fa-users" style="color: #a855f7;"></i>
          </div>
          <h3 style="color: #a855f7; margin: 0 0 1rem 0;">
            ${connectionCount > 0 ? `You have ${connectionCount} connections` : 'Start Building Connections'}
          </h3>
          <p style="color: rgba(255,255,255,0.7); margin-bottom: 2rem;">
            ${connectionCount > 0
              ? 'Great start! Keep expanding your network to discover more opportunities.'
              : 'Explore the community and send connection requests to people who share your interests.'}
          </p>

          <button onclick="window.StartOnboarding.explorePeople()" style="
            background: linear-gradient(135deg, #a855f7, #8b5cf6);
            border: none;
            border-radius: 12px;
            color: #fff;
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 700;
            cursor: pointer;
            min-width: 200px;
          ">
            <i class="fas fa-search"></i> Find People
          </button>
        </div>

        <div style="
          background: rgba(0,224,255,0.05);
          border: 1px solid rgba(0,224,255,0.2);
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        ">
          <h4 style="color: #00e0ff; margin: 0 0 1rem 0; font-size: 1rem;">
            <i class="fas fa-lightbulb"></i> Pro Tips
          </h4>
          <ul style="margin: 0; padding-left: 1.5rem; color: rgba(255,255,255,0.7);">
            <li style="margin-bottom: 0.5rem;">Look for people in your themes of interest</li>
            <li style="margin-bottom: 0.5rem;">Check skills to find complementary collaborators</li>
            <li>Send personalized connection requests</li>
          </ul>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
          <button onclick="window.StartOnboarding.previousStep()" style="
            background: transparent;
            border: 2px solid rgba(0,224,255,0.4);
            border-radius: 12px;
            color: #00e0ff;
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            min-width: 150px;
          ">
            <i class="fas fa-arrow-left"></i> Back
          </button>

          <button onclick="window.StartOnboarding.nextStep()" style="
            background: linear-gradient(135deg, #00ff88, #00e0ff);
            border: none;
            border-radius: 12px;
            color: #000;
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 700;
            cursor: pointer;
            min-width: 200px;
          ">
            Next: Explore Projects <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Step 4: Explore Projects
   */
  renderStep4_Explore() {
    const opportunities = this.userData.opportunities || {};
    const projectCount = opportunities.skill_matched_projects?.count || 0;

    return `
      <div class="onboarding-step">
        <div style="text-align: center; margin-bottom: 2rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🚀</div>
          <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0;">Discover Projects</h2>
          <p style="color: rgba(255,255,255,0.7);">
            Join exciting projects or create your own. Collaborate, innovate, and build together!
          </p>
        </div>

        <div style="
          background: linear-gradient(135deg, rgba(0,255,136,0.1), rgba(0,224,255,0.05));
          border: 2px solid rgba(0,255,136,0.3);
          border-radius: 16px;
          padding: 2rem;
          margin-bottom: 2rem;
          text-align: center;
        ">
          <div style="font-size: 2.5rem; margin-bottom: 1rem;">
            <i class="fas fa-rocket" style="color: #00ff88;"></i>
          </div>
          <h3 style="color: #00ff88; margin: 0 0 1rem 0;">
            ${projectCount > 0 ? `${projectCount} Projects Match Your Skills` : 'Ready to Start Building?'}
          </h3>
          <p style="color: rgba(255,255,255,0.7); margin-bottom: 2rem;">
            ${projectCount > 0
              ? 'We found projects that match your skills. Check them out and collaborate!'
              : 'Browse projects or create your own to start collaborating with the community.'}
          </p>

          <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
            <button onclick="window.StartOnboarding.browseProjects()" style="
              background: linear-gradient(135deg, #00ff88, #00e0ff);
              border: none;
              border-radius: 12px;
              color: #000;
              padding: 1rem 2rem;
              font-size: 1rem;
              font-weight: 700;
              cursor: pointer;
            ">
              <i class="fas fa-search"></i> Browse Projects
            </button>

            <button onclick="window.StartOnboarding.createProject()" style="
              background: transparent;
              border: 2px solid rgba(0,255,136,0.4);
              border-radius: 12px;
              color: #00ff88;
              padding: 1rem 2rem;
              font-size: 1rem;
              font-weight: 600;
              cursor: pointer;
            ">
              <i class="fas fa-plus"></i> Create Project
            </button>
          </div>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
          <button onclick="window.StartOnboarding.previousStep()" style="
            background: transparent;
            border: 2px solid rgba(0,224,255,0.4);
            border-radius: 12px;
            color: #00e0ff;
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            min-width: 150px;
          ">
            <i class="fas fa-arrow-left"></i> Back
          </button>

          <button onclick="window.StartOnboarding.completeOnboarding()" style="
            background: linear-gradient(135deg, #00ff88, #00e0ff);
            border: none;
            border-radius: 12px;
            color: #000;
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 700;
            cursor: pointer;
            min-width: 200px;
            box-shadow: 0 8px 25px rgba(0,255,136,0.4);
          ">
            Complete Setup <i class="fas fa-check"></i>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render completion screen
   */
  renderComplete() {
    return `
      <div class="onboarding-step" style="text-align: center;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🎉</div>
        <h2 style="color: #00ff88; margin: 0 0 1rem 0;">Welcome to the Network!</h2>
        <p style="color: rgba(255,255,255,0.7); font-size: 1.1rem; margin-bottom: 2rem;">
          You're all set! Start exploring the dashboard to discover connections, projects, and opportunities.
        </p>

        <button onclick="window.EnhancedStartUI.close()" style="
          background: linear-gradient(135deg, #00ff88, #00e0ff);
          border: none;
          border-radius: 12px;
          color: #000;
          padding: 1.5rem 3rem;
          font-size: 1.2rem;
          font-weight: 700;
          cursor: pointer;
        ">
          <i class="fas fa-rocket"></i> Go to Dashboard
        </button>
      </div>
    `;
  }

  // ================================================================
  // ACTION HANDLERS
  // ================================================================

  async nextStep() {
    console.log('🔄 Moving to next onboarding step from', this.currentStep, 'to', this.currentStep + 1);
    this.currentStep++;

    // Update onboarding step in database
    if (window.supabase) {
      try {
        const { data: { user }, error: userError } = await window.supabase.auth.getUser();
        
        if (userError) {
          console.error('❌ Failed to get user:', userError);
          throw userError;
        }
        
        if (!user) {
          console.error('❌ No user found');
          throw new Error('User not authenticated');
        }

        console.log('📝 Calling update_onboarding_step with:', {
          auth_user_id: user.id,
          step_number: this.currentStep
        });

        const { data, error } = await window.supabase.rpc('update_onboarding_step', {
          auth_user_id: user.id,
          step_number: this.currentStep
        });

        if (error) {
          console.error('❌ RPC error:', error);
          throw error;
        }

        console.log('✅ Onboarding step updated in database:', data);
        
      } catch (error) {
        console.error('❌ Failed to update onboarding step:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        
        // Show error to user
        if (window.EnhancedStartUI && window.EnhancedStartUI.showToast) {
          window.EnhancedStartUI.showToast(
            'Failed to save progress. Please try again.',
            'error'
          );
        }
        
        // Don't proceed if database update failed
        this.currentStep--; // Revert step increment
        return;
      }
    }

    // Re-render with updated step
    try {
      console.log('🎨 Re-rendering START UI with step:', this.currentStep);
      
      // Clear the cache so we get fresh data
      if (window.clearStartSequenceCache) {
        window.clearStartSequenceCache();
      }
      
      await window.EnhancedStartUI.open();
      
    } catch (error) {
      console.error('❌ Failed to re-render START UI:', error);
      // Fallback: just close the modal
      if (window.EnhancedStartUI && window.EnhancedStartUI.close) {
        window.EnhancedStartUI.close();
      }
    }
  }

  async previousStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      await window.EnhancedStartUI.open();
    }
  }

  async skip() {
    this.currentStep = 4; // Jump to end
    await this.completeOnboarding();
  }

  async completeOnboarding() {
    // Mark onboarding as complete
    if (window.supabase) {
      try {
        const { data: { user } } = await window.supabase.auth.getUser();
        if (user) {
          await window.supabase.rpc('complete_onboarding', {
            auth_user_id: user.id
          });
        }
      } catch (error) {
        console.error('Failed to complete onboarding:', error);
      }
    }

    // Show completion
    this.currentStep = 4;
    await window.EnhancedStartUI.open();
  }

  editProfile() {
    // Close START modal and open profile editor
    window.EnhancedStartUI.close();

    setTimeout(() => {
      if (window.openProfile) {
        window.openProfile();
      } else {
        window.EnhancedStartUI.showToast('Opening profile editor...', 'info');
        // Fallback: click the profile button
        const profileBtn = document.querySelector('[onclick*="openProfile"]');
        if (profileBtn) profileBtn.click();
      }
    }, 300);
  }

  browseThemes() {
    window.EnhancedStartUI.close();

    setTimeout(() => {
      // Switch to circle view if in cards mode
      if (window.toggleThemeStrategy && typeof window.toggleThemeStrategy === 'function') {
        const currentStrategy = window.currentStrategy || 'new';
        if (currentStrategy === 'new') {
          window.toggleThemeStrategy();
        }
      } else {
        // Fallback: click themes filter
        const themesBtn = document.querySelector('[data-category="themes"]');
        if (themesBtn) themesBtn.click();
      }
    }, 300);
  }

  explorePeople() {
    window.EnhancedStartUI.close();

    setTimeout(() => {
      if (window.filterByNodeType) {
        window.filterByNodeType('person');
      } else {
        const peopleBtn = document.querySelector('[data-category="people"]');
        if (peopleBtn) peopleBtn.click();
      }
    }, 300);
  }

  browseProjects() {
    window.EnhancedStartUI.close();

    setTimeout(() => {
      if (window.openProjectsModal) {
        window.openProjectsModal();
      } else {
        window.EnhancedStartUI.showToast('Projects feature coming soon!', 'info');
      }
    }, 300);
  }

  createProject() {
    window.EnhancedStartUI.close();

    setTimeout(() => {
      if (window.openProjectsModal) {
        window.openProjectsModal();
        // TODO: Auto-open "Create Project" form
      } else {
        window.EnhancedStartUI.showToast('Projects feature coming soon!', 'info');
      }
    }, 300);
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.StartOnboarding = new StartOnboarding();

console.log('✅ START Onboarding ready');
