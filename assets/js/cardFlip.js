// ===============================================
// CharlestonHacks Card Flip Logic (Portal Enhanced)
// ===============================================
// ✅ Portal flip animation with function names on button clicks
// ✅ Random video clips play automatically (only once per portal per session)
// ✅ Shows BTC tracker when Descartes.png appears
// ✅ Triggers chat bubble when Medusa.png appears
// ===============================================

import { setupChatBubble } from './chatBubble.js';

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
let videoPlaying = false;
let visitedPortals = new Set(); // Track which portals have been clicked this session
let randomAnimationTimer = null;

export function initCardFlip(CONFIG) {
  const missionImage = document.getElementById('missionImage');
  const missionVideo = document.getElementById('missionVideo');
  const cardFrame    = document.getElementById('cardFrame');
  const btcElement   = document.getElementById('btcPrice');

  if (!missionImage || !missionVideo || !cardFrame) return;

  // Inject portal animation styles
  injectPortalStyles();
  
  // Create portal overlay element
  createPortalOverlay();

  // ===== Helper Functions =====
  const getRandomCardImage = () => {
    const arr = CONFIG.cardImages;
    return arr[Math.floor(Math.random() * arr.length)];
  };

  const getRandomFlipClass = () =>
    Math.random() > 0.5 ? 'flip-image-x' : 'flip-image-y';

  const getRandomVideo = () => {
    const arr = CONFIG.videos;
    return arr[Math.floor(Math.random() * arr.length)];
  };

  const playSound = (soundKey) => {
    const audio = CONFIG.sounds[soundKey];
    if (audio) {
      audio.currentTime = 0;
      audio.volume = soundKey === 'cardflip' ? 0.45 : 0.7;
      audio.play().catch(() => {});
    }
  };

  // ===== BTC Visibility Helper =====
  function updateBTCVisibility(currentCardSrc) {
    if (!btcElement) return;
    if (typeof currentCardSrc === 'string' && currentCardSrc.includes('Descartes.png')) {
      btcElement.classList.add('visible');
    } else {
      btcElement.classList.remove('visible');
    }
  }

  // ===== Play Random Video Animation =====
  function playRandomVideoAnimation() {
    if (videoPlaying || isFlipping) return;

    console.log('🎬 Playing random video animation');

    // Select next random card + animation
    const flipClass = getRandomFlipClass();
    const newImage = getRandomCardImage();
    missionImage.src = newImage;
    missionImage.classList.add(flipClass);
    playSound('cardflip');

    // 💬 Trigger chat bubble when Medusa appears
    if (typeof newImage === 'string' && newImage.includes('Medusa.png')) {
      setupChatBubble();
    }

    // 💰 Show BTC only for Descartes.png
    updateBTCVisibility(newImage);

    // Clean up flip animation class
    setTimeout(() => missionImage.classList.remove(flipClass), 1200);

    // 🎬 Select a random video to accompany the card
    const videoSrc = getRandomVideo();
    missionVideo.src = videoSrc;
    missionVideo.style.display = 'block';
    cardFrame.style.display    = 'block';
    setTimeout(() => (missionVideo.style.opacity = 1), 100);
    missionVideo.muted = false;

    // 🖥 Responsive controls
    if (window.matchMedia('(max-width: 600px)').matches) {
      missionVideo.removeAttribute('controls');
    } else {
      missionVideo.setAttribute('controls', '');
    }

    missionVideo.load();
    missionVideo.play();
    videoPlaying = true;

    // 🔄 Restore state when video ends
    missionVideo.onended = () => {
      missionVideo.pause();
      missionVideo.style.display = 'none';
      missionVideo.style.opacity = 0;
      cardFrame.style.display = 'none';
      videoPlaying = false;
    };
  }

  // ===== Random Video Animations for Unvisited Portals =====
  function startRandomAnimations() {
    // Wait 3 seconds before starting random animations
    setTimeout(() => {
      triggerRandomAnimation();
    }, 3000);
  }

  function triggerRandomAnimation() {
    // Don't animate if user is actively using the card
    if (isFlipping || videoPlaying) {
      scheduleNextRandomAnimation();
      return;
    }

    // Get all portal keys that haven't been visited
    const allPortalKeys = Object.keys(PORTAL_MAP);
    const unvisitedPortals = allPortalKeys.filter(key => !visitedPortals.has(key));

    // If all portals have been visited, stop random animations
    if (unvisitedPortals.length === 0) {
      console.log('🎉 All portals visited - stopping random video animations');
      return;
    }

    // Play a random video animation
    playRandomVideoAnimation();

    // Schedule next random animation
    scheduleNextRandomAnimation();
  }

  function scheduleNextRandomAnimation() {
    // Clear any existing timer
    if (randomAnimationTimer) {
      clearTimeout(randomAnimationTimer);
    }

    // Random interval between 8-15 seconds
    const interval = 8000 + Math.random() * 7000;
    randomAnimationTimer = setTimeout(() => {
      triggerRandomAnimation();
    }, interval);
  }

  // ===== Portal Button Click Handlers =====
  setupPortalClickHandlers(CONFIG);

  // ===== Original Card Click Handler (preserved for manual clicks) =====
  missionImage.addEventListener('click', () => {
    if (videoPlaying || isFlipping) return;
    playRandomVideoAnimation();
  });

  // ===== Keyboard Accessibility =====
  missionImage.setAttribute('tabindex', '0');
  missionImage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') missionImage.click();
  });

  // Start random animations
  startRandomAnimations();

  console.log('✅ Portal Card System with Video Animations Ready');
}

/**
 * Create the portal overlay element for displaying function names
 */
function createPortalOverlay() {
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
  }
}

/**
 * Set up portal click handlers for all clickable areas
 */
function setupPortalClickHandlers(CONFIG) {
  const buttons = document.querySelectorAll('.clickable-area');
  console.log(`Found ${buttons.length} clickable areas`);

  buttons.forEach((btn, index) => {
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

      // Don't trigger if already flipping or video playing
      if (isFlipping || videoPlaying) {
        console.log('Card busy, ignoring click');
        return;
      }

      // Mark this portal as visited
      visitedPortals.add(portalKey);
      console.log(`✓ Portal ${portalKey} marked as visited`);

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
 */
function triggerPortalSequence(portal) {
  console.log(`🌀 Starting portal sequence: ${portal.functionName}`);
  isFlipping = true;

  // Cancel any pending random animations
  if (randomAnimationTimer) {
    clearTimeout(randomAnimationTimer);
  }

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
  }

  if (frame) {
    frame.style.transition = 'transform 0.8s cubic-bezier(0.4, 0.0, 0.2, 1)';
    frame.style.transformStyle = 'preserve-3d';
    frame.style.transform = 'rotateY(180deg)';
  }
}

/**
 * Execute the portal function (navigate to destination)
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
 */
export function openPortal(portalKey) {
  const portal = PORTAL_MAP[portalKey];
  if (portal && !isFlipping) {
    visitedPortals.add(portalKey);
    triggerPortalSequence(portal);
  }
}

/**
 * Get all available portals
 */
export function getPortals() {
  return { ...PORTAL_MAP };
}

/**
 * Reset visited portals (useful for testing)
 */
export function resetVisitedPortals() {
  visitedPortals.clear();
  console.log('🔄 Visited portals reset');
}
