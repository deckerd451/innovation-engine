// ================================================================
// UNIFIED START FLOW - Progressive Multi-Step Sequence
// ================================================================
// Guides users through: Notifications → Themes → Organizations → Projects → People → Report
// Each step completes before moving to the next
// ================================================================

console.log("%c🚀 Progressive START Flow Loading", "color:#0f8; font-weight:bold; font-size:14px");

class StartFlowManager {
  constructor() {
    this.state = {
      isOpen: false,
      userProfile: null,
      supabase: null,
      currentStep: 0,
      totalSteps: 6,
      stepData: {},
      sequenceComplete: false
    };
    
    this.steps = [
      { id: 'notifications', title: 'Notifications', icon: 'fa-bell', color: '#00e0ff' },
      { id: 'themes', title: 'Suggested Themes', icon: 'fa-palette', color: '#ffaa00' },
      { id: 'organizations', title: 'Organizations', icon: 'fa-building', color: '#a855f7' },
      { id: 'projects', title: 'Projects', icon: 'fa-lightbulb', color: '#00ff88' },
      { id: 'people', title: 'People to Connect', icon: 'fa-users', color: '#ffd700' },
      { id: 'report', title: 'Your Daily Report', icon: 'fa-chart-line', color: '#00e0ff' }
    ];
    
    this.elements = {
      container: null,
      modal: null,
      backdrop: null,
      content: null,
      progress: null
    };
    
    this.init();
  }

  // ================================================================
  // INITIALIZATION
  // ================================================================
  
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
    
    console.log('✅ Profile loaded in START Flow:', {
      hasProfile: !!this.state.userProfile,
      userId: this.state.userProfile?.id
    });
    
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

  // ================================================================
  // SEQUENCE CONTROL
  // ================================================================

  async open() {
    if (this.state.isOpen) return;
    
    console.log('🚀 Starting progressive sequence');
    this.state.isOpen = true;
    this.state.currentStep = 0;
    this.state.sequenceComplete = false;

    // Hide start button container
    if (this.elements.container) {
      this.elements.container.style.transition = 'opacity 0.5s ease';
      this.elements.container.style.opacity = '0';
      setTimeout(() => {
        this.elements.container.style.display = 'none';
      }, 500);
    }

    // Show modal
    if (this.elements.modal && this.elements.backdrop) {
      this.elements.modal.style.display = 'block';
      this.elements.backdrop.style.display = 'block';
      
      requestAnimationFrame(() => {
        this.elements.modal.style.opacity = '1';
        this.elements.modal.style.transform = 'translate(-50%, -50%) scale(1)';
      });
    }

    // Start the sequence
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

    // Update progress indicator
    this.updateProgress();

    // Load and render step content
    await this.renderStep(step);
  }

  async renderStep(step) {
    if (!this.elements.content) return;

    // Show loading
    this.elements.content.innerHTML = `
      <div style="text-align:center; padding:2rem;">
        <i class="fas fa-spinner fa-spin" style="font-size:2rem; color:${step.color}; margin-bottom:1rem;"></i>
        <p style="color:rgba(255,255,255,0.7);">Loading ${step.title.toLowerCase()}...</p>
      </div>
    `;

    try {
      // Load step data
      const data = await this.loadStepData(step.id);
      this.state.stepData[step.id] = data;

      // Render step content
      this.renderStepContent(step, data);
    } catch (error) {
      console.error(`❌ Error loading step ${step.id}:`, error);
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
      case 'organizations':
        return await this.loadOrganizations();
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

  // ================================================================
  // DATA LOADERS
  // ================================================================

  async loadNotifications() {
    const { userProfile, supabase } = this.state;
    const notifications = [];

    try {
      // Check unread messages
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
            action: () => this.openMessages()
          });
        }
      }

