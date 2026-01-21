// ================================================================
// UI ENHANCEMENTS SYSTEM
// ================================================================
// Interactive UI improvements and micro-interactions

console.log("%c✨ UI Enhancements Loading...", "color:#00e0ff; font-weight: bold; font-size: 16px");

let isInitialized = false;
let animationObserver = null;
let intersectionObserver = null;

// Initialize UI enhancements
export function initUIEnhancements() {
  if (isInitialized) return;

  // Setup animation observers
  setupAnimationObservers();
  
  // Setup interactive elements
  setupInteractiveElements();
  
  // Setup loading states
  setupLoadingStates();
  
  // Setup mobile enhancements
  setupMobileEnhancements();
  
  // Setup accessibility improvements
  setupAccessibilityImprovements();
  
  // Setup performance optimizations
  setupPerformanceOptimizations();

  // Expose functions globally
  window.showLoadingState = showLoadingState;
  window.hideLoadingState = hideLoadingState;
  window.animateElement = animateElement;
  window.createToast = createToast;
  window.showSkeleton = showSkeleton;
  window.hideSkeleton = hideSkeleton;
  window.smoothScrollTo = smoothScrollTo;
  window.rippleEffect = rippleEffect;

  isInitialized = true;
  console.log('✅ UI enhancements initialized');
}

// Setup animation observers for scroll-triggered animations
function setupAnimationObservers() {
  // Intersection Observer for scroll animations
  intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        const animationType = element.dataset.animate || 'fadeInUp';
        
        element.classList.add(`animate-${animationType}`);
        
        // Add stagger delay if specified
        const stagger = element.dataset.stagger;
        if (stagger) {
          element.style.animationDelay = `${parseInt(stagger) * 0.1}s`;
        }
        
        // Unobserve after animation
        intersectionObserver.unobserve(element);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  // Observe elements with data-animate attribute
  document.querySelectorAll('[data-animate]').forEach(element => {
    intersectionObserver.observe(element);
  });

  // Mutation observer to watch for new animated elements
  animationObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const animatedElements = node.querySelectorAll ? node.querySelectorAll('[data-animate]') : [];
          animatedElements.forEach(element => {
            intersectionObserver.observe(element);
          });
          
          if (node.hasAttribute && node.hasAttribute('data-animate')) {
            intersectionObserver.observe(node);
          }
        }
      });
    });
  });

  animationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Setup interactive elements
function setupInteractiveElements() {
  // Enhanced button interactions
  document.addEventListener('click', (e) => {
    const button = e.target.closest('.btn');
    if (button && !button.disabled) {
      rippleEffect(button, e);
    }
  });

  // Card hover effects
  document.addEventListener('mouseenter', (e) => {
    const card = e.target.closest('.card');
    if (card && !card.classList.contains('no-hover')) {
      card.classList.add('hover-lift');
    }
  }, true);

  document.addEventListener('mouseleave', (e) => {
    const card = e.target.closest('.card');
    if (card) {
      card.classList.remove('hover-lift');
    }
  }, true);

  // Form enhancements
  document.addEventListener('focus', (e) => {
    if (e.target.classList.contains('form-control')) {
      e.target.parentElement?.classList.add('form-group-focused');
    }
  }, true);

  document.addEventListener('blur', (e) => {
    if (e.target.classList.contains('form-control')) {
      e.target.parentElement?.classList.remove('form-group-focused');
    }
  }, true);

  // Smooth scroll for anchor links
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (link) {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        smoothScrollTo(target);
      }
    }
  });
}

// Ripple effect for buttons
window.rippleEffect = function(element, event) {
  const rect = element.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;
  
  const ripple = document.createElement('span');
  ripple.style.cssText = `
    position: absolute;
    width: ${size}px;
    height: ${size}px;
    left: ${x}px;
    top: ${y}px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    transform: scale(0);
    animation: ripple 0.6s ease-out;
    pointer-events: none;
  `;
  
  element.style.position = 'relative';
  element.style.overflow = 'hidden';
  element.appendChild(ripple);
  
  setTimeout(() => {
    ripple.remove();
  }, 600);
};

// Add ripple animation CSS
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
  @keyframes ripple {
    to {
      transform: scale(2);
      opacity: 0;
    }
  }
