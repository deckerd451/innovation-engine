// cardFlip.js - CharlestonHacks Portal Card System
// Updated to support flip-to-function portal UX

// Portal routing map - links each clickable area to its function
const PORTAL_MAP = {
  'top-left': {
    functionName: 'openPoster()',
    destination: 'Poster.html',
    description: 'Event Poster Portal',
    color: '#c9a35e'
  },
  'top-center': {
    functionName: 'openDocs()',
    destination: 'docs.html',
    description: 'Documentation Portal',
    color: '#00e0ff'
  },
  'top-right': {
    functionName: 'openInnovationEngine()',
    destination: '2card.html',
    description: 'Innovation Engine Portal',
    color: '#c9a35e'
  },
  'middle-left': {
    functionName: 'openExperimental()',
    destination: 'experimental.html',
    description: 'Experimental Sandbox',
    color: '#00e0ff'
  },
  'middle-right': {
    functionName: 'openSwag()',
    destination: 'swag.html',
    description: 'Swag Store Portal',
    color: '#c9a35e'
  },
  'bottom-left': {
    functionName: 'openNews()',
    destination: 'news.html',
    description: 'News Feed Portal',
    color: '#00e0ff'
  },
  'bottom-center': {
    functionName: 'openDonations()',
    destination: 'donations.html',
    description: 'Sponsorship Portal',
    color: '#c9a35e'
  },
  'bottom-right': {
    functionName: 'openCardMatchGame()',
    destination: 'cardmatchgame.html',
    description: 'Card Match Game',
    color: '#00e0ff'
  }
};

let isFlipping = false;

/**
 * Initialize the card flip portal system
 * @param {Object} CONFIG - Configuration object with sounds and other settings
 */
export function initCardFlip(CONFIG) {
  console.log('🚀 Initializing Portal Card System...');
  
  // Inject portal animation styles first
  injectPortalStyles();
  
  // Create portal overlay element
  createPortalOverlay();
  
  // Set up click handlers for all clickable areas
  setupPortalClickHandlers(CONFIG);
  
  console.log('✅ Portal System Ready');
}

/**
 * Create the portal overlay element for displaying function names
 */
function createPortalOverlay() {
  // Check if overlay already exists
  if (document.getElementById('portal-overlay')) {
    console.log('Portal overlay already exists');
    return;
  }
  
  const overlay = document.createElement('div');
  overlay.id = 'portal-overlay';
  overlay.style.cssText = `
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at center, rgba(0,224,255,0.15) 0%, rgba(0,0,0,0.85) 70%);
    backdrop-filter: blur(8px);
    z-index: 150;
    pointer-events: none;
  `;
  
  const mediaContainer = document.querySelector('.media-container');
  if (mediaContainer) {
    mediaContainer.appendChild(overlay);
    console.log('Portal overlay created');
  } else {
    console.error('Media container not found!');
  }
}

/**
 * Set up portal click handlers for all clickable areas
 * @param {Object} CONFIG - Configuration object
 */
function setupPortalClickHandlers(CONFIG) {
  const buttons = document.querySelectorAll('.clickable-area');
  console.log(`Found ${buttons.length} clickable areas`);
  
  buttons.forEach((btn, index) => {
    // Find which portal area this is
    const portalKey = findPortalKey(btn);
    console.log(`Button ${index}: ${portalKey}`);
    
    if (!portalKey) {
      console.warn(`No portal mapping found for button ${index}`, btn.classList);
      return;
    }
    
    // Add click handler
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log(`🎯 Portal clicked: ${portalKey}`);
      
      // Don't trigger if already flipping
      if (isFlipping) {
        console.log('Already flipping, ignoring click');
        return;
      }
      
      const portal = PORTAL_MAP[portalKey];
      
      // Play sound
      const soundName = btn.dataset.sound;
      if (soundName && CONFIG.sounds && CONFIG.sounds[soundName]) {
        console.log(`Playing sound: ${soundName}`);
        CONFIG.sounds[soundName].play().catch(err => {
          console.log('Sound play failed:', err);
        });
      }
      
      // Trigger portal flip sequence
      triggerPortalSequence(portal);
    });
    
    // Preserve hover info behavior
    btn.addEventListener('mouseover', () => {
      const infoLine = document.getElementById('infoLine');
      const infoText = document.getElementById('infoText');
      if (infoLine && infoText) {
        infoLine.style.opacity = '1';
        infoText.textContent = btn.dataset.info || '';
      }
    });
    
    btn.addEventListener('mouseout', () => {
      const infoLine = document.getElementById('infoLine');
      const infoText = document.getElementById('infoText');
      if (infoLine && infoText) {
        infoLine.style.opacity = '0';
        infoText.textContent = '';
      }
    });
  });
}

/**
 * Find the portal key from button classes
 * @param {HTMLElement} btn - Button element
 * @returns {string|null} Portal key
 */
function findPortalKey(btn) {
  const classList = Array.from(btn.classList);
  for (const key of Object.keys(PORTAL_MAP)) {
    if (classList.includes(key)) {
      return key;
    }
  }
  return null;
}

/**
 * Trigger the complete portal flip sequence
 * @param {Object} portal - Portal configuration object
 */
function triggerPortalSequence(portal) {
  console.log(`🌀 Starting portal sequence: ${portal.functionName}`);
  isFlipping = true;
  
  // Step 1: Show portal overlay with function name
  showPortalText(portal);
  
  // Step 2: Start flip animation
  startCardFlip();
  
  // Step 3: Execute portal function after flip completes
  setTimeout(() => {
    executePortalFunction(portal);
  }, 800); // Flip animation duration
}

