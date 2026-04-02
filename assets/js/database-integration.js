// ================================================================
// DATABASE INTEGRATION - PRODUCTION READY
// ================================================================
// Integrates database-config.js with existing CharlestonHacks systems
// Ensures proper wiring between database and application

console.log('🔌 Database integration initializing...');

// ================================================================
// INITIALIZE DATABASE HELPER
// ================================================================

// Use the global dbHelper declared in database-config.js (loaded first)
// No need to redeclare - it causes "Identifier 'dbHelper' has already been declared" error

// Wait for supabaseClient to be available
function initializeDatabaseIntegration() {
  if (typeof window.supabase === 'undefined') {
    console.log('⏳ Waiting for Supabase client...');
    setTimeout(initializeDatabaseIntegration, 100);
    return;
  }

  if (typeof window.initializeDatabaseHelper === 'undefined') {
    console.log('⏳ Waiting for database helper...');
    setTimeout(initializeDatabaseIntegration, 100);
    return;
  }

  try {
    window.dbHelper = window.initializeDatabaseHelper(window.supabase);
    console.log('✅ Database helper integrated with Supabase client');

    // Initialize enhanced functions
    setupEnhancedFunctions();

  } catch (error) {
    console.error('❌ Failed to initialize database helper:', error);
  }
}

// Start initialization
initializeDatabaseIntegration();

// ================================================================
// ENHANCED MESSAGING SYSTEM INTEGRATION
// ================================================================

function setupEnhancedFunctions() {
  // Override existing messaging functions with database-aware versions
  window.sendDirectMessage = async function(userId, message) {
    console.log('📨 Enhanced sendDirectMessage called:', userId, message);
    
    try {
      if (!window.dbHelper) throw new Error('Database helper not initialized');

      // Create or get conversation
      const conversation = await window.dbHelper.createConversation(userId);

      // Send message if provided
      if (message && message.trim()) {
        await window.dbHelper.sendMessage(conversation.id, message.trim());
      }
      
      // Open messaging interface
      if (typeof window.openMessagingInterface === 'function') {
        await window.openMessagingInterface(conversation.id);
      }
      
      console.log('✅ Direct message sent successfully');
      
    } catch (error) {
      console.error('❌ Error in enhanced sendDirectMessage:', error);
      
      // Fallback to original function if it exists
      if (window.originalSendDirectMessage) {
        return window.originalSendDirectMessage(userId, message);
      }
      
      if (window.showSynapseNotification) {
        window.showSynapseNotification('Failed to send message', 'error');
      }
    }
  };

  // Enhanced messaging interface
  window.openEnhancedMessagingInterface = async function(conversationId = null) {
    console.log('💬 Enhanced messaging interface opening...');
    
    try {
      if (!window.dbHelper) throw new Error('Database helper not initialized');

      // Load conversations using database helper
      const conversations = await window.dbHelper.getConversations();
      
      // Call original messaging interface with enhanced data
      if (typeof window.openMessagingInterface === 'function') {
        return window.openMessagingInterface(conversationId);
      }
      
    } catch (error) {
      console.error('❌ Error opening enhanced messaging interface:', error);
    }
  };

  // ================================================================
  // ENHANCED CONNECTION SYSTEM INTEGRATION
  // ================================================================

  window.sendEnhancedConnectionRequest = async function(toCommunityId, targetName = 'User', type = 'recommendation') {
    console.log('🤝 Enhanced connection request:', toCommunityId, targetName, type);
    
    try {
      if (!window.dbHelper) throw new Error('Database helper not initialized');

      const result = await window.dbHelper.sendConnectionRequest(toCommunityId, type);
      
      console.log('✅ Enhanced connection request sent:', result);
      
      // Refresh UI components
      if (typeof window.refreshCounters === 'function') {
        await window.refreshCounters();
      }
      
      if (typeof window.refreshSynapse === 'function') {
        await window.refreshSynapse();
      }
      
      if (window.showSynapseNotification) {
        window.showSynapseNotification(`Connection request sent to ${targetName}`, 'success');
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Error sending enhanced connection request:', error);
      
      if (window.showSynapseNotification) {
        window.showSynapseNotification('Failed to send connection request', 'error');
      }
      return { success: false, error };
    }
  };

// ================================================================
// ENHANCED PROJECT SYSTEM INTEGRATION
// ================================================================

window.createEnhancedProject = async function(projectData) {
  console.log('💡 Enhanced project creation:', projectData);
  
  try {
    if (!window.dbHelper) throw new Error('Database helper not initialized');
    
    const project = await window.dbHelper.createProject(projectData);
    
    console.log('✅ Enhanced project created:', project);
    console.log(`[Projects] create success: ${project.id}`);
    
    // Refresh UI components
    if (typeof window.refreshCounters === 'function') {
      await window.refreshCounters();
    }

    // Refresh Command Dashboard project list
    if (window.CommandDashboard && typeof window.CommandDashboard.refreshEnrichedData === 'function') {
      console.log('[Projects] command list refresh triggered');
      await window.CommandDashboard.refreshEnrichedData();
    }
    
    if (typeof window.refreshSynapseConnections === 'function') {
      await window.refreshSynapseConnections();
    }
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification(`Project "${project.title}" created successfully`, 'success');
    }
    
    return project;
    
  } catch (error) {
    console.error('❌ Error creating enhanced project:', error);
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Failed to create project', 'error');
    }
  }
};

