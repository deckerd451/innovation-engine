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
  // CREATE MOBILE TOP BAR - DRAGGABLE
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
    const adminBtn = document.getElementById('btn-admin-top');
    
    if (refreshBtn) {
      topBar.appendChild(refreshBtn);
    }
    
    if (logoutBtn) {
      topBar.appendChild(logoutBtn);
    }
    
    // Check if user is admin and add admin button
    if (adminBtn && window.isAdminUser && window.isAdminUser()) {
      adminBtn.style.display = 'flex';
      topBar.appendChild(adminBtn);
    }
    
    // Add to body
    document.body.appendChild(topBar);
    
    // Make draggable
    makeDraggable(topBar);
  }
  
  // ============================================================================
  // DRAGGABLE FUNCTIONALITY
  // ============================================================================
  
  function makeDraggable(element) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    
    // Get initial position from computed style
    const rect = element.getBoundingClientRect();
    xOffset = rect.right - window.innerWidth;
    yOffset = rect.top;
    
    element.addEventListener('touchstart', dragStart, { passive: false });
    element.addEventListener('touchend', dragEnd);
    element.addEventListener('touchmove', drag, { passive: false });
    
    element.addEventListener('mousedown', dragStart);
    element.addEventListener('mouseup', dragEnd);
    element.addEventListener('mousemove', drag);
    
    function dragStart(e) {
      // Only drag if touching the container, not the buttons
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'I') {
        return;
      }
      
      if (e.type === 'touchstart') {
        initialX = e.touches[0].clientX - xOffset;
        initialY = e.touches[0].clientY - yOffset;
      } else {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
      }
      
      isDragging = true;
      element.style.cursor = 'grabbing';
    }
    
    function dragEnd(e) {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
      element.style.cursor = 'grab';
      
      // Save position to localStorage
      localStorage.setItem('mobile-top-bar-position', JSON.stringify({ x: xOffset, y: yOffset }));
    }
    
    function drag(e) {
      if (!isDragging) return;
      
      e.preventDefault();
      
      if (e.type === 'touchmove') {
        currentX = e.touches[0].clientX - initialX;
        currentY = e.touches[0].clientY - initialY;
      } else {
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
      }
      
      xOffset = currentX;
      yOffset = currentY;
      
      // Constrain to viewport
      const maxX = window.innerWidth - element.offsetWidth - 12;
      const maxY = window.innerHeight - element.offsetHeight - 12;
      
      xOffset = Math.max(12, Math.min(xOffset, maxX));
      yOffset = Math.max(12, Math.min(yOffset, maxY));
      
      setTranslate(xOffset, yOffset, element);
    }
    
    function setTranslate(xPos, yPos, el) {
      el.style.right = 'auto';
      el.style.left = xPos + 'px';
      el.style.top = yPos + 'px';
    }
    
    // Restore saved position
    const savedPosition = localStorage.getItem('mobile-top-bar-position');
    if (savedPosition) {
      try {
        const pos = JSON.parse(savedPosition);
        xOffset = pos.x;
        yOffset = pos.y;
        setTranslate(xOffset, yOffset, element);
      } catch (e) {
        // Ignore invalid saved position
      }
    }
    
    // Add visual indicator that it's draggable
    element.style.cursor = 'grab';
  }
  
  // ============================================================================
  // CREATE MOBILE BOTTOM NAVIGATION
  // ============================================================================
  
  let currentSearchCategory = null;
  
  function createMobileBottomNav() {
    // Check if already exists
    if (document.getElementById('mobile-bottom-nav')) return;
    
    // Create scrollable container
    const bottomNav = document.createElement('div');
    bottomNav.id = 'mobile-bottom-nav';
    
    // Create scrollable button container
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'mobile-nav-scroll';
    
    // Define navigation buttons
    const navButtons = [
      { id: 'people', icon: 'fa-users', label: 'People', category: 'people' },
      { id: 'organizations', icon: 'fa-building', label: 'Organizations', category: 'organizations' },
      { id: 'projects', icon: 'fa-lightbulb', label: 'Projects', category: 'projects' },
      { id: 'opportunities', icon: 'fa-briefcase', label: 'Opportunities', category: 'opportunities' },
      { id: 'report', icon: 'fa-chart-bar', label: 'Report', category: 'report' },
      { id: 'intelligence', icon: 'fa-brain', label: 'Intelligence', category: 'intelligence' }
    ];
    
    // Create buttons
    navButtons.forEach((btn, index) => {
      const button = document.createElement('button');
      button.className = 'mobile-nav-btn';
      button.dataset.category = btn.category;
      button.innerHTML = `<i class="fas ${btn.icon}"></i><span>${btn.label}</span>`;
      
      button.onclick = () => {
        // Update active state
        document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        
        // Show search bar
        showSearchBar(btn.category);
        
        // Store current category
        currentSearchCategory = btn.category;
      };
      
      scrollContainer.appendChild(button);
    });
    
    bottomNav.appendChild(scrollContainer);
    document.body.appendChild(bottomNav);
  }
  
  // ============================================================================
  // SEARCH BAR MANAGEMENT
  // ============================================================================
  
  function showSearchBar(category) {
    const searchContainer = document.getElementById('centered-search-container');
    const searchInput = document.getElementById('global-search');
    
    if (!searchContainer || !searchInput) return;
    
    // Show search container
    searchContainer.style.display = 'flex';
    searchContainer.style.opacity = '0';
    searchContainer.style.transform = 'translateX(-50%) translateY(20px)';
    
    // Animate in
    setTimeout(() => {
      searchContainer.style.transition = 'all 0.3s ease';
      searchContainer.style.opacity = '1';
      searchContainer.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);
    
    // Update placeholder based on category
    const placeholders = {
      people: 'Search people...',
      organizations: 'Search organizations...',
      projects: 'Search projects...',
      opportunities: 'Search opportunities...',
      report: 'Generate network report...',
      intelligence: 'Ask intelligence...'
    };
    
    searchInput.placeholder = placeholders[category] || 'Search...';
    
    // Handle special categories
    if (category === 'report') {
      handleReportCategory();
    } else if (category === 'intelligence') {
      handleIntelligenceCategory();
    } else {
      // Focus search for normal categories
      setTimeout(() => searchInput.focus(), 350);
    }
  }
  
  function handleReportCategory() {
    // Open network report
    const reportBtn = document.getElementById('cd-report-btn');
    if (reportBtn) {
      reportBtn.click();
    } else if (typeof window.generateNetworkReport === 'function') {
      window.generateNetworkReport();
    }
  }
  
  function handleIntelligenceCategory() {
    // Open START/Intelligence panel
    if (window.EnhancedStartUI && window.EnhancedStartUI.open) {
      window.EnhancedStartUI.open();
    } else if (typeof window.openStartModal === 'function') {
      window.openStartModal();
    }
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
  
  // ============================================================================
  // HIDE LEGEND
  // ============================================================================
  
  function hideLegend() {
    const legends = document.querySelectorAll(
      '#graph-legend, .graph-legend, .legend, .legend-panel, [class*="legend"], [id*="legend"]'
    );
    
    legends.forEach(legend => {
      legend.style.display = 'none';
      legend.style.visibility = 'hidden';
      legend.style.opacity = '0';
    });
  }
  
  // ============================================================================
  // HIDE COMPETING LOADING STATES
  // ============================================================================
  
  function hideLoadingStates() {
    const loadingElements = document.querySelectorAll(
      '.loading, .loader, .spinner, .loading-spinner, .loading-overlay, .loading-indicator, ' +
      '[class*="loading"], [class*="spinner"], [class*="loader"], ' +
      '[id*="loading"], [id*="spinner"], [id*="loader"]'
    );
    
    loadingElements.forEach(el => {
      // Skip the main loading indicator if it exists
      if (el.id === 'main-loading') return;
      
      el.style.display = 'none';
      el.style.visibility = 'hidden';
      el.style.opacity = '0';
    });
  }
  
  // ============================================================================
  // LOCK VIEWPORT - PREVENT NODES FROM BEING CUT OFF
  // ============================================================================
  
  function lockViewport() {
    const svg = document.getElementById('synapse-svg');
    if (!svg) return;
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Set viewBox to match viewport with padding
    const padding = 50;
    svg.setAttribute('viewBox', `${-padding} ${-padding} ${viewportWidth + padding * 2} ${viewportHeight + padding * 2}`);
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
    hideSearchBarInitially();
    hideLegend();
    hideLoadingStates();
    lockViewport();
    hideConnectionLines();
    preventConnectionLines();
    cleanUpArtifacts();
    ensureButtonsWork();
    preventZoomOnInput();
    
    // Re-run on resize
    window.addEventListener('resize', () => {
      lockViewport();
      hideLegend();
      hideLoadingStates();
    });
    
    // Re-run cleanup after DOM changes
    const observer = new MutationObserver(() => {
      hideLegend();
      hideLoadingStates();
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
  
  // ============================================================================
  // HIDE SEARCH BAR INITIALLY
  // ============================================================================
  
  function hideSearchBarInitially() {
    const searchContainer = document.getElementById('centered-search-container');
    if (searchContainer) {
      searchContainer.style.display = 'none';
      searchContainer.style.opacity = '0';
    }
  }
  
  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
