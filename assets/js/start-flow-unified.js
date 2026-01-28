// ================================================================
// UNIFIED START FLOW - Progressive Multi-Step Sequence
// ================================================================
// Guides users through: Notifications → Themes → Projects → People → Report
// Card-based UI with downloadable session report
// ================================================================

console.log("%c🚀 Progressive START Flow Loading", "color:#0f8; font-weight:bold; font-size:14px");

class StartFlowManager {
  constructor() {
    this.state = {
      isOpen: false,
      userProfile: null,
      supabase: null,
      currentStep: 0,
      totalSteps: 5,
      stepData: {},
      sequenceComplete: false,
      sessionLog: {
        startTime: null,
        endTime: null,
        connectionRequestsSent: [],
        connectionsAccepted: [],
        themesViewed: [],
        projectsViewed: [],
        peopleViewed: [],
        errors: []
      }
    };
    
    this.steps = [
      { id: 'notifications', title: 'Notifications', icon: 'fa-bell', color: '#00e0ff' },
      { id: 'themes', title: 'Suggested Themes', icon: 'fa-palette', color: '#ffaa00' },
      { id: 'projects', title: 'Projects', icon: 'fa-lightbulb', color: '#00ff88' },
      { id: 'people', title: 'People to Connect', icon: 'fa-users', color: '#ffd700' },
      { id: 'report', title: 'Session Report', icon: 'fa-chart-line', color: '#00e0ff' }
    ];
    
    this.elements = {
      container: null,
      modal: null,
      backdrop: null,
      content: null
    };
    
    this.init();
  }

  init() {
    console.log('🚀 Initializing Progressive START Flow');
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    this.elements.container = document.getElementById('start-button-container');
    this.elements.modal = document.getElementById('start-modal');
    this.elements.backdrop = document.getElementById('start-modal-backdrop');
    this.elements.content = document.getElementById('start-options-container');

    window.addEventListener('profile-loaded', (e) => this.handleProfileLoaded(e));
    this.wireUpButtons();
    
    console.log('✅ Progressive START Flow setup complete');
  }

  handleProfileLoaded(e) {
    this.state.userProfile = e.detail?.profile || e.detail;
    this.state.supabase = window.supabase;
    
    console.log('✅ Profile loaded in START Flow');
    
    if (this.elements.container) {
      this.elements.container.style.display = 'flex';
    }
  }

