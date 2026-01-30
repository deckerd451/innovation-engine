// ================================================================
// START SEQUENCE REPORT GENERATOR
// ================================================================

class StartSequenceReport {
  constructor() {
    this.cache = {
      data: null,
      timestamp: null,
      ttl: 5 * 60 * 1000 // 5 minutes cache
    };
    
    this.isLoading = false;
  }

  /**
   * Get START sequence data (with caching)
   */
  async getData(forceRefresh = false) {
    // Check cache first
    if (!forceRefresh && this.isCacheValid()) {
      return this.cache.data;
    }

    // Prevent duplicate requests
    if (this.isLoading) {
      return this.waitForLoad();
    }

    this.isLoading = true;

    try {
      const data = await this.fetchFromDatabase();
      
      // Cache the result
      this.cache.data = data;
      this.cache.timestamp = Date.now();
      
      return data;
      
    } catch (error) {
      console.error('Failed to load START sequence data:', error);
      throw error;
      
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Fetch data from Supabase
   */
  async fetchFromDatabase() {
    if (!window.supabase) {
      throw new Error('Supabase client not initialized');
    }

    // Get current user
    const { data: { user }, error: userError } = await window.supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    try {
      // Call the SQL function
      const { data, error } = await window.supabase.rpc('get_start_sequence_data', {
        auth_user_id: user.id
      });

      if (error) {
        console.error('Database error:', error);
        throw new Error(`Database error: ${error.message || JSON.stringify(error)}`);
      }

      if (!data) {
        throw new Error('No data returned from database');
      }

      // Parse if it's a string
      let parsedData = data;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          console.error('Failed to parse data:', e);
          throw new Error('Invalid JSON response from database');
        }
      }

      // Check if user has a profile
      if (parsedData.has_profile === false) {
        return this.createEmptyReport();
      }

      return parsedData;
      
    } catch (error) {
      console.error('Error fetching START data:', error);
      throw error;
    }
  }

  /**
   * Check if cache is still valid
   */
  isCacheValid() {
    if (!this.cache.data || !this.cache.timestamp) {
      return false;
    }

    const age = Date.now() - this.cache.timestamp;
    return age < this.cache.ttl;
  }

  /**
   * Wait for ongoing load to complete
   */
  async waitForLoad() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.isLoading) {
          clearInterval(checkInterval);
          resolve(this.cache.data);
        }
      }, 100);
    });
  }

  /**
   * Create empty report for users without profiles
   */
  createEmptyReport() {
    return {
      has_profile: false,
      profile: null,
      immediate_actions: {
        pending_requests: { count: 0, items: [] },
        unread_messages: { count: 0, conversations: [] },
        pending_bids: { count: 0, items: [] },
        bids_to_review: { count: 0, items: [] }
      },
      opportunities: {
        skill_matched_projects: { count: 0, items: [] },
        active_themes: { count: 0, items: [] },
        open_opportunities: { count: 0, items: [] },
        complementary_connections: { count: 0, items: [] }
      },
      momentum: {
        weekly_activity: 0,
        activity_breakdown: {},
        streak: { current: 0, last_login: null, is_at_risk: false },
        xp_progress: { current_xp: 0, current_level: 1, next_level_xp: 1000, xp_to_next_level: 1000, progress_percentage: 0 },
        recent_achievements: []
      },
      network_insights: {
        connections: { total: 0, by_type: {} },
        active_projects: { count: 0, items: [] },
        participating_themes: { count: 0, items: [] },
        growth: { new_connections: 0, new_projects: 0, new_themes: 0 }
      },
      recommendations: {
        priority_actions: []
      }
    };
  }

  /**
   * Clear cache (useful after user actions)
   */
  clearCache() {
    this.cache.data = null;
    this.cache.timestamp = null;
  }
}

// ================================================================
// REPORT FORMATTER
// ================================================================

