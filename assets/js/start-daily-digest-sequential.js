// ============================================================================
// START SEQUENCE - SEQUENTIAL DAILY DIGEST
// ============================================================================
// Progressive, step-by-step experience that guides users through their day
// ============================================================================

console.log('%c📰 START Sequential Digest - Loading', 'color:#0f8; font-weight:bold;');

class StartSequentialDigest {
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
   */
  async buildSteps(data) {
    const steps = [];
    const whatsNew = data.whats_new || {};
    const immediate = data.immediate_actions || {};

    // Step 1: Welcome (always first)
    steps.push({
      id: 'welcome',
      title: 'Welcome Back',
      icon: '👋',
      render: () => this.renderWelcomeStep(data)
    });

    // Step 2: Urgent actions (if any)
    if (immediate.pending_requests?.count > 0) {
      steps.push({
        id: 'connection-requests',
        title: 'Connection Requests',
        icon: '🤝',
        count: immediate.pending_requests.count,
        render: () => this.renderConnectionRequestsStep(immediate.pending_requests)
      });
    }

    if (immediate.unread_messages?.count > 0) {
      steps.push({
        id: 'messages',
        title: 'New Messages',
        icon: '💬',
        count: immediate.unread_messages.count,
        render: () => this.renderMessagesStep(immediate.unread_messages)
      });
    }

    // Step 3: What's New (if any updates)
    const hasUpdates = this.hasAnyUpdates(whatsNew);
    if (hasUpdates) {
      if (whatsNew.new_connections > 0) {
        steps.push({
          id: 'new-connections',
          title: 'New Connections',
          icon: '✨',
          count: whatsNew.new_connections,
          render: () => this.renderNewConnectionsStep(whatsNew)
        });
      }

      if (whatsNew.new_projects_in_themes > 0) {
        steps.push({
          id: 'new-projects',
          title: 'New Projects',
          icon: '🚀',
          count: whatsNew.new_projects_in_themes,
          render: () => this.renderNewProjectsStep(whatsNew)
        });
      }
    }

    // Step 4: Your Network Overview
    steps.push({
      id: 'network',
      title: 'Your Network',
      icon: '📊',
      render: () => this.renderNetworkStep(data)
    });

    // Step 5: Suggestions (always last)
    steps.push({
      id: 'suggestions',
      title: 'Suggested Actions',
      icon: '💡',
      render: () => this.renderSuggestionsStep(data)
    });

    return steps;
  }

