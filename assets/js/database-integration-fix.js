// ================================================================
// DATABASE INTEGRATION FIX - IMMEDIATE SOLUTION
// ================================================================
// Quick fix for sendDirectMessage undefined error

console.log('🔧 Database integration fix loading...');

// Ensure sendDirectMessage is available immediately
if (typeof window.sendDirectMessage === 'undefined') {
  window.sendDirectMessage = async function(userId, message) {
    console.log('📨 Fallback sendDirectMessage called:', userId, message);
    
    // Try to use the enhanced version if available
    if (window.sendEnhancedDirectMessage) {
      return window.sendEnhancedDirectMessage(userId, message);
    }
    
    // Basic fallback implementation
    try {
      if (!window.supabase || !window.currentUserProfile) {
        console.warn('⚠️ Supabase or user profile not available');
        if (window.showSynapseNotification) {
          window.showSynapseNotification('Please wait for system to initialize', 'warning');
        }
        return;
      }
      
      // Open messaging interface directly
      if (typeof window.openMessagingInterface === 'function') {
        window.openMessagingInterface();
      } else {
        console.warn('⚠️ Messaging interface not available');
      }
      
    } catch (error) {
      console.error('❌ Error in fallback sendDirectMessage:', error);
      if (window.showSynapseNotification) {
        window.showSynapseNotification('Messaging system temporarily unavailable', 'error');
      }
    }
  };
  
  console.log('✅ Fallback sendDirectMessage function created');
}

// Enhanced version that will replace the fallback when database helper is ready
window.sendEnhancedDirectMessage = async function(userId, message) {
  console.log('📨 Enhanced sendDirectMessage called:', userId, message);
  
  try {
    // Wait for database helper to be available
    if (!window.dbHelper && window.DatabaseHelper && window.supabase) {
      window.dbHelper = new window.DatabaseHelper(window.supabase);
    }
    
    if (!window.dbHelper) {
      console.warn('⚠️ Database helper not available, using basic messaging');
      if (typeof window.openMessagingInterface === 'function') {
        window.openMessagingInterface();
      }
      return;
    }
    
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
    
    console.log('✅ Enhanced direct message sent successfully');
    
  } catch (error) {
    console.error('❌ Error in enhanced sendDirectMessage:', error);
    
    // Fallback to basic messaging
    if (typeof window.openMessagingInterface === 'function') {
      window.openMessagingInterface();
    }
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Message system available in basic mode', 'info');
    }
  }
};

// Replace the fallback with enhanced version when ready
function upgradeToEnhancedMessaging() {
  if (window.dbHelper || (window.DatabaseHelper && window.supabase)) {
    window.sendDirectMessage = window.sendEnhancedDirectMessage;
    console.log('✅ Upgraded to enhanced messaging system');
  } else {
    // Try again in 500ms
    setTimeout(upgradeToEnhancedMessaging, 500);
  }
}

// Start the upgrade process
setTimeout(upgradeToEnhancedMessaging, 1000);

console.log('✅ Database integration fix ready');