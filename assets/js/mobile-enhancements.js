// Mobile Enhancements
// Touch gestures, pull-to-refresh, and mobile-specific UX

let touchStartY = 0;
let touchEndY = 0;
let isPulling = false;

function initMobileEnhancements() {
  if (!isMobile()) return;
  
  addPullToRefresh();
  addSwipeGestures();
  optimizeTouchTargets();
  handleKeyboardResize();
}

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Elements where a downward touch-drag is a normal in-app gesture
// (dragging graph nodes, scrolling inside modals/panels, using the
// bottom tab bar or other controls) rather than a request to reload
// the page. #main-content fills the whole viewport and never scrolls
// (it's position:fixed), so window.scrollY is always 0 there and
// can't be used to distinguish "idle background" from "mid-navigation" —
// without this check, pull-to-refresh armed on every touch anywhere
// in the app and any accidental >80px downward drag reloaded the page.
const PULL_REFRESH_EXCLUDE_SELECTOR =
  'svg, .modal, #node-side-panel, #mobile-tab-bar, button, a, input, textarea, select, [role="button"], [contenteditable]';

// Pull-to-refresh is intentionally conservative because the app canvas is a
// fixed full-screen surface: a normal downward swipe can start anywhere.
// Requiring a gesture to begin at the very top edge makes refresh an explicit
// action while preserving ordinary scrolling and panel gestures.
const PULL_REFRESH_EDGE_PX = 24;
const PULL_REFRESH_THRESHOLD_PX = 120;
const PULL_REFRESH_DIRECTION_SLOP_PX = 12;

function addPullToRefresh() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  let startY = 0;
  let startX = 0;
  let currentY = 0;
  let pulling = false;

  mainContent.addEventListener('touchstart', (e) => {
    const target = e.target;
    const onExcludedElement = target?.closest?.(PULL_REFRESH_EXCLUDE_SELECTOR);
    const touch = e.touches[0];
    if (touch && touch.clientY <= PULL_REFRESH_EDGE_PX && !onExcludedElement) {
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      currentY = startY;
      pulling = true;
    }
  }, { passive: true });
  
  mainContent.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    
    currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    const horizontalDiff = Math.abs(e.touches[0].clientX - startX);

    // Cancel as soon as the gesture is clearly horizontal or not a deliberate
    // vertical pull. This prevents diagonal navigation gestures from arming it.
    if (horizontalDiff > diff + PULL_REFRESH_DIRECTION_SLOP_PX || diff < 0) {
      pulling = false;
      hidePullIndicator();
      return;
    }
    
    if (diff > 0 && diff < PULL_REFRESH_THRESHOLD_PX) {
      showPullIndicator(diff);
    }
  }, { passive: true });
  
  mainContent.addEventListener('touchend', () => {
    if (!pulling) return;
    
    const diff = currentY - startY;
    if (diff >= PULL_REFRESH_THRESHOLD_PX) {
      triggerRefresh();
    }
    
    hidePullIndicator();
    pulling = false;
  });
}

function showPullIndicator(distance) {
  let indicator = document.getElementById('pull-indicator');
  if (!indicator) {
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
      transition: opacity 0.2s ease;
    `;
    document.body.appendChild(indicator);
  }
  
  indicator.style.opacity = Math.min(distance / 80, 1);
  
  if (distance > 60) {
    indicator.style.transform = 'translateX(-50%) rotate(180deg)';
  }
}

function hidePullIndicator() {
  const indicator = document.getElementById('pull-indicator');
  if (indicator) {
    indicator.style.opacity = '0';
    setTimeout(() => indicator.remove(), 200);
  }
}

function triggerRefresh() {
  const indicator = document.getElementById('pull-indicator');
  if (indicator) {
    indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }
  
  setTimeout(() => {
    location.reload();
  }, 500);
}

function addSwipeGestures() {
  let startX = 0;
  let startY = 0;
  
  document.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  
  document.addEventListener('touchend', (e) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    
    const diffX = endX - startX;
    const diffY = endY - startY;
    
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
  const panel = document.querySelector('.node-panel[style*="display: block"]');
  if (panel) {
    panel.style.display = 'none';
  }
}

function handleSwipeLeft() {
  // Could open a side menu or panel
}

function optimizeTouchTargets() {
  const buttons = document.querySelectorAll('button, a, .clickable');
  buttons.forEach(btn => {
    const rect = btn.getBoundingClientRect();
    if (rect.height < 44) {
      btn.style.minHeight = '44px';
      btn.style.minWidth = '44px';
    }
  });
}

function handleKeyboardResize() {
  const originalHeight = window.innerHeight;
  
  window.addEventListener('resize', () => {
    const currentHeight = window.innerHeight;
    const diff = originalHeight - currentHeight;
    
    if (diff > 150) {
      document.body.classList.add('keyboard-open');
    } else {
      document.body.classList.remove('keyboard-open');
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initMobileEnhancements);
}