`;
document.head.appendChild(rippleStyle);

// Setup loading states
function setupLoadingStates() {
  // Auto-detect forms and add loading states
  document.addEventListener('submit', (e) => {
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
    
    if (submitBtn && !submitBtn.disabled) {
      showLoadingState(submitBtn);
      
      // Auto-hide after 5 seconds as fallback
      setTimeout(() => {
        hideLoadingState(submitBtn);
      }, 5000);
    }
  });
}

// Show loading state
window.showLoadingState = function(element, text = 'Loading...') {
  if (!element) return;
  
  element.disabled = true;
  element.dataset.originalText = element.textContent || element.value;
  
  const spinner = '<span class="spinner" style="margin-right: 0.5rem;"></span>';
  
  if (element.tagName === 'INPUT') {
    element.value = text;
  } else {
    element.innerHTML = spinner + text;
  }
  
  element.classList.add('loading');
};

// Hide loading state
window.hideLoadingState = function(element) {
  if (!element) return;
  
  element.disabled = false;
  element.classList.remove('loading');
  
  const originalText = element.dataset.originalText || 'Submit';
  
  if (element.tagName === 'INPUT') {
    element.value = originalText;
  } else {
    element.innerHTML = originalText;
  }
  
  delete element.dataset.originalText;
};

// Animate element
window.animateElement = function(element, animation = 'fadeInUp', delay = 0) {
  if (!element) return;
  
  element.style.animationDelay = `${delay}ms`;
  element.classList.add(`animate-${animation}`);
  
  // Remove animation class after completion
  element.addEventListener('animationend', () => {
    element.classList.remove(`animate-${animation}`);
    element.style.animationDelay = '';
  }, { once: true });
};

// Create toast notification
window.createToast = function(message, type = 'info', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-secondary);
    border-left: 4px solid var(--primary-cyan);
    border-radius: var(--radius-md);
    padding: var(--space-md) var(--space-lg);
    box-shadow: var(--shadow-lg);
    z-index: var(--z-toast);
    max-width: 400px;
    transform: translateX(100%);
    transition: transform var(--transition-base);
    backdrop-filter: blur(10px);
  `;
  
  // Set border color based on type
  const colors = {
    success: 'var(--accent-green)',
    error: 'var(--secondary-red)',
    warning: 'var(--accent-orange)',
    info: 'var(--primary-cyan)'
  };
  
  toast.style.borderLeftColor = colors[type] || colors.info;
  
  // Add icon based on type
  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle'
  };
  
  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: var(--space-sm);">
      <i class="${icons[type] || icons.info}" style="color: ${colors[type] || colors.info}; font-size: 1.2rem;"></i>
      <span style="color: var(--text-primary); font-weight: 500;">${message}</span>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: none;
        border: none;
        color: var(--text-tertiary);
        cursor: pointer;
        margin-left: auto;
        padding: 0;
        font-size: 1.2rem;
      ">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;
  
  document.body.appendChild(toast);
  
  // Animate in
  setTimeout(() => {
    toast.style.transform = 'translateX(0)';
  }, 100);
  
  // Auto-remove
  setTimeout(() => {
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
  
  return toast;
};

// Show skeleton loading
window.showSkeleton = function(container, type = 'default') {
  if (!container) return;
  
  container.dataset.originalContent = container.innerHTML;
  
  const skeletons = {
    default: `
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text" style="width: 80%;"></div>
    `,
    card: `
      <div class="skeleton skeleton-avatar" style="margin-bottom: 1rem;"></div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text" style="width: 60%;"></div>
    `,
    list: `
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
        <div class="skeleton skeleton-avatar"></div>
        <div style="flex: 1;">
          <div class="skeleton skeleton-text" style="width: 40%; margin-bottom: 0.5rem;"></div>
          <div class="skeleton skeleton-text" style="width: 60%;"></div>
        </div>
      </div>
    `.repeat(3)
  };
  
  container.innerHTML = skeletons[type] || skeletons.default;
  container.classList.add('skeleton-container');
};

// Hide skeleton loading
window.hideSkeleton = function(container) {
  if (!container) return;
  
  const originalContent = container.dataset.originalContent;
  if (originalContent) {
    container.innerHTML = originalContent;
    delete container.dataset.originalContent;
  }
  
  container.classList.remove('skeleton-container');
};

// Smooth scroll to element
window.smoothScrollTo = function(target, offset = 0) {
  if (!target) return;
  
  const targetPosition = target.offsetTop - offset;
  const startPosition = window.pageYOffset;
  const distance = targetPosition - startPosition;
  const duration = Math.min(Math.abs(distance) / 2, 1000);
  let start = null;
  
  function animation(currentTime) {
    if (start === null) start = currentTime;
    const timeElapsed = currentTime - start;
    const run = ease(timeElapsed, startPosition, distance, duration);
    window.scrollTo(0, run);
    if (timeElapsed < duration) requestAnimationFrame(animation);
  }
  
  function ease(t, b, c, d) {
    t /= d / 2;
    if (t < 1) return c / 2 * t * t + b;
    t--;
    return -c / 2 * (t * (t - 2) - 1) + b;
  }
  
  requestAnimationFrame(animation);
};

// Setup mobile enhancements
function setupMobileEnhancements() {
  // Touch feedback for mobile
  if ('ontouchstart' in window) {
    document.addEventListener('touchstart', (e) => {
      const button = e.target.closest('.btn, .card, .nav-item');
      if (button) {
        button.classList.add('touch-active');
      }
    });
    
    document.addEventListener('touchend', (e) => {
      const button = e.target.closest('.btn, .card, .nav-item');
      if (button) {
        setTimeout(() => {
          button.classList.remove('touch-active');
        }, 150);
      }
    });
    
    // Add touch styles
    const touchStyle = document.createElement('style');
    touchStyle.textContent = `
      .touch-active {
        transform: scale(0.98) !important;
        opacity: 0.8 !important;
      }
    `;
    document.head.appendChild(touchStyle);
  }
  
  // Mobile drawer functionality
  const drawerToggle = document.querySelector('[data-drawer-toggle]');
  const drawer = document.querySelector('.mobile-drawer');
  const drawerOverlay = document.querySelector('.mobile-drawer-overlay');
  
  if (drawerToggle && drawer) {
    drawerToggle.addEventListener('click', () => {
      drawer.classList.toggle('open');
      drawerOverlay?.classList.toggle('open');
    });
    
    drawerOverlay?.addEventListener('click', () => {
      drawer.classList.remove('open');
      drawerOverlay.classList.remove('open');
    });
  }
}

// Setup accessibility improvements
function setupAccessibilityImprovements() {
  // Keyboard navigation for custom elements
  document.addEventListener('keydown', (e) => {
    // Enter key on buttons
    if (e.key === 'Enter' && e.target.classList.contains('btn')) {
      e.target.click();
    }
    
    // Escape key to close modals
    if (e.key === 'Escape') {
      const modal = document.querySelector('.modal.active');
      if (modal) {
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) closeBtn.click();
      }
    }
    
    // Tab navigation improvements
    if (e.key === 'Tab') {
      document.body.classList.add('keyboard-navigation');
    }
  });
  
  // Remove keyboard navigation class on mouse use
  document.addEventListener('mousedown', () => {
    document.body.classList.remove('keyboard-navigation');
  });
  
  // Add focus styles for keyboard navigation
  const focusStyle = document.createElement('style');
  focusStyle.textContent = `
    .keyboard-navigation *:focus {
      outline: 2px solid var(--primary-cyan) !important;
      outline-offset: 2px !important;
    }
  `;
  document.head.appendChild(focusStyle);
  
  // ARIA live region for dynamic content
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.className = 'sr-only';
  liveRegion.id = 'live-region';
  document.body.appendChild(liveRegion);
  
  // Function to announce to screen readers
  window.announceToScreenReader = function(message) {
    const liveRegion = document.getElementById('live-region');
    if (liveRegion) {
      liveRegion.textContent = message;
      setTimeout(() => {
        liveRegion.textContent = '';
      }, 1000);
    }
  };
}

