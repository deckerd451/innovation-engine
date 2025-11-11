// =========================================================
// CharlestonHacks Card Flip Logic (Intelligent Portal Mode)
// =========================================================
// ✅ First flip = cinematic random animation & video
// ✅ Later flips = route to custom pages by flip number or image name
// ✅ Optional delayed portal (flip shows card, next click enters world)
// =========================================================

import { setupChatBubble } from './chatBubble.js';

export function initCardFlip(CONFIG) {
  const missionImage = document.getElementById('missionImage');
  const missionVideo = document.getElementById('missionVideo');
  const cardFrame    = document.getElementById('cardFrame');
  const btcElement   = document.getElementById('btcPrice');
  if (!missionImage || !missionVideo || !cardFrame) return;

  // ---- Portal overlay ----
  const overlay = document.createElement('div');
  overlay.id = 'flipOverlay';
  document.body.appendChild(overlay);

  // ---- Route configuration ----
  // Control destinations by flip count
  const flipRoutes = {
    2: '2card.html',   // 2nd flip → Innovation Engine
    3: 'bbs.html',     // 3rd flip → BBS terminal
    4: 'news.html',    // 4th flip → News hub
    5: 'swag.html'     // 5th flip → Swag / sponsors
  };

  // Control destinations by card face keyword
  const imageRoutes = {
    Medusa: 'bbs.html',
    Descartes: '2card.html',
    Astrid: 'news.html',
    Atlas: 'swag.html'
  };

  // ---- Optional delayed-portal toggle ----
  // If true, card must appear first, then next click enters page
  const DELAYED_PORTAL_MODE = true;

  // ---- Runtime state ----
  let flipCount = 0;
  let videoPlaying = false;
  let nextPortal = null; // used in delayed mode

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

  const playSound = (key) => {
    const a = CONFIG.sounds[key];
    if (a) {
      a.currentTime = 0;
      a.volume = key === 'cardflip' ? 0.45 : 0.7;
      a.play().catch(() => {});
    }
  };

  const updateBTCVisibility = (src) => {
    if (!btcElement) return;
    if (typeof src === 'string' && src.includes('Descartes.png'))
      btcElement.classList.add('visible');
    else
      btcElement.classList.remove('visible');
  };

  // ===== Check for image-based route =====
  function checkImageRoute(src) {
    for (const key in imageRoutes) {
      if (src.includes(key)) {
        return imageRoutes[key];
      }
    }
    return null;
  }

  // ===== Portal effect + redirect =====
  function triggerPortal(url) {
    if (overlay.classList.contains('active')) return;
    overlay.classList.add('active');
    playSound('chime');
    setTimeout(() => (window.location.href = url), 700);
  }

  // ===== Main click handler =====
  missionImage.addEventListener('click', () => {
    // ---- If a portal is queued (delayed mode) ----
    if (DELAYED_PORTAL_MODE && nextPortal) {
      triggerPortal(nextPortal);
      nextPortal = null;
      return;
    }

    // ---- First Flip: cinematic random animation ----
    if (flipCount === 0) {
      if (videoPlaying) return;

      const flipClass = getRandomFlipClass();
      const newImage = getRandomCardImage();
      missionImage.src = newImage;
      missionImage.classList.add(flipClass);
      playSound('cardflip');

      // 💬 Trigger chat bubble if Medusa
      if (newImage.includes('Medusa.png')) setupChatBubble();

      // 💰 BTC visibility for Descartes
      updateBTCVisibility(newImage);

      setTimeout(() => missionImage.classList.remove(flipClass), 1200);

      // 🎬 Play random background video
      const videoSrc = getRandomVideo();
      missionVideo.src = videoSrc;
      missionVideo.style.display = 'block';
      cardFrame.style.display    = 'block';
      setTimeout(() => (missionVideo.style.opacity = 1), 100);
      missionVideo.muted = false;

      if (window.matchMedia('(max-width: 600px)').matches)
        missionVideo.removeAttribute('controls');
      else
        missionVideo.setAttribute('controls', '');

      missionVideo.load();
      missionVideo.play();
      videoPlaying = true;

      missionVideo.onended = () => {
        missionVideo.pause();
        missionVideo.style.display = 'none';
        missionVideo.style.opacity = 0;
        cardFrame.style.display = 'none';
        videoPlaying = false;
      };

      // 🎯 After showing card, queue nextPortal if applicable
      const match = checkImageRoute(newImage);
      if (DELAYED_PORTAL_MODE) {
        nextPortal = match;
      } else if (match) {
        triggerPortal(match);
      }

      flipCount++;
      return;
    }

    // ---- Subsequent flips ----
    // If not delayed mode or no queued portal, check flipRoutes / imageRoutes
    const match = checkImageRoute(missionImage.src);
    if (match) {
      triggerPortal(match);
      return;
    }

    const target = flipRoutes[flipCount];
    if (target) {
      triggerPortal(target);
    } else {
      // fallback to home
      triggerPortal('index.html');
    }

    flipCount++;
  });

  // ===== Keyboard Accessibility =====
  missionImage.setAttribute('tabindex', '0');
  missionImage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') missionImage.click();
  });
}
