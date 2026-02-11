// ===============================================
// CharlestonHacks Chat Bubble – lazy, click-safe
// ===============================================
// - No WidgetBot loaded until user clicks the bubble
// - All WidgetBot containers have pointer-events: none
//   unless the crate is open (prevents blocking clicks)
// - Draggable, position persisted, no duplicates
// ===============================================

export function setupChatBubble() {
  // Prevent duplicates
  document.querySelectorAll('#discord-bubble').forEach((b, i) => i > 0 && b.remove());
  if (window.CH_BUBBLE_INITIALIZED && document.getElementById('discord-bubble')) return;
  window.CH_BUBBLE_INITIALIZED = true;

  // Inject styles (bubble + widgetbot click safety)
  if (!document.getElementById('chat-bubble-style')) {
    const style = document.createElement('style');
    style.id = 'chat-bubble-style';
    style.textContent = `
      /* Bubble */
      #discord-bubble {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, #7289da, #404eed 80%);
        box-shadow: 0 0 20px rgba(64,78,237,0.6), 0 4px 16px rgba(0,0,0,0.4);
        display: flex; align-items: center; justify-content: center;
        color: white; font-size: 28px;
        cursor: grab; user-select: none;
        transition: transform .25s ease, box-shadow .25s ease, opacity .4s ease;
        z-index: 9999;
        opacity: 0; pointer-events: none;
      }
      #discord-bubble.visible { opacity: 1; pointer-events: auto; }
      #discord-bubble:hover { transform: scale(1.12); box-shadow: 0 0 30px rgba(114,137,218,0.9); }
      #discord-bubble.dragging { opacity: .85; cursor: grabbing; }
      @media (max-width: 600px) { #discord-bubble { width: 50px; height: 50px; bottom: 16px; right: 16px; } }

      /* 🔒 Click-through protection:
         All widgetbot layers are inert unless the chat is open. */
      .wb-host, .widgetbot, .widgetbot-embed, .Crate__window, .Crate__container, .Crate__backdrop, .Crate__frame {
        pointer-events: none !important;
      }
      body.wb-open .wb-host,
      body.wb-open .widgetbot,
      body.wb-open .widgetbot-embed,
      body.wb-open .Crate__window,
      body.wb-open .Crate__container,
      body.wb-open .Crate__backdrop,
      body.wb-open .Crate__frame {
        pointer-events: auto !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Create bubble
  const bubble = document.createElement('div');
  bubble.id = 'discord-bubble';
  bubble.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="white" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3C7.03 3 2.73 6.11 1 10.5c1.73 4.39 6.03 7.5 11 7.5s9.27-3.11 11-7.5C21.27 6.11 16.97 3 12 3zm0 12c-2.48 0-4.5-1.79-4.5-4s2.02-4 4.5-4 4.5 1.79 4.5 4-2.02 4-4.5 4z"/>
    </svg>
  `;

  // Restore position if saved
  const saved = JSON.parse(localStorage.getItem('discordBubblePos') || 'null');
  if (saved?.left && saved?.top) {
    bubble.style.left = saved.left;
    bubble.style.top = saved.top;
    bubble.style.right = 'auto';
    bubble.style.bottom = 'auto';
  }

  document.body.appendChild(bubble);

  // Drag handling
  let dragging = false, offsetX = 0, offsetY = 0;
  const startDrag = e => {
    dragging = true;
    bubble.classList.add('dragging');
    const rect = bubble.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    offsetX = p.clientX - rect.left;
    offsetY = p.clientY - rect.top;
  };
  const moveDrag = e => {
    if (!dragging) return;
    e.preventDefault();
    const p = e.touches ? e.touches[0] : e;
    bubble.style.left = (p.clientX - offsetX) + 'px';
    bubble.style.top  = (p.clientY - offsetY) + 'px';
    bubble.style.right = 'auto';
    bubble.style.bottom = 'auto';
  };
  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    bubble.classList.remove('dragging');
    localStorage.setItem('discordBubblePos', JSON.stringify({
      left: bubble.style.left, top: bubble.style.top
    }));
  };

  bubble.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', stopDrag);
  bubble.addEventListener('touchstart', startDrag, { passive: true });
  window.addEventListener('touchmove', moveDrag, { passive: false });
  window.addEventListener('touchend', stopDrag);

  // 🔄 Lazy load WidgetBot only when first clicked
  let crateReady = false;
  const ensureCrate = () => new Promise(resolve => {
    if (crateReady && window.CrateInstance) return resolve();
    if (document.getElementById('widgetbot-crate')) {
      // Script is loading; poll until ready
      const tick = setInterval(() => {
        if (window.Crate && !window.CrateInstance) {
          window.CrateInstance = new window.Crate({
            server: '1365587542975713320',
            channel: '1365587543696867384'
          });
        }
        if (window.CrateInstance) {
          crateReady = true;
          clearInterval(tick);
          hookCrateEvents();
          resolve();
        }
      }, 100);
      return;
    }
    const s = document.createElement('script');
    s.id = 'widgetbot-crate';
    s.src = 'https://cdn.jsdelivr.net/npm/@widgetbot/crate@3';
    s.async = true; s.defer = true;
    s.onload = () => {
      if (!window.CrateInstance) {
        window.CrateInstance = new window.Crate({
          server: '1365587542975713320',
          channel: '1365587543696867384'
        });
      }
      crateReady = true;
      hookCrateEvents();
      resolve();
    };
    document.body.appendChild(s);
  });

  function hookCrateEvents() {
    // Guard
    if (!window.CrateInstance || window.CrateHooked) return;
    window.CrateHooked = true;

    // When open, allow widgetbot to receive clicks; when closed, disable
    try {
      window.CrateInstance.on('open', () => document.body.classList.add('wb-open'));
      window.CrateInstance.on('close', () => document.body.classList.remove('wb-open'));
    } catch {
      // Some builds of Crate don't expose .on; fail gracefully
      // Fallback: toggle class after toggle calls (below)
    }
  }

  // Toggle on bubble click (and fallback class management)
  bubble.addEventListener('click', async () => {
    if (bubble.classList.contains('dragging')) return; // ignore drag end
    await ensureCrate();
    if (window.CrateInstance) {
      const wasOpen = document.body.classList.contains('wb-open');
      window.CrateInstance.toggle();
      document.body.classList.toggle('wb-open', !wasOpen);
    }
  });

  console.log('🟣 Chat bubble ready (lazy load).');
}
