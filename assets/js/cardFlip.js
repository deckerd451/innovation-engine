// Modified cardFlip.js to trigger chat bubble when the Medusa card appears

// Import the chat bubble helper so we can initialize it on-demand
import { setupChatBubble } from './chatBubble.js';

// Original functionality wrapped in the exported initCardFlip function
export function initCardFlip(CONFIG) {
  const missionImage = document.getElementById('missionImage');
  const missionVideo = document.getElementById('missionVideo');
  const cardFrame    = document.getElementById('cardFrame');

  if (!missionImage || !missionVideo || !cardFrame) return;

  const getRandomCardImage = () => {
    const arr = CONFIG.cardImages;
    return arr[Math.floor(Math.random() * arr.length)];
  };

  const getRandomFlipClass = () => {
    return Math.random() > 0.5 ? 'flip-image-x' : 'flip-image-y';
  };

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

  let videoPlaying = false;

  missionImage.addEventListener('click', () => {
    // Prevent overlapping videos
    if (videoPlaying) return;

    // Pick a random flip class and image, then apply them
    const flipClass = getRandomFlipClass();
    const newImage  = getRandomCardImage();
    missionImage.src = newImage;
    missionImage.classList.add(flipClass);
    playSound('cardflip');

    // If the newly selected card is the Medusa card, trigger the chat bubble
    // The helper will no-op if the bubble is already initialized.
    if (typeof newImage === 'string' && newImage.includes('Medusa.png')) {
      setupChatBubble();
    }

    // Remove the flip class after the animation completes
    setTimeout(() => missionImage.classList.remove(flipClass), 1200);

    // Select a video to accompany the card and prepare it
    const videoSrc = getRandomVideo();
    missionVideo.src = videoSrc;
    missionVideo.style.display = 'block';
    cardFrame.style.display    = 'block';
    setTimeout(() => { missionVideo.style.opacity = 1; }, 100);
    missionVideo.muted = false;

    // For small screens disable controls to avoid layout issues
    if (window.matchMedia('(max-width: 600px)').matches) {
      missionVideo.removeAttribute('controls');
    } else {
      missionVideo.setAttribute('controls', '');
    }

    missionVideo.load();
    missionVideo.play();
    videoPlaying = true;

    // When the video finishes restore the original state
    missionVideo.onended = () => {
      missionVideo.pause();
      missionVideo.style.display = 'none';
      missionVideo.style.opacity = 0;
      cardFrame.style.display    = 'none';
      videoPlaying = false;
    };
  });

  // Keyboard accessibility: allow Enter/Space to trigger the same as click
  missionImage.setAttribute('tabindex', '0');
  missionImage.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') missionImage.click();
  });
}
