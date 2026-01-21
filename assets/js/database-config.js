// ================================================================
// DATABASE CONFIGURATION & UTILITIES
// ================================================================
// Centralized database configuration and helper functions for CharlestonHacks

console.log('🗄️ Database configuration loading...');

// ================================================================
// DATABASE SCHEMA MAPPING
// ================================================================
// Based on your actual Supabase schema analysis

window.DATABASE_SCHEMA = {
  // Core tables
  COMMUNITY: 'community',
  CONVERSATIONS: 'conversations', 
  MESSAGES: 'messages',
  PROJECTS: 'projects',
  CONNECTIONS: 'connections',
  
  // Extended tables
  ENDORSEMENTS: 'endorsements',
  THEME_CIRCLES: 'theme_circles',
  THEME_PARTICIPANTS: 'theme_participants',
  ORGANIZATIONS: 'organizations',
  OPPORTUNITIES: 'opportunities',
  
  // Activity & Engagement
  ACTIVITY_LOG: 'activity_log',
  USER_ACHIEVEMENTS: 'user_achievements',
  ACHIEVEMENTS: 'achievements',
  
  // BBS System
  BBS_CHANNELS: 'bbs_channels',
  BBS_MESSAGES: 'bbs_messages',
  BBS_PRESENCE: 'bbs_presence',
  
  // Project Management
  PROJECT_MEMBERS: 'project_members',
  PROJECT_BIDS: 'project_bids',
  PROJECT_COMMENTS: 'project_comments',
  
  // Ideas System
  IDEAS: 'ideas',
  IDEA_COMMENTS: 'idea_comments',
  IDEA_UPVOTES: 'idea_upvotes',
  TEAM_MEMBERS: 'team_members'
};

// ================================================================
// COLUMN MAPPINGS (Critical for messaging system)
// ================================================================

window.COLUMN_MAPPINGS = {
  // Conversations table - CONFIRMED from your schema
  CONVERSATIONS: {
    ID: 'id',
    PARTICIPANT_1: 'participant_1_id',  // Uses underscores
    PARTICIPANT_2: 'participant_2_id',  // Uses underscores
    CREATED_AT: 'created_at',
    UPDATED_AT: 'updated_at',
    LAST_MESSAGE_AT: 'last_message_at',
    LAST_MESSAGE_PREVIEW: 'last_message_preview'
  },
  
  // Messages table - CONFIRMED from your schema
  MESSAGES: {
    ID: 'id',
    CONVERSATION_ID: 'conversation_id',
    SENDER_ID: 'sender_id',           // References community.id
    CONTENT: 'content',
    READ: 'read',
    CREATED_AT: 'created_at'
  },
  
  // Community table - CONFIRMED from your schema
  COMMUNITY: {
    ID: 'id',
    USER_ID: 'user_id',              // References auth.users.id
    NAME: 'name',
    EMAIL: 'email',
    IMAGE_URL: 'image_url',
    SKILLS: 'skills',
    BIO: 'bio',
    XP: 'xp',
    LEVEL: 'level',
    CONNECTION_COUNT: 'connection_count'
  },
  
  // Connections table - CONFIRMED from your schema
  CONNECTIONS: {
    ID: 'id',
    FROM_USER_ID: 'from_user_id',    // References community.id
    TO_USER_ID: 'to_user_id',        // References community.id
    STATUS: 'status',
    TYPE: 'type',
    CREATED_AT: 'created_at'
  }
};

// ================================================================
// DATABASE HELPER FUNCTIONS
// ================================================================

