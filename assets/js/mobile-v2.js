/**
 * MOBILE V2 - BULLETPROOF MOBILE JAVASCRIPT
 * Handles all mobile-specific interactions and behaviors
 * Last updated: 2026-03-01
 */

(function() {
  'use strict';
  
  // ============================================================================
  // MOBILE DETECTION
  // ============================================================================
  
  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth < 1024;
  };
  
  const isIOS = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  };
  
  const isAndroid = () => {
    return /Android/.test(navigator.userAgent);
  };
  
  // ============================================================================
  // VIEWPORT HEIGHT FIX (iOS address bar)
  // ============================================================================
  
  function setViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    document.documentElement.style.setProperty('--mobile-vh', `${window.innerHeight}px`);
  }
  
  function initViewportHeight() {
    setViewportHeight();
    
    // Update on resize and orientation change
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(setViewportHeight, 100);
    });
    
    window.addEventListener('orientationchange', () => {
      setTimeout(setViewportHeight, 100);
    });
  }
  
  // ============================================================================
  // TOUCH TARGET OPTIMIZATION
  // ============================================================================
  
  function optimizeTouchTargets() {
    const selectors = [
      'button',
      'a',
      '[role="button"]',
      '.btn',
      '.clickable',
      'input[type="button"]',
      'input[type="submit"]'
    ];
    
    const elements = document.querySelectorAll(selectors.join(','));
    
    elements.forEach(el => {
      // Ensure minimum touch target size
      const rect = el.getBoundingClientRect();
      if (rect.height < 44 || rect.width < 44) {
        el.style.minHeight = '44px';
        el.style.minWidth = '44px';
      }
      
      // Ensure proper touch behavior
      el.style.touchAction = 'manipulation';
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      
      // Prevent children from blocking clicks
      const children = el.querySelectorAll('*');
      children.forEach(child => {
        child.style.pointerEvents = 'none';
      });
    });
  }
  
  // ============================================================================
  // BUTTON CLICK HANDLER (Ensures all buttons work)
  // ============================================================================
  
  function ensureButtonsWork() {
    // Get all buttons
    const buttons = document.querySelectorAll('button, .btn, [role="button"]');
    
    buttons.forEach(button => {
      // Remove any existing listeners to avoid duplicates
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);
      
      // Add touch event listener
      newButton.addEventListener('touchstart', function(e) {
        this.classList.add('touching');
      }, { passive: true });
      
      newButton.addEventListener('touchend', function(e) {
        this.classList.remove('touching');
      }, { passive: true });
      
      newButton.addEventListener('touchcancel', function(e) {
        this.classList.remove('touching');
      }, { passive: true });
    });
  }
  
  // ============================================================================
  // KEYBOARD HANDLING
  // ============================================================================
  
  function handleKeyboard() {
    const originalHeight = window.innerHeight;
    
    // Detect keyboard open/close
    window.addEventListener('resize', () => {
      const currentHeight = window.innerHeight;
      const diff = originalHeight - currentHeight;
      
      if (diff > 150) {
        // Keyboard is open
        document.body.classList.add('keyboard-open');
        
        // Scroll active input into view
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
          setTimeout(() => {
            activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }
      } else {
        // Keyboard is closed
        document.body.classList.remove('keyboard-open');
      }
    });
    
    // Prevent zoom on input focus (iOS)
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.style.fontSize = '16px';
    });
  }
  
  // ============================================================================
  // PULL TO REFRESH
  // ============================================================================
  
  function initPullToRefresh() {
    let startY = 0;
    let currentY = 0;
    let pulling = false;
    let indicator = null;
    
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;
    
    // Create indicator
    indicator = document.createElement('div');
    indicator.id = 'pull-indicator';
    indicator.innerHTML = '<i class="fas fa-sync-alt"></i>';
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      color: #00e0ff;
      font-size: 1.5rem;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
    `;
    document.body.appendChild(indicator);
    
    mainContent.addEventListener('touchstart', (e) => {
      if (window.scrollY === 0 || mainContent.scrollTop === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    }, { passive: true });
    
    mainContent.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      
      if (diff > 0 && diff < 100) {
        const opacity = Math.min(diff / 80, 1);
        indicator.style.opacity = opacity;
        
        if (diff > 60) {
          indicator.style.transform = 'translateX(-50%) rotate(180deg)';
        } else {
          indicator.style.transform = 'translateX(-50%) rotate(0deg)';
        }
      }
    }, { passive: true });
    
    mainContent.addEventListener('touchend', () => {
      if (!pulling) return;
      
      const diff = currentY - startY;
      if (diff > 80) {
        // Trigger refresh
        indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        indicator.style.opacity = '1';
        
        setTimeout(() => {
          location.reload();
        }, 500);
      } else {
        // Reset
        indicator.style.opacity = '0';
        indicator.style.transform = 'translateX(-50%) rotate(0deg)';
      }
      
      pulling = false;
    });
  }
  
  // ============================================================================
  // SWIPE GESTURES
  // ============================================================================
  
  function initSwipeGestures() {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    
    document.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });
    
    document.addEventListener('touchend', (e) => {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const endTime = Date.now();
      
      const diffX = endX - startX;
      const diffY = endY - startY;
      const diffTime = endTime - startTime;
      
      // Only register as swipe if fast enough
      if (diffTime > 500) return;
      
      // Horizontal swipe
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 100) {
        if (diffX > 0) {
          handleSwipeRight();
        } else {
          handleSwipeLeft();
        }
      }
    });
  }
  
  function handleSwipeRight() {
    // Close any open panels
    const panels = document.querySelectorAll('.node-panel.active, #node-side-panel.active');
    panels.forEach(panel => {
      panel.classList.remove('active');
    });
  }
  
  function handleSwipeLeft() {
    // Could open a menu or panel
  }
  
  // ============================================================================
  // PREVENT DOUBLE TAP ZOOM
  // ============================================================================
  
  function preventDoubleTapZoom() {
    let lastTouchEnd = 0;
    
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });
  }
  
  // ============================================================================
  // SMOOTH SCROLLING
  // ============================================================================
  
  function enableSmoothScrolling() {
    const scrollables = document.querySelectorAll(
      '.scrollable, .modal-content, #search-suggestions, .node-panel, [style*="overflow"]'
    );
    
    scrollables.forEach(el => {
      el.style.webkitOverflowScrolling = 'touch';
      el.style.overscrollBehavior = 'contain';
    });
  }
  
  // ============================================================================
  // SAFE AREA DETECTION
  // ============================================================================
  
  function detectSafeAreas() {
    // Test if safe area insets are supported
    const testDiv = document.createElement('div');
    testDiv.style.paddingTop = 'env(safe-area-inset-top)';
    document.body.appendChild(testDiv);
    
    const hasSafeArea = getComputedStyle(testDiv).paddingTop !== '0px';
    document.body.removeChild(testDiv);
    
    if (hasSafeArea) {
      document.body.classList.add('has-safe-area');
    }
  }
  
  // ============================================================================
  // ORIENTATION CHANGE HANDLER
  // ============================================================================
  
  function handleOrientationChange() {
    window.addEventListener('orientationchange', () => {
      // Wait for orientation change to complete
      setTimeout(() => {
        setViewportHeight();
        optimizeTouchTargets();
        
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('mobileOrientationChange', {
          detail: {
            orientation: window.orientation,
            width: window.innerWidth,
            height: window.innerHeight
          }
        }));
      }, 100);
    });
  }
  
  // ============================================================================
  // PERFORMANCE MONITORING
  // ============================================================================
  
  function monitorPerformance() {
    // Log slow interactions
    let interactionStart = 0;
    
    document.addEventListener('touchstart', () => {
      interactionStart = performance.now();
    }, { passive: true });
    
    document.addEventListener('touchend', () => {
      const duration = performance.now() - interactionStart;
      if (duration > 100) {
        console.warn(`Slow interaction: ${duration}ms`);
      }
    }, { passive: true });
  }
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    if (!isMobile()) {
      console.log('Mobile V2: Desktop detected, skipping mobile initialization');
      return;
    }
    
    console.log('Mobile V2: Initializing mobile experience...');
    
    // Core functionality
    initViewportHeight();
    optimizeTouchTargets();
    handleKeyboard();
    
    // Enhanced interactions
    initPullToRefresh();
    initSwipeGestures();
    preventDoubleTapZoom();
    enableSmoothScrolling();
    
    // Device-specific
    detectSafeAreas();
    handleOrientationChange();
    
    // Performance
    if (window.location.search.includes('debug=1')) {
      monitorPerformance();
    }
    
    // Re-optimize touch targets after DOM changes
    const observer = new MutationObserver(() => {
      optimizeTouchTargets();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Mark as initialized
    document.body.classList.add('mobile-v2-initialized');
    
    console.log('Mobile V2: Initialization complete');
    
    // Dispatch ready event
    window.dispatchEvent(new CustomEvent('mobileV2Ready', {
      detail: {
        isIOS: isIOS(),
        isAndroid: isAndroid(),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      }
    }));
  }
  
  // ============================================================================
  // AUTO-INITIALIZE
  // ============================================================================
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Export for manual initialization if needed
  window.MobileV2 = {
    init,
    isMobile,
    isIOS,
    isAndroid,
    optimizeTouchTargets,
    setViewportHeight
  };
  
})();
