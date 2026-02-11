// ================================================================
// START SEQUENCE - DAILY DIGEST (SEQUENTIAL)
// ================================================================
// Shows "what's new" for returning users in a step-by-step flow
// Highlights changes since last login
// ================================================================
// CONVERSION NOTE: This file was converted from all-at-once display
// to sequential step-by-step flow. All data queries and business
// logic remain unchanged - only presentation layer was modified.
// ================================================================

console.log('%c📰 START Daily Digest (Sequential) - Loading', 'color:#0f8; font-weight:bold;');

class StartDailyDigest {
  constructor() {
    this.userData = null;
    this.currentStep = 0;
    this.steps = [];
  }

  /**
   * Render the daily digest - now sequential
   */
  async render(data) {
    this.userData = data;
    this.currentStep = 0;
    
    // Build steps dynamically based on available data
    this.steps = await this.buildSteps(data);
    
    return `
      <div class="daily-digest-container sequential-mode">
        ${this.renderProgressBar()}
        <div id="digest-step-content" class="digest-step-content" style="
          min-height: 400px;
          transition: opacity 0.3s ease, transform 0.3s ease;
        ">
          ${await this.renderCurrentStep()}
        </div>
        ${this.renderNavigation()}
      </div>
    `;
  }

  /**
   * Build steps array based on available data
   * Steps are dynamically created - empty steps are automatically skipped
   */
  async buildSteps(data) {
    const steps = [];
    const whatsNew = data.whats_new || {};
    const immediate = data.immediate_actions || {};

    // Step 1: Welcome (always first)
    steps.push({
      id: 'welcome',
      title: 'Your focus today',
      render: () => this.renderWelcomeHeader(data)
    });

    // Step 2: Connection Requests (if any)
    if (immediate.pending_requests?.count > 0 && immediate.pending_requests?.items?.length > 0) {
      steps.push({
        id: 'connection-requests',
        title: 'Connection Requests',
        render: () => this.renderConnectionRequests(immediate.pending_requests)
      });
    }

    // Step 3: Messages (if any)
    if (immediate.unread_messages?.count > 0) {
      steps.push({
        id: 'messages',
        title: 'New Messages',
        render: () => this.renderMessagesStep(immediate.unread_messages)
      });
    }

    // Step 4: What's New Updates (if any)
    if (this.hasAnyUpdates(whatsNew)) {
      steps.push({
        id: 'whats-new',
        title: "What's New",
        render: () => this.renderWhatsNew(whatsNew)
      });
    }

    // Step 5: Network Snapshot (always included)
    steps.push({
      id: 'network',
      title: 'Your Network',
      render: () => this.renderNetworkSnapshot(data)
    });

    // Step 6: Quick Actions (if any)
    const quickActionsHTML = await this.renderQuickActions(data);
    if (quickActionsHTML && quickActionsHTML.trim()) {
      steps.push({
        id: 'quick-actions',
        title: 'Quick Actions',
        render: () => Promise.resolve(quickActionsHTML)
      });
    }

    // Step 7: Explore Suggestions (if any - will be populated by suggestions integration)
    // This step will be added dynamically by checking for suggestions
    const suggestionsHTML = await this.renderExploreSuggestions();
    if (suggestionsHTML && suggestionsHTML.trim()) {
      steps.push({
        id: 'explore',
        title: 'Explore',
        render: () => Promise.resolve(suggestionsHTML)
      });
    }

    // Final Step: Completion (always last)
    steps.push({
      id: 'completion',
      title: 'All Caught Up',
      render: () => this.renderCompletionStep()
    });

    return steps;
  }

  /**
   * Render progress bar
   */
  renderProgressBar() {
    const progress = ((this.currentStep + 1) / this.steps.length) * 100;
    const currentStepTitle = this.steps[this.currentStep]?.title || '';
    
    return `
      <div style="margin-bottom: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem;">
            Step ${this.currentStep + 1} of ${this.steps.length}
          </div>
          <div style="color: #00e0ff; font-size: 0.9rem; font-weight: 600;">
            ${Math.round(progress)}% Complete
          </div>
        </div>
        <div style="
          width: 100%;
          height: 6px;
          background: rgba(255,255,255,0.1);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        ">
          <div style="
            width: ${progress}%;
            height: 100%;
            background: linear-gradient(90deg, #00e0ff, #00ff88);
            transition: width 0.5s ease;
            border-radius: 3px;
          "></div>
        </div>
        <div style="color: rgba(255,255,255,0.5); font-size: 0.85rem; text-align: center;">
          ${currentStepTitle}
        </div>
      </div>
    `;
  }

