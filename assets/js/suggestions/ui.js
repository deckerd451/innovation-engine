// ================================================================
// DAILY SUGGESTIONS - UI INTEGRATION
// ================================================================
// Renders suggestions in the START UI and handles user interactions
// ================================================================

export class DailySuggestionsUI {
  constructor(engine, store) {
    this.engine = engine;
    this.store = store;
  }

  /**
   * Get suggestions for rendering in START UI
   * Returns array of insight objects compatible with EnhancedStartUI
   */
  async getSuggestionsForStartUI() {
    try {
      const profile = window.currentUserProfile;
      if (!profile) {
        console.warn('⚠️ No profile available for suggestions');
        return [];
      }
      
      const today = this.engine.getTodayKey();
      let suggestions = await this.store.getSuggestionsForDate(profile.id, today);
      
      // If no suggestions, generate them
      if (!suggestions || suggestions.length === 0) {
        suggestions = await this.engine.ensureTodaysSuggestions();
      }
      
      // Convert to START UI insight format
      return this.convertToInsights(suggestions);
    } catch (err) {
      console.error('❌ Failed to get suggestions for START UI:', err);
      return [];
    }
  }

  /**
   * Convert suggestions to START UI insight format
   */
  convertToInsights(suggestions) {
    return suggestions.map(s => this.suggestionToInsight(s));
  }

  /**
   * Convert a single suggestion to insight format
   */
  suggestionToInsight(suggestion) {
    // Handle both V1 and V2 suggestion formats
    const suggestionType = suggestion.suggestion_type || suggestion.type;
    const data = suggestion.data || {};
    
    const typeConfig = {
      person: {
        icon: 'user-plus',
        color: '#00e0ff',
        actionText: 'Connect',
        handler: 'viewPerson'
      },
      project_join: {
        icon: 'lightbulb',
        color: '#00ff88',
        actionText: 'View Project',
        handler: 'viewProject'
      },
      project_recruit: {
        icon: 'users',
        color: '#a855f7',
        actionText: 'Recruit',
        handler: 'viewProject'
      },
      project: {
        icon: 'lightbulb',
        color: '#00ff88',
        actionText: 'View Project',
        handler: 'viewProject'
      },
      theme: {
        icon: 'bullseye',
        color: '#ffaa00',
        actionText: 'Explore Theme',
        handler: 'viewTheme'
      },
      org: {
        icon: 'building',
        color: '#a855f7',
        actionText: 'View Organization',
        handler: 'viewOrganization'
      },
      coordination: {
        icon: 'network-wired',
        color: '#ff6b6b',
        actionText: data.action || 'View',
        handler: 'viewCoordination'
      }
    };
    
    const config = typeConfig[suggestionType] || typeConfig.person;
    
    // For coordination insights, use custom messaging
    if (suggestionType === 'coordination') {
      return {
        icon: data.icon || config.icon,
        color: data.color || config.color,
        message: data.message || 'Coordination opportunity',
        detail: data.detail || (suggestion.why && suggestion.why.length > 0 ? suggestion.why.join(' • ') : 'Opportunity detected'),
        action: data.action || config.actionText,
        handler: config.handler,
        priority: this.scoreToPriority(suggestion.score),
        data: {
          ...data,
          targetId: suggestion.target_id,
          suggestionType: suggestionType,
          subtype: suggestion.subtype,
          why: suggestion.why
        }
      };
    }
    
    // Build message for traditional suggestions
    let message = '';
    if (suggestionType === 'person') {
      message = `Connect with ${data.name || 'someone new'}`;
    } else if (suggestionType === 'project_join') {
      message = `Join: ${data.title || 'a project'}`;
    } else if (suggestionType === 'project_recruit') {
      message = `Recruit for: ${data.title || 'your project'}`;
    } else if (suggestionType === 'project') {
      message = data.title || 'View project';
    } else if (suggestionType === 'theme') {
      message = `Explore: ${data.title || 'a theme'}`;
    } else if (suggestionType === 'org') {
      message = `Follow: ${data.name || 'an organization'}`;
    }
    
    // Build detail (why this was recommended)
    const detail = suggestion.why && suggestion.why.length > 0
      ? suggestion.why.join(' • ')
      : 'Recommended for you';
    
    return {
      icon: config.icon,
      color: config.color,
      message: message,
      detail: detail,
      action: data.action || config.actionText,
      handler: config.handler,
      priority: this.scoreToPriority(suggestion.score),
      data: {
        ...data,
        targetId: suggestion.target_id,
        suggestionType: suggestionType,
        why: suggestion.why
      }
    };
  }

