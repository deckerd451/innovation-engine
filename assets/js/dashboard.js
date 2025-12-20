/* 
 * Dashboard Module
 * File: assets/js/dashboard.js
 * 
 * Manages the main dashboard view that shows:
 * - User stats
 * - Active projects
 * - Recommendations
 * - Recent activity
 */

(function() {
  'use strict';
  
  let isInitialized = false;
  let updateInterval = null;
  
  // ============================================================
  // INITIALIZATION
  // ============================================================
  
  function init() {
    if (isInitialized) {
      console.log('Dashboard already initialized');
      return;
    }
    
    console.log('📊 Initializing Dashboard...');
    
    if (!window.EcosystemConnector) {
      console.warn('EcosystemConnector not available yet, retrying...');
      setTimeout(init, 500);
      return;
    }
    
    // Render initial dashboard
    renderDashboard();
    
    // Setup auto-refresh every 30 seconds
    updateInterval = setInterval(renderDashboard, 30000);
    
    isInitialized = true;
    console.log('✅ Dashboard initialized');
  }
  
  // ============================================================
  // RENDERING
  // ============================================================
  
  function renderDashboard() {
    const container = document.getElementById('dashboard-container');
    if (!container) return;
    
    try {
      window.EcosystemConnector.renderDashboard('dashboard-container');
    } catch (error) {
      console.error('Error rendering dashboard:', error);
      container.innerHTML = `
        <div class="empty-state">
          <p>Failed to load dashboard. Please refresh the page.</p>
        </div>
      `;
    }
  }
  
  // ============================================================
  // CLEANUP
  // ============================================================
  
  function cleanup() {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
    isInitialized = false;
    console.log('Dashboard cleaned up');
  }
  
  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  
  // Listen for dashboard tab activation
  document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        const target = mutation.target;
        
        // Dashboard activated
        if (target.classList.contains('active-tab-pane') && 
            target.id === 'dashboard') {
          init();
        }
        
        // Dashboard deactivated - cleanup
        if (!target.classList.contains('active-tab-pane') && 
            target.id === 'dashboard' && 
            isInitialized) {
          cleanup();
        }
      });
    });
    
    const dashboardTab = document.getElementById('dashboard');
    if (dashboardTab) {
      observer.observe(dashboardTab, { 
        attributes: true, 
        attributeFilter: ['class'] 
      });
      
      // Initialize immediately if already active
      if (dashboardTab.classList.contains('active-tab-pane')) {
        init();
      }
    }
  });
  
  // Listen for ecosystem updates
  window.addEventListener('recommendations-updated', () => {
    if (isInitialized) {
      renderDashboard();
    }
  });
  
  window.addEventListener('ecosystem-notification', () => {
    if (isInitialized) {
      renderDashboard();
    }
  });
  
  // Listen for profile updates
  window.addEventListener('profile-updated', () => {
    if (isInitialized) {
      setTimeout(renderDashboard, 1000); // Delay to allow data sync
    }
  });
  
  // Expose for manual refresh
  window.refreshDashboard = function() {
    renderDashboard();
  };
})();