class StartSequenceFormatter {
  /**
   * Generate summary statistics for the report panel
   */
  static generateSummary(data) {
    if (!data || !data.has_profile) {
      return {
        people: 0,
        themes_interested: 0,
        organizations_followed: 0,
        connection_requests_sent: 0,
        connections_accepted: 0,
        errors: 0
      };
    }

    const immediate = data.immediate_actions || {};
    const opportunities = data.opportunities || {};
    const network = data.network_insights || {};

    return {
      // Current network size
      people: network.connections?.total || 0,
      
      // Themes participating in
      themes_interested: network.participating_themes?.count || 0,
      
      // Organizations (could be derived from opportunities)
      organizations_followed: 0, // TODO: Add organization followers to query
      
      // Pending outgoing requests
      connection_requests_sent: 0, // TODO: Add to query if needed
      
      // Accepted connections
      connections_accepted: network.connections?.total || 0,
      
      // Errors or issues (none for now)
      errors: 0
    };
  }

  /**
   * Generate actionable insights for the UI
   */
  static generateInsights(data) {
    if (!data || !data.has_profile) {
      return [];
    }

    const insights = [];
    const immediate = data.immediate_actions || {};
    const opportunities = data.opportunities || {};
    const network = data.network_insights || {};

    // Immediate action insights
    if (immediate.pending_requests?.count > 0) {
      insights.push({
        type: 'action',
        priority: 'high',
        icon: 'user-plus',
        color: '#00e0ff',
        message: `${immediate.pending_requests.count} ${immediate.pending_requests.count === 1 ? 'person wants' : 'people want'} to connect with you`,
        action: 'Review Requests',
        handler: 'openConnectionRequests'
      });
    }

    if (immediate.unread_messages?.count > 0) {
      insights.push({
        type: 'action',
        priority: 'high',
        icon: 'envelope',
        color: '#00e0ff',
        message: `${immediate.unread_messages.count} unread ${immediate.unread_messages.count === 1 ? 'message' : 'messages'}`,
        action: 'View Messages',
        handler: 'openMessaging'
      });
    }

    if (immediate.bids_to_review?.count > 0) {
      insights.push({
        type: 'action',
        priority: 'high',
        icon: 'clipboard-check',
        color: '#00ff88',
        message: `${immediate.bids_to_review.count} ${immediate.bids_to_review.count === 1 ? 'bid' : 'bids'} on your projects`,
        action: 'Review Bids',
        handler: 'openProjectBids'
      });
    }

    // Opportunity insights
    if (opportunities.skill_matched_projects?.count > 0) {
      const topMatch = opportunities.skill_matched_projects.items[0];
      if (topMatch) {
        insights.push({
          type: 'opportunity',
          priority: 'medium',
          icon: 'lightbulb',
          color: '#00ff88',
          message: `${opportunities.skill_matched_projects.count} projects match your skills`,
          detail: topMatch.matched_skills?.length > 0 
            ? `Top match needs: ${topMatch.matched_skills.slice(0, 3).join(', ')}`
            : null,
          action: 'View Projects',
          handler: 'openSkillMatchedProjects'
        });
      }
    }

    if (opportunities.active_themes?.count > 0) {
      insights.push({
        type: 'opportunity',
        priority: 'medium',
        icon: 'bullseye',
        color: '#ffaa00',
        message: `${opportunities.active_themes.count} active themes to explore`,
        action: 'Browse Themes',
        handler: 'openThemes'
      });
    }

    // Network growth insights
    if (network.growth?.new_connections > 0) {
      insights.push({
        type: 'info',
        priority: 'low',
        icon: 'chart-line',
        color: '#00e0ff',
        message: `${network.growth.new_connections} new connections this month`,
        detail: 'Your network is growing!',
        action: null,
        handler: null
      });
    }

    // Streak insights
    if (data.momentum?.streak?.is_at_risk) {
      insights.push({
        type: 'warning',
        priority: 'medium',
        icon: 'fire',
        color: '#ff6b6b',
        message: `Your ${data.momentum.streak.current}-day streak is at risk!`,
        detail: 'Log in daily to maintain your streak',
        action: null,
        handler: null
      });
    }

    return insights;
  }

