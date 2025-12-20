/* 
 * CYNQ Module - UPDATED for CharlestonHacks
 * File: assets/js/cynq.js
 * 
 * Uses your existing supabaseClient.js
 * No duplicate Supabase initialization needed!
 */

const CYNQModule = (function() {
  'use strict';
  
  let state = {
    initialized: false,
    ideas: [],
    teamMembers: [],
    userUpvotes: [],
    currentUser: null,
    filters: { sort: 'recent', status: 'all' },
    subscriptions: []
  };
  
  const config = {
    containerId: 'cynq-app',
    modalId: 'cynq-modal',
    toastDuration: 3000
  };
  
  // Utilities
  const utils = {
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },
    
    timeAgo(timestamp) {
      const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
      if (seconds < 60) return 'just now';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;
      return new Date(timestamp).toLocaleDateString();
    },
    
    showToast(message, type = 'success') {
      const toast = document.createElement('div');
      toast.className = `cynq-toast ${type}`;
      toast.textContent = message;
      toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid ${type === 'success' ? '#0f0' : type === 'error' ? '#f00' : '#00e0ff'};
        border-radius: 8px;
        padding: 1rem 1.5rem;
        color: #fff;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 16000;
        animation: cynq-toast-in 0.3s ease;
        max-width: 350px;
      `;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), config.toastDuration);
    }
  };
  
  // Data layer
  const dataLayer = {
    async initUser() {
      if (!window.supabase) throw new Error('Supabase not available');
      
      const { data: { session } } = await window.supabase.auth.getSession();
      if (!session) throw new Error('No active session');
      
      const { data: profile } = await window.supabase
        .from('community')
        .select('*')
        .eq('user_id', session.user.id)
        .single();
      
      state.currentUser = {
        id: session.user.id,
        email: session.user.email,
        name: profile?.name || session.user.email.split('@')[0],
        communityId: profile?.id,
        user_id: profile?.user_id,
        isAdmin: profile?.role === 'admin'
      };
      
      return state.currentUser;
    },
    
    async fetchIdeas() {
      const { data, error } = await window.supabase
        .from('ideas')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      state.ideas = data || [];
      return state.ideas;
    },
    
    async fetchTeamMembers() {
      const { data, error } = await window.supabase
        .from('team_members')
        .select('*, community(name, email)');
      
      if (error) throw error;
      state.teamMembers = (data || []).map(tm => ({
        ...tm,
        displayName: tm.community?.name,
        email: tm.community?.email
      }));
      return state.teamMembers;
    },
    
    async fetchUserUpvotes() {
      if (!state.currentUser) return [];
      
      const { data, error } = await window.supabase
        .from('idea_upvotes')
        .select('idea_id')
        .eq('auth_user_id', state.currentUser.id);
      
      if (error) throw error;
      state.userUpvotes = (data || []).map(item => item.idea_id);
      return state.userUpvotes;
    },
    
    async createIdea(ideaData) {
      const { data, error } = await window.supabase
        .from('ideas')
        .insert([{
          title: ideaData.title,
          description: ideaData.description,
          tags: ideaData.tags || [],
          skills: ideaData.skills || [],
          max_team_size: ideaData.maxTeamSize || null,
          created_by_auth_id: state.currentUser.id,
          created_by_community_id: state.currentUser.communityId
        }])
        .select()
        .single();
      
      if (error) throw error;
      
      // Add creator as team member
      await window.supabase.from('team_members').insert([{
        idea_id: data.id,
        auth_user_id: state.currentUser.id,
        community_user_id: state.currentUser.communityId,
        role: 'creator',
        status: 'active'
      }]);
      
      return data;
    },
    
    async toggleUpvote(ideaId, isUpvoted) {
      if (isUpvoted) {
        await window.supabase.from('idea_upvotes').delete()
          .eq('idea_id', ideaId)
          .eq('auth_user_id', state.currentUser.id);
        await window.supabase.rpc('decrement_upvotes', { idea_uuid: ideaId });
      } else {
        await window.supabase.from('idea_upvotes').insert([{
          idea_id: ideaId,
          auth_user_id: state.currentUser.id,
          community_user_id: state.currentUser.communityId
        }]);
        await window.supabase.rpc('increment_upvotes', { idea_uuid: ideaId });
      }
    },
    
    setupRealtime() {
      state.subscriptions.forEach(sub => window.supabase.removeChannel(sub));
      state.subscriptions = [];
      
      const ideasChannel = window.supabase
        .channel('cynq-ideas')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'ideas' 
        }, () => {
          dataLayer.fetchIdeas().then(() => views.renderIdeasList());
        })
        .subscribe();
      
      state.subscriptions = [ideasChannel];
    },
    
    cleanup() {
      state.subscriptions.forEach(sub => window.supabase.removeChannel(sub));
      state.subscriptions = [];
    }
  };
  
  // View layer
  const views = {
    renderApp() {
      const container = document.getElementById(config.containerId);
      if (!container) return;
      
      container.innerHTML = `
        <div class="cynq-grid">
          <div class="cynq-section">
            <div class="cynq-section-header">
              <i class="cynq-section-icon fas fa-lightbulb"></i>
              <div>
                <h2 class="cynq-section-title">Submit an Idea</h2>
                <p class="cynq-section-subtitle">Share your innovation</p>
              </div>
            </div>
            ${this.renderSubmitForm()}
          </div>
          
          <div class="cynq-section">
            <div class="cynq-section-header">
              <i class="cynq-section-icon fas fa-rocket"></i>
              <div>
                <h2 class="cynq-section-title">Explore Ideas</h2>
                <p class="cynq-section-subtitle">
                  <span id="cynq-idea-count">${state.ideas.length}</span> community ideas
                </p>
              </div>
            </div>
            ${this.renderFilters()}
            <div id="cynq-ideas-container" class="cynq-ideas-list"></div>
          </div>
        </div>
        
        <div id="${config.modalId}" class="cynq-modal"></div>
      `;
      
      this.renderIdeasList();
      events.attachEventListeners();
    },
    
    renderSubmitForm() {
      return `
        <form id="cynq-submit-form">
          <div class="cynq-form-group">
            <label class="cynq-form-label">Idea Title *</label>
            <input type="text" name="title" class="cynq-form-input" 
                   placeholder="e.g., AI-Powered Code Assistant" required>
          </div>
          <div class="cynq-form-group">
            <label class="cynq-form-label">Description *</label>
            <textarea name="description" class="cynq-form-textarea" 
                      placeholder="Describe your idea..." required></textarea>
          </div>
          <div class="cynq-form-group">
            <label class="cynq-form-label">Tags</label>
            <input type="text" name="tags" class="cynq-form-input" 
                   placeholder="AI, Web, Mobile">
            <p class="cynq-form-hint">Comma-separated</p>
          </div>
          <div class="cynq-form-row">
            <div class="cynq-form-group">
              <label class="cynq-form-label">Skills Needed</label>
              <input type="text" name="skills" class="cynq-form-input" 
                     placeholder="React, Python">
            </div>
            <div class="cynq-form-group">
              <label class="cynq-form-label">Max Team Size</label>
              <input type="number" name="maxTeam" class="cynq-form-input" 
                     placeholder="5" min="1">
            </div>
          </div>
          <button type="submit" class="cynq-btn cynq-btn-full">
            <i class="fas fa-paper-plane"></i> Submit Idea
          </button>
        </form>
      `;
    },
    
    renderFilters() {
      return `
        <div class="cynq-filter-bar">
          <button class="cynq-filter-btn ${state.filters.sort === 'recent' ? 'active' : ''}" 
                  data-sort="recent">🕐 Recent</button>
          <button class="cynq-filter-btn ${state.filters.sort === 'popular' ? 'active' : ''}" 
                  data-sort="popular">🔥 Popular</button>
          <button class="cynq-filter-btn ${state.filters.status === 'all' ? 'active' : ''}" 
                  data-filter="all">All</button>
          <button class="cynq-filter-btn ${state.filters.status === 'open' ? 'active' : ''}" 
                  data-filter="open">Open</button>
        </div>
      `;
    },
    
    renderIdeasList() {
      const container = document.getElementById('cynq-ideas-container');
      const countEl = document.getElementById('cynq-idea-count');
      if (!container) return;
      
      let filteredIdeas = [...state.ideas];
      
      if (state.filters.status !== 'all') {
        filteredIdeas = filteredIdeas.filter(i => i.status === state.filters.status);
      }
      
      if (state.filters.sort === 'recent') {
        filteredIdeas.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      } else if (state.filters.sort === 'popular') {
        filteredIdeas.sort((a, b) => b.upvotes - a.upvotes);
      }
      
      if (countEl) countEl.textContent = filteredIdeas.length;
      
      if (filteredIdeas.length === 0) {
        container.innerHTML = `
          <div class="cynq-empty-state">
            <div class="cynq-empty-icon">📭</div>
            <p>No ideas found</p>
          </div>
        `;
        return;
      }
      
      container.innerHTML = filteredIdeas.map(idea => this.renderIdeaCard(idea)).join('');
    },
    
    renderIdeaCard(idea) {
      const isUpvoted = state.userUpvotes.includes(idea.id);
      
      return `
        <div class="cynq-idea-card" data-idea-id="${idea.id}">
          <div class="cynq-idea-header">
            <h3 class="cynq-idea-title">${utils.escapeHtml(idea.title)}</h3>
            <span class="cynq-status-badge ${idea.status}">
              ${idea.status.replace('_', ' ')}
            </span>
          </div>
          <p class="cynq-idea-description">${utils.escapeHtml(idea.description)}</p>
          <div class="cynq-idea-meta">
            <button class="cynq-upvote-btn ${isUpvoted ? 'upvoted' : ''}" 
                    data-idea-id="${idea.id}" 
                    onclick="event.stopPropagation()">
              ▲ ${idea.upvotes}
            </button>
            <span>👥 ${idea.current_team_size}${idea.max_team_size ? '/' + idea.max_team_size : ''}</span>
            <span>${utils.timeAgo(idea.created_at)}</span>
          </div>
        </div>
      `;
    },
    
    renderIdeaModal(ideaId) {
      const idea = state.ideas.find(i => i.id === ideaId);
      if (!idea) return;
      
      const modal = document.getElementById(config.modalId);
      const isUpvoted = state.userUpvotes.includes(ideaId);
      const teamMembers = state.teamMembers.filter(tm => tm.idea_id === ideaId);
      
      modal.innerHTML = `
        <div class="cynq-modal-content">
          <div class="cynq-modal-header">
            <div style="flex: 1;">
              <h2 class="cynq-modal-title">${utils.escapeHtml(idea.title)}</h2>
              <div style="display: flex; gap: 1rem; align-items: center; margin-top: 0.5rem;">
                <span class="cynq-status-badge ${idea.status}">
                  ${idea.status.replace('_', ' ')}
                </span>
                <button class="cynq-upvote-btn ${isUpvoted ? 'upvoted' : ''}" 
                        data-idea-id="${idea.id}">
                  ▲ ${idea.upvotes}
                </button>
                <span style="font-size: 0.85rem; color: #888;">
                  ${utils.timeAgo(idea.created_at)}
                </span>
              </div>
            </div>
            <button class="cynq-close-btn">×</button>
          </div>
          
          <div class="cynq-modal-section">
            <h3 class="cynq-modal-section-title">Description</h3>
            <p style="color: #aaa; line-height: 1.6;">${utils.escapeHtml(idea.description)}</p>
          </div>
          
          ${idea.tags && idea.tags.length > 0 ? `
            <div class="cynq-modal-section">
              <h3 class="cynq-modal-section-title">Tags</h3>
              <div class="cynq-tag-group">
                ${idea.tags.map(tag => `<span class="cynq-tag">${utils.escapeHtml(tag)}</span>`).join('')}
              </div>
            </div>
          ` : ''}
          
          ${idea.skills && idea.skills.length > 0 ? `
            <div class="cynq-modal-section">
              <h3 class="cynq-modal-section-title">Skills Needed</h3>
              <div class="cynq-tag-group">
                ${idea.skills.map(skill => `<span class="cynq-tag">${utils.escapeHtml(skill)}</span>`).join('')}
              </div>
            </div>
          ` : ''}
          
          <div class="cynq-modal-section">
            <h3 class="cynq-modal-section-title">
              Team (${idea.current_team_size}${idea.max_team_size ? '/' + idea.max_team_size : ''})
            </h3>
            ${teamMembers.length === 0 ? `
              <p style="color: #888; font-size: 0.9rem;">No team members yet.</p>
            ` : `
              <div class="cynq-team-list">
                ${teamMembers.map(member => `
                  <div class="cynq-team-member">
                    <div class="cynq-team-member-name">
                      ${member.displayName || 'Anonymous'}
                      ${member.role === 'creator' ? ' (Creator)' : ''}
                    </div>
                    <div class="cynq-team-member-role">
                      ${member.status}
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      `;
      
      modal.classList.add('active');
    },
    
    closeModal() {
      const modal = document.getElementById(config.modalId);
      if (modal) modal.classList.remove('active');
    }
  };
  
  // Event handlers
  const events = {
    attachEventListeners() {
      const form = document.getElementById('cynq-submit-form');
      if (form) {
        form.addEventListener('submit', this.handleSubmit);
      }
      
      document.querySelectorAll('[data-sort], [data-filter]').forEach(btn => {
        btn.addEventListener('click', this.handleFilter);
      });
      
      const container = document.getElementById('cynq-ideas-container');
      if (container) {
        container.addEventListener('click', this.handleIdeaClick);
        container.addEventListener('click', this.handleUpvoteClick);
      }
      
      const modal = document.getElementById(config.modalId);
      if (modal) {
        modal.addEventListener('click', this.handleModalClick);
      }
    },
    
    async handleSubmit(e) {
      e.preventDefault();
      const formData = new FormData(e.target);
      const btn = e.target.querySelector('button[type="submit"]');
      const originalHTML = btn.innerHTML;
      
      btn.innerHTML = '<span class="cynq-loading"></span> Submitting...';
      btn.disabled = true;
      
      try {
        const newIdea = await dataLayer.createIdea({
          title: formData.get('title'),
          description: formData.get('description'),
          tags: formData.get('tags')?.split(',').map(t => t.trim()).filter(t => t) || [],
          skills: formData.get('skills')?.split(',').map(s => s.trim()).filter(s => s) || [],
          maxTeamSize: formData.get('maxTeam') ? parseInt(formData.get('maxTeam')) : null
        });
        
        e.target.reset();
        utils.showToast('Idea submitted successfully! 🎉', 'success');
        
        // Notify ecosystem
        if (window.EcosystemConnector) {
          window.EcosystemConnector.notifyIdeaCreated(newIdea);
        }
        
        await dataLayer.fetchIdeas();
        views.renderIdeasList();
      } catch (error) {
        console.error('Error submitting:', error);
        utils.showToast('Failed to submit idea', 'error');
      } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
      }
    },
    
    handleFilter(e) {
      const btn = e.currentTarget;
      
      if (btn.dataset.sort) {
        document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filters.sort = btn.dataset.sort;
      } else if (btn.dataset.filter) {
        document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filters.status = btn.dataset.filter;
      }
      
      views.renderIdeasList();
    },
    
    handleIdeaClick(e) {
      const card = e.target.closest('.cynq-idea-card');
      if (card && !e.target.closest('.cynq-upvote-btn')) {
        const ideaId = card.dataset.ideaId;
        views.renderIdeaModal(ideaId);
      }
    },
    
    async handleUpvoteClick(e) {
      if (e.target.closest('.cynq-upvote-btn')) {
        e.stopPropagation();
        const btn = e.target.closest('.cynq-upvote-btn');
        const ideaId = btn.dataset.ideaId;
        const isUpvoted = btn.classList.contains('upvoted');
        
        try {
          await dataLayer.toggleUpvote(ideaId, isUpvoted);
          
          if (isUpvoted) {
            state.userUpvotes = state.userUpvotes.filter(id => id !== ideaId);
          } else {
            state.userUpvotes.push(ideaId);
          }
          
          await dataLayer.fetchIdeas();
          views.renderIdeasList();
          
          if (document.querySelector(`#${config.modalId}.active`)) {
            views.renderIdeaModal(ideaId);
          }
        } catch (error) {
          console.error('Error toggling upvote:', error);
          utils.showToast('Failed to update vote', 'error');
        }
      }
    },
    
    handleModalClick(e) {
      const modal = e.currentTarget;
      
      if (e.target.closest('.cynq-close-btn')) {
        views.closeModal();
        return;
      }
      
      if (e.target === modal) {
        views.closeModal();
        return;
      }
      
      if (e.target.closest('.cynq-upvote-btn')) {
        events.handleUpvoteClick(e);
      }
    }
  };
  
  // Public API
  return {
    async init() {
      if (state.initialized) {
        console.log('CYNQ already initialized');
        return;
      }
      
      try {
        if (!window.supabase) {
          throw new Error('Supabase not initialized');
        }
        
        await dataLayer.initUser();
        await Promise.all([
          dataLayer.fetchIdeas(),
          dataLayer.fetchTeamMembers(),
          dataLayer.fetchUserUpvotes()
        ]);
        
        dataLayer.setupRealtime();
        views.renderApp();
        
        state.initialized = true;
        console.log('✅ CYNQ initialized successfully');
        
      } catch (error) {
        console.error('Failed to initialize CYNQ:', error);
        const container = document.getElementById(config.containerId);
        if (container) {
          container.innerHTML = `
            <div class="cynq-empty-state">
              <div class="cynq-empty-icon">🔐</div>
              <p>${error.message === 'No active session' 
                ? 'Please sign in to access Innovation Hub' 
                : 'Failed to load Innovation Hub'}</p>
            </div>
          `;
        }
      }
    },
    
    destroy() {
      dataLayer.cleanup();
      state.initialized = false;
      state.ideas = [];
      state.teamMembers = [];
      state.userUpvotes = [];
      console.log('CYNQ module destroyed');
    },
    
    getState() {
      return { ...state };
    }
  };
})();

// Expose globally
window.CYNQModule = CYNQModule;

// Auto-initialize when tab becomes active
document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target.classList.contains('active-tab-pane') && 
          mutation.target.id === 'cynq') {
        CYNQModule.init();
      }
    });
  });
  
  const cynqTab = document.querySelector('#cynq');
  if (cynqTab) {
    observer.observe(cynqTab, { attributes: true, attributeFilter: ['class'] });
    
    if (cynqTab.classList.contains('active-tab-pane')) {
      CYNQModule.init();
    }
  }
});