// Setup performance optimizations
function setupPerformanceOptimizations() {
  // Lazy load images
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      }
    });
  });
  
  document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
  });
  
  // Debounce scroll events
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    scrollTimeout = setTimeout(() => {
      document.body.classList.add('scrolling');
      clearTimeout(scrollTimeout);
      setTimeout(() => {
        document.body.classList.remove('scrolling');
      }, 100);
    }, 10);
  }, { passive: true });
  
  // Optimize animations for performance
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (prefersReducedMotion.matches) {
    document.body.classList.add('reduced-motion');
  }
  
  prefersReducedMotion.addEventListener('change', (e) => {
    if (e.matches) {
      document.body.classList.add('reduced-motion');
    } else {
      document.body.classList.remove('reduced-motion');
    }
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initUIEnhancements();
});

// Auto-enhance new elements
const enhancementObserver = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE && isInitialized) {
        // Re-observe new animated elements
        const animatedElements = node.querySelectorAll ? node.querySelectorAll('[data-animate]') : [];
        animatedElements.forEach(element => {
          if (intersectionObserver) {
            intersectionObserver.observe(element);
          }
        });
        
        // Lazy load new images
        const lazyImages = node.querySelectorAll ? node.querySelectorAll('img[data-src]') : [];
        lazyImages.forEach(img => {
          if (imageObserver) {
            imageObserver.observe(img);
          }
        });
      }
    });
  });
});

enhancementObserver.observe(document.body, {
  childList: true,
  subtree: true
});

console.log('✅ UI enhancements ready');