      // Check connection requests
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
          action: () => this.openConnections()
        });
      }

      // Check endorsements
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const { count: recentEndorsements } = await supabase
        .from('endorsements')
        .select('*', { count: 'exact', head: true })
        .eq('endorsed_community_id', userProfile.id)
        .gte('created_at', weekAgo.toISOString());

      if (recentEndorsements > 0) {
        notifications.push({
          type: 'endorsements',
          title: `${recentEndorsements} new endorsement${recentEndorsements > 1 ? 's' : ''}`,
          description: 'See who endorsed you',
          icon: 'fa-star',
          action: () => this.openEndorsements()
        });
      }

    } catch (error) {
      console.error('Error loading notifications:', error);
    }

    return { items: notifications, count: notifications.length };
  }

  async loadThemes() {
    const { supabase } = this.state;
    const themes = [];

    try {
      const { data } = await supabase
        .from('themes')
        .select('*')
        .eq('active', true)
        .order('member_count', { ascending: false })
        .limit(5);

      if (data) {
        themes.push(...data.map(theme => ({
          id: theme.id,
          title: theme.name,
          description: theme.description || 'Join this theme',
          icon: 'fa-palette',
          members: theme.member_count || 0,
          color: theme.color || '#ffaa00'
        })));
      }
    } catch (error) {
      console.error('Error loading themes:', error);
    }

    return { items: themes, count: themes.length };
  }

  async loadOrganizations() {
    const { supabase } = this.state;
    const orgs = [];

    try {
      const { data } = await supabase
        .from('organizations')
        .select('*')
        .eq('is_active', true)
        .order('member_count', { ascending: false })
        .limit(5);

      if (data) {
        orgs.push(...data.map(org => ({
          id: org.id,
          title: org.name,
          description: org.description || 'Learn more',
          icon: 'fa-building',
          members: org.member_count || 0
        })));
      }
    } catch (error) {
      console.error('Error loading organizations:', error);
    }

    return { items: orgs, count: orgs.length };
  }

  async loadProjects() {
    const { supabase } = this.state;
    const projects = [];

    try {
      const { data } = await supabase
        .from('projects')
        .select('*, creator:community!projects_creator_id_fkey(name)')
        .eq('status', 'in-progress')
        .order('created_at', { ascending: false })
        .limit(5);

      if (data) {
        projects.push(...data.map(project => ({
          id: project.id,
          title: project.name,
          description: project.description || 'Join this project',
          icon: 'fa-lightbulb',
          creator: project.creator?.name || 'Unknown'
        })));
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }

    return { items: projects, count: projects.length };
  }

  async loadPeople() {
    const { userProfile, supabase } = this.state;
    const people = [];

    try {
      // Get existing connections
      const { data: connections } = await supabase
        .from('connections')
        .select('from_user_id, to_user_id')
        .or(`from_user_id.eq.${userProfile.id},to_user_id.eq.${userProfile.id}`);

      const connectedIds = new Set([userProfile.id]);
      connections?.forEach(conn => {
        connectedIds.add(conn.from_user_id);
        connectedIds.add(conn.to_user_id);
      });

      // Get suggested people
      const { data } = await supabase
        .from('community')
        .select('*')
        .not('id', 'in', `(${Array.from(connectedIds).join(',')})`)
        .limit(5);

      if (data) {
        people.push(...data.map(person => ({
          id: person.id,
          title: person.name,
          description: person.bio || 'Connect with this person',
          icon: 'fa-user',
          skills: person.skills || []
        })));
      }
    } catch (error) {
      console.error('Error loading people:', error);
    }

    return { items: people, count: people.length };
  }

  async generateReport() {
    const report = {
      notifications: this.state.stepData.notifications?.count || 0,
      themes: this.state.stepData.themes?.count || 0,
      organizations: this.state.stepData.organizations?.count || 0,
      projects: this.state.stepData.projects?.count || 0,
      people: this.state.stepData.people?.count || 0,
      timestamp: new Date().toISOString()
    };

    return { report };
  }

  // ================================================================
  // RENDER FUNCTIONS
  // ================================================================

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

    const html = `
      <div style="margin-bottom:1.5rem;">
        <h3 style="color:${step.color}; font-size:1.2rem; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
          <i class="fas ${step.icon}"></i>
          ${step.title}
        </h3>
        <div style="display:flex; flex-direction:column; gap:0.75rem;">
          ${items.map((item, index) => this.renderItem(item, step, index)).join('')}
        </div>
      </div>
      <div style="display:flex; gap:1rem; margin-top:1.5rem;">
        <button 
          id="step-next-btn"
          style="flex:1; padding:1rem; background:linear-gradient(135deg, ${step.color}40, ${step.color}20);
          border:2px solid ${step.color}; border-radius:10px; color:#fff; font-weight:600; cursor:pointer; transition:all 0.3s;"
        >
          <i class="fas fa-arrow-right" style="margin-right:0.5rem;"></i>Continue
        </button>
      </div>
    `;

    this.elements.content.innerHTML = html;

    // Wire up next button
    const nextBtn = document.getElementById('step-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.nextStep());
      nextBtn.addEventListener('mouseover', () => {
        nextBtn.style.background = `linear-gradient(135deg, ${step.color}60, ${step.color}40)`;
        nextBtn.style.transform = 'translateY(-2px)';
      });
      nextBtn.addEventListener('mouseout', () => {
        nextBtn.style.background = `linear-gradient(135deg, ${step.color}40, ${step.color}20)`;
        nextBtn.style.transform = 'translateY(0)';
      });
    }

    // Wire up item clicks
    items.forEach((item, index) => {
      const itemEl = document.getElementById(`step-item-${index}`);
      if (itemEl && item.action) {
        itemEl.addEventListener('click', () => item.action());
      }
    });
  }

  renderItem(item, step, index) {
    return `
      <div 
        id="step-item-${index}"
        style="
          background:rgba(0,0,0,0.4); 
          border:1px solid ${step.color}40; 
          border-radius:8px; 
          padding:1rem; 
          cursor:${item.action ? 'pointer' : 'default'};
          transition:all 0.3s;
        "
        onmouseover="if(${!!item.action}) { this.style.borderColor='${step.color}80'; this.style.background='rgba(0,0,0,0.6)'; }"
        onmouseout="this.style.borderColor='${step.color}40'; this.style.background='rgba(0,0,0,0.4)';"
      >
        <div style="display:flex; align-items:center; gap:1rem;">
          <div style="
            width:40px; height:40px; background:${step.color}20; border:2px solid ${step.color};
            border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;
          ">
            <i class="fas ${item.icon}" style="color:${step.color};"></i>
          </div>
          <div style="flex:1;">
            <div style="color:#fff; font-weight:600; margin-bottom:0.25rem;">${item.title}</div>
            <div style="color:rgba(255,255,255,0.6); font-size:0.9rem;">${item.description}</div>
          </div>
          ${item.action ? `<i class="fas fa-chevron-right" style="color:${step.color}; opacity:0.5;"></i>` : ''}
        </div>
      </div>
    `;
  }

  renderEmptyStep(step) {
    this.elements.content.innerHTML = `
      <div style="text-align:center; padding:2rem;">
        <i class="fas ${step.icon}" style="font-size:3rem; color:${step.color}40; margin-bottom:1rem;"></i>
        <h3 style="color:${step.color}; margin-bottom:0.5rem;">No ${step.title}</h3>
        <p style="color:rgba(255,255,255,0.6); margin-bottom:2rem;">You're all caught up!</p>
        <button 
          onclick="startFlowManager.nextStep()"
          style="padding:1rem 2rem; background:${step.color}; border:none; border-radius:10px; color:#000; font-weight:600; cursor:pointer;"
        >
          Continue <i class="fas fa-arrow-right" style="margin-left:0.5rem;"></i>
        </button>
      </div>
    `;
  }

  renderReport(report) {
    const totalItems = report.notifications + report.themes + report.organizations + report.projects + report.people;
    
    this.elements.content.innerHTML = `
      <div style="text-align:center; padding:2rem;">
        <div style="font-size:4rem; color:#00ff88; margin-bottom:1rem;">
          <i class="fas fa-check-circle"></i>
        </div>
        <h2 style="color:#00ff88; font-size:1.8rem; margin-bottom:0.5rem;">Sequence Complete!</h2>
        <p style="color:rgba(255,255,255,0.7); margin-bottom:2rem;">Here's your daily summary</p>
        
        <div style="background:rgba(0,0,0,0.4); border:1px solid rgba(0,255,136,0.3); border-radius:12px; padding:1.5rem; margin-bottom:2rem; text-align:left;">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:1rem;">
            ${this.renderReportStat('Notifications', report.notifications, 'fa-bell', '#00e0ff')}
            ${this.renderReportStat('Themes', report.themes, 'fa-palette', '#ffaa00')}
            ${this.renderReportStat('Organizations', report.organizations, 'fa-building', '#a855f7')}
            ${this.renderReportStat('Projects', report.projects, 'fa-lightbulb', '#00ff88')}
            ${this.renderReportStat('People', report.people, 'fa-users', '#ffd700')}
          </div>
        </div>

        <button 
          onclick="startFlowManager.close()"
          style="padding:1rem 2rem; background:linear-gradient(135deg, #00ff88, #00e0ff); border:none; border-radius:10px; color:#000; font-weight:700; cursor:pointer; font-size:1.1rem;"
        >
          <i class="fas fa-rocket" style="margin-right:0.5rem;"></i>Start Exploring
        </button>
      </div>
    `;
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
      <div style="text-align:center; padding:2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem; color:#ff6b6b; margin-bottom:1rem;"></i>
        <p style="color:rgba(255,255,255,0.7); margin-bottom:1.5rem;">Unable to load ${step.title.toLowerCase()}</p>
        <button 
          onclick="startFlowManager.nextStep()"
          style="padding:0.75rem 1.5rem; background:#00e0ff; border:none; border-radius:8px; color:#000; font-weight:600; cursor:pointer;"
        >
          Skip to Next
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

    // Update subtitle with progress
    const subtitle = this.elements.modal?.querySelector('p');
    if (subtitle) {
      subtitle.textContent = `Step ${this.state.currentStep + 1} of ${this.steps.length}`;
    }
  }

  // ================================================================
  // NAVIGATION
  // ================================================================

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
    // Report is the last step, so it's already shown
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

  // ================================================================
  // ACTION HANDLERS
  // ================================================================

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

// ================================================================
// INITIALIZE
// ================================================================

const startFlowManager = new StartFlowManager();

window.startFlowManager = startFlowManager;
window.openStartModal = () => startFlowManager.open();
window.closeStartModal = () => startFlowManager.close();

console.log('✅ Progressive START Flow initialized');
