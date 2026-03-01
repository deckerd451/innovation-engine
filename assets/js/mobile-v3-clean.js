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
  // CREATE MOBILE BOTTOM NAVIGATION
  // ============================================================================
  
  function createMobileBottomNav() {
    // Check if already exists
    if (document.getElementById('mobile-bottom-nav')) return;
    
    // Create container
    const bottomNav = document.createElement('div');
    bottomNav.id = 'mobile-bottom-nav';
    
    // Network button
    const networkBtn = document.createElement('button');
    networkBtn.className = 'mobile-nav-btn active';
    networkBtn.innerHTML = '<i class="fas fa-project-diagram"></i><span>Network</span>';
    networkBtn.onclick = () => {
      // Already on network view
      document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
      networkBtn.classList.add('active');
    };
    
    // People button
    const peopleBtn = document.createElement('button');
    peopleBtn.className = 'mobile-nav-btn';
    peopleBtn.innerHTML = '<i class="fas fa-users"></i><span>People</span>';
    peopleBtn.onclick = () => {
      document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
      peopleBtn.classList.add('active');
      
      // Trigger search for people
      const searchInput = document.getElementById('global-search');
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
        // Trigger search suggestions
        const event = new Event('input', { bubbles: true });
        searchInput.dispatchEvent(event);
      }
    };
    
    // Messages button
    const messagesBtn = document.createElement('button');
    messagesBtn.className = 'mobile-nav-btn';
    messagesBtn.innerHTML = '<i class="fas fa-comments"></i><span>Messages</span>';
    messagesBtn.onclick = () => {
      document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
      messagesBtn.classList.add('active');
      
      // Open messages
      const msgBtn = document.getElementById('btn-messages');
      if (msgBtn) {
        msgBtn.click();
      }
    };
    
    // Profile button
    const profileBtn = document.createElement('button');
    profileBtn.className = 'mobile-nav-btn';
    profileBtn.innerHTML = '<i class="fas fa-user"></i><span>You</span>';
    profileBtn.onclick = () => {
      document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
      profileBtn.classList.add('active');
      
      // Open profile
      const userMenu = document.getElementById('user-menu');
      const dropdownProfile = document.getElementById('dropdown-profile');
      if (dropdownProfile) {
        dropdownProfile.click();
      } else if (userMenu) {
        userMenu.click();
      }
    };
    
    // Add buttons to nav
    bottomNav.appendChild(networkBtn);
    bottomNav.appendChild(peopleBtn);
    bottomNav.appendChild(messagesBtn);
    bottomNav.appendChild(profileBtn);
    
    // Add to body
    document.body.appendChild(bottomNav);
  }
  
  // ============================================================================
  // HIDE CONNECTION LINES (Proximity shows connections instead)
  // ============================================================================
  
  function hideConnectionLines() {
    // Hide all SVG lines and paths
    const svg = document.getElementById('synapse-svg');
    if (!svg) return;
    
    // Hide lines
    const lines = svg.querySelectorAll('line, path[stroke], .link, .connection, .edge');
    lines.forEach(line => {
      line.style.display = 'none';
      line.style.opacity = '0';
      line.style.visibility = 'hidden';
    });
    
    // Ensure nodes are visible
    const nodes = svg.querySelectorAll('circle, .node');
    nodes.forEach(node => {
      node.style.display = 'block';
      node.style.opacity = '1';
      node.style.visibility = 'visible';
    });
  }
  
  // ============================================================================
  // PREVENT CONNECTION LINES FROM BEING DRAWN
  // ============================================================================
  
  function preventConnectionLines() {
    // Override D3 link drawing if it exists
    if (window.d3) {
      const originalLine = window.d3.line;
      window.d3.line = function() {
        const line = originalLine.apply(this, arguments);
        // Return a line that draws nothing
        return function() { return ''; };
      };
    }
    
    // Watch for new lines being added
    const svg = document.getElementById('synapse-svg');
    if (!svg) return;
    
    const observer = new MutationObserver(() => {
      hideConnectionLines();
    });
    
    observer.observe(svg, {
      childList: true,
      subtree: true
    });
  }
  
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
    createMobileBottomNav();
    hideConnectionLines();
    preventConnectionLines();
    cleanUpArtifacts();
    ensureButtonsWork();
    preventZoomOnInput();
    
    // Re-run cleanup after DOM changes
    const observer = new MutationObserver(() => {
      hideConnectionLines();
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
