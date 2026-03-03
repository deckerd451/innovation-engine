// ================================================================
// OPPORTUNITY ENGINE
// ================================================================
// Lightweight engine to derive opportunities from existing data
// and track engagement via opportunity_engagement table

console.log('🎯 Opportunity Engine loading...');

/**
 * Opportunity Engine
 * Derives opportunities from projects, orgs, and existing data
 * Tracks engagement (join, bookmark, click) in opportunity_engagement table
 */
class OpportunityEngine {
  constructor() {
    this.supabase = null;
    this.currentUserId = null;
    this.opportunities = [];
    this.trendingCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Initialize the engine
   */
  async init(supabase, currentUserId) {
    this.supabase = supabase;
    this.currentUserId = currentUserId;
    
    console.log('🎯 Opportunity Engine initialized');
    
    // Load opportunities
    await this.loadOpportunities();
    
    return this;
  }

  /**
   * Derive opportunities from existing data sources
   */
  async loadOpportunities() {
    console.log('📊 Loading opportunities from data sources...');
    
    const opportunities = [];
    
    // Source 1: Projects needing help
    const projectOpps = await this.deriveFromProjects();
    opportunities.push(...projectOpps);
    
    // Source 2: Organizations requesting participation
    const orgOpps = await this.deriveFromOrganizations();
    opportunities.push(...orgOpps);
    
    // Source 3: Existing opportunities table (if present)
    const existingOpps = await this.loadExistingOpportunities();
    opportunities.push(...existingOpps);
    
    // Normalize and enrich with momentum data
    this.opportunities = await this.enrichWithMomentum(opportunities);
    
    console.log(`✅ Loaded ${this.opportunities.length} opportunities`);
    
    return this.opportunities;
  }

  /**
   * Derive opportunities from projects
   */
  async deriveFromProjects() {
    try {
      const { data: projects, error } = await this.supabase
        .from('projects')
        .select('id, title, description, status, created_at, deadline, tags')
        .in('status', ['active', 'recruiting', 'open']);
      
      if (error) {
        console.warn('⚠️ Error loading projects:', error);
        return [];
      }
      
      return (projects || []).map(project => ({
        id: `project:${project.id}`,
        title: project.title,
        description: project.description,
        source: 'project',
        sourceId: project.id,
        tags: this.parseTags(project.tags),
        deadline: project.deadline,
        createdAt: project.created_at,
        urgencyScore: this.calculateUrgency(project.deadline),
        momentumScore: 0 // Will be enriched later
      }));
    } catch (err) {
      console.warn('⚠️ Exception loading projects:', err);
      return [];
    }
  }

  /**
   * Derive opportunities from organizations
   */
  async deriveFromOrganizations() {
    try {
      const { data: orgs, error } = await this.supabase
        .from('organizations')
        .select('id, name, description, industry, location')
        .eq('verified', true);
      
      if (error) {
        console.warn('⚠️ Error loading organizations:', error);
        return [];
      }
      
      return (orgs || []).map(org => ({
        id: `org:${org.id}`,
        title: `Join ${org.name}`,
        description: org.description || `Connect with ${org.name} in ${org.industry || 'the community'}`,
        source: 'org',
        sourceId: org.id,
        tags: [org.industry, org.location].filter(Boolean),
        deadline: null,
        createdAt: new Date().toISOString(),
        urgencyScore: 0.3, // Lower urgency for org opportunities
        momentumScore: 0 // Will be enriched later
      }));
    } catch (err) {
      console.warn('⚠️ Exception loading organizations:', err);
      return [];
    }
  }

  /**
   * Load existing opportunities from opportunities table
   */
  async loadExistingOpportunities() {
    try {
      const { data: opps, error } = await this.supabase
        .from('opportunities')
        .select('*')
        .eq('status', 'active');
      
      if (error) {
        // Table might not exist
        if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
          console.log('ℹ️ Opportunities table not found - using derived opportunities only');
          return [];
        }
        console.warn('⚠️ Error loading opportunities:', error);
        return [];
      }
      
      return (opps || []).map(opp => ({
        id: `opp:${opp.id}`,
        title: opp.title,
        description: opp.description,
        source: 'seed',
        sourceId: opp.id,
        tags: this.parseTags(opp.tags),
        deadline: opp.deadline,
        createdAt: opp.created_at,
        urgencyScore: this.calculateUrgency(opp.deadline),
        momentumScore: 0 // Will be enriched later
      }));
    } catch (err) {
      console.warn('⚠️ Exception loading opportunities:', err);
      return [];
    }
  }

