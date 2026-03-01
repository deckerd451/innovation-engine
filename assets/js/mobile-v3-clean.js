/**
 * MOBILE V3 - CLEAN & SIMPLE
 * Minimal JavaScript for mobile experience
 */

(function() {
  'use strict';
  
  const isMobile = () => window.innerWidth < 1024;
  
  if (!isMobile()) return;
  
  // ============================================================================
  // VIEWPORT HEIGHT FIX
  // ============================================================================
  
  function setViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    document.documentElement.style.setProperty('--mobile-vh', `${window.innerHeight}px`);
  }
  
  setViewportHeight();
  window.addEventListener('resize', setViewportHeight);
  window.addEventListener('orientationchange', () => setTimeout(setViewportHeight, 100));
  
  // ============================================================================
  // CREATE MOBILE TOP BAR
  // ============================================================================
  
  function createMobileTopBar() {
    // Check if already exists
    if (document.getElementById('mobile-top-bar')) return;
    
    // Create container
    const topBar = document.createElement('div');
    topBar.id = 'mobile-top-bar';
    
    // Find existing buttons
    const refreshBtn = document.getElementById('btn-refresh-network');
    const logoutBtn = document.getElementById('btn-logout-header');
    
    if (refreshBtn) {
      topBar.appendChild(refreshBtn);
    }
    
    if (logoutBtn) {
      topBar.appendChild(logoutBtn);
    }
    
    // Add to body
    document.body.appendChild(topBar);
  }
  
  // ============================================================================
  // CLEAN UP ARTIFACTS
  // ============================================================================
  
  function cleanUpArtifacts() {
    // Remove any white boxes or artifacts
    const artifacts = document.querySelectorAll('[style*="background: white"], [style*="background:#fff"], [style*="background: #ffffff"]');
    artifacts.forEach(el => {
      if (el.offsetWidth < 100 && el.offsetHeight < 100) {
        el.style.display = 'none';
      }
    });
    
    // Hide any floating badges at top
    const topElements = document.querySelectorAll('[style*="position:absolute"][style*="top:"]');
    topElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < 100 && rect.height < 60 && !el.id.includes('mobile')) {
        el.style.display = 'none';
      }
    });
  }
  
  // ============================================================================
  // ENSURE BUTTONS WORK
  // ============================================================================
  
  function ensureButtonsWork() {
    const buttons = document.querySelectorAll('button, .btn, [role="button"]');
    
    buttons.forEach(btn => {
      btn.style.pointerEvents = 'auto';
      btn.style.touchAction = 'manipulation';
      btn.style.cursor = 'pointer';
      
      // Ensure children don't block clicks
      const children = btn.querySelectorAll('*');
      children.forEach(child => {
        child.style.pointerEvents = 'none';
      });
    });
  }
  
  // ============================================================================
  // PREVENT ZOOM ON INPUT
  // ============================================================================
  
  function preventZoomOnInput() {
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.style.fontSize = '16px';
    });
  }
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    console.log('Mobile V3 Clean: Initializing...');
    
    createMobileTopBar();
    cleanUpArtifacts();
    ensureButtonsWork();
    preventZoomOnInput();
    
    // Re-run cleanup after DOM changes
    const observer = new MutationObserver(() => {
      cleanUpArtifacts();
      ensureButtonsWork();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    document.body.classList.add('mobile-v3-clean');
    console.log('Mobile V3 Clean: Ready');
  }
  
  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