  /**
   * Format data for synapse visualization
   */
  static formatForSynapse(data) {
    if (!data || !data.has_profile) {
      return {
        highlights: [],
        connections: [],
        themes: []
      };
    }

    const highlights = [];
    const immediate = data.immediate_actions || {};
    const opportunities = data.opportunities || {};

    // Highlight people with pending requests
    if (immediate.pending_requests?.items) {
      immediate.pending_requests.items.forEach(request => {
        highlights.push({
          id: request.from_user_id,
          type: 'person',
          reason: 'pending_request',
          priority: 'high',
          animation: 'pulse'
        });
      });
    }

    // Highlight unread message partners
    if (immediate.unread_messages?.conversations) {
      immediate.unread_messages.conversations.forEach(conv => {
        highlights.push({
          id: conv.partner_id,
          type: 'person',
          reason: 'unread_message',
          priority: 'high',
          animation: 'glow',
          badge: conv.unread_count
        });
      });
    }

    // Highlight skill-matched projects
    if (opportunities.skill_matched_projects?.items) {
      opportunities.skill_matched_projects.items.slice(0, 5).forEach(project => {
        highlights.push({
          id: project.id,
          type: 'project',
          reason: 'skill_match',
          priority: 'medium',
          animation: 'highlight',
          matchedSkills: project.matched_skills
        });
      });
    }

    // Highlight active themes
    if (opportunities.active_themes?.items) {
      opportunities.active_themes.items.slice(0, 5).forEach(theme => {
        highlights.push({
          id: theme.id,
          type: 'theme',
          reason: 'active',
          priority: 'medium',
          animation: 'subtle-glow',
          participantCount: theme.participant_count
        });
      });
    }

    return {
      highlights,
      connections: data.network_insights?.connections || {},
      themes: opportunities.active_themes?.items || []
    };
  }

  /**
   * Generate priority score for sorting recommendations
   */
  static calculatePriorityScore(item, type) {
    let score = 0;

    // Base scores by type
    const typeScores = {
      pending_requests: 100,
      unread_messages: 95,
      bids_to_review: 90,
      pending_bids: 85,
      skill_matches: 80,
      active_themes: 70,
      complementary_connections: 60,
      open_opportunities: 50
    };

    score += typeScores[type] || 0;

    // Boost for recency
    if (item.created_at) {
      const age = Date.now() - new Date(item.created_at).getTime();
      const daysSinceCreation = age / (1000 * 60 * 60 * 24);
      
      if (daysSinceCreation < 1) score += 20;
      else if (daysSinceCreation < 3) score += 10;
      else if (daysSinceCreation < 7) score += 5;
    }

    // Boost for skill matches
    if (item.matched_skills && item.matched_skills.length > 0) {
      score += item.matched_skills.length * 5;
    }

    return score;
  }
}

// ================================================================
// GLOBAL INSTANCE
// ================================================================

// Create global instance
window.StartSequenceReport = new StartSequenceReport();
window.StartSequenceFormatter = StartSequenceFormatter;

// ================================================================
// CONVENIENCE FUNCTIONS
// ================================================================

/**
 * Get START sequence data
 */
async function getStartSequenceData(forceRefresh = false) {
  return await window.StartSequenceReport.getData(forceRefresh);
}

/**
 * Generate summary for report panel
 */
async function generateStartSummary(forceRefresh = false) {
  const data = await getStartSequenceData(forceRefresh);
  return StartSequenceFormatter.generateSummary(data);
}

/**
 * Generate actionable insights
 */
async function generateStartInsights(forceRefresh = false) {
  const data = await getStartSequenceData(forceRefresh);
  return StartSequenceFormatter.generateInsights(data);
}

/**
 * Get synapse visualization data
 */
async function getStartSynapseData(forceRefresh = false) {
  const data = await getStartSequenceData(forceRefresh);
  return StartSequenceFormatter.formatForSynapse(data);
}

/**
 * Clear cache (call after user actions)
 */
function clearStartSequenceCache() {
  window.StartSequenceReport.clearCache();
}

// Export functions
window.getStartSequenceData = getStartSequenceData;
window.generateStartSummary = generateStartSummary;
window.generateStartInsights = generateStartInsights;
window.getStartSynapseData = getStartSynapseData;
window.clearStartSequenceCache = clearStartSequenceCache;
