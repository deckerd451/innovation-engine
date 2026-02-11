// ============================================================================
// START SEQUENCE - SEQUENTIAL DAILY DIGEST (REFACTORED)
// ============================================================================
// Simplified, step-by-step experience: Overview → Done
// ============================================================================

console.log('%c📰 START Sequential Digest - Loading', 'color:#0f8; font-weight:bold;');

class StartDailyDigest {
  constructor() {
    this.userData = null;
    this.currentStep = 0;
    this.steps = [];
    this.container = null;
  }

  /**
   * Main render - creates sequential flow
   */
  async render(data) {
    this.userData = data;
    this.steps = await this.buildSteps(data);
    this.currentStep = 0;

    return `
      <div class="sequential-digest-container">
        ${this.renderProgressBar()}
        <div id="step-content" class="step-content">
          ${await this.renderCurrentStep()}
        </div>
        ${this.renderNavigation()}
      </div>
    `;
  }

  /**
   * Build the sequence of steps based on user data
   * NEW FLOW: Overview → Completion
   */
  async buildSteps(data) {
    const steps = [];

    // Step 1: Overview Dashboard (combines welcome + network + messages)
    steps.push({
      id: 'overview',
      title: 'Overview',
      icon: '👋',
      render: () => this.renderOverviewStep(data)
    });

    // Step 2: Completion (always last)
    steps.push({
      id: 'completion',
      title: 'Complete',
      icon: '🎉',
      render: () => this.renderCompletionStep()
    });

    return steps;
  }

  /**
   * Render progress bar
   */
  renderProgressBar() {
    const progress = ((this.currentStep + 1) / this.steps.length) * 100;
    
    return `
      <div style="margin-bottom: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem;">
            Step ${this.currentStep + 1} of ${this.steps.length}
          </div>
          <div style="color: #00e0ff; font-size: 0.9rem; font-weight: 600;">
            ${Math.round(progress)}% Complete
          </div>
        </div>
        <div style="
          width: 100%;
          height: 8px;
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
          overflow: hidden;
        ">
          <div style="
            width: ${progress}%;
            height: 100%;
            background: linear-gradient(90deg, #00e0ff, #00ff88);
            transition: width 0.5s ease;
            border-radius: 4px;
          "></div>
        </div>
      </div>
    `;
  }

  /**
   * Render current step
   */
  async renderCurrentStep() {
    if (this.currentStep >= this.steps.length) {
      return this.renderCompletionStep();
    }

    const step = this.steps[this.currentStep];
    return await step.render();
  }