  /**
   * Enrich opportunities with momentum scores from engagement data
   */
  async enrichWithMomentum(opportunities) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    try {
      // Fetch engagement data from last 7 days
      const { data: engagements, error } = await this.supabase
        .from('opportunity_engagement')
        .select('opportunity_id, action')
        .gte('created_at', sevenDaysAgo.toISOString());
      
      if (error) {
        console.warn('⚠️ Error loading engagement data:', error);
        return opportunities;
      }
      
      // Calculate momentum scores
      const momentumMap = new Map();
      
      (engagements || []).forEach(engagement => {
        const current = momentumMap.get(engagement.opportunity_id) || { joins: 0, bookmarks: 0, clicks: 0 };
        
        if (engagement.action === 'join') current.joins++;
        else if (engagement.action === 'bookmark') current.bookmarks++;
        else if (engagement.action === 'click') current.clicks++;
        
        momentumMap.set(engagement.opportunity_id, current);
      });
      
      // Apply momentum scores to opportunities
      return opportunities.map(opp => {
        const momentum = momentumMap.get(opp.id) || { joins: 0, bookmarks: 0, clicks: 0 };
        const momentumScore = (momentum.joins * 5) + (momentum.bookmarks * 2) + (momentum.clicks * 1);
        
        return {
          ...opp,
          momentumScore,
          engagementCounts: momentum
        };
      });
    } catch (err) {
      console.warn('⚠️ Exception enriching with momentum:', err);
      return opportunities;
    }
  }

  /**
   * Get all opportunities
   */
  getOpportunities() {
    return this.opportunities;
  }

  /**
   * Get active opportunities count
   */
  getActiveCount() {
    return this.opportunities.length;
  }

  /**
   * Get trending opportunities
   */
  getTrending(limit = 5) {
    return [...this.opportunities]
      .sort((a, b) => b.momentumScore - a.momentumScore)
      .slice(0, limit);
  }

  /**
   * Get top trending opportunity
   */
  getTopTrending() {
    const trending = this.getTrending(1);
    return trending.length > 0 ? trending[0] : null;
  }

  /**
   * Track engagement action
   */
  async trackEngagement(opportunityId, action, metadata = {}) {
    if (!this.supabase || !this.currentUserId) {
      console.warn('⚠️ Cannot track engagement: engine not initialized');
      return { success: false, error: 'Not initialized' };
    }
    
    if (!['join', 'bookmark', 'click'].includes(action)) {
      console.warn('⚠️ Invalid action:', action);
      return { success: false, error: 'Invalid action' };
    }
    
    try {
      const { data, error } = await this.supabase
        .from('opportunity_engagement')
        .insert([{
          user_id: this.currentUserId,
          opportunity_id: opportunityId,
          action: action,
          meta: metadata
        }]);
      
      if (error) {
        // Handle duplicate gracefully
        if (error.code === '23505') {
          console.log('ℹ️ Engagement already recorded');
          return { success: true, duplicate: true };
        }
        console.error('❌ Error tracking engagement:', error);
        return { success: false, error: error.message };
      }
      
      console.log(`✅ Tracked ${action} for opportunity:`, opportunityId);
      
      // Invalidate cache
      this.trendingCache.clear();
      
      return { success: true, data };
    } catch (err) {
      console.error('❌ Exception tracking engagement:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Track join action
   */
  async trackJoin(opportunityId, metadata = {}) {
    return this.trackEngagement(opportunityId, 'join', metadata);
  }

  /**
   * Track bookmark action
   */
  async trackBookmark(opportunityId, metadata = {}) {
    return this.trackEngagement(opportunityId, 'bookmark', metadata);
  }

  /**
   * Track click action
   */
  async trackClick(opportunityId, metadata = {}) {
    return this.trackEngagement(opportunityId, 'click', metadata);
  }

  /**
   * Calculate urgency score based on deadline
   */
  calculateUrgency(deadline) {
    if (!deadline) return 0.5; // Default medium urgency
    
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const daysUntil = (deadlineDate - now) / (1000 * 60 * 60 * 24);
    
    if (daysUntil < 0) return 0; // Past deadline
    if (daysUntil < 3) return 1.0; // Very urgent
    if (daysUntil < 7) return 0.8; // Urgent
    if (daysUntil < 14) return 0.6; // Moderate
    return 0.4; // Low urgency
  }

  /**
   * Parse tags from various formats
   */
  parseTags(tags) {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags;
    if (typeof tags === 'string') {
      try {
        const parsed = JSON.parse(tags);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return tags.split(',').map(t => t.trim()).filter(Boolean);
      }
    }
    return [];
  }

  /**
   * Refresh opportunities data
   */
  async refresh() {
    console.log('🔄 Refreshing opportunities...');
    await this.loadOpportunities();
    return this.opportunities;
  }
}

// Export singleton instance
window.OpportunityEngine = new OpportunityEngine();

console.log('✅ Opportunity Engine loaded');
