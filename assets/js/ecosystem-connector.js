/* 
 * Ecosystem Connector - UPDATED for CharlestonHacks
 * File: assets/js/ecosystem-connector.js
 * 
 * Works with your existing:
 * - supabaseClient.js (already has Supabase setup)
 * - community table (user_id as PK)
 * - Auth system (GitHub/Google OAuth)
 */

const EcosystemConnector = (function() {
  'use strict';
  
  // Central state
  const state = {
    currentUser: null,
    allUsers: [],
    ideas: [],
    connections: [],
    recommendations: { ideas: [], people: [] },
    notifications: []
  };
  
  // Event bus for cross-module communication
  const eventBus = {
    listeners: {},
    on(event, callback) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
    },
    emit(event, data) {
      console.log(`🔔 Event: ${event}`, data);
      if (this.listeners[event]) {
        this.listeners[event].forEach(cb => cb(data));
      }
    }
  };
  
  // Recommendation engine
  const recommendationEngine = {
    getRecommendedIdeas(user) {
      if (!user || !user.skills) return [];
      
      const userSkills = new Set(
        typeof user.skills === 'string' 
          ? user.skills.split(',').map(s => s.trim().toLowerCase())
          : (user.skills || []).map(s => s.toLowerCase())
      );
      
      return state.ideas
        .filter(idea => {
          const neededSkills = idea.skills || [];
          const hasMatch = neededSkills.some(skill => 
            userSkills.has(skill.toLowerCase())
          );
          const notOnTeam = !idea.team_current?.includes(user.user_id);
          const isOpen = idea.status === 'open';
          return hasMatch && notOnTeam && isOpen;
        })
        .map(idea => ({
          ...idea,
          matchScore: this.calculateMatchScore(user, idea),
          matchingSkills: this.getMatchingSkills(user, idea)
        }))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10);
    },
    
    getSuggestedTeamMembers(idea) {
      if (!idea || !idea.skills) return [];
      
      const neededSkills = new Set(idea.skills.map(s => s.toLowerCase()));
      
      return state.allUsers
        .filter(user => {
          const userSkills = typeof user.skills === 'string'
            ? user.skills.split(',').map(s => s.trim().toLowerCase())
            : (user.skills || []).map(s => s.toLowerCase());
            
          const hasSkill = userSkills.some(s => neededSkills.has(s));
          const notOnTeam = !idea.team_current?.includes(user.user_id);
          const available = user.availability !== 'Not Looking';
          
          return hasSkill && notOnTeam && available;
        })
        .map(user => ({
          ...user,
          matchScore: this.calculateMatchScore(user, idea),
          matchingSkills: this.getMatchingSkills(user, idea)
        }))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 8);
    },
    
    calculateMatchScore(user, idea) {
      let score = 0;
      
      const userSkills = new Set(
        typeof user.skills === 'string'
          ? user.skills.split(',').map(s => s.trim().toLowerCase())
          : (user.skills || []).map(s => s.toLowerCase())
      );
      
      const neededSkills = idea.skills || [];
      const matchingSkills = neededSkills.filter(s => 
        userSkills.has(s.toLowerCase())
      );
      
      score += matchingSkills.length * 10;
      if (user.availability === 'Available') score += 20;
      
      return Math.min(score, 100);
    },
    
    getMatchingSkills(user, idea) {
      const userSkills = new Set(
        typeof user.skills === 'string'
          ? user.skills.split(',').map(s => s.trim().toLowerCase())
          : (user.skills || []).map(s => s.toLowerCase())
      );
      const neededSkills = idea.skills || [];
      return neededSkills.filter(s => userSkills.has(s.toLowerCase()));
    }
  };
  
  // Dashboard renderer
  const dashboard = {
    getDashboardData() {
      const user = state.currentUser;
      if (!user) return null;
      
      const leadingProjects = state.ideas.filter(i => 
        i.created_by_auth_id === user.user_id
      );
      
      const contributingProjects = state.ideas.filter(i => 
        i.team_current?.includes(user.user_id) && 
        i.created_by_auth_id !== user.user_id
      );
      
      const recommendations = recommendationEngine.getRecommendedIdeas(user);
      const opportunities = recommendations.filter(i => i.matchScore >= 70);
      
      return {
        user,
        projects: { leading: leadingProjects, contributing: contributingProjects },
        recommendations: recommendations.slice(0, 5),
        opportunities,
        stats: {
          total_projects: leadingProjects.length + contributingProjects.length,
          total_connections: state.connections.length,
          skill_matches: opportunities.length
        }
      };
    },
    
    render(containerId) {
      const data = this.getDashboardData();
      if (!data) return;
      
      const container = document.getElementById(containerId);
      if (!container) return;
      
      container.innerHTML = `
        <div class="ecosystem-dashboard">
          <h2>🏠 My Innovation Hub</h2>
          
          <div class="dashboard-stats">
            <div class="stat-card">
              <div class="stat-value">${data.stats.total_projects}</div>
              <div class="stat-label">Active Projects</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${data.recommendations.length}</div>
              <div class="stat-label">Recommendations</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${data.stats.total_connections}</div>
              <div class="stat-label">Connections</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${data.opportunities.length}</div>
              <div class="stat-label">Opportunities</div>
            </div>
          </div>
          
          ${this.renderProjects(data.projects)}
          ${this.renderRecommendations(data.recommendations)}
        </div>
      `;
    },
    
    renderProjects(projects) {
      if (projects.leading.length === 0 && projects.contributing.length === 0) {
        return `
          <div class="dashboard-section">
            <h3>📊 My Projects</h3>
            <div class="empty-state">
              No active projects yet. Check recommendations below or create one in Innovation Hub!
            </div>
          </div>
        `;
      }
      
      return `
        <div class="dashboard-section">
          <h3>📊 My Projects</h3>
          ${projects.leading.length > 0 ? `
            <h4>Leading (${projects.leading.length})</h4>
            <div class="project-list">
              ${projects.leading.map(p => this.renderProjectCard(p)).join('')}
            </div>
          ` : ''}
          ${projects.contributing.length > 0 ? `
            <h4>Contributing (${projects.contributing.length})</h4>
            <div class="project-list">
              ${projects.contributing.map(p => this.renderProjectCard(p)).join('')}
            </div>
          ` : ''}
        </div>
      `;
    },
    
    renderProjectCard(project) {
      return `
        <div class="project-card" onclick="switchToTab('cynq')">
          <h4>${project.title}</h4>
          <div class="project-meta">
            <span>Team: ${project.current_team_size}/${project.max_team_size || '∞'}</span>
            <span>Status: ${project.status}</span>
          </div>
          <button class="btn-small">View Project</button>
        </div>
      `;
    },
    
    renderRecommendations(recommendations) {
      if (recommendations.length === 0) {
        return `
          <div class="dashboard-section">
            <h3>💡 Recommended For You</h3>
            <div class="empty-state">
              No recommendations yet. Update your skills in your profile to get personalized suggestions!
            </div>
          </div>
        `;
      }
      
      return `
        <div class="dashboard-section">
          <h3>💡 Recommended For You</h3>
          <div class="recommendations-list">
            ${recommendations.map(idea => `
              <div class="recommendation-card" onclick="switchToTab('cynq')">
                <h4>${idea.title}</h4>
                <div class="match-score">
                  <span class="score">${idea.matchScore}% Match</span>
                  <span class="skills">${idea.matchingSkills.join(', ')}</span>
                </div>
                <button class="btn-small">View Details</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  };
  
  // Public API
  return {
    async init(supabaseClient) {
      console.log('🌐 Initializing Ecosystem Connector...');

      try {
        // Use the already-authenticated user from window.currentAuthUser
        const user = window.currentAuthUser;
        if (!user) {
          console.log('🌐 No authenticated user available');
          return;
        }

        // Get current user from community table
        const { data: profile } = await supabaseClient
          .from('community')
          .select('*')
          .eq('user_id', user.id)
          .single();

        state.currentUser = profile;
        
        // Load all users
        const { data: users } = await supabaseClient
          .from('community')
          .select('*');
        state.allUsers = users || [];
        
        // Load ideas
        const { data: ideas } = await supabaseClient
          .from('ideas')
          .select('*');
        state.ideas = ideas || [];
        
        // Generate recommendations
        if (state.currentUser) {
          state.recommendations.ideas = recommendationEngine.getRecommendedIdeas(state.currentUser);
        }
        
        console.log('✅ Ecosystem Connector ready');
      } catch (error) {
        console.error('Error initializing ecosystem:', error);
      }
    },
    
    notifyProfileUpdate(userData) {
      state.currentUser = userData;
      if (state.currentUser) {
        state.recommendations.ideas = recommendationEngine.getRecommendedIdeas(state.currentUser);
      }
      eventBus.emit('profile-updated', userData);
      eventBus.emit('recommendations-updated', state.recommendations);
    },
    
    notifyIdeaCreated(idea) {
      state.ideas.push(idea);
      const suggestions = recommendationEngine.getSuggestedTeamMembers(idea);
      eventBus.emit('idea-created', { idea, suggestions });
    },
    
    notifySearchPerformed(query, results) {
      const relatedIdeas = state.ideas.filter(idea => {
        const q = query.toLowerCase();
        return idea.title?.toLowerCase().includes(q) ||
               idea.description?.toLowerCase().includes(q) ||
               idea.skills?.some(s => s.toLowerCase().includes(q));
      });
      eventBus.emit('search-enhanced', { people: results, ideas: relatedIdeas });
    },
    
    getDashboard() {
      return dashboard.getDashboardData();
    },
    
    renderDashboard(containerId) {
      dashboard.render(containerId);
    },
    
    getRecommendations() {
      return state.recommendations;
    },
    
    getState() {
      return { ...state };
    },
    
    getEventBus() {
      return eventBus;
    }
  };
})();

// Expose globally
window.EcosystemConnector = EcosystemConnector;

// Initialize only after auth is ready
function startEcosystemWhenReady() {
  // Wait until auth.js finished its initial decision
  if (!window.__authReady) {
    window.addEventListener("auth-ready", startEcosystemWhenReady, { once: true });
    return;
  }

  // If you require login, also require a user:
  if (!window.currentAuthUser) {
    console.log("🌐 Ecosystem connector skipped (no user)");
    return;
  }

  // Initialize with current Supabase client
  if (window.supabase) {
    EcosystemConnector.init(window.supabase);
  }
}

startEcosystemWhenReady();