  /**
   * STEP 1: Overview Dashboard
   * Combines: Greeting + Streak + Network Stats + Unread Messages
   */
  async renderOverviewStep(data) {
    const profile = data.profile || {};
    const momentum = data.momentum || {};
    const streak = momentum.streak || {};
    const immediate = data.immediate_actions || {};
    const unreadMessages = immediate.unread_messages?.count || 0;
    
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    // Fetch network counts
    let counts = { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    try {
      counts = await this.fetchActualCounts();
    } catch (err) {
      console.warn('Failed to fetch counts:', err);
    }

    return `
      <div style="padding: 2rem;">
        <!-- Greeting Section (moved higher) -->
        <div style="text-align: center; margin-bottom: 2rem;">
          <div style="font-size: 3.5rem; margin-bottom: 0.75rem; animation: fadeInScale 0.6s ease;">
            ${this.getGreetingEmoji()}
          </div>
          <h2 style="color: #00e0ff; margin: 0 0 1rem 0; font-size: 1.8rem; animation: fadeIn 0.8s ease;">
            ${greeting}, ${profile.name || 'there'}!
          </h2>
          
          ${streak.current > 0 ? `
            <div style="
              display: inline-flex;
              align-items: center;
              gap: 0.5rem;
              background: linear-gradient(135deg, rgba(255,100,0,0.2), rgba(255,150,0,0.1));
              border: 2px solid rgba(255,100,0,0.4);
              border-radius: 12px;
              padding: 0.75rem 1.5rem;
              animation: fadeIn 1s ease;
            ">
              <span style="font-size: 1.5rem;">🔥</span>
              <span style="color: #fff; font-weight: 700; font-size: 1.2rem;">${streak.current}-day streak!</span>
            </div>
          ` : ''}
        </div>

        <!-- Network at a Glance -->
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #00e0ff; margin: 0 0 1rem 0; font-size: 1.3rem; text-align: center;">
            Your Network at a Glance
          </h3>
          
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1rem;">
            ${this.renderStatCard('Connections', counts.connections, 'users', '#00e0ff', 'viewConnections')}
            ${this.renderStatCard('Projects', counts.projects, 'rocket', '#a855f7', 'viewProjects')}
            ${this.renderStatCard('Themes', counts.themes, 'bullseye', '#ffaa00', 'viewThemes')}
            ${this.renderStatCard('Opportunities', counts.opportunities, 'briefcase', '#00ff88', 'viewOpportunities')}
          </div>

          <!-- Explore Opportunities Button -->
          <div style="text-align: center; margin-top: 1.5rem;">
            <a 
              href="/innovation-engine/explore.html"
              style="
                display: inline-block;
                background: linear-gradient(135deg, #00e0ff, #00ff88);
                border: none;
                border-radius: 12px;
                color: #000;
                padding: 1rem 2rem;
                font-weight: 700;
                font-size: 1rem;
                cursor: pointer;
                text-decoration: none;
                transition: all 0.3s;
                box-shadow: 0 4px 15px rgba(0,224,255,0.4);
                width: 100%;
                max-width: 400px;
              "
              onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(0,224,255,0.6)';"
              onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(0,224,255,0.4)';"
            >
              <i class="fas fa-compass" style="margin-right: 0.5rem;"></i>
              Explore Opportunities
            </a>
          </div>
        </div>

        <!-- Unread Messages (if any) -->
        ${unreadMessages > 0 ? `
          <div style="
            background: linear-gradient(135deg, rgba(255,170,0,0.2), rgba(255,136,0,0.1));
            border: 2px solid rgba(255,170,0,0.4);
            border-radius: 12px;
            padding: 1.25rem;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            transition: all 0.3s;
          "
          onclick="window.StartDailyDigest.openMessaging()"
          onmouseenter="this.style.background='linear-gradient(135deg, rgba(255,170,0,0.3), rgba(255,136,0,0.2))'; this.style.transform='translateY(-2px)';"
          onmouseleave="this.style.background='linear-gradient(135deg, rgba(255,170,0,0.2), rgba(255,136,0,0.1))'; this.style.transform='translateY(0)';"
          >
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="font-size: 2rem;">💬</div>
              <div>
                <div style="color: #ffaa00; font-weight: 700; font-size: 1.1rem;">
                  Unread Messages: ${unreadMessages}
                </div>
                <div style="color: rgba(255,255,255,0.7); font-size: 0.9rem;">
                  Click to view
                </div>
              </div>
            </div>
            <i class="fas fa-chevron-right" style="color: #ffaa00; font-size: 1.2rem;"></i>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * STEP 2: Completion Screen (Simplified)
   */
  renderCompletionStep() {
    return `
      <div style="padding: 3rem 2rem; text-align: center;">
        <div style="font-size: 4rem; margin-bottom: 1rem; animation: bounceIn 0.8s ease;">
          🎉
        </div>
        <h3 style="color: #00ff88; margin: 0 0 0.5rem 0; font-size: 1.8rem;">
          You're All Caught Up!
        </h3>
        <p style="color: rgba(255,255,255,0.7); margin: 0 0 2rem 0; font-size: 1.05rem; line-height: 1.6;">
          This digest summarizes your current network activity, suggested connections, and growth opportunities.
        </p>
        
        <div style="
          background: linear-gradient(135deg, rgba(0,224,255,0.1), rgba(0,255,136,0.1));
          border: 2px solid rgba(0,224,255,0.3);
          border-radius: 16px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        ">
          <p style="color: rgba(255,255,255,0.8); margin: 0 0 0.5rem 0; font-size: 0.95rem; font-weight: 600;">
            Download Report
          </p>
          <p style="color: rgba(255,255,255,0.6); margin: 0; font-size: 0.9rem; line-height: 1.5;">
            Get a PDF summary of your network insights and engagement metrics
          </p>
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
          <button
            onclick="window.StartDailyDigest.previousStep()"
            style="
              background: rgba(255,255,255,0.1);
              border: 1px solid rgba(255,255,255,0.3);
              border-radius: 12px;
              color: rgba(255,255,255,0.8);
              padding: 1rem 2rem;
              font-weight: 600;
              font-size: 1rem;
              cursor: pointer;
              transition: all 0.3s;
            "
            onmouseenter="this.style.background='rgba(255,255,255,0.15)';"
            onmouseleave="this.style.background='rgba(255,255,255,0.1)';"
          >
            ← Back
          </button>
          
          <button
            onclick="window.StartDailyDigest.closeAndExplore()"
            style="
              background: linear-gradient(135deg, #00e0ff, #00ff88);
              border: none;
              border-radius: 12px;
              color: #000;
              padding: 1rem 2rem;
              font-weight: 700;
              font-size: 1rem;
              cursor: pointer;
              transition: all 0.3s;
              box-shadow: 0 4px 15px rgba(0,224,255,0.4);
            "
            onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(0,224,255,0.6)';"
            onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(0,224,255,0.4)';"
          >
            Let's Go! →
          </button>
          
          <button
            onclick="window.StartDailyDigest.downloadReport()"
            style="
              background: rgba(255,170,0,0.2);
              border: 2px solid rgba(255,170,0,0.4);
              border-radius: 12px;
              color: #ffaa00;
              padding: 1rem 2rem;
              font-weight: 600;
              font-size: 1rem;
              cursor: pointer;
              transition: all 0.3s;
            "
            onmouseenter="this.style.background='rgba(255,170,0,0.3)';"
            onmouseleave="this.style.background='rgba(255,170,0,0.2)';"
          >
            <i class="fas fa-download" style="margin-right: 0.5rem;"></i>
            Download Report
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Navigation buttons
   */
  renderNavigation() {
    const isFirst = this.currentStep === 0;
    const isLast = this.currentStep >= this.steps.length - 1;
    
    return `
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 2rem;
        padding-top: 1.5rem;
        border-top: 1px solid rgba(255,255,255,0.1);
      ">
        <button
          id="prev-step-btn"
          onclick="window.StartDailyDigest.previousStep()"
          style="
            background: ${isFirst ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'};
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 8px;
            color: ${isFirst ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)'};
            padding: 0.75rem 1.5rem;
            font-weight: 600;
            cursor: ${isFirst ? 'not-allowed' : 'pointer'};
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          "
          ${isFirst ? 'disabled' : ''}
        >
          ← Back
        </button>
        
        <div style="display: flex; gap: 0.5rem;">
          ${this.steps.map((step, index) => `
            <div style="
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: ${index === this.currentStep ? '#00e0ff' : 'rgba(255,255,255,0.2)'};
              transition: all 0.3s;
            "></div>
          `).join('')}
        </div>
        
        <button
          id="next-step-btn"
          onclick="window.StartDailyDigest.nextStep()"
          style="
            background: linear-gradient(135deg, #00e0ff, #00ff88);
            border: none;
            border-radius: 8px;
            color: #000;
            padding: 0.75rem 1.5rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          "
        >
          ${isLast ? 'Finish' : 'Next'} →
        </button>
      </div>
    `;
  }

  // ============================================================================
  // NAVIGATION METHODS
  // ============================================================================

  async nextStep() {
    if (this.currentStep >= this.steps.length - 1) {
      this.currentStep++;
      await this.updateStepContent();
      return;
    }
    
    this.currentStep++;
    await this.updateStepContent();
  }

  async previousStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      await this.updateStepContent();
    }
  }

  async updateStepContent() {
    const container = document.querySelector('.sequential-digest-container');
    if (!container) return;
    
    const progressBar = container.firstElementChild;
    const stepContent = document.getElementById('step-content');
    const navigation = container.lastElementChild;
    
    // Fade out
    stepContent.style.opacity = '0';
    stepContent.style.transform = 'translateY(20px)';
    
    setTimeout(async () => {
      // Update content
      progressBar.outerHTML = this.renderProgressBar();
      stepContent.innerHTML = await this.renderCurrentStep();
      navigation.outerHTML = this.renderNavigation();
      
      // Fade in
      setTimeout(() => {
        stepContent.style.opacity = '1';
        stepContent.style.transform = 'translateY(0)';
      }, 50);
    }, 300);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  getGreetingEmoji() {
    const hour = new Date().getHours();
    if (hour < 12) return '🌅';
    if (hour < 18) return '☀️';
    return '🌙';
  }

  renderStatCard(label, value, icon, color, handler) {
    const clickHandler = handler ? `onclick="window.StartDailyDigest.${handler}()" style="cursor: pointer;"` : '';
    const hoverStyle = handler ? `
      onmouseenter="this.style.transform='translateY(-2px)'; this.style.borderColor='${color}';"
      onmouseleave="this.style.transform='translateY(0)'; this.style.borderColor='${color}40';"
    ` : '';
    
    return `
      <div ${clickHandler} ${hoverStyle} style="
        background: rgba(0,0,0,0.3);
        border: 2px solid ${color}40;
        border-radius: 12px;
        padding: 1.5rem;
        text-align: center;
        transition: all 0.2s;
      ">
        <i class="fas fa-${icon}" style="color: ${color}; font-size: 2rem; margin-bottom: 0.75rem; display: block;"></i>
        <div style="color: #fff; font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem;">
          ${value}
        </div>
        <div style="color: rgba(255,255,255,0.7); font-size: 0.95rem;">
          ${label}
        </div>
      </div>
    `;
  }

  async fetchActualCounts() {
    if (!window.supabase) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    
    const { data: { user } } = await window.supabase.auth.getUser();
    if (!user) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    
    const { data: profile } = await window.supabase
      .from('community')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    if (!profile) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    
    const communityId = profile.id;
    
    const [connectionsResult, themesResult, projectsResult, opportunitiesResult] = await Promise.all([
      window.supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`from_user_id.eq.${communityId},to_user_id.eq.${communityId}`),
      
      window.supabase
        .from('theme_participants')
        .select('theme_id', { count: 'exact', head: true })
        .eq('community_id', communityId),
      
      window.supabase
        .from('project_members')
        .select('project_id', { count: 'exact', head: true })
        .eq('user_id', communityId),
      
      window.supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
    ]);
    
    return {
      connections: connectionsResult.count || 0,
      themes: themesResult.count || 0,
      projects: projectsResult.count || 0,
      opportunities: opportunitiesResult.count || 0
    };
  }

  // ============================================================================
  // ACTION HANDLERS
  // ============================================================================

  openMessaging() {
    if (window.EnhancedStartUI) {
      window.EnhancedStartUI.close();
    }
    setTimeout(() => {
      if (window.EnhancedStartUI) {
        window.EnhancedStartUI.handleAction('openMessaging', { preventDefault: () => {}, stopPropagation: () => {} });
      }
    }, 300);
  }

  viewConnections() {
    if (window.EnhancedStartUI) {
      window.EnhancedStartUI.close();
    }
    setTimeout(() => {
      if (window.filterByNodeType) {
        window.filterByNodeType('person');
      }
    }, 300);
  }

  viewThemes() {
    if (window.EnhancedStartUI) {
      window.EnhancedStartUI.close();
    }
    setTimeout(() => {
      if (window.showView) {
        window.showView('synapse');
      }
      setTimeout(() => {
        if (window.filterSynapseByCategory) {
          window.filterSynapseByCategory('themes');
        }
      }, 500);
    }, 300);
  }

  viewProjects() {
    if (window.EnhancedStartUI) {
      window.EnhancedStartUI.close();
    }
    setTimeout(() => {
      if (window.filterByNodeType) {
        window.filterByNodeType('project');
      }
    }, 300);
  }

  viewOpportunities() {
    if (window.EnhancedStartUI) {
      window.EnhancedStartUI.close();
    }
    setTimeout(() => {
      if (window.showView) {
        window.showView('opportunities');
      } else if (window.filterByNodeType) {
        window.filterByNodeType('project');
      }
    }, 300);
  }

  closeAndExplore() {
    if (window.EnhancedStartUI) {
      window.EnhancedStartUI.close();
    }
  }

  downloadReport() {
    this.showToast('Report download feature coming soon!', 'info');
    // TODO: Implement PDF report generation
  }

  showToast(message, type = 'info') {
    const colors = {
      info: '#00e0ff',
      success: '#00ff88',
      warning: '#ffaa00',
      error: '#ff6b6b'
    };

    const color = colors[type] || colors.info;
    
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: ${color};
      color: ${type === 'info' || type === 'warning' ? '#000' : '#fff'};
      padding: 1rem 1.5rem;
      border-radius: 12px;
      font-weight: 600;
      z-index: 100001;
      box-shadow: 0 8px 25px rgba(0,0,0,0.5);
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// ============================================================================
// GLOBAL INSTANCE & STYLES
// ============================================================================

window.StartDailyDigest = new StartDailyDigest();

// Add CSS animations (idempotent)
if (!document.getElementById('start-daily-digest-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'start-daily-digest-styles';
  styleEl.textContent = `
    .step-content {
      transition: opacity 0.3s ease, transform 0.3s ease;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes fadeInScale {
      from {
        opacity: 0;
        transform: scale(0.8);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes bounceIn {
      0% {
        opacity: 0;
        transform: scale(0.3);
      }
      50% {
        transform: scale(1.05);
      }
      70% {
        transform: scale(0.9);
      }
      100% {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }

    @keyframes zoomIn {
      from {
        opacity: 0;
        transform: scale(0.5);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes fadeOut {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(styleEl);
}

console.log('✅ START Daily Digest ready (Refactored: 2-step flow)');
