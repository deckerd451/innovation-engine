// ===============================================
// CharlestonHacks Chat Bubble
// ===============================================
// - Prevents duplicate bubbles across imports
// - Adds elegant Charleston Night Mode styling
// - Stores bubble position in localStorage
// - Handles drag + click toggle for WidgetBot
// ===============================================

export function setupChatBubble() {
  // ----- Prevent duplicate initialization -----
  if (window.CH_BUBBLE_INITIALIZED && document.getElementById('discord-bubble')) return;
  window.CH_BUBBLE_INITIALIZED = true;

  // ----- Create and inject global style block -----
  if (!document.getElementById('chat-bubble-style')) {
    const style = document.createElement('style');
    style.id = 'chat-bubble-style';
    style.textContent = `
      #discord-bubble {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, #7289da, #404eed 80%);
        box-shadow: 0 0 20px rgba(64, 78, 237, 0.6), 0 4px 16px rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 28px;
        cursor: grab;
        user-select: none;
        transition: transform 0.25s ease, box-shadow 0.25s ease, opacity 0.3s ease;
        z-index: 9999;
      }

      #discord-bubble:hover {
        transform: scale(1.12);
        box-shadow: 0 0 30px rgba(114, 137, 218, 0.9);
      }

      #discord-bubble.dragging {
        opacity: 0.8;
        cursor: grabbing;
      }

      #discord-bubble.hidden {
        opacity: 0;
        pointer-events: none;
        transform: scale(0.9);
      }

      @media (max-width: 600px) {
        #discord-bubble {
          width: 50px;
          height: 50px;
          bottom: 16px;
          right: 16px;
        }
      }

      iframe[src*="widgetbot.io"] {
        pointer-events: none !important;
        opacity: 0 !important;
      }
      iframe[src*="widgetbot.io"].visible {
        pointer-events: auto !important;
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ----- Load WidgetBot Crate if not already loaded -----
  if (!window.Crate && !document.getElementById('widgetbot-crate')) {
    const crateScript = document.createElement('script');
    crateScript.id = 'widgetbot-crate';
    crateScript.src = 'https://cdn.jsdelivr.net/npm/@widgetbot/crate@3';
    crateScript.async = true;
    crateScript.defer = true;
    crateScript.onload = () => {
      window.CrateInstance = new window.Crate({
        server: '1365587542975713320', // CharlestonHacks server ID
        channel: '1365587543696867384' // Channel ID
      });
    };
    document.body.appendChild(crateScript);
  }

  // ----- Create the bubble element -----
  const discordBubble = document.createElement('div');
  discordBubble.id = 'discord-bubble';
  discordBubble.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="white" viewBox="0 0 24 24">
      <path d="M12 3C7.03 3 2.73 6.11 1 10.5c1.73 4.39 6.03 7.5 11 7.5s9.27-3.11 11-7.5C21.27 6.11 16.97 3 12 3zm0 12c-2.48 0-4.5-1.79-4.5-4s2.02-4 4.5-4 4.5 1.79 4.5 4-2.02 4-4.5 4z"/>
    </svg>
  `;

  // ----- Restore saved position if it exists -----
  const savedPos = JSON.parse(localStorage.getItem('discordBubblePos'));
  if (savedPos && savedPos.left && savedPos.top) {
    discordBubble.style.left = savedPos.left;
    discordBubble.style.top = savedPos.top;
    discordBubble.style.transform = 'none';
  }

  document.body.appendChild(discordBubble);

  // ----- Drag-and-drop logic -----
  let dragging = false, offsetX = 0, offsetY = 0;

  const startDrag = (e) => {
    dragging = true;
    discordBubble.classList.add('dragging');
    const rect = discordBubble.getBoundingClientRect();
    offsetX = (e.clientX || e.touches[0].clientX) - rect.left;
    offsetY = (e.clientY || e.touches[0].clientY) - rect.top;
  };

  const drag = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;
    discordBubble.style.left = `${clientX - offsetX}px`;
    discordBubble.style.top = `${clientY - offsetY}px`;
    discordBubble.style.transform = 'none';
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    discordBubble.classList.remove('dragging');
    localStorage.setItem('discordBubblePos', JSON.stringify({
      left: discordBubble.style.left,
      top: discordBubble.style.top
    }));
  };

  discordBubble.addEventListener('mousedown', startDrag);
  discordBubble.addEventListener('touchstart', startDrag, { passive: true });
  window.addEventListener('mousemove', drag);
  window.addEventListener('touchmove', drag, { passive: false });
  window.addEventListener('mouseup', endDrag);
  window.addEventListener('touchend', endDrag);

  // ----- Toggle Discord chat when clicked -----
  discordBubble.addEventListener('click', () => {
    if (window.CrateInstance) {
      window.CrateInstance.toggle();
    } else {
      console.warn('WidgetBot not yet ready.');
    }
  });
}