/**
 * Display the portal function name with sci-fi styling
 * @param {Object} portal - Portal configuration
 */
function showPortalText(portal) {
  const overlay = document.getElementById('portal-overlay');
  if (!overlay) {
    console.error('Portal overlay not found!');
    return;
  }
  
  console.log(`Displaying portal text: ${portal.functionName}`);
  
  // Create portal rings animation
  const ringsHTML = `
    <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;">
      <div class="portal-ring portal-ring-1"></div>
      <div class="portal-ring portal-ring-2"></div>
      <div class="portal-ring portal-ring-3"></div>
    </div>
  `;
  
  // Create function name display
  overlay.innerHTML = `
    ${ringsHTML}
    <div style="position: relative; z-index: 10; text-align: center; padding: 2rem;">
      <div style="
        font-size: clamp(2rem, 5vw, 3.5rem);
        font-weight: bold;
        color: ${portal.color};
        font-family: 'Orbitron', 'Courier New', monospace;
        text-shadow: 
          0 0 20px ${portal.color},
          0 0 40px ${portal.color},
          0 0 60px ${portal.color};
        animation: portalPulse 0.8s ease-in-out;
        margin-bottom: 1rem;
      ">
        ${portal.functionName}
      </div>
      <div style="
        font-size: 1rem;
        color: rgba(255, 255, 255, 0.7);
        font-family: 'Orbitron', sans-serif;
        text-transform: uppercase;
        letter-spacing: 2px;
      ">
        ${portal.description}
      </div>
      <div style="
        display: flex;
        justify-content: center;
        gap: 0.5rem;
        margin-top: 1.5rem;
      ">
        <div class="loading-dot" style="animation-delay: 0s;"></div>
        <div class="loading-dot" style="animation-delay: 0.2s;"></div>
        <div class="loading-dot" style="animation-delay: 0.4s;"></div>
      </div>
    </div>
  `;
  
  overlay.style.display = 'flex';
}

/**
 * Start the card flip animation
 */
function startCardFlip() {
  const card = document.getElementById('missionImage');
  const frame = document.getElementById('cardFrame');
  
  console.log('Starting card flip animation');
  
  if (card) {
    card.style.transition = 'transform 0.8s cubic-bezier(0.4, 0.0, 0.2, 1)';
    card.style.transformStyle = 'preserve-3d';
    card.style.transform = 'rotateY(180deg)';
  } else {
    console.error('Card image not found!');
  }
  
  if (frame) {
    frame.style.transition = 'transform 0.8s cubic-bezier(0.4, 0.0, 0.2, 1)';
    frame.style.transformStyle = 'preserve-3d';
    frame.style.transform = 'rotateY(180deg)';
  }
}

/**
 * Execute the portal function (navigate to destination)
 * @param {Object} portal - Portal configuration
 */
function executePortalFunction(portal) {
  console.log(`🚀 Executing: ${portal.functionName}`);
  console.log(`📍 Navigating to: ${portal.destination}`);
  
  // Navigate to the destination
  window.location.href = portal.destination;
}

/**
 * Inject CSS styles for portal animations
 */
function injectPortalStyles() {
  // Check if styles already injected
  if (document.getElementById('portal-styles')) {
    console.log('Portal styles already injected');
    return;
  }
  
  const style = document.createElement('style');
  style.id = 'portal-styles';
  style.textContent = `
    @keyframes portalPulse {
      0%, 100% { 
        opacity: 1; 
        transform: scale(1);
      }
      50% { 
        opacity: 0.7; 
        transform: scale(1.05);
      }
    }
    
    @keyframes portalRing {
      0% {
        transform: scale(0.8);
        opacity: 0;
      }
      50% {
        opacity: 0.4;
      }
      100% {
        transform: scale(1.5);
        opacity: 0;
      }
    }
    
    @keyframes portalSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    @keyframes loadingDot {
      0%, 100% { 
        opacity: 0.3; 
        transform: scale(1);
      }
      50% { 
        opacity: 1; 
        transform: scale(1.3);
      }
    }
    
    .portal-ring {
      position: absolute;
      border-radius: 50%;
      border: 2px solid;
    }
    
    .portal-ring-1 {
      width: 300px;
      height: 300px;
      border-color: rgba(0, 224, 255, 0.3);
      animation: portalRing 2s ease-out infinite;
    }
    
    .portal-ring-2 {
      width: 200px;
      height: 200px;
      border-color: rgba(201, 163, 94, 0.3);
      animation: portalRing 2s ease-out infinite 0.4s;
    }
    
    .portal-ring-3 {
      width: 100px;
      height: 100px;
      border-color: rgba(0, 224, 255, 0.5);
      animation: portalSpin 3s linear infinite;
    }
    
    .loading-dot {
      width: 8px;
      height: 8px;
      background: #00e0ff;
      border-radius: 50%;
      animation: loadingDot 1.4s ease-in-out infinite;
    }
  `;
  
  document.head.appendChild(style);
  console.log('Portal styles injected');
}

/**
 * Public function to manually trigger a portal
 * @param {string} portalKey - Key from PORTAL_MAP
 */
export function openPortal(portalKey) {
  const portal = PORTAL_MAP[portalKey];
  if (portal && !isFlipping) {
    triggerPortalSequence(portal);
  }
}

/**
 * Get all available portals
 * @returns {Object} Portal map
 */
export function getPortals() {
  return { ...PORTAL_MAP };
}
