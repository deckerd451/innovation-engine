// ================================================================
// UNIFIED START FLOW - Maximum Efficiency
// ================================================================
// Single source of truth for the start sequence
// Replaces: start-flow.js, start-flow-integration.js, start-flow-enhanced.js,
//           start-flow-sequential.js, start-flow-ui-redesigned.js, etc.
// ================================================================

console.log("%c🚀 Unified START Flow Loading", "color:#0f8; font-weight:bold; font-size:14px");

class StartFlowManager {
  constructor() {
    this.state = {
      isOpen: false,
      userProfile: null,
      supabase: null,
      recommendations: null,
      hasShownToday: false
    };
    
    this.elements = {
      container: null,
      modal: null,
      backdrop: null,
      content: null
    };
    
    this.init();
  }

  // ================================================================
  // INITIALIZATION
  // ================================================================
  
  init() {
    console.log('🚀 Initializing Unified START Flow');
    
    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    // Cache DOM elements
    this.elements.container = document.getElementById('start-button-container');
    this.elements.modal = document.getElementById('start-modal');
    this.elements.backdrop = document.getElementById('start-modal-backdrop');
    this.elements.content = document.getElementById('start-options-container');

    // Listen for profile loaded
    window.addEventListener('profile-loaded', (e) => this.handleProfileLoaded(e));
    
    // Wire up buttons
    this.wireUpButtons();
    
    console.log('✅ START Flow setup complete');
  }

  handleProfileLoaded(e) {
    this.state.userProfile = e.detail?.profile || e.detail;
    this.state.supabase = window.supabase;
    
    console.log('✅ Profile loaded in START Flow:', {
      hasProfile: !!this.state.userProfile,
      userId: this.state.userProfile?.id
    });
    
    // Show start button container if it exists
    if (this.elements.container) {
      this.elements.container.style.display = 'flex';
    }
  }