window.DatabaseHelper = class DatabaseHelper {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.currentUser = null;
    this.currentCommunityProfile = null;
  }

  // ================================================================
  // USER MANAGEMENT
  // ================================================================
  
  async getCurrentUser() {
    if (this.currentUser) return this.currentUser;
    
    const { data: { user }, error } = await this.supabase.auth.getUser();
    if (error) throw error;
    
    this.currentUser = user;
    return user;
  }

  async getCurrentCommunityProfile() {
    if (this.currentCommunityProfile) return this.currentCommunityProfile;
    
    const user = await this.getCurrentUser();
    if (!user) return null;

    const { data, error } = await this.supabase
      .from(DATABASE_SCHEMA.COMMUNITY)
      .select('*')
      .eq(COLUMN_MAPPINGS.COMMUNITY.USER_ID, user.id)
      .single();

    if (error) {
      console.warn('Community profile not found:', error);
      return null;
    }

    this.currentCommunityProfile = data;
    return data;
  }

  // ================================================================
  // MESSAGING SYSTEM
  // ================================================================
  
  async getConversations() {
    const profile = await this.getCurrentCommunityProfile();
    if (!profile) throw new Error('No community profile found');

    const { data, error } = await this.supabase
      .from(DATABASE_SCHEMA.CONVERSATIONS)
      .select(`
        *,
        participant1:${DATABASE_SCHEMA.COMMUNITY}!${COLUMN_MAPPINGS.CONVERSATIONS.PARTICIPANT_1}(
          ${COLUMN_MAPPINGS.COMMUNITY.ID},
          ${COLUMN_MAPPINGS.COMMUNITY.NAME},
          ${COLUMN_MAPPINGS.COMMUNITY.IMAGE_URL}
        ),
        participant2:${DATABASE_SCHEMA.COMMUNITY}!${COLUMN_MAPPINGS.CONVERSATIONS.PARTICIPANT_2}(
          ${COLUMN_MAPPINGS.COMMUNITY.ID},
          ${COLUMN_MAPPINGS.COMMUNITY.NAME},
          ${COLUMN_MAPPINGS.COMMUNITY.IMAGE_URL}
        )
      `)
      .or(`${COLUMN_MAPPINGS.CONVERSATIONS.PARTICIPANT_1}.eq.${profile.id},${COLUMN_MAPPINGS.CONVERSATIONS.PARTICIPANT_2}.eq.${profile.id}`)
      .order(COLUMN_MAPPINGS.CONVERSATIONS.UPDATED_AT, { ascending: false });

    if (error) throw error;
    return data;
  }

  async getMessages(conversationId) {
    const { data, error } = await this.supabase
      .from(DATABASE_SCHEMA.MESSAGES)
      .select('*')
      .eq(COLUMN_MAPPINGS.MESSAGES.CONVERSATION_ID, conversationId)
      .order(COLUMN_MAPPINGS.MESSAGES.CREATED_AT, { ascending: true });

    if (error) throw error;
    return data;
  }

  async sendMessage(conversationId, content) {
    const profile = await this.getCurrentCommunityProfile();
    if (!profile) throw new Error('No community profile found');

    const { data, error } = await this.supabase
      .from(DATABASE_SCHEMA.MESSAGES)
      .insert({
        [COLUMN_MAPPINGS.MESSAGES.CONVERSATION_ID]: conversationId,
        [COLUMN_MAPPINGS.MESSAGES.SENDER_ID]: profile.id,
        [COLUMN_MAPPINGS.MESSAGES.CONTENT]: content,
        [COLUMN_MAPPINGS.MESSAGES.READ]: false
      })
      .select()
      .single();

    if (error) throw error;

    // Update conversation timestamp
    await this.supabase
      .from(DATABASE_SCHEMA.CONVERSATIONS)
      .update({
        [COLUMN_MAPPINGS.CONVERSATIONS.UPDATED_AT]: new Date().toISOString(),
        [COLUMN_MAPPINGS.CONVERSATIONS.LAST_MESSAGE_PREVIEW]: content.substring(0, 100)
      })
      .eq(COLUMN_MAPPINGS.CONVERSATIONS.ID, conversationId);

    return data;
  }

  async createConversation(otherUserId) {
    const profile = await this.getCurrentCommunityProfile();
    if (!profile) throw new Error('No community profile found');

    // Check if conversation already exists
    const { data: existing } = await this.supabase
      .from(DATABASE_SCHEMA.CONVERSATIONS)
      .select(COLUMN_MAPPINGS.CONVERSATIONS.ID)
      .or(`and(${COLUMN_MAPPINGS.CONVERSATIONS.PARTICIPANT_1}.eq.${profile.id},${COLUMN_MAPPINGS.CONVERSATIONS.PARTICIPANT_2}.eq.${otherUserId}),and(${COLUMN_MAPPINGS.CONVERSATIONS.PARTICIPANT_1}.eq.${otherUserId},${COLUMN_MAPPINGS.CONVERSATIONS.PARTICIPANT_2}.eq.${profile.id})`)
      .single();

    if (existing) return existing;

    // Create new conversation
    const { data, error } = await this.supabase
      .from(DATABASE_SCHEMA.CONVERSATIONS)
      .insert({
        [COLUMN_MAPPINGS.CONVERSATIONS.PARTICIPANT_1]: profile.id,
        [COLUMN_MAPPINGS.CONVERSATIONS.PARTICIPANT_2]: otherUserId
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ================================================================
  // CONNECTIONS SYSTEM
  // ================================================================
  
  async getConnections() {
    const profile = await this.getCurrentCommunityProfile();
    if (!profile) throw new Error('No community profile found');

    const { data, error } = await this.supabase
      .from(DATABASE_SCHEMA.CONNECTIONS)
      .select(`
        *,
        from_user:${DATABASE_SCHEMA.COMMUNITY}!${COLUMN_MAPPINGS.CONNECTIONS.FROM_USER_ID}(
          ${COLUMN_MAPPINGS.COMMUNITY.ID},
          ${COLUMN_MAPPINGS.COMMUNITY.NAME},
          ${COLUMN_MAPPINGS.COMMUNITY.IMAGE_URL}
        ),
        to_user:${DATABASE_SCHEMA.COMMUNITY}!${COLUMN_MAPPINGS.CONNECTIONS.TO_USER_ID}(
          ${COLUMN_MAPPINGS.COMMUNITY.ID},
          ${COLUMN_MAPPINGS.COMMUNITY.NAME},
          ${COLUMN_MAPPINGS.COMMUNITY.IMAGE_URL}
        )
      `)
      .or(`${COLUMN_MAPPINGS.CONNECTIONS.FROM_USER_ID}.eq.${profile.id},${COLUMN_MAPPINGS.CONNECTIONS.TO_USER_ID}.eq.${profile.id}`);

    if (error) throw error;
    return data;
  }

  async sendConnectionRequest(toUserId, type = 'generic') {
    const profile = await this.getCurrentCommunityProfile();
    if (!profile) throw new Error('No community profile found');

    const { data, error } = await this.supabase
      .from(DATABASE_SCHEMA.CONNECTIONS)
      .insert({
        [COLUMN_MAPPINGS.CONNECTIONS.FROM_USER_ID]: profile.id,
        [COLUMN_MAPPINGS.CONNECTIONS.TO_USER_ID]: toUserId,
        [COLUMN_MAPPINGS.CONNECTIONS.STATUS]: 'pending',
        [COLUMN_MAPPINGS.CONNECTIONS.TYPE]: type
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ================================================================
  // PROJECTS SYSTEM
  // ================================================================
  
  async getProjects() {
    const { data, error } = await this.supabase
      .from(DATABASE_SCHEMA.PROJECTS)
      .select(`
        *,
        creator:${DATABASE_SCHEMA.COMMUNITY}!creator_id(
          ${COLUMN_MAPPINGS.COMMUNITY.ID},
          ${COLUMN_MAPPINGS.COMMUNITY.NAME},
          ${COLUMN_MAPPINGS.COMMUNITY.IMAGE_URL}
        ),
        theme:${DATABASE_SCHEMA.THEME_CIRCLES}!theme_id(
          id,
          title,
          tags
        )
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async createProject(projectData) {
    const profile = await this.getCurrentCommunityProfile();
    if (!profile) throw new Error('No community profile found');

    const { data, error } = await this.supabase
      .from(DATABASE_SCHEMA.PROJECTS)
      .insert({
        ...projectData,
        creator_id: profile.id
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ================================================================
  // THEME CIRCLES SYSTEM
  // ================================================================
  
  async getActiveThemes() {
    const { data, error } = await this.supabase
      .from(DATABASE_SCHEMA.THEME_CIRCLES)
      .select('*')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('activity_score', { ascending: false });

    if (error) throw error;
    return data;
  }

  async joinTheme(themeId, engagementLevel = 'interested', signals = []) {
    const profile = await this.getCurrentCommunityProfile();
    if (!profile) throw new Error('No community profile found');

    const { data, error } = await this.supabase
      .from(DATABASE_SCHEMA.THEME_PARTICIPANTS)
      .insert({
        theme_id: themeId,
        community_id: profile.id,
        engagement_level: engagementLevel,
        signals: signals
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ================================================================
  // UTILITY FUNCTIONS
  // ================================================================
  
  async searchCommunity(query, limit = 20) {
    const { data, error } = await this.supabase
      .from(DATABASE_SCHEMA.COMMUNITY)
      .select('*')
      .or(`name.ilike.%${query}%,skills.ilike.%${query}%,bio.ilike.%${query}%`)
      .limit(limit);

    if (error) throw error;
    return data;
  }

  async getNetworkStats() {
    const profile = await this.getCurrentCommunityProfile();
    if (!profile) return null;

    const [connectionsResult, projectsResult, endorsementsResult] = await Promise.all([
      this.supabase
        .from(DATABASE_SCHEMA.CONNECTIONS)
        .select('id', { count: 'exact' })
        .or(`${COLUMN_MAPPINGS.CONNECTIONS.FROM_USER_ID}.eq.${profile.id},${COLUMN_MAPPINGS.CONNECTIONS.TO_USER_ID}.eq.${profile.id}`)
        .eq('status', 'accepted'),
      
      this.supabase
        .from(DATABASE_SCHEMA.PROJECTS)
        .select('id', { count: 'exact' })
        .eq('creator_id', profile.id),
      
      this.supabase
        .from(DATABASE_SCHEMA.ENDORSEMENTS)
        .select('id', { count: 'exact' })
        .eq('endorsed_community_id', profile.id)
    ]);

    return {
      connections: connectionsResult.count || 0,
      projects: projectsResult.count || 0,
      endorsements: endorsementsResult.count || 0,
      xp: profile.xp || 0,
      level: profile.level || 1
    };
  }

  // ================================================================
  // REAL-TIME SUBSCRIPTIONS
  // ================================================================
  
  subscribeToMessages(conversationId, callback) {
    return this.supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: DATABASE_SCHEMA.MESSAGES,
        filter: `${COLUMN_MAPPINGS.MESSAGES.CONVERSATION_ID}=eq.${conversationId}`
      }, callback)
      .subscribe();
  }

  subscribeToConnections(callback) {
    const profile = this.currentCommunityProfile;
    if (!profile) return null;

    return this.supabase
      .channel('connections')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: DATABASE_SCHEMA.CONNECTIONS,
        filter: `${COLUMN_MAPPINGS.CONNECTIONS.TO_USER_ID}=eq.${profile.id}`
      }, callback)
      .subscribe();
  }

  // ================================================================
  // ERROR HANDLING & VALIDATION
  // ================================================================
  
  validateConnection() {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }
    return true;
  }

  async testConnection() {
    try {
      const { data, error } = await this.supabase
        .from(DATABASE_SCHEMA.COMMUNITY)
        .select('id')
        .limit(1);
      
      if (error) throw error;
      return { success: true, message: 'Database connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

// ================================================================
// GLOBAL INITIALIZATION
// ================================================================

let dbHelper = null;

window.initializeDatabaseHelper = function(supabaseClient) {
  dbHelper = new window.DatabaseHelper(supabaseClient);
  
  // Expose globally for legacy compatibility
  window.dbHelper = dbHelper;
  
  console.log('✅ Database helper initialized');
  return dbHelper;
};

window.getDatabaseHelper = function() {
  if (!dbHelper) {
    throw new Error('Database helper not initialized. Call initializeDatabaseHelper() first.');
  }
  return dbHelper;
};

console.log('✅ Database configuration loaded');