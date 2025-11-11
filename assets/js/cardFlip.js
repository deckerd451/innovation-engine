// ===============================================
// CharlestonHacks Card Flip Logic (Enhanced)
// ===============================================
// ✅ Flips between random cards with animation
// ✅ Plays sound and loads a random video
// ✅ Shows BTC tracker when Descartes.png appears
// ✅ Triggers chat bubble when Medusa.png appears
// ===============================================

import { setupChatBubble } from './chatBubble.js';

export function initCardFlip(CONFIG) {
  const missionImage = document.getElementById('missionImage');
  const missionVideo = document.getElementById('missionVideo');
  const cardFrame    = document.getElementById('cardFrame');
  const btcElement   = document.getElementById('btcPrice');

  if (!missionImage || !missionVideo || !cardFrame) return;

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

  let videoPlaying = false;

  // ===== Card Click Handler =====
  missionImage.addEventListener('click', () => {
    if (videoPlaying) return;

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

    // 🔁 Restore state when video ends
    missionVideo.onended = () => {
      missionVideo.pause();
      missionVideo.style.display = 'none';
      missionVideo.style.opacity = 0;
      cardFrame.style.display = 'none';
      videoPlaying = false;
    };
  });

  // ===== Keyboard Accessibility =====
  missionImage.setAttribute('tabindex', '0');
  missionImage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') missionImage.click();
  });
}