  wireUpButtons() {
    // Main START button (centered)
    const startBtn = document.getElementById('btn-start-center');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.open());
    }

    // Explore freely button
    const exploreBtn = document.getElementById('btn-explore-cancel');
    if (exploreBtn) {
      exploreBtn.addEventListener('click', () => this.skipStart());
    }

    // Close button in modal
    const closeBtn = document.querySelector('#start-modal .mentor-panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Explore freely button in modal
    const exploreFreelyBtn = document.getElementById('explore-freely-btn');
    if (exploreFreelyBtn) {
      exploreFreelyBtn.addEventListener('click', () => this.close());
    }
  }

  // ================================================================
  // OPEN/CLOSE LOGIC
  // ================================================================

  async open() {
    if (this.state.isOpen) return;
    
    console.log('🚀 Opening START modal');
    this.state.isOpen = true;

    // Hide the start button container
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
      
      // Animate in
      requestAnimationFrame(() => {
        this.elements.modal.style.opacity = '1';
        this.elements.modal.style.transform = 'translate(-50%, -50%) scale(1)';
      });
    }

    // Load recommendations
    await this.loadRecommendations();
    
    // Dispatch event
    window.dispatchEvent(new CustomEvent('start-modal-opened'));
  }

  close() {
    if (!this.state.isOpen) return;
    
    console.log('🚀 Closing START modal');
    this.state.isOpen = false;

    // Animate out
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

    // Dispatch event
    window.dispatchEvent(new CustomEvent('start-modal-closed'));
  }

  skipStart() {
    console.log('🔍 User skipped START sequence');
    
    // Hide start button container
    if (this.elements.container) {
      this.elements.container.style.transition = 'opacity 0.5s ease';
      this.elements.container.style.opacity = '0';
      setTimeout(() => {
        this.elements.container.style.display = 'none';
      }, 500);
    }
  }

  // ================================================================
  // RECOMMENDATIONS ENGINE
  // ================================================================

  async loadRecommendations() {
    if (!this.elements.content) {
      console.warn('⚠️ Content container not found');
      return;
    }

    // Show loading
    this.elements.content.innerHTML = `
      <div style="text-align:center; padding:2rem; background:rgba(0,0,0,0.6); border-radius:12px; border:1px solid rgba(0,224,255,0.2);">
        <i class="fas fa-spinner fa-spin" style="font-size:2rem; color:#00e0ff; margin-bottom:1rem;"></i>
        <p style="color:rgba(255,255,255,0.7);">Analyzing your network...</p>
      </div>
    `;

    try {
      const recommendations = await this.generateRecommendations();
      this.renderRecommendations(recommendations);
    } catch (error) {
      console.error('❌ Error loading recommendations:', error);
      this.renderFallback();
    }
  }

  async generateRecommendations() {
    const { userProfile, supabase } = this.state;
    
    if (!userProfile || !supabase) {
      console.warn('⚠️ Missing user profile or supabase');
      return this.getDefaultRecommendations();
    }

    const recommendations = [];

    try {
      // 1. Check for unread messages
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
          recommendations.push({
            type: 'messages',
            priority: 10,
            title: `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`,
            description: 'Catch up on your conversations',
            icon: 'fa-envelope',
            color: '#00e0ff',
            action: () => this.openMessages()
          });
        }
      }

      // 2. Check for active projects
      const { data: projects } = await supabase
        .from('projects')
        .select('*')
        .eq('status', 'in-progress')
        .limit(5);

      if (projects?.length > 0) {
        recommendations.push({
          type: 'projects',
          priority: 8,
          title: `${projects.length} active project${projects.length > 1 ? 's' : ''}`,
          description: 'Continue building',
          icon: 'fa-rocket',
          color: '#ff6b6b',
          action: () => this.openProjects()
        });
      }

      // 3. Check for connection requests
      const { count: pendingRequests } = await supabase
        .from('connections')
        .select('*', { count: 'exact', head: true })
        .eq('to_user_id', userProfile.id)
        .eq('status', 'pending');

      if (pendingRequests > 0) {
        recommendations.push({
          type: 'connections',
          priority: 9,
          title: `${pendingRequests} connection request${pendingRequests > 1 ? 's' : ''}`,
          description: 'Review and respond',
          icon: 'fa-user-plus',
          color: '#ffd700',
          action: () => this.openConnections()
        });
      }

      // 4. Suggest exploring network
      recommendations.push({
        type: 'explore',
        priority: 5,
        title: 'Explore your network',
        description: 'Discover people and opportunities',
        icon: 'fa-compass',
        color: '#00ff88',
        action: () => this.close()
      });

    } catch (error) {
      console.error('❌ Error generating recommendations:', error);
    }

    // Sort by priority
    recommendations.sort((a, b) => b.priority - a.priority);

    return recommendations.length > 0 ? recommendations : this.getDefaultRecommendations();
  }

  getDefaultRecommendations() {
    return [
      {
        type: 'explore',
        priority: 5,
        title: 'Explore your network',
        description: 'Discover people and opportunities',
        icon: 'fa-compass',
        color: '#00ff88',
        action: () => this.close()
      },
      {
        type: 'connect',
        priority: 4,
        title: 'Find people to connect with',
        description: 'Grow your network',
        icon: 'fa-user-plus',
        color: '#00e0ff',
        action: () => this.openConnections()
      },
      {
        type: 'projects',
        priority: 3,
        title: 'Browse projects',
        description: 'Find something to build',
        icon: 'fa-lightbulb',
        color: '#ff6b6b',
        action: () => this.openProjects()
      }
    ];
  }

  renderRecommendations(recommendations) {
    if (!this.elements.content) return;

    const html = recommendations.map((rec, index) => `
      <button 
        class="start-recommendation-card"
        data-type="${rec.type}"
        style="
          background: linear-gradient(135deg, rgba(0,0,0,0.8), rgba(0,0,0,0.6));
          border: 2px solid ${rec.color}40;
          border-radius: 12px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.3s ease;
          text-align: left;
          width: 100%;
          display: flex;
          align-items: center;
          gap: 1.5rem;
          animation: slideIn 0.4s ease ${index * 0.1}s both;
        "
        onmouseover="this.style.borderColor='${rec.color}80'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px ${rec.color}40';"
        onmouseout="this.style.borderColor='${rec.color}40'; this.style.transform='translateY(0)'; this.style.boxShadow='none';"
      >
        <div style="
          width: 60px;
          height: 60px;
          background: ${rec.color}20;
          border: 2px solid ${rec.color};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <i class="fas ${rec.icon}" style="font-size: 1.5rem; color: ${rec.color};"></i>
        </div>
        <div style="flex: 1;">
          <div style="color: #fff; font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem;">
            ${rec.title}
          </div>
          <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem;">
            ${rec.description}
          </div>
        </div>
        <i class="fas fa-arrow-right" style="color: ${rec.color}; font-size: 1.25rem; opacity: 0.7;"></i>
      </button>
    `).join('');

    this.elements.content.innerHTML = html;

    // Wire up click handlers
    recommendations.forEach((rec, index) => {
      const card = this.elements.content.children[index];
      if (card) {
        card.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('🎯 Recommendation clicked:', rec.type);
          if (typeof rec.action === 'function') {
            rec.action();
          } else {
            console.error('❌ No action defined for:', rec.type);
          }
        });
      }
    });
  }

  renderFallback() {
    if (!this.elements.content) return;

    this.elements.content.innerHTML = `
      <div style="text-align:center; padding:2rem; background:rgba(0,0,0,0.6); border-radius:12px; border:1px solid rgba(255,107,107,0.3);">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem; color:#ff6b6b; margin-bottom:1rem;"></i>
        <p style="color:rgba(255,255,255,0.7); margin-bottom:1.5rem;">Unable to load recommendations</p>
        <button 
          onclick="startFlowManager.close()"
          style="padding:0.75rem 1.5rem; background:#00e0ff; border:none; border-radius:8px; color:#000; font-weight:600; cursor:pointer;"
        >
          Explore Network
        </button>
      </div>
    `;
  }

  // ================================================================
  // ACTION HANDLERS
  // ================================================================

  openMessages() {
    this.close();
    setTimeout(() => {
      const modal = document.getElementById('messages-modal');
      if (modal) {
        modal.classList.add('active');
        if (window.MessagingModule?.init) {
          window.MessagingModule.init();
        }
      }
    }, 300);
  }

  openProjects() {
    this.close();
    setTimeout(() => {
      if (typeof window.openProjectsModal === 'function') {
        window.openProjectsModal();
      }
    }, 300);
  }

  openConnections() {
    this.close();
    setTimeout(() => {
      if (typeof window.openQuickConnectModal === 'function') {
        window.openQuickConnectModal();
      }
    }, 300);
  }
}

// ================================================================
// INITIALIZE
// ================================================================

const startFlowManager = new StartFlowManager();

// Export for global access
window.startFlowManager = startFlowManager;
window.openStartModal = () => startFlowManager.open();
window.closeStartModal = () => startFlowManager.close();

// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
`;
document.head.appendChild(style);

console.log('✅ Unified START Flow initialized');