  hasAnyUpdates(whatsNew) {
    return (
      (whatsNew.new_connection_requests || 0) > 0 ||
      (whatsNew.new_messages || 0) > 0 ||
      (whatsNew.new_connections || 0) > 0 ||
      (whatsNew.new_projects_in_themes || 0) > 0 ||
      (whatsNew.new_theme_members || 0) > 0
    );
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
   * STEP 1: Welcome
   */
  renderWelcomeStep(data) {
    const profile = data.profile || {};
    const momentum = data.momentum || {};
    const streak = momentum.streak || {};
    const lastLogin = data.previous_login ? new Date(data.previous_login) : null;
    const timeAgo = lastLogin ? this.getTimeAgo(lastLogin) : 'a while';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    return `
      <div style="text-align: center; padding: 3rem 2rem;">
        <div style="font-size: 4rem; margin-bottom: 1rem; animation: fadeInScale 0.6s ease;">
          ${this.getGreetingEmoji()}
        </div>
        <h2 style="color: #00e0ff; margin: 0 0 1rem 0; font-size: 2rem; animation: fadeIn 0.8s ease;">
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
            margin-bottom: 1rem;
            animation: fadeIn 1s ease;
          ">
            <span style="font-size: 1.5rem;">🔥</span>
            <span style="color: #fff; font-weight: 700; font-size: 1.2rem;">${streak.current}-day streak!</span>
          </div>
        ` : ''}
        <p style="color: rgba(255,255,255,0.7); margin: 1.5rem 0 0 0; font-size: 1.1rem; animation: fadeIn 1.2s ease;">
          Last seen ${timeAgo}
        </p>
        <p style="color: rgba(255,255,255,0.5); margin: 1rem 0 0 0; font-size: 0.95rem; animation: fadeIn 1.4s ease;">
          Let's see what's new for you today
        </p>
      </div>
    `;
  }

  /**
   * STEP 2: Connection Requests
   */
  renderConnectionRequestsStep(pendingRequests) {
    const items = pendingRequests.items || [];
    
    return `
      <div style="padding: 2rem;">
        <div style="text-align: center; margin-bottom: 2rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🤝</div>
          <h3 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.5rem;">
            ${items.length} ${items.length === 1 ? 'Person Wants' : 'People Want'} to Connect
          </h3>
          <p style="color: rgba(255,255,255,0.6); margin: 0;">
            Review and respond to connection requests
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 1rem; max-height: 400px; overflow-y: auto;">
          ${items.map(req => `
            <div class="connection-request-item" data-request-id="${req.id}" style="
              background: linear-gradient(135deg, rgba(0,224,255,0.1), rgba(0,0,0,0.1));
              border: 2px solid rgba(0,224,255,0.3);
              border-radius: 12px;
              padding: 1.25rem;
              display: flex;
              align-items: center;
              gap: 1rem;
              transition: all 0.3s;
            ">
              <div 
                class="profile-photo-clickable"
                onclick="window.StartSequentialDigest.enlargePhoto(this)"
                data-photo-url="${req.photo_url || ''}"
                data-user-name="${req.from_user_name || req.from_name || 'Someone'}"
                style="
                  width: 56px;
                  height: 56px;
                  background: linear-gradient(135deg, #00e0ff, #0080ff);
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 1.8rem;
                  flex-shrink: 0;
                  cursor: pointer;
                  transition: transform 0.2s, box-shadow 0.2s;
                "
                onmouseenter="this.style.transform='scale(1.1)'; this.style.boxShadow='0 4px 15px rgba(0,224,255,0.5)';"
                onmouseleave="this.style.transform='scale(1)'; this.style.boxShadow='none';"
              >
                👤
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="color: #fff; font-weight: 600; font-size: 1.1rem; margin-bottom: 0.25rem;">
                  ${req.from_user_name || req.from_name || 'Someone'}
                </div>
                <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem;">
                  ${req.created_at ? this.getTimeAgo(new Date(req.created_at)) : 'Recently'}
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
                <button
                  class="accept-connection-btn"
                  data-request-id="${req.id}"
                  onclick="window.StartSequentialDigest.acceptConnection('${req.id}')"
                  style="
                    background: #00ff88;
                    border: none;
                    border-radius: 8px;
                    color: #000;
                    padding: 0.75rem 1.25rem;
                    font-weight: 600;
                    font-size: 0.95rem;
                    cursor: pointer;
                    transition: all 0.2s;
                  "
                >
                  ✓ Accept
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * STEP 3: Messages
   */
  renderMessagesStep(unreadMessages) {
    const count = unreadMessages.count || 0;
    
    return `
      <div style="padding: 2rem; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">💬</div>
        <h3 style="color: #ffaa00; margin: 0 0 0.5rem 0; font-size: 1.5rem;">
          ${count} New ${count === 1 ? 'Message' : 'Messages'}
        </h3>
        <p style="color: rgba(255,255,255,0.6); margin: 0 0 2rem 0;">
          You have unread messages waiting for you
        </p>
        
        <button
          onclick="window.StartSequentialDigest.openMessaging()"
          style="
            background: linear-gradient(135deg, #ffaa00, #ff8800);
            border: none;
            border-radius: 12px;
            color: #000;
            padding: 1rem 2rem;
            font-weight: 700;
            font-size: 1.1rem;
            cursor: pointer;
            transition: all 0.3s;
            box-shadow: 0 4px 15px rgba(255,170,0,0.4);
          "
          onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(255,170,0,0.6)';"
          onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(255,170,0,0.4)';"
        >
          Read Messages →
        </button>
      </div>
    `;
  }

  /**
   * STEP 4: New Connections
   */
  renderNewConnectionsStep(whatsNew) {
    const count = whatsNew.new_connections || 0;
    
    return `
      <div style="padding: 2rem; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">✨</div>
        <h3 style="color: #00ff88; margin: 0 0 0.5rem 0; font-size: 1.5rem;">
          ${count} New ${count === 1 ? 'Connection' : 'Connections'}!
        </h3>
        <p style="color: rgba(255,255,255,0.6); margin: 0 0 2rem 0;">
          ${count === 1 ? 'Someone accepted' : 'People accepted'} your connection request
        </p>
        
        <button
          onclick="window.StartSequentialDigest.viewConnections()"
          style="
            background: linear-gradient(135deg, #00ff88, #00cc66);
            border: none;
            border-radius: 12px;
            color: #000;
            padding: 1rem 2rem;
            font-weight: 700;
            font-size: 1.1rem;
            cursor: pointer;
            transition: all 0.3s;
            box-shadow: 0 4px 15px rgba(0,255,136,0.4);
          "
          onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(0,255,136,0.6)';"
          onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(0,255,136,0.4)';"
        >
          View Network →
        </button>
      </div>
    `;
  }

  /**
   * STEP 5: New Projects
   */
  renderNewProjectsStep(whatsNew) {
    const count = whatsNew.new_projects_in_themes || 0;
    
    return `
      <div style="padding: 2rem; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🚀</div>
        <h3 style="color: #a855f7; margin: 0 0 0.5rem 0; font-size: 1.5rem;">
          ${count} New ${count === 1 ? 'Project' : 'Projects'} in Your Themes
        </h3>
        <p style="color: rgba(255,255,255,0.6); margin: 0 0 2rem 0;">
          Discover new collaboration opportunities
        </p>
        
        <button
          onclick="window.StartSequentialDigest.viewProjects()"
          style="
            background: linear-gradient(135deg, #a855f7, #8833dd);
            border: none;
            border-radius: 12px;
            color: #fff;
            padding: 1rem 2rem;
            font-weight: 700;
            font-size: 1.1rem;
            cursor: pointer;
            transition: all 0.3s;
            box-shadow: 0 4px 15px rgba(168,85,247,0.4);
          "
          onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(168,85,247,0.6)';"
          onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(168,85,247,0.4)';"
        >
          Explore Projects →
        </button>
      </div>
    `;
  }

  /**
   * STEP 6: Network Overview
   */
  async renderNetworkStep(data) {
    const network = data.network_insights || {};
    const opportunities = data.opportunities || {};
    
    let connectionsCount = network.connections?.total || 0;
    let themesCount = opportunities.active_themes?.count || 0;
    let projectsCount = network.active_projects?.count || 0;
    let opportunitiesCount = opportunities.skill_matched_projects?.count || 0;
    
    if (connectionsCount === 0 || themesCount === 0 || projectsCount === 0) {
      try {
        const counts = await this.fetchActualCounts();
        connectionsCount = counts.connections;
        themesCount = counts.themes;
        projectsCount = counts.projects;
        opportunitiesCount = counts.opportunities;
      } catch (err) {
        console.warn('Failed to fetch actual counts:', err);
      }
    }

    return `
      <div style="padding: 2rem;">
        <div style="text-align: center; margin-bottom: 2rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">📊</div>
          <h3 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.5rem;">
            Your Network at a Glance
          </h3>
          <p style="color: rgba(255,255,255,0.6); margin: 0;">
            Here's what you're connected to
          </p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
          ${this.renderStatCard('Connections', connectionsCount, 'users', '#00e0ff', 'viewConnections')}
          ${this.renderStatCard('Themes', themesCount, 'bullseye', '#ffaa00', 'viewThemes')}
          ${this.renderStatCard('Projects', projectsCount, 'rocket', '#a855f7', 'viewProjects')}
          ${this.renderStatCard('Opportunities', opportunitiesCount, 'briefcase', '#00ff88', 'viewOpportunities')}
        </div>
      </div>
    `;
  }

  /**
   * STEP 7: Suggestions
   */
  renderSuggestionsStep(data) {
    return `
      <div style="padding: 2rem; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">💡</div>
        <h3 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.5rem;">
          Suggested Actions
        </h3>
        <p style="color: rgba(255,255,255,0.6); margin: 0 0 2rem 0;">
          Here's what you can do next
        </p>
        
        <div style="display: flex; flex-direction: column; gap: 1rem; max-width: 400px; margin: 0 auto;">
          <button
            onclick="window.StartSequentialDigest.exploreNetwork()"
            style="
              background: linear-gradient(135deg, rgba(0,224,255,0.2), rgba(0,128,255,0.1));
              border: 2px solid rgba(0,224,255,0.4);
              border-radius: 12px;
              color: #00e0ff;
              padding: 1rem 1.5rem;
              font-weight: 600;
              font-size: 1rem;
              cursor: pointer;
              transition: all 0.3s;
              text-align: left;
              display: flex;
              align-items: center;
              gap: 1rem;
            "
            onmouseenter="this.style.background='linear-gradient(135deg, rgba(0,224,255,0.3), rgba(0,128,255,0.2))'; this.style.transform='translateX(4px)';"
            onmouseleave="this.style.background='linear-gradient(135deg, rgba(0,224,255,0.2), rgba(0,128,255,0.1))'; this.style.transform='translateX(0)';"
          >
            <span style="font-size: 1.5rem;">🌐</span>
            <span>Explore the Network</span>
          </button>
          
          <button
            onclick="window.StartSequentialDigest.findProjects()"
            style="
              background: linear-gradient(135deg, rgba(168,85,247,0.2), rgba(136,51,221,0.1));
              border: 2px solid rgba(168,85,247,0.4);
              border-radius: 12px;
              color: #a855f7;
              padding: 1rem 1.5rem;
              font-weight: 600;
              font-size: 1rem;
              cursor: pointer;
              transition: all 0.3s;
              text-align: left;
              display: flex;
              align-items: center;
              gap: 1rem;
            "
            onmouseenter="this.style.background='linear-gradient(135deg, rgba(168,85,247,0.3), rgba(136,51,221,0.2))'; this.style.transform='translateX(4px)';"
            onmouseleave="this.style.background='linear-gradient(135deg, rgba(168,85,247,0.2), rgba(136,51,221,0.1))'; this.style.transform='translateX(0)';"
          >
            <span style="font-size: 1.5rem;">🚀</span>
            <span>Find Projects to Join</span>
          </button>
          
          <button
            onclick="window.StartSequentialDigest.connectWithPeople()"
            style="
              background: linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,204,102,0.1));
              border: 2px solid rgba(0,255,136,0.4);
              border-radius: 12px;
              color: #00ff88;
              padding: 1rem 1.5rem;
              font-weight: 600;
              font-size: 1rem;
              cursor: pointer;
              transition: all 0.3s;
              text-align: left;
              display: flex;
              align-items: center;
              gap: 1rem;
            "
            onmouseenter="this.style.background='linear-gradient(135deg, rgba(0,255,136,0.3), rgba(0,204,102,0.2))'; this.style.transform='translateX(4px)';"
            onmouseleave="this.style.background='linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,204,102,0.1))'; this.style.transform='translateX(0)';"
          >
            <span style="font-size: 1.5rem;">👥</span>
            <span>Connect with People</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Completion Step
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
        <p style="color: rgba(255,255,255,0.7); margin: 0 0 2rem 0; font-size: 1.1rem;">
          You've reviewed everything new since your last visit
        </p>
        
        <div style="
          background: linear-gradient(135deg, rgba(0,224,255,0.1), rgba(0,255,136,0.1));
          border: 2px solid rgba(0,224,255,0.3);
          border-radius: 16px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        ">
          <p style="color: rgba(255,255,255,0.8); margin: 0; font-size: 1rem; line-height: 1.6;">
            Ready to make an impact? Explore the network, join projects, or connect with new people.
          </p>
        </div>
        
        <button
          onclick="window.StartSequentialDigest.closeAndExplore()"
          style="
            background: linear-gradient(135deg, #00e0ff, #00ff88);
            border: none;
            border-radius: 12px;
            color: #000;
            padding: 1rem 2rem;
            font-weight: 700;
            font-size: 1.1rem;
            cursor: pointer;
            transition: all 0.3s;
            box-shadow: 0 4px 15px rgba(0,224,255,0.4);
          "
          onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(0,224,255,0.6)';"
          onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(0,224,255,0.4)';"
        >
          Let's Go! →
        </button>
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
          onclick="window.StartSequentialDigest.previousStep()"
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
          onclick="window.StartSequentialDigest.nextStep()"
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
    if (this.currentStep >= this.steps.length) {
      this.closeAndExplore();
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
    const progressBar = document.querySelector('.sequential-digest-container').firstElementChild;
    const stepContent = document.getElementById('step-content');
    const navigation = document.querySelector('.sequential-digest-container').lastElementChild;
    
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

  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }

  renderStatCard(label, value, icon, color, handler) {
    const clickHandler = handler ? `onclick="window.StartSequentialDigest.${handler}()" style="cursor: pointer;"` : '';
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

  async acceptConnection(connectionId) {
    try {
      const { acceptConnectionRequest } = await import('./connections.js');
      
      const button = document.querySelector(`.accept-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accepting...';
      }
      
      const result = await acceptConnectionRequest(connectionId);
      
      if (result.success) {
        const item = document.querySelector(`.connection-request-item[data-request-id="${connectionId}"]`);
        if (item) {
          item.style.opacity = '0';
          item.style.transform = 'translateX(100px)';
          setTimeout(() => item.remove(), 300);
        }
        
        this.showToast('Connection accepted!', 'success');
        
        // Auto-advance if no more requests
        setTimeout(() => {
          const remainingRequests = document.querySelectorAll('.connection-request-item');
          if (remainingRequests.length === 0) {
            this.nextStep();
          }
        }, 1000);
      } else {
        throw new Error('Failed to accept connection');
      }
    } catch (error) {
      console.error('Error accepting connection:', error);
      this.showToast('Failed to accept connection', 'error');
      
      const button = document.querySelector(`.accept-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = false;
        button.innerHTML = '✓ Accept';
      }
    }
  }

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

  exploreNetwork() {
    this.closeAndExplore();
  }

  findProjects() {
    if (window.EnhancedStartUI) {
      window.EnhancedStartUI.close();
    }
    setTimeout(() => {
      if (window.filterByNodeType) {
        window.filterByNodeType('project');
      }
    }, 300);
  }

  connectWithPeople() {
    if (window.EnhancedStartUI) {
      window.EnhancedStartUI.close();
    }
    setTimeout(() => {
      if (window.filterByNodeType) {
        window.filterByNodeType('person');
      }
    }, 300);
  }

  closeAndExplore() {
    if (window.EnhancedStartUI) {
      window.EnhancedStartUI.close();
    }
  }
  /**
   * Enlarge/minimize profile photo on click
   */
  enlargePhoto(photoElement) {
    const photoUrl = photoElement.dataset.photoUrl;
    const userName = photoElement.dataset.userName;

    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'photo-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100002;
      animation: fadeIn 0.3s ease;
      cursor: pointer;
    `;

    // Create photo container
    const photoContainer = document.createElement('div');
    photoContainer.style.cssText = `
      position: relative;
      max-width: 90%;
      max-height: 90%;
      animation: zoomIn 0.3s ease;
    `;

    // Create enlarged photo
    const enlargedPhoto = document.createElement('div');
    enlargedPhoto.style.cssText = `
      width: 400px;
      height: 400px;
      background: linear-gradient(135deg, #00e0ff, #0080ff);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12rem;
      box-shadow: 0 20px 60px rgba(0, 224, 255, 0.5);
      border: 4px solid rgba(0, 224, 255, 0.8);
    `;
    enlargedPhoto.textContent = '👤';

    // Create user name label
    const nameLabel = document.createElement('div');
    nameLabel.style.cssText = `
      position: absolute;
      bottom: -60px;
      left: 50%;
      transform: translateX(-50%);
      color: #00e0ff;
      font-size: 1.5rem;
      font-weight: 700;
      text-align: center;
      white-space: nowrap;
    `;
    nameLabel.textContent = userName;

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕';
    closeButton.style.cssText = `
      position: absolute;
      top: -50px;
      right: -50px;
      background: rgba(255, 255, 255, 0.1);
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      width: 40px;
      height: 40px;
      color: #fff;
      font-size: 1.5rem;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeButton.onmouseenter = () => {
      closeButton.style.background = 'rgba(255, 255, 255, 0.2)';
      closeButton.style.transform = 'scale(1.1)';
    };
    closeButton.onmouseleave = () => {
      closeButton.style.background = 'rgba(255, 255, 255, 0.1)';
      closeButton.style.transform = 'scale(1)';
    };

    // Assemble modal
    photoContainer.appendChild(enlargedPhoto);
    photoContainer.appendChild(nameLabel);
    photoContainer.appendChild(closeButton);
    modal.appendChild(photoContainer);

    // Close modal on click
    const closeModal = () => {
      modal.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => modal.remove(), 300);
    };

    modal.onclick = closeModal;
    closeButton.onclick = (e) => {
      e.stopPropagation();
      closeModal();
    };

    // Prevent closing when clicking on photo
    photoContainer.onclick = (e) => e.stopPropagation();

    document.body.appendChild(modal);
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
      color: ${type === 'info' ? '#000' : '#fff'};
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

window.StartSequentialDigest = new StartSequentialDigest();

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
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
document.head.appendChild(style);

console.log('✅ START Sequential Digest ready');

  async fetchActualCounts() {
    if (!window.supabase) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    const { data: { user } } = await window.supabase.auth.getUser();
    if (!user) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    const { data: profile } = await window.supabase.from('community').select('id').eq('user_id', user.id).single();
    if (!profile) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    const communityId = profile.id;
    const [connectionsResult, themesResult, projectsResult, opportunitiesResult] = await Promise.all([
      window.supabase.from('connections').select('id', { count: 'exact', head: true }).eq('status', 'accepted').or(`from_user_id.eq.${communityId},to_user_id.eq.${communityId}`),
      window.supabase.from('theme_participants').select('theme_id', { count: 'exact', head: true }).eq('community_id', communityId),
      window.supabase.from('project_members').select('project_id', { count: 'exact', head: true }).eq('user_id', communityId),
      window.supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'open')
    ]);
    return {
      connections: connectionsResult.count || 0,
      themes: themesResult.count || 0,
      projects: projectsResult.count || 0,
      opportunities: opportunitiesResult.count || 0
    };
  }

  async acceptConnection(connectionId) {
    try {
      const { acceptConnectionRequest } = await import('./connections.js');
      const button = document.querySelector(`.accept-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accepting...';
      }
      const result = await acceptConnectionRequest(connectionId);
      if (result.success) {
        const item = document.querySelector(`.connection-request-item[data-request-id="${connectionId}"]`);
        if (item) {
          item.style.opacity = '0';
          item.style.transform = 'translateX(100px)';
          setTimeout(() => item.remove(), 300);
        }
        this.showToast('Connection accepted!', 'success');
        setTimeout(() => {
          const remainingRequests = document.querySelectorAll('.connection-request-item');
          if (remainingRequests.length === 0) {
            this.nextStep();
          }
        }, 1000);
      } else {
        throw new Error('Failed to accept connection');
      }
    } catch (error) {
      console.error('Error accepting connection:', error);
      this.showToast('Failed to accept connection', 'error');
      const button = document.querySelector(`.accept-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = false;
        button.innerHTML = '✓ Accept';
      }
    }
  }

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

  exploreNetwork() {
    this.closeAndExplore();
  }

  findProjects() {
    if (window.EnhancedStartUI) {
      window.EnhancedStartUI.close();
    }
    setTimeout(() => {
      if (window.filterByNodeType) {
        window.filterByNodeType('project');
      }
    }, 300);
  }

  connectWithPeople() {
    if (window.EnhancedStartUI) {
      window.EnhancedStartUI.close();
    }
    setTimeout(() => {
      if (window.filterByNodeType) {
        window.filterByNodeType('person');
      }
    }, 300);
  }

  closeAndExplore() {
    if (window.EnhancedStartUI) {
      window.EnhancedStartUI.close();
    }
  }

  showToast(message, type = 'info') {
    const colors = { info: '#00e0ff', success: '#00ff88', warning: '#ffaa00', error: '#ff6b6b' };
    const color = colors[type] || colors.info;
    const toast = document.createElement('div');
    toast.style.cssText = `position: fixed; bottom: 2rem; right: 2rem; background: ${color}; color: ${type === 'info' ? '#000' : '#fff'}; padding: 1rem 1.5rem; border-radius: 12px; font-weight: 600; z-index: 100001; box-shadow: 0 8px 25px rgba(0,0,0,0.5); animation: slideIn 0.3s ease;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

window.StartSequentialDigest = new StartSequentialDigest();

const style = document.createElement('style');
style.textContent = `
  .step-content { transition: opacity 0.3s ease, transform 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeInScale { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
  @keyframes bounceIn { 0% { opacity: 0; transform: scale(0.3); } 50% { transform: scale(1.05); } 70% { transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
`;
document.head.appendChild(style);

console.log('✅ START Sequential Digest ready');

  async fetchActualCounts() {
    if (!window.supabase) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    const { data: { user } } = await window.supabase.auth.getUser();
    if (!user) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    const { data: profile } = await window.supabase.from('community').select('id').eq('user_id', user.id).single();
    if (!profile) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    const communityId = profile.id;
    const [connectionsResult, themesResult, projectsResult, opportunitiesResult] = await Promise.all([
      window.supabase.from('connections').select('id', { count: 'exact', head: true }).eq('status', 'accepted').or(`from_user_id.eq.${communityId},to_user_id.eq.${communityId}`),
      window.supabase.from('theme_participants').select('theme_id', { count: 'exact', head: true }).eq('community_id', communityId),
      window.supabase.from('project_members').select('project_id', { count: 'exact', head: true }).eq('user_id', communityId),
      window.supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'open')
    ]);
    return {
      connections: connectionsResult.count || 0,
      themes: themesResult.count || 0,
      projects: projectsResult.count || 0,
      opportunities: opportunitiesResult.count || 0
    };
  }

  async acceptConnection(connectionId) {
    try {
      const { acceptConnectionRequest } = await import('./connections.js');
      const button = document.querySelector(`.accept-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accepting...';
      }
      const result = await acceptConnectionRequest(connectionId);
      if (result.success) {
        const item = document.querySelector(`.connection-request-item[data-request-id="${connectionId}"]`);
        if (item) {
          item.style.opacity = '0';
          item.style.transform = 'translateX(100px)';
          setTimeout(() => item.remove(), 300);
        }
        this.showToast('Connection accepted!', 'success');
        setTimeout(() => {
          const remainingRequests = document.querySelectorAll('.connection-request-item');
          if (remainingRequests.length === 0) {
            this.nextStep();
          }
        }, 1000);
      } else {
        throw new Error('Failed to accept connection');
      }
    } catch (error) {
      console.error('Error accepting connection:', error);
      this.showToast('Failed to accept connection', 'error');
      const button = document.querySelector(`.accept-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = false;
        button.innerHTML = '✓ Accept';
      }
    }
  }

  openMessaging() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.EnhancedStartUI) {
        window.EnhancedStartUI.handleAction('openMessaging', { preventDefault: () => {}, stopPropagation: () => {} });
      }
    }, 300);
  }

  viewConnections() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.filterByNodeType) window.filterByNodeType('person');
    }, 300);
  }

  viewThemes() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.showView) window.showView('synapse');
      setTimeout(() => {
        if (window.filterSynapseByCategory) window.filterSynapseByCategory('themes');
      }, 500);
    }, 300);
  }

  viewProjects() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.filterByNodeType) window.filterByNodeType('project');
    }, 300);
  }

  viewOpportunities() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.showView) {
        window.showView('opportunities');
      } else if (window.filterByNodeType) {
        window.filterByNodeType('project');
      }
    }, 300);
  }

  exploreNetwork() {
    this.closeAndExplore();
  }

  findProjects() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.filterByNodeType) window.filterByNodeType('project');
    }, 300);
  }

  connectWithPeople() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.filterByNodeType) window.filterByNodeType('person');
    }, 300);
  }

  closeAndExplore() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
  }

  showToast(message, type = 'info') {
    const colors = { info: '#00e0ff', success: '#00ff88', warning: '#ffaa00', error: '#ff6b6b' };
    const color = colors[type] || colors.info;
    const toast = document.createElement('div');
    toast.style.cssText = `position: fixed; bottom: 2rem; right: 2rem; background: ${color}; color: ${type === 'info' ? '#000' : '#fff'}; padding: 1rem 1.5rem; border-radius: 12px; font-weight: 600; z-index: 100001; box-shadow: 0 8px 25px rgba(0,0,0,0.5); animation: slideIn 0.3s ease;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

window.StartSequentialDigest = new StartSequentialDigest();

const style = document.createElement('style');
style.textContent = `
  .step-content { transition: opacity 0.3s ease, transform 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeInScale { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
  @keyframes bounceIn { 0% { opacity: 0; transform: scale(0.3); } 50% { transform: scale(1.05); } 70% { transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
`;
document.head.appendChild(style);

console.log('✅ START Sequential Digest ready');

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
      window.supabase.from('connections').select('id', { count: 'exact', head: true }).eq('status', 'accepted').or(`from_user_id.eq.${communityId},to_user_id.eq.${communityId}`),
      window.supabase.from('theme_participants').select('theme_id', { count: 'exact', head: true }).eq('community_id', communityId),
      window.supabase.from('project_members').select('project_id', { count: 'exact', head: true }).eq('user_id', communityId),
      window.supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'open')
    ]);
    
    return {
      connections: connectionsResult.count || 0,
      themes: themesResult.count || 0,
      projects: projectsResult.count || 0,
      opportunities: opportunitiesResult.count || 0
    };
  }

  async acceptConnection(connectionId) {
    try {
      const { acceptConnectionRequest } = await import('./connections.js');
      const button = document.querySelector(`.accept-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accepting...';
      }
      
      const result = await acceptConnectionRequest(connectionId);
      
      if (result.success) {
        const item = document.querySelector(`.connection-request-item[data-request-id="${connectionId}"]`);
        if (item) {
          item.style.opacity = '0';
          item.style.transform = 'translateX(100px)';
          setTimeout(() => item.remove(), 300);
        }
        
        this.showToast('Connection accepted!', 'success');
        
        setTimeout(() => {
          const remainingRequests = document.querySelectorAll('.connection-request-item');
          if (remainingRequests.length === 0) {
            this.nextStep();
          }
        }, 1000);
      } else {
        throw new Error('Failed to accept connection');
      }
    } catch (error) {
      console.error('Error accepting connection:', error);
      this.showToast('Failed to accept connection', 'error');
      const button = document.querySelector(`.accept-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = false;
        button.innerHTML = '✓ Accept';
      }
    }
  }

  openMessaging() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.EnhancedStartUI) {
        window.EnhancedStartUI.handleAction('openMessaging', { preventDefault: () => {}, stopPropagation: () => {} });
      }
    }, 300);
  }

  viewConnections() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.filterByNodeType) window.filterByNodeType('person');
    }, 300);
  }

  viewThemes() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.showView) window.showView('synapse');
      setTimeout(() => {
        if (window.filterSynapseByCategory) window.filterSynapseByCategory('themes');
      }, 500);
    }, 300);
  }

  viewProjects() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.filterByNodeType) window.filterByNodeType('project');
    }, 300);
  }

  viewOpportunities() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.showView) {
        window.showView('opportunities');
      } else if (window.filterByNodeType) {
        window.filterByNodeType('project');
      }
    }, 300);
  }

  exploreNetwork() {
    this.closeAndExplore();
  }

  findProjects() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.filterByNodeType) window.filterByNodeType('project');
    }, 300);
  }

  connectWithPeople() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.filterByNodeType) window.filterByNodeType('person');
    }, 300);
  }

  closeAndExplore() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
  }

  showToast(message, type = 'info') {
    const colors = { info: '#00e0ff', success: '#00ff88', warning: '#ffaa00', error: '#ff6b6b' };
    const color = colors[type] || colors.info;
    const toast = document.createElement('div');
    toast.style.cssText = `position: fixed; bottom: 2rem; right: 2rem; background: ${color}; color: ${type === 'info' ? '#000' : '#fff'}; padding: 1rem 1.5rem; border-radius: 12px; font-weight: 600; z-index: 100001; box-shadow: 0 8px 25px rgba(0,0,0,0.5); animation: slideIn 0.3s ease;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

window.StartSequentialDigest = new StartSequentialDigest();

const style = document.createElement('style');
style.textContent = `
  .step-content { transition: opacity 0.3s ease, transform 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeInScale { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
  @keyframes bounceIn { 0% { opacity: 0; transform: scale(0.3); } 50% { transform: scale(1.05); } 70% { transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
`;
document.head.appendChild(style);

console.log('✅ START Sequential Digest ready');
