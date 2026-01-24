/*
 * Connections Fix - Wrapper
 * File: assets/js/connections-fix.js
 * 
 * ADD THIS FILE to your site to fix silent connection failures
 * This wraps your existing connections functionality with better error handling
 */

(function() {
  'use strict';
  
  // Toast notification system
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `connection-toast toast-${type}`;
    toast.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    `;
    
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#00e0ff'};
      color: #fff;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      animation: slideInRight 0.3s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      min-width: 300px;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
  
  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOutRight {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
  
  // Wrap connection request function
  window.ConnectionsModule = window.ConnectionsModule || {};
  
  const originalSendRequest = window.ConnectionsModule.sendConnectionRequest;
  
  window.ConnectionsModule.sendConnectionRequest = async function(targetUserId, targetUserName) {
    try {
      showToast(`Sending connection request to ${targetUserName}...`, 'info');
      
      if (!window.supabase) {
        throw new Error('Not connected to database');
      }
      
      const { data: { session } } = await window.supabase.auth.getSession();
      if (!session) {
        showToast('Please sign in to send connection requests', 'error');
        return;
      }
      
      // Get current user's community ID
      const { data: currentUserProfile } = await window.supabase
        .from('community')
        .select('id')
        .eq('user_id', session.user.id)
        .single();
      
      if (!currentUserProfile) {
        showToast('Please create your profile first', 'error');
        return;
      }
      
      // Get target user's community ID
      const { data: targetUserProfile } = await window.supabase
        .from('community')
        .select('id')
        .eq('user_id', targetUserId)
        .single();
      
      if (!targetUserProfile) {
        showToast('User profile not found', 'error');
        return;
      }
      
      // Check if already connected
      const { data: existing } = await window.supabase
        .from('connections')
        .select('*')
        .or(`and(user1_id.eq.${session.user.id},user2_id.eq.${targetUserId}),and(user1_id.eq.${targetUserId},user2_id.eq.${session.user.id})`);
      
      if (existing && existing.length > 0) {
        const status = existing[0].status;
        if (status === 'accepted') {
          showToast('You are already connected!', 'info');
        } else if (status === 'pending') {
          showToast('Connection request already pending', 'info');
        }
        return;
      }
      
      // Send connection request
      const { data, error } = await window.supabase
        .from('connections')
        .insert({
          user1_id: session.user.id,
          user2_id: targetUserId,
          user1_community_id: currentUserProfile.id,
          user2_community_id: targetUserProfile.id,
          status: 'pending'
        })
        .select()
        .single();
      
      if (error) {
        console.error('Connection error:', error);
        
        if (error.code === '23505') { // Unique constraint violation
          showToast('Connection request already exists', 'info');
        } else {
          showToast(`Failed to send connection request: ${error.message}`, 'error');
        }
        return;
      }
      
      // Success!
      showToast(`✓ Connection request sent to ${targetUserName}!`, 'success');
      
      // Update UI - find the connect button and disable it
      const buttons = document.querySelectorAll(`[onclick*="${targetUserId}"]`);
      buttons.forEach(btn => {
        if (btn.textContent.includes('Connect')) {
          btn.disabled = true;
          btn.innerHTML = '<i class="fas fa-check"></i> Request Sent';
          btn.style.opacity = '0.6';
          btn.style.cursor = 'not-allowed';
        }
      });
      
      // Dispatch event for other modules
      window.dispatchEvent(new CustomEvent('connectionRequestSent', {
        detail: { targetUserId, targetUserName }
      }));
      
    } catch (error) {
      console.error('Connection request error:', error);
      showToast(`Failed to send connection request: ${error.message}`, 'error');
    }
  };
  
  // Export for manual calls
  window.sendConnectionRequest = window.ConnectionsModule.sendConnectionRequest;
  
  console.log('✓ Connections fix loaded - better error handling enabled');
})();