// ================================================================
// ENHANCED SEARCH INTEGRATION
// ================================================================

window.enhancedCommunitySearch = async function(query, limit = 20) {
  console.log('🔍 Enhanced community search:', query);
  
  try {
    if (!window.dbHelper) throw new Error('Database helper not initialized');
    
    const results = await window.dbHelper.searchCommunity(query, limit);
    
    console.log(`✅ Enhanced search found ${results.length} results`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Error in enhanced community search:', error);
    return [];
  }
};

// ================================================================
// ENHANCED THEME SYSTEM INTEGRATION
// ================================================================

window.joinEnhancedTheme = async function(themeId, engagementLevel = 'interested', signals = []) {
  console.log('🎯 Enhanced theme joining:', themeId, engagementLevel);
  
  try {
    if (!window.dbHelper) throw new Error('Database helper not initialized');
    
    const participation = await window.dbHelper.joinTheme(themeId, engagementLevel, signals);
    
    console.log('✅ Enhanced theme joined:', participation);
    
    // Refresh UI components
    if (typeof window.refreshSynapse === 'function') {
      await window.refreshSynapse();
    }
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Successfully joined theme', 'success');
    }
    
    return participation;
    
  } catch (error) {
    console.error('❌ Error joining enhanced theme:', error);
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Failed to join theme', 'error');
    }
  }
};

// ================================================================
// ENHANCED NETWORK STATS INTEGRATION
// ================================================================

window.getEnhancedNetworkStats = async function() {
  console.log('📊 Getting enhanced network stats...');
  
  try {
    if (!window.dbHelper) throw new Error('Database helper not initialized');
    
    const stats = await window.dbHelper.getNetworkStats();
    
    console.log('✅ Enhanced network stats loaded:', stats);
    
    return stats;
    
  } catch (error) {
    console.error('❌ Error getting enhanced network stats:', error);
    return null;
  }
};

// ================================================================
// REAL-TIME INTEGRATION
// ================================================================

let activeSubscriptions = new Map();

window.subscribeToEnhancedMessages = function(conversationId, callback) {
  console.log('🔄 Subscribing to enhanced messages:', conversationId);
  
  try {
    if (!window.dbHelper) throw new Error('Database helper not initialized');
    
    // Unsubscribe from existing subscription
    if (activeSubscriptions.has(`messages:${conversationId}`)) {
      const oldSub = activeSubscriptions.get(`messages:${conversationId}`);
      supabase.removeChannel(oldSub);
    }
    
    // Create new subscription
    const subscription = window.dbHelper.subscribeToMessages(conversationId, callback);
    activeSubscriptions.set(`messages:${conversationId}`, subscription);
    
    console.log('✅ Enhanced message subscription created');
    
    return subscription;
    
  } catch (error) {
    console.error('❌ Error subscribing to enhanced messages:', error);
    return null;
  }
};