  /**
   * Convert score to priority level
   */
  scoreToPriority(score) {
    if (score >= 50) return 'high';
    if (score >= 20) return 'medium';
    return 'low';
  }

  /**
   * Show "why" modal for a suggestion
   */
  showWhyModal(suggestion) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(16,20,39,0.98));
      border: 2px solid rgba(0,224,255,0.4);
      border-radius: 16px;
      padding: 2rem;
      max-width: 500px;
      width: 90%;
      z-index: 10003;
      box-shadow: 0 20px 60px rgba(0,0,0,0.8);
    `;
    
    const typeLabels = {
      person: 'Person',
      project: 'Project',
      theme: 'Theme',
      org: 'Organization'
    };
    
    const typeLabel = typeLabels[suggestion.suggestion_type] || 'Item';
    const data = suggestion.data || {};
    const name = data.name || data.title || 'Unknown';
    
    modal.innerHTML = `
      <div style="text-align: center; margin-bottom: 1.5rem;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">💡</div>
        <h3 style="color: #00e0ff; margin: 0 0 0.5rem 0;">Why this ${typeLabel}?</h3>
        <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.9rem;">${name}</p>
      </div>
      
      <div style="background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem;">
        <h4 style="color: #00ff88; margin: 0 0 1rem 0; font-size: 1rem;">Reasons:</h4>
        <ul style="margin: 0; padding-left: 1.5rem; color: rgba(255,255,255,0.9);">
          ${suggestion.why.map(reason => `<li style="margin-bottom: 0.5rem;">${reason}</li>`).join('')}
        </ul>
      </div>
      
      <div style="text-align: center;">
        <button onclick="this.closest('div[style*=fixed]').remove(); document.getElementById('why-modal-backdrop').remove();" style="
          background: linear-gradient(135deg, #00e0ff, #0080ff);
          border: none;
          border-radius: 8px;
          color: #000;
          padding: 0.75rem 2rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
        ">
          Got it!
        </button>
      </div>
    `;
    
    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'why-modal-backdrop';
    backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
      z-index: 10002;
    `;
    backdrop.onclick = () => {
      modal.remove();
      backdrop.remove();
    };
    
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
  }

  /**
   * Handle suggestion action (view/connect/etc)
   */
  async handleSuggestionAction(handler, data) {
    const handlers = {
      viewPerson: () => this.viewPerson(data.targetId),
      viewProject: () => this.viewProject(data.targetId),
      viewTheme: () => this.viewTheme(data.targetId),
      viewOrganization: () => this.viewOrganization(data.targetId),
      viewCoordination: () => this.viewCoordination(data)
    };
    
    const handlerFn = handlers[handler];
    if (handlerFn) {
      await handlerFn();
    } else {
      console.warn('Unknown handler:', handler);
    }
  }

  /**
   * View a person (open profile or filter synapse)
   */
  viewPerson(personId) {
    // Try to open profile modal
    if (window.openProfile && typeof window.openProfile === 'function') {
      try {
        window.openProfile(personId);
        return;
      } catch (err) {
        console.warn('Failed to open profile:', err);
      }
    }
    
    if (window.viewProfile && typeof window.viewProfile === 'function') {
      try {
        window.viewProfile(personId);
        return;
      } catch (err) {
        console.warn('Failed to view profile:', err);
      }
    }
    
    // Fallback: filter synapse to show people
    if (window.filterByNodeType && typeof window.filterByNodeType === 'function') {
      try {
        window.filterByNodeType('person');
        this.showToast('Showing people in your network', 'info');
      } catch (err) {
        console.warn('Failed to filter by person:', err);
        this.showToast('Check the network visualization for people', 'info');
      }
    } else {
      this.showToast('Explore people in the network visualization', 'info');
    }
  }

  /**
   * View a project
   */
  viewProject(projectId) {
    // Try to open project modal
    if (window.openProjectsModal && typeof window.openProjectsModal === 'function') {
      try {
        window.openProjectsModal();
        return;
      } catch (err) {
        console.warn('Failed to open projects modal:', err);
      }
    }
    
    // Fallback: filter synapse
    if (window.filterByNodeType && typeof window.filterByNodeType === 'function') {
      try {
        window.filterByNodeType('project');
        this.showToast('Showing projects', 'info');
      } catch (err) {
        console.warn('Failed to filter by project:', err);
        this.showToast('Check the network visualization for projects', 'info');
      }
    } else {
      this.showToast('Explore projects in the network visualization', 'info');
    }
  }

  /**
   * View a theme
   */
  viewTheme(themeId) {
    // Try to filter to themes
    if (window.filterByNodeType && typeof window.filterByNodeType === 'function') {
      try {
        window.filterByNodeType('theme');
        this.showToast('Showing themes', 'info');
      } catch (err) {
        console.warn('Failed to filter by theme:', err);
        this.showToast('Themes view - check the network visualization', 'info');
      }
    } else {
      // Fallback: just show a message
      this.showToast('Explore themes in the network visualization', 'info');
    }
  }

  /**
   * View an organization
   */
  viewOrganization(orgId) {
    // Try to filter to organizations
    if (window.filterByNodeType && typeof window.filterByNodeType === 'function') {
      try {
        window.filterByNodeType('organization');
        this.showToast('Showing organizations', 'info');
      } catch (err) {
        console.warn('Failed to filter by organization:', err);
        this.showToast('Check the network visualization for organizations', 'info');
      }
    } else {
      this.showToast('Explore organizations in the network visualization', 'info');
    }
  }

  /**
   * View coordination opportunity
   */
  viewCoordination(data) {
    const subtype = data.subtype;
    
    // Handle different coordination types
    if (subtype === 'theme_convergence' && data.targetId) {
      this.viewTheme(data.targetId);
    } else if (subtype === 'bridge_opportunity' && data.targetId) {
      this.viewPerson(data.targetId);
    } else if (subtype === 'momentum_shift' && data.targetId) {
      this.viewProject(data.targetId);
    } else if (subtype === 'conversation_to_action' && data.targetId) {
      // Try to open messaging
      if (window.openMessagesModal && typeof window.openMessagesModal === 'function') {
        try {
          window.openMessagesModal();
        } catch (err) {
          console.warn('Failed to open messages:', err);
          this.showToast('Check your messages', 'info');
        }
      } else {
        this.showToast('Check your messages for this conversation', 'info');
      }
    } else {
      // Generic: show network view
      this.showToast('Explore the network to see this opportunity', 'info');
    }
  }

  /**
   * Show toast notification
   */
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
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, ${color}20, rgba(0,0,0,0.9));
      border: 2px solid ${color}60;
      border-radius: 12px;
      padding: 1rem 1.5rem;
      color: #fff;
      font-size: 0.95rem;
      font-weight: 500;
      max-width: 400px;
      z-index: 100000;
      box-shadow: 0 8px 25px rgba(0,0,0,0.5);
      animation: slideInRight 0.3s ease;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => {
        if (toast.parentNode) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 4000);
  }
}