  wireUpButtons() {
    const startBtn = document.getElementById('btn-start-center');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.open());
    }

    const exploreBtn = document.getElementById('btn-explore-cancel');
    if (exploreBtn) {
      exploreBtn.addEventListener('click', () => this.skipStart());
    }

    const closeBtn = document.querySelector('#start-modal .mentor-panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    const exploreFreelyBtn = document.getElementById('explore-freely-btn');
    if (exploreFreelyBtn) {
      exploreFreelyBtn.addEventListener('click', () => this.skipSequence());
    }
  }

  async open() {
    if (this.state.isOpen) return;
    
    console.log('🚀 Starting progressive sequence');
    this.state.isOpen = true;
    this.state.currentStep = 0;
    this.state.sequenceComplete = false;
    this.state.sessionLog.startTime = new Date().toISOString();

    if (this.elements.container) {
      this.elements.container.style.transition = 'opacity 0.5s ease';
      this.elements.container.style.opacity = '0';
      setTimeout(() => {
        this.elements.container.style.display = 'none';
      }, 500);
    }

    if (this.elements.modal && this.elements.backdrop) {
      this.elements.modal.style.display = 'block';
      this.elements.backdrop.style.display = 'block';
      
      // Hide the "I just want to explore freely" button
      const exploreFreelyBtn = document.getElementById('explore-freely-btn');
      if (exploreFreelyBtn) {
        exploreFreelyBtn.style.display = 'none';
      }

      // Hide the Filter View panel (synapse legend)
      const legendPanel = document.getElementById('synapse-legend');
      if (legendPanel) {
        legendPanel.style.display = 'none';
      }

      // Hide the search container at the bottom
      const searchContainer = document.getElementById('centered-search-container');
      if (searchContainer) {
        searchContainer.style.display = 'none';
      }
      
      requestAnimationFrame(() => {
        this.elements.modal.style.opacity = '1';
        this.elements.modal.style.transform = 'translate(-50%, -50%) scale(1)';
      });
    }

    await this.showStep(0);
    window.dispatchEvent(new CustomEvent('start-modal-opened'));
  }

  async showStep(stepIndex) {
    if (stepIndex >= this.steps.length) {
      this.completeSequence();
      return;
    }

    this.state.currentStep = stepIndex;
    const step = this.steps[stepIndex];
    
    console.log(`📍 Step ${stepIndex + 1}/${this.steps.length}: ${step.title}`);

    this.updateProgress();
    await this.renderStep(step);
  }

  async renderStep(step) {
    if (!this.elements.content) return;

    this.elements.content.innerHTML = `
      <div style="text-align:center; padding:2rem;">
        <i class="fas fa-spinner fa-spin" style="font-size:2rem; color:${step.color}; margin-bottom:1rem;"></i>
        <p style="color:rgba(255,255,255,0.7);">Loading ${step.title.toLowerCase()}...</p>
      </div>
    `;

    try {
      const data = await this.loadStepData(step.id);
      this.state.stepData[step.id] = data;
      this.renderStepContent(step, data);
    } catch (error) {
      console.error(`❌ Error loading step ${step.id}:`, error);
      this.state.sessionLog.errors.push({
        step: step.id,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      this.renderStepError(step);
    }
  }

  async loadStepData(stepId) {
    const { userProfile, supabase } = this.state;
    
    if (!userProfile || !supabase) {
      return { items: [], count: 0 };
    }

    switch (stepId) {
      case 'notifications':
        return await this.loadNotifications();
      case 'themes':
        return await this.loadThemes();
      case 'projects':
        return await this.loadProjects();
      case 'people':
        return await this.loadPeople();
      case 'report':
        return await this.generateReport();
      default:
        return { items: [], count: 0 };
    }
  }

  async loadNotifications() {
    const { userProfile, supabase } = this.state;
    const notifications = [];

    try {
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .or(`participant_1_id.eq.${userProfile.id},participant_2_id.eq.${userProfile.id}`)
        .limit(10);

      if (conversations?.length > 0) {
        const convIds = conversations.map(c => c.id);
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .neq('sender_id', userProfile.id)
          .eq('read', false);

        if (unreadCount > 0) {
          notifications.push({
            type: 'messages',
            title: `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`,
            description: 'Catch up on your conversations',
            icon: 'fa-envelope',
            color: '#00e0ff',
            action: () => this.openMessages()
          });
        }
      }

      const { count: pendingRequests } = await supabase
        .from('connections')
        .select('*', { count: 'exact', head: true })
        .eq('to_user_id', userProfile.id)
        .eq('status', 'pending');

      if (pendingRequests > 0) {
        notifications.push({
          type: 'connections',
          title: `${pendingRequests} connection request${pendingRequests > 1 ? 's' : ''}`,
          description: 'Review and respond',
          icon: 'fa-user-plus',
          color: '#ffd700',
          action: () => this.openConnections()
        });
      }

    } catch (error) {
      console.error('Error loading notifications:', error);
      this.state.sessionLog.errors.push({
        step: 'notifications',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    return { items: notifications, count: notifications.length };
  }

  async loadThemes() {
    // Themes table doesn't exist in database - skip this step gracefully
    console.log('ℹ️ Themes step skipped (table not available)');
    return { items: [], count: 0 };
  }

  async loadProjects() {
    const { supabase } = this.state;
    const projects = [];

    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*, creator:community!projects_creator_id_fkey(name)')
        .eq('status', 'in-progress')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      if (data) {
        projects.push(...data.map(project => ({
          id: project.id,
          title: project.name,
          description: project.description || 'Join this project',
          icon: 'fa-lightbulb',
          color: '#00ff88',
          creator: project.creator?.name || 'Unknown'
        })));
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      this.state.sessionLog.errors.push({
        step: 'projects',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    return { items: projects, count: projects.length };
  }

  async loadPeople() {
    const { userProfile, supabase } = this.state;
    const people = [];

    try {
      const { data: connections } = await supabase
        .from('connections')
        .select('from_user_id, to_user_id')
        .or(`from_user_id.eq.${userProfile.id},to_user_id.eq.${userProfile.id}`);

      const connectedIds = new Set([userProfile.id]);
      connections?.forEach(conn => {
        connectedIds.add(conn.from_user_id);
        connectedIds.add(conn.to_user_id);
      });

      const { data, error } = await supabase
        .from('community')
        .select('*')
        .not('id', 'in', `(${Array.from(connectedIds).join(',')})`)
        .limit(5);

      if (error) throw error;

      if (data) {
        people.push(...data.map(person => ({
          id: person.id,
          title: person.name,
          description: person.bio || 'Connect with this person',
          icon: 'fa-user',
          color: '#ffd700',
          email: person.email,
          bio: person.bio,
          skills: person.skills || [],
          action: () => this.sendConnectionRequest(person)
        })));
      }
    } catch (error) {
      console.error('Error loading people:', error);
      this.state.sessionLog.errors.push({
        step: 'people',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    return { items: people, count: people.length };
  }

  async sendConnectionRequest(person) {
    try {
      const { userProfile, supabase } = this.state;
      
      const { error } = await supabase
        .from('connections')
        .insert({
          from_user_id: userProfile.id,
          to_user_id: person.id,
          status: 'pending'
        });

      if (error) throw error;

      this.state.sessionLog.connectionRequestsSent.push({
        name: person.title,
        bio: person.bio || 'No bio provided',
        email: person.email || 'No email',
        timestamp: new Date().toISOString()
      });

      alert(`Connection request sent to ${person.title}!`);
    } catch (error) {
      console.error('Error sending connection request:', error);
      this.state.sessionLog.errors.push({
        action: 'send_connection_request',
        person: person.title,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      alert('Failed to send connection request');
    }
  }

  async generateReport() {
    this.state.sessionLog.endTime = new Date().toISOString();
    
    const report = {
      sessionDuration: this.calculateDuration(),
      notifications: this.state.stepData.notifications?.count || 0,
      themes: this.state.stepData.themes?.count || 0,
      projects: this.state.stepData.projects?.count || 0,
      people: this.state.stepData.people?.count || 0,
      connectionRequestsSent: this.state.sessionLog.connectionRequestsSent.length,
      connectionsAccepted: this.state.sessionLog.connectionsAccepted.length,
      errors: this.state.sessionLog.errors.length,
      timestamp: new Date().toISOString()
    };

    return { report };
  }

  calculateDuration() {
    if (!this.state.sessionLog.startTime || !this.state.sessionLog.endTime) {
      return '0 minutes';
    }
    
    const start = new Date(this.state.sessionLog.startTime);
    const end = new Date(this.state.sessionLog.endTime);
    const minutes = Math.round((end - start) / 60000);
    
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  renderStepContent(step, data) {
    if (!this.elements.content) return;

    if (step.id === 'report') {
      this.renderReport(data.report);
      return;
    }

    const items = data.items || [];
    
    if (items.length === 0) {
      this.renderEmptyStep(step);
      return;
    }

    // Card-based UI like previous version
    const html = items.map((item, index) => `
      <button 
        class="start-recommendation-card"
        id="step-item-${index}"
        style="
          background: linear-gradient(135deg, rgba(0,0,0,0.8), rgba(0,0,0,0.6));
          border: 2px solid ${item.color}40;
          border-radius: 12px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.3s ease;
          text-align: left;
          width: 100%;
          display: flex;
          align-items: center;
          gap: 1.5rem;
          margin-bottom: 1rem;
        "
        onmouseover="this.style.borderColor='${item.color}80'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px ${item.color}40';"
        onmouseout="this.style.borderColor='${item.color}40'; this.style.transform='translateY(0)'; this.style.boxShadow='none';"
      >
        <div style="
          width: 60px;
          height: 60px;
          background: ${item.color}20;
          border: 2px solid ${item.color};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <i class="fas ${item.icon}" style="font-size: 1.5rem; color: ${item.color};"></i>
        </div>
        <div style="flex: 1;">
          <div style="color: #fff; font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem;">
            ${item.title}
          </div>
          <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem;">
            ${item.description}
          </div>
        </div>
        <i class="fas fa-arrow-right" style="color: ${item.color}; font-size: 1.25rem; opacity: 0.7;"></i>
      </button>
    `).join('');

    const continueBtn = `
      <button 
        id="step-next-btn"
        style="
          width: 100%;
          padding: 1rem 2rem;
          background: linear-gradient(135deg, ${step.color}, ${step.color}80);
          border: none;
          border-radius: 10px;
          color: #000;
          font-weight: 700;
          font-size: 1.1rem;
          cursor: pointer;
          transition: all 0.3s;
          margin-top: 1rem;
        "
        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 24px ${step.color}60';"
        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';"
      >
        <i class="fas fa-arrow-right" style="margin-right: 0.5rem;"></i>Continue to Next Step
      </button>
    `;

    this.elements.content.innerHTML = html + continueBtn;

    // Wire up next button
    const nextBtn = document.getElementById('step-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.nextStep());
    }

    // Wire up item clicks
    items.forEach((item, index) => {
      const itemEl = document.getElementById(`step-item-${index}`);
      if (itemEl && item.action) {
        itemEl.addEventListener('click', (e) => {
          e.preventDefault();
          item.action();
        });
      }
    });
  }

  renderEmptyStep(step) {
    this.elements.content.innerHTML = `
      <div style="text-align:center; padding:3rem 2rem;">
        <i class="fas ${step.icon}" style="font-size:4rem; color:${step.color}40; margin-bottom:1rem;"></i>
        <h3 style="color:${step.color}; margin-bottom:0.5rem; font-size:1.5rem;">No ${step.title}</h3>
        <p style="color:rgba(255,255,255,0.6); margin-bottom:2rem;">You're all caught up!</p>
        <button 
          onclick="startFlowManager.nextStep()"
          style="padding:1rem 2rem; background:linear-gradient(135deg, ${step.color}, ${step.color}80); border:none; border-radius:10px; color:#000; font-weight:700; cursor:pointer; font-size:1.1rem;"
        >
          Continue <i class="fas fa-arrow-right" style="margin-left:0.5rem;"></i>
        </button>
      </div>
    `;
  }

  renderReport(report) {
    const html = `
      <div style="text-align:center; padding:2rem;">
        <div style="font-size:4rem; color:#00ff88; margin-bottom:1rem;">
          <i class="fas fa-check-circle"></i>
        </div>
        <h2 style="color:#00ff88; font-size:2rem; margin-bottom:0.5rem;">Session Complete!</h2>
        <p style="color:rgba(255,255,255,0.7); margin-bottom:2rem;">Duration: ${report.sessionDuration}</p>
        
        <div style="background:rgba(0,0,0,0.4); border:1px solid rgba(0,255,136,0.3); border-radius:12px; padding:1.5rem; margin-bottom:2rem; text-align:left;">
          <h3 style="color:#00e0ff; margin-bottom:1rem; font-size:1.2rem;">
            <i class="fas fa-chart-bar" style="margin-right:0.5rem;"></i>Session Summary
          </h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
            ${this.renderReportStat('Notifications', report.notifications, 'fa-bell', '#00e0ff')}
            ${this.renderReportStat('Themes', report.themes, 'fa-palette', '#ffaa00')}
            ${this.renderReportStat('Projects', report.projects, 'fa-lightbulb', '#00ff88')}
            ${this.renderReportStat('People', report.people, 'fa-users', '#ffd700')}
          </div>
          
          <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:1rem; margin-top:1rem;">
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem;">
              <div style="text-align:center;">
                <div style="font-size:2rem; font-weight:bold; color:#00ff88;">${report.connectionRequestsSent}</div>
                <div style="font-size:0.85rem; color:rgba(255,255,255,0.6);">Connection Requests Sent</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:2rem; font-weight:bold; color:#00e0ff;">${report.connectionsAccepted}</div>
                <div style="font-size:0.85rem; color:rgba(255,255,255,0.6);">Connections Accepted</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:2rem; font-weight:bold; color:${report.errors > 0 ? '#ff6b6b' : '#00ff88'}">${report.errors}</div>
                <div style="font-size:0.85rem; color:rgba(255,255,255,0.6);">Errors</div>
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex; gap:1rem; justify-content:center;">
          <button 
            onclick="startFlowManager.downloadReport()"
            style="padding:1rem 2rem; background:rgba(0,224,255,0.2); border:2px solid #00e0ff; border-radius:10px; color:#00e0ff; font-weight:700; cursor:pointer; font-size:1rem; transition:all 0.3s;"
            onmouseover="this.style.background='rgba(0,224,255,0.3)'; this.style.transform='translateY(-2px)';"
            onmouseout="this.style.background='rgba(0,224,255,0.2)'; this.style.transform='translateY(0)';"
          >
            <i class="fas fa-download" style="margin-right:0.5rem;"></i>Download Report
          </button>
          <button 
            onclick="startFlowManager.close()"
            style="padding:1rem 2rem; background:linear-gradient(135deg, #00ff88, #00e0ff); border:none; border-radius:10px; color:#000; font-weight:700; cursor:pointer; font-size:1rem; transition:all 0.3s;"
            onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 24px rgba(0,255,136,0.4)';"
            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';"
          >
            <i class="fas fa-rocket" style="margin-right:0.5rem;"></i>Start Exploring
          </button>
        </div>
      </div>
    `;

    this.elements.content.innerHTML = html;
  }

  renderReportStat(label, value, icon, color) {
    return `
      <div style="text-align:center; padding:1rem;">
        <i class="fas ${icon}" style="font-size:1.5rem; color:${color}; margin-bottom:0.5rem;"></i>
        <div style="font-size:2rem; font-weight:bold; color:#fff; margin-bottom:0.25rem;">${value}</div>
        <div style="font-size:0.85rem; color:rgba(255,255,255,0.6);">${label}</div>
      </div>
    `;
  }

  renderStepError(step) {
    this.elements.content.innerHTML = `
      <div style="text-align:center; padding:3rem 2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:3rem; color:#ff6b6b; margin-bottom:1rem;"></i>
        <h3 style="color:#ff6b6b; margin-bottom:0.5rem;">Unable to load ${step.title}</h3>
        <p style="color:rgba(255,255,255,0.7); margin-bottom:2rem;">An error occurred while loading this step</p>
        <button 
          onclick="startFlowManager.nextStep()"
          style="padding:1rem 2rem; background:#00e0ff; border:none; border-radius:10px; color:#000; font-weight:700; cursor:pointer; font-size:1rem;"
        >
          Skip to Next Step
        </button>
      </div>
    `;
  }

  updateProgress() {
    const modalHeader = this.elements.modal?.querySelector('h2');
    if (modalHeader) {
      const step = this.steps[this.state.currentStep];
      modalHeader.innerHTML = `
        <i class="fas ${step.icon}" style="margin-right:0.5rem;"></i>
        ${step.title}
      `;
      modalHeader.style.color = step.color;
    }

    const subtitle = this.elements.modal?.querySelector('p');
    if (subtitle) {
      subtitle.textContent = `Step ${this.state.currentStep + 1} of ${this.steps.length}`;
    }
  }

  downloadReport() {
    const report = {
      sessionSummary: {
        startTime: this.state.sessionLog.startTime,
        endTime: this.state.sessionLog.endTime,
        duration: this.calculateDuration(),
        completedSteps: this.state.currentStep + 1,
        totalSteps: this.steps.length
      },
      statistics: {
        notifications: this.state.stepData.notifications?.count || 0,
        themes: this.state.stepData.themes?.count || 0,
        projects: this.state.stepData.projects?.count || 0,
        people: this.state.stepData.people?.count || 0
      },
      connectionRequestsSent: this.state.sessionLog.connectionRequestsSent,
      connectionsAccepted: this.state.sessionLog.connectionsAccepted,
      errors: this.state.sessionLog.errors,
      generatedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `start-sequence-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('📥 Report downloaded');
  }

  nextStep() {
    const nextIndex = this.state.currentStep + 1;
    if (nextIndex < this.steps.length) {
      this.showStep(nextIndex);
    } else {
      this.completeSequence();
    }
  }

  skipSequence() {
    console.log('⏭️ User skipped sequence');
    this.close();
  }

  completeSequence() {
    console.log('✅ Sequence complete');
    this.state.sequenceComplete = true;
  }

  close() {
    if (!this.state.isOpen) return;
    
    console.log('🚀 Closing START modal');
    this.state.isOpen = false;

    if (this.elements.modal) {
      this.elements.modal.style.opacity = '0';
      this.elements.modal.style.transform = 'translate(-50%, -50%) scale(0.95)';
      
      setTimeout(() => {
        this.elements.modal.style.display = 'none';
        if (this.elements.backdrop) {
          this.elements.backdrop.style.display = 'none';
        }

        // Restore the Filter View panel
        const legendPanel = document.getElementById('synapse-legend');
        if (legendPanel) {
          legendPanel.style.display = '';
        }

        // Restore the search container
        const searchContainer = document.getElementById('centered-search-container');
        if (searchContainer) {
          searchContainer.style.display = 'flex';
        }
      }, 300);
    }

    window.dispatchEvent(new CustomEvent('start-modal-closed'));
  }

  skipStart() {
    console.log('🔍 User skipped START sequence');
    
    if (this.elements.container) {
      this.elements.container.style.transition = 'opacity 0.5s ease';
      this.elements.container.style.opacity = '0';
      setTimeout(() => {
        this.elements.container.style.display = 'none';
      }, 500);
    }
  }

  openMessages() {
    setTimeout(() => {
      const modal = document.getElementById('messages-modal');
      if (modal) {
        modal.classList.add('active');
        if (window.MessagingModule?.init) {
          window.MessagingModule.init();
        }
      }
    }, 100);
  }

  openProjects() {
    setTimeout(() => {
      if (typeof window.openProjectsModal === 'function') {
        window.openProjectsModal();
      }
    }, 100);
  }

  openConnections() {
    setTimeout(() => {
      if (typeof window.openQuickConnectModal === 'function') {
        window.openQuickConnectModal();
      }
    }, 100);
  }

  openEndorsements() {
    setTimeout(() => {
      if (typeof window.openEndorsementsModal === 'function') {
        window.openEndorsementsModal();
      }
    }, 100);
  }
}

const startFlowManager = new StartFlowManager();

window.startFlowManager = startFlowManager;
window.openStartModal = () => startFlowManager.open();
window.closeStartModal = () => startFlowManager.close();

console.log('✅ Progressive START Flow initialized');