window.subscribeToEnhancedConnections = function(callback) {
  console.log('🔄 Subscribing to enhanced connections...');
  
  try {
    if (!window.dbHelper) throw new Error('Database helper not initialized');
    
    // Unsubscribe from existing subscription
    if (activeSubscriptions.has('connections')) {
      const oldSub = activeSubscriptions.get('connections');
      supabase.removeChannel(oldSub);
    }
    
    // Create new subscription
    const subscription = window.dbHelper.subscribeToConnections(callback);
    activeSubscriptions.set('connections', subscription);
    
    console.log('✅ Enhanced connections subscription created');
    
    return subscription;
    
  } catch (error) {
    console.error('❌ Error subscribing to enhanced connections:', error);
    return null;
  }
};

// ================================================================
// DATABASE HEALTH CHECK
// ================================================================

window.testDatabaseConnection = async function() {
  console.log('🔍 Testing database connection...');
  
  try {
    if (!window.dbHelper) throw new Error('Database helper not initialized');
    
    const result = await window.dbHelper.testConnection();
    
    if (result.success) {
      console.log('✅ Database connection test passed');
      if (window.showSynapseNotification) {
        window.showSynapseNotification('Database connection healthy', 'success');
      }
    } else {
      console.error('❌ Database connection test failed:', result.message);
      if (window.showSynapseNotification) {
        window.showSynapseNotification('Database connection issues detected', 'warning');
      }
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Database connection test error:', error);
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Database connection test failed', 'error');
    }
    return { success: false, message: error.message };
  }
};

// ================================================================
// INITIALIZATION AND CLEANUP
// ================================================================

// Initialize enhanced features when profile is loaded
window.addEventListener('profile-loaded', async (event) => {
  console.log('👤 Profile loaded, initializing enhanced database features...');
  
  try {
    // Test database connection
    await window.testDatabaseConnection();
    
    // Initialize real-time subscriptions for connections
    window.subscribeToEnhancedConnections((payload) => {
      console.log('🔄 Connection update received:', payload);
      
      // Refresh UI components
      if (typeof window.refreshCounters === 'function') {
        window.refreshCounters();
      }
    });
    
    console.log('✅ Enhanced database features initialized');
    
  } catch (error) {
    console.error('❌ Error initializing enhanced database features:', error);
  }
});

// Cleanup subscriptions on logout
window.addEventListener('user-logged-out', () => {
  console.log('👋 User logged out, cleaning up database subscriptions...');
  
  // Unsubscribe from all active subscriptions
  activeSubscriptions.forEach((subscription, key) => {
    try {
      supabase.removeChannel(subscription);
      console.log(`✅ Unsubscribed from ${key}`);
    } catch (error) {
      console.warn(`⚠️ Error unsubscribing from ${key}:`, error);
    }
  });
  
  activeSubscriptions.clear();
  
  // Reset database helper
  if (window.dbHelper) {
    window.dbHelper.currentUser = null;
    window.dbHelper.currentCommunityProfile = null;
  }
  
  console.log('✅ Database cleanup completed');
});

// ================================================================
// EXPOSE ENHANCED FUNCTIONS GLOBALLY
// ================================================================

// Note: window.dbHelper is already set by database-config.js
// Note: window.DATABASE_SCHEMA and window.COLUMN_MAPPINGS are already set by database-config.js

// Enhanced function aliases
window.sendDirectMessage = window.sendDirectMessage; // Already overridden above
window.sendConnectionRequest = window.sendEnhancedConnectionRequest;

// ================================================================
// BACKWARD COMPATIBILITY
// ================================================================

// Ensure existing functions still work by providing fallbacks
if (!window.originalSendDirectMessage && window.sendDirectMessage) {
  window.originalSendDirectMessage = window.sendDirectMessage;
}

console.log('✅ Database integration completed - all systems wired');
}