  /**
   * Render current step content
   */
  async renderCurrentStep() {
    if (this.currentStep >= this.steps.length) {
      return this.renderCompletionStep();
    }

    const step = this.steps[this.currentStep];
    return await step.render();
  }

  /**
   * Render navigation buttons
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
        gap: 1rem;
      ">
        <button
          id="digest-prev-btn"
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
          ${!isFirst ? `onmouseenter="this.style.background='rgba(255,255,255,0.15)'" onmouseleave="this.style.background='rgba(255,255,255,0.1)'"` : ''}
        >
          ← Back
        </button>
        
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          ${this.steps.map((step, index) => `
            <div style="
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: ${index === this.currentStep ? '#00e0ff' : 'rgba(255,255,255,0.2)'};
              transition: all 0.3s;
              ${index === this.currentStep ? 'box-shadow: 0 0 8px #00e0ff;' : ''}
            "></div>
          `).join('')}
        </div>
        
        <button
          id="digest-next-btn"
          onclick="window.StartDailyDigest.${isLast ? 'close()' : 'nextStep()'}"
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
          onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,224,255,0.4)'"
          onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='none'"
        >
          ${isLast ? "Let's Go! 🚀" : 'Next →'}
        </button>
      </div>
    `;
  }

  /**
   * Navigate to next step
   */
  async nextStep() {
    if (this.currentStep >= this.steps.length - 1) {
      this.close();
      return;
    }
    
    this.currentStep++;
    await this.updateStepContent();
  }

  /**
   * Navigate to previous step
   */
  async previousStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      await this.updateStepContent();
    }
  }

  /**
   * Update step content with smooth transition
   */
  async updateStepContent() {
    const container = document.querySelector('.daily-digest-container');
    if (!container) return;

    const stepContent = document.getElementById('digest-step-content');
    
    if (!stepContent) return;

    // Fade out
    stepContent.style.opacity = '0';
    stepContent.style.transform = 'translateY(20px)';
    
    setTimeout(async () => {
      // Re-render the entire container to ensure proper state
      const newHTML = `
        ${this.renderProgressBar()}
        <div id="digest-step-content" class="digest-step-content" style="
          min-height: 400px;
          transition: opacity 0.3s ease, transform 0.3s ease;
          opacity: 0;
          transform: translateY(20px);
        ">
          ${await this.renderCurrentStep()}
        </div>
        ${this.renderNavigation()}
      `;
      
      container.innerHTML = newHTML;
      
      // Get the new step content element
      const newStepContent = document.getElementById('digest-step-content');
      
      // Fade in
      setTimeout(() => {
        if (newStepContent) {
          newStepContent.style.opacity = '1';
          newStepContent.style.transform = 'translateY(0)';
        }
      }, 50);
    }, 300);
  }

  /**
   * Close the digest modal
   */
  close() {
    if (window.EnhancedStartUI) {
      window.EnhancedStartUI.close();
    }
  }

  /**
   * Render completion step
   */
  renderCompletionStep() {
    return `
      <div style="text-align: center; padding: 3rem 2rem;">
        <div style="font-size: 4rem; margin-bottom: 1rem; animation: bounceIn 0.8s ease;">
          ✨
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
            Ready to make an impact? Explore your network, join projects, or connect with new people.
          </p>
        </div>
      </div>
      
      <style>
        @keyframes bounceIn {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
      </style>
    `;
  }

  /**
   * Render messages step (new for sequential flow)
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
          onclick="window.StartDailyDigest.handleAction('openMessaging')"
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
   * Render explore suggestions step
   * This fetches suggestions from the Daily Suggestions Engine
   */
  async renderExploreSuggestions() {
    // Check if Daily Suggestions Engine is available
    if (!window.DailySuggestionsUI || !window.DailySuggestionsUI.getSuggestionsForStartUI) {
      return '';
    }

    try {
      const suggestions = await window.DailySuggestionsUI.getSuggestionsForStartUI();
      
      if (!suggestions || suggestions.length === 0) {
        return '';
      }

      // Limit to top 5 suggestions for the step
      const displaySuggestions = suggestions.slice(0, 5);

      return `
        <div style="padding: 2rem;">
          <div style="text-align: center; margin-bottom: 2rem;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🧭</div>
            <h3 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.5rem;">
              Explore Opportunities
            </h3>
            <p style="color: rgba(255,255,255,0.6); margin: 0;">
              Personalized recommendations for you
            </p>
          </div>

          <div style="display: flex; flex-direction: column; gap: 1rem;">
            ${displaySuggestions.map(suggestion => this.renderExploreSuggestionCard(suggestion)).join('')}
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Failed to render explore suggestions:', err);
      return '';
    }
  }

  /**
   * Render a single explore suggestion card
   */
  renderExploreSuggestionCard(suggestion) {
    const color = suggestion.color || '#00e0ff';
    const icon = suggestion.icon || 'star';
    const message = suggestion.message || 'Check this out';
    const detail = suggestion.detail || '';
    const action = suggestion.action || 'Explore';
    const handler = suggestion.handler || '';
    const data = suggestion.data || {};
    
    // Special styling for Intelligence Layer
    const isIntelligenceLayer = message.includes('Intelligence Layer');
    const cardColor = isIntelligenceLayer ? '#a855f7' : color; // Purple for Intelligence Layer
    const borderColor = isIntelligenceLayer ? 'rgba(168,85,247,0.6)' : `${cardColor}40`;
    
    // Encode data for onclick handler
    const dataJson = JSON.stringify(data).replace(/"/g, '&quot;');
    
    return `
      <div class="explore-suggestion-card" 
           data-handler="${handler}" 
           data-suggestion-data='${dataJson}'
           style="
        background: linear-gradient(135deg, ${cardColor}15, rgba(0,0,0,0.1));
        border: 2px solid ${borderColor};
        border-radius: 12px;
        padding: 1.25rem;
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
      "
      onclick="window.StartDailyDigest.handleExploreSuggestion('${handler}', this)"
      onmouseenter="this.style.transform='translateY(-2px)'; this.style.borderColor='${cardColor}'; this.style.boxShadow='0 8px 25px ${cardColor}30';"
      onmouseleave="this.style.transform='translateY(0)'; this.style.borderColor='${borderColor}'; this.style.boxShadow='none';">
        
        <div style="display: flex; align-items: start; gap: 1rem;">
          <div style="
            width: 48px;
            height: 48px;
            background: ${cardColor}20;
            border: 2px solid ${cardColor}60;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          ">
            <i class="fas fa-${icon}" style="color: ${cardColor}; font-size: 1.5rem;"></i>
          </div>
          
          <div style="flex: 1; min-width: 0;">
            <div style="color: #fff; font-size: 1.05rem; font-weight: 600; margin-bottom: 0.25rem; word-wrap: break-word;">
              ${message}
            </div>
            ${detail ? `
              <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 0.75rem; word-wrap: break-word;">
                ${detail}
              </div>
            ` : ''}
            <div style="
              display: inline-block;
              background: ${cardColor};
              color: ${isIntelligenceLayer ? '#fff' : '#000'};
              padding: 0.4rem 0.9rem;
              border-radius: 8px;
              font-size: 0.85rem;
              font-weight: 600;
            ">
              ${action} →
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Handle explore suggestion click
   */
  async handleExploreSuggestion(handler, element) {
    const dataAttr = element.getAttribute('data-suggestion-data');
    const data = dataAttr ? JSON.parse(dataAttr) : {};
    
    // Close the modal
    this.close();
    
    // Execute the suggestion handler after modal closes
    setTimeout(async () => {
      if (window.handleSuggestionCTA && typeof window.handleSuggestionCTA === 'function') {
        await window.handleSuggestionCTA(handler, data);
      } else {
        console.warn('handleSuggestionCTA not available');
      }
    }, 300);
  }

  /**
   * Check if there are any updates
   */
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
   * Render welcome header (Step 1)
   */
  renderWelcomeHeader(data) {
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
      
      <style>
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
      </style>
    `;
  }

  /**
   * Get greeting emoji based on time of day
   */
  getGreetingEmoji() {
    const hour = new Date().getHours();
    if (hour < 12) return '🌅';
    if (hour < 18) return '☀️';
    return '🌙';
  }

  /**
   * Get human-readable time ago
   */
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

  /**
   * Render what's new section (as a step)
   */
  renderWhatsNew(whatsNew) {
    const updates = [];

    if (whatsNew.new_connection_requests > 0) {
      updates.push({
        icon: 'user-plus',
        color: '#00e0ff',
        title: 'New Connection Requests',
        count: whatsNew.new_connection_requests,
        message: `${whatsNew.new_connection_requests} ${whatsNew.new_connection_requests === 1 ? 'person wants' : 'people want'} to connect`,
        action: 'View Requests',
        handler: 'openConnectionRequests',
        priority: 1
      });
    }

    if (whatsNew.new_messages > 0) {
      updates.push({
        icon: 'envelope',
        color: '#ffaa00',
        title: 'New Messages',
        count: whatsNew.new_messages,
        message: `${whatsNew.new_messages} new ${whatsNew.new_messages === 1 ? 'message' : 'messages'}`,
        action: 'Read Messages',
        handler: 'openMessaging',
        priority: 2
      });
    }

    if (whatsNew.new_connections > 0) {
      updates.push({
        icon: 'users',
        color: '#00ff88',
        title: 'New Connections',
        count: whatsNew.new_connections,
        message: `${whatsNew.new_connections} new ${whatsNew.new_connections === 1 ? 'connection' : 'connections'} accepted`,
        action: 'View Network',
        handler: 'viewConnections',
        priority: 3
      });
    }

    if (whatsNew.new_projects_in_themes > 0) {
      updates.push({
        icon: 'rocket',
        color: '#a855f7',
        title: 'New Projects',
        count: whatsNew.new_projects_in_themes,
        message: `${whatsNew.new_projects_in_themes} new ${whatsNew.new_projects_in_themes === 1 ? 'project' : 'projects'} in your themes`,
        action: 'Browse Projects',
        handler: 'openSkillMatchedProjects',
        priority: 4
      });
    }

    if (whatsNew.new_theme_members > 0) {
      updates.push({
        icon: 'user-friends',
        color: '#ff6b6b',
        title: 'New Theme Members',
        count: whatsNew.new_theme_members,
        message: `${whatsNew.new_theme_members} ${whatsNew.new_theme_members === 1 ? 'person joined' : 'people joined'} your themes`,
        action: 'View Themes',
        handler: 'openThemes',
        priority: 5
      });
    }

    // Sort by priority
    updates.sort((a, b) => a.priority - b.priority);

    return `
      <div style="padding: 2rem;">
        <div style="text-align: center; margin-bottom: 2rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🔔</div>
          <h3 style="
            color: #00e0ff;
            margin: 0 0 0.5rem 0;
            font-size: 1.5rem;
          ">
            What's New
          </h3>
          <p style="color: rgba(255,255,255,0.6); margin: 0;">
            Here's what happened since your last visit
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${updates.map(update => this.renderUpdateCard(update)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render a single update card
   */
  renderUpdateCard(update) {
    return `
      <div class="update-card"
           onclick="window.StartDailyDigest.handleAction('${update.handler}')"
           style="
        background: linear-gradient(135deg, ${update.color}15, rgba(0,0,0,0.1));
        border: 2px solid ${update.color}40;
        border-radius: 12px;
        padding: 1.25rem;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 1rem;
      "
      onmouseenter="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 25px ${update.color}40';"
      onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='none';">

        <div style="
          width: 48px;
          height: 48px;
          background: ${update.color}20;
          border: 2px solid ${update.color}60;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <i class="fas fa-${update.icon}" style="color: ${update.color}; font-size: 1.5rem;"></i>
        </div>

        <div style="flex: 1; min-width: 0;">
          <div style="
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.25rem;
          ">
            <div style="color: #fff; font-size: 1.1rem; font-weight: 600;">
              ${update.title}
            </div>
            <div style="
              background: ${update.color};
              color: #000;
              padding: 0.125rem 0.5rem;
              border-radius: 12px;
              font-size: 0.75rem;
              font-weight: 700;
            ">
              ${update.count}
            </div>
          </div>
          <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem; margin-bottom: 0.5rem;">
            ${update.message}
          </div>
          <div style="
            color: ${update.color};
            font-size: 0.9rem;
            font-weight: 600;
          ">
            ${update.action} →
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render no updates message (not used in sequential mode - kept for compatibility)
   */
  renderNoUpdates() {
    return `
      <div style="
        text-align: center;
        padding: 3rem 2rem;
        background: rgba(0,224,255,0.05);
        border: 2px dashed rgba(0,224,255,0.2);
        border-radius: 16px;
        margin-bottom: 2rem;
      ">
        <div style="font-size: 3rem; margin-bottom: 1rem;">✨</div>
        <h3 style="color: #00e0ff; margin: 0 0 0.5rem 0;">You're All Caught Up!</h3>
        <p style="color: rgba(255,255,255,0.6); margin: 0;">
          No new updates since your last visit. Check back later!
        </p>
      </div>
    `;
  }

  /**
   * Render quick actions (as a step - only if there are actions)
   */
  async renderQuickActions(data) {
    const immediate = data.immediate_actions || {};
    let html = '';

    // Debug logging
    console.log('🔍 renderQuickActions - immediate_actions:', immediate);
    console.log('🔍 pending_requests:', immediate.pending_requests);

    // Note: Connection requests are now their own step, so we skip them here
    
    // Render other quick actions
    const actions = [];

    if (immediate.unread_messages?.count > 0) {
      actions.push({
        icon: 'comments',
        label: 'Unread Messages',
        count: immediate.unread_messages.count,
        color: '#ffaa00',
        handler: 'openMessaging'
      });
    }

    if (immediate.pending_bids?.count > 0) {
      actions.push({
        icon: 'clipboard-list',
        label: 'Pending Bids',
        count: immediate.pending_bids.count,
        color: '#a855f7',
        handler: 'openProjectBids'
      });
    }

    if (immediate.bids_to_review?.count > 0) {
      actions.push({
        icon: 'tasks',
        label: 'Bids to Review',
        count: immediate.bids_to_review.count,
        color: '#ff6b6b',
        handler: 'openBidsToReview'
      });
    }

    if (actions.length === 0) {
      return ''; // Return empty string to skip this step
    }

    html += `
      <div style="padding: 2rem;">
        <div style="text-align: center; margin-bottom: 2rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">⚡</div>
          <h3 style="
            color: #00ff88;
            margin: 0 0 0.5rem 0;
            font-size: 1.5rem;
          ">
            Quick Actions
          </h3>
          <p style="color: rgba(255,255,255,0.6); margin: 0;">
            Things that need your attention
          </p>
        </div>

        <div style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
        ">
          ${actions.map(action => `
            <button onclick="window.StartDailyDigest.handleAction('${action.handler}')" style="
              background: linear-gradient(135deg, ${action.color}20, rgba(0,0,0,0.1));
              border: 2px solid ${action.color}40;
              border-radius: 12px;
              padding: 1.5rem 1rem;
              cursor: pointer;
              transition: all 0.3s ease;
              text-align: center;
            "
            onmouseenter="this.style.transform='translateY(-2px)'; this.style.borderColor='${action.color}';"
            onmouseleave="this.style.transform='translateY(0)'; this.style.borderColor='${action.color}40';">
              <i class="fas fa-${action.icon}" style="
                color: ${action.color};
                font-size: 2rem;
                margin-bottom: 0.75rem;
                display: block;
              "></i>
              <div style="color: #fff; font-weight: 600; margin-bottom: 0.5rem; font-size: 0.95rem;">
                ${action.label}
              </div>
              <div style="
                background: ${action.color};
                color: #000;
                padding: 0.25rem 0.75rem;
                border-radius: 8px;
                font-size: 0.85rem;
                font-weight: 700;
                display: inline-block;
              ">
                ${action.count}
              </div>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    return html;
  }

  /**
   * Render connection requests as a step
   */
  async renderConnectionRequests(pendingRequests) {
    const items = pendingRequests.items || [];
    
    if (items.length === 0) {
      return '';
    }

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
              <div style="
                width: 56px;
                height: 56px;
                background: linear-gradient(135deg, #00e0ff, #0080ff);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.8rem;
                flex-shrink: 0;
              ">
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
              <div style="display: flex; gap: 0.5rem; flex-shrink: 0; flex-wrap: wrap;">
                <button 
                  class="accept-connection-btn"
                  data-request-id="${req.id}"
                  onclick="window.StartDailyDigest.acceptConnection('${req.id}')"
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
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                  "
                  onmouseenter="this.style.opacity='0.8'; this.style.transform='translateY(-1px)'"
                  onmouseout="this.style.opacity='1'; this.style.transform='translateY(0)'"
                >
                  <i class="fas fa-check"></i>
                  Accept
                </button>
                <button 
                  class="decline-connection-btn"
                  data-request-id="${req.id}"
                  onclick="window.StartDailyDigest.declineConnection('${req.id}')"
                  style="
                    background: rgba(255,59,48,0.2);
                    border: 2px solid rgba(255,59,48,0.4);
                    border-radius: 8px;
                    color: #ff3b30;
                    padding: 0.75rem 1.25rem;
                    font-weight: 600;
                    font-size: 0.95rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                  "
                  onmouseenter="this.style.background='rgba(255,59,48,0.3)'; this.style.transform='translateY(-1px)'"
                  onmouseout="this.style.background='rgba(255,59,48,0.2)'; this.style.transform='translateY(0)'"
                >
                  <i class="fas fa-times"></i>
                  Decline
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render network snapshot as a step
   */
  async renderNetworkSnapshot(data) {
    const network = data.network_insights || {};
    const opportunities = data.opportunities || {};
    
    // Fetch actual counts from database if not provided
    let connectionsCount = network.connections?.total || 0;
    let themesCount = opportunities.active_themes?.count || 0;
    let projectsCount = network.active_projects?.count || 0;
    let opportunitiesCount = opportunities.skill_matched_projects?.count || 0;
    
    // If counts are 0, try to fetch them directly
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

        <div style="
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        ">
          ${this.renderStatCard('Connections', connectionsCount, 'users', '#00e0ff', 'viewConnections')}
          ${this.renderStatCard('Themes', themesCount, 'bullseye', '#ffaa00', 'viewThemes')}
          ${this.renderStatCard('Projects', projectsCount, 'rocket', '#a855f7', 'viewProjects')}
          ${this.renderStatCard('Opportunities', opportunitiesCount, 'briefcase', '#00ff88', 'viewOpportunities')}
        </div>
      </div>
    `;
  }
  
  /**
   * Fetch actual counts from database
   */
  async fetchActualCounts() {
    if (!window.supabase) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    
    const { data: { user } } = await window.supabase.auth.getUser();
    if (!user) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    
    // Get community profile
    const { data: profile } = await window.supabase
      .from('community')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    if (!profile) {
      return { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    }
    
    const communityId = profile.id;
    
    // Fetch counts in parallel
    const [connectionsResult, themesResult, projectsResult, opportunitiesResult] = await Promise.all([
      // Count accepted connections
      window.supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`from_user_id.eq.${communityId},to_user_id.eq.${communityId}`),
      
      // Count theme participations
      window.supabase
        .from('theme_participants')
        .select('theme_id', { count: 'exact', head: true })
        .eq('community_id', communityId),
      
      // Count project memberships
      window.supabase
        .from('project_members')
        .select('project_id', { count: 'exact', head: true })
        .eq('user_id', communityId),
      
      // Count open projects (opportunities)
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

  /**
   * Render stat card with helpful tooltip
   */
  renderStatCard(label, value, icon, color, handler) {
    const clickHandler = handler ? `onclick="window.StartDailyDigest.${handler}()" style="cursor: pointer;"` : '';
    const hoverStyle = handler ? `
      onmouseenter="this.style.transform='translateY(-2px)'; this.style.borderColor='${color}';"
      onmouseleave="this.style.transform='translateY(0)'; this.style.borderColor='${color}40';"
    ` : '';
    
    // Add helpful descriptions for each stat
    const descriptions = {
      'Connections': 'People you\'re connected with',
      'Themes': 'Theme circles you\'ve joined',
      'Projects': 'Projects you\'re involved in',
      'Opportunities': 'Open projects seeking collaborators'
    };
    
    const description = descriptions[label] || '';
    
    return `
      <div ${clickHandler} ${hoverStyle} style="
        background: rgba(0,0,0,0.3);
        border: 1px solid ${color}40;
        border-radius: 12px;
        padding: 1rem;
        text-align: center;
        transition: all 0.2s;
        position: relative;
      " title="${description}">
        <i class="fas fa-${icon}" style="color: ${color}; font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
        <div style="color: #fff; font-size: 1.8rem; font-weight: 700; margin-bottom: 0.25rem;">
          ${value}
        </div>
        <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-bottom: 0.25rem;">
          ${label}
        </div>
        <div style="color: rgba(255,255,255,0.4); font-size: 0.7rem; line-height: 1.2;">
          ${description}
        </div>
      </div>
    `;
  }

  // ================================================================
  // ACTION HANDLERS
  // ================================================================

  handleAction(handler) {
    // Use the existing EnhancedStartUI handler
    if (window.EnhancedStartUI && window.EnhancedStartUI.handleAction) {
      window.EnhancedStartUI.handleAction(handler, { preventDefault: () => {}, stopPropagation: () => {} });
    }
  }

  viewConnections() {
    window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.filterByNodeType) {
        window.filterByNodeType('person');
      }
    }, 300);
  }
  
  viewThemes() {
    window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.showView) {
        window.showView('synapse');
      }
      // Filter to show only themes
      setTimeout(() => {
        if (window.filterSynapseByCategory) {
          window.filterSynapseByCategory('themes');
        }
      }, 500);
    }, 300);
  }
  
  viewProjects() {
    window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.filterByNodeType) {
        window.filterByNodeType('project');
      }
    }, 300);
  }
  
  viewOpportunities() {
    window.EnhancedStartUI.close();
    setTimeout(() => {
      // Show opportunities page or open projects list
      if (window.showView) {
        window.showView('opportunities');
      } else if (window.filterByNodeType) {
        // Fallback: show open projects
        window.filterByNodeType('project');
      }
    }, 300);
  }

  async acceptConnection(connectionId) {
    try {
      // Import the accept function
      const { acceptConnectionRequest } = await import('./connections.js');
      
      // Find the button and show loading state
      const button = document.querySelector(`.accept-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accepting...';
      }
      
      // Accept the connection
      const result = await acceptConnectionRequest(connectionId);
      
      if (result.success) {
        // Remove the request item from the UI
        const item = document.querySelector(`.connection-request-item[data-request-id="${connectionId}"]`);
        if (item) {
          item.style.animation = 'slideOut 0.3s ease-out';
          setTimeout(() => item.remove(), 300);
        }
        
        // Show success message
        this.showToast('Connection accepted!', 'success');
        
        // Refresh the START modal after a short delay
        setTimeout(() => {
          if (window.EnhancedStartUI) {
            window.EnhancedStartUI.open();
          }
        }, 1000);
      } else {
        throw new Error('Failed to accept connection');
      }
    } catch (error) {
      console.error('Error accepting connection:', error);
      this.showToast('Failed to accept connection', 'error');
      
      // Reset button
      const button = document.querySelector(`.accept-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-check"></i> Accept';
      }
    }
  }

  async declineConnection(connectionId) {
    try {
      // Import the decline function
      const { declineConnectionRequest } = await import('./connections.js');
      
      // Find the button and show loading state
      const button = document.querySelector(`.decline-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Declining...';
      }
      
      // Decline the connection
      const result = await declineConnectionRequest(connectionId);
      
      if (result.success) {
        // Remove the request item from the UI
        const item = document.querySelector(`.connection-request-item[data-request-id="${connectionId}"]`);
        if (item) {
          item.style.animation = 'slideOut 0.3s ease-out';
          setTimeout(() => item.remove(), 300);
        }
        
        // Show success message
        this.showToast('Connection declined', 'info');
        
        // Refresh the START modal after a short delay
        setTimeout(() => {
          if (window.EnhancedStartUI) {
            window.EnhancedStartUI.open();
          }
        }, 1000);
      } else {
        throw new Error('Failed to decline connection');
      }
    } catch (error) {
      console.error('Error declining connection:', error);
      this.showToast('Failed to decline connection', 'error');
      
      // Reset button
      const button = document.querySelector(`.decline-connection-btn[data-request-id="${connectionId}"]`);
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-times"></i> Decline';
      }
    }
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

// ================================================================
// GLOBAL INSTANCE
// ================================================================

window.StartDailyDigest = new StartDailyDigest();

console.log('✅ START Daily Digest (Sequential Mode) ready');
