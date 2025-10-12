// ===============================================
// CharlestonHacks Chat Bubble (Stabilized Version)
// ===============================================
// - Prevents duplicate bubbles and double Crate init
// - Disables WidgetBot telemetry (no CORS or Sentry spam)
// - Lazy-loads after window.onload to avoid React observer errors
// - Maintains Medusa visibility, drag persistence, and smooth styling
// ===============================================

export function setupChatBubble() {
  // 🧹 Cleanup stray duplicates
  document.querySelectorAll('#discord-bubble').forEach((b, i) => {
    if (i > 0) b.remove();
  });

  if (window.CH_BUBBLE_INITIALIZED && document.getElementById('discord-bubble')) return;
  window.CH_BUBBLE_INITIALIZED = true;

  // 🎨 Inject bubble style if not already present
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
        transition: transform 0.25s ease, box-shadow 0.25s ease, opacity 0.4s ease;
        z-index: 9999;
        opacity: 0;
        pointer-events: none;
      }

      #discord-bubble.visible {
        opacity: 1;
        pointer-events: auto;
      }

      #discord-bubble:hover {
        transform: scale(1.12);
        box-shadow: 0 0 30px rgba(114, 137, 218, 0.9);
      }

      #discord-bubble.dragging {
        opacity: 0.8;
        cursor: grabbing;
      }

      @media (max-width: 600px) {
        #discord-bubble {
          width: 50px;
          height: 50px;
          bottom: 16px;
          right: 16px;
        }
      }

      /* WidgetBot iframe handling */
      iframe[src*="widgetbot.io"] {
        pointer-events: none !important;
        opacity: 0 !important;
        transition: opacity 0.4s ease;
      }
      iframe[src*="widgetbot.io"].visible {
        pointer-events: auto !important;
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  // 💬 Create and inject the chat bubble
  const discordBubble = document.createElement('div');
  discordBubble.id = 'discord-bubble';
  discordBubble.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="white" viewBox="0 0 24 24">
      <path d="M12 3C7.03 3 2.73 6.11 1 10.5c1.73 4.39 6.03 7.5 11 7.5s9.27-3.11 11-7.5C21.27 6.11 16.97 3 12 3zm0 12c-2.48 0-4.5-1.79-4.5-4s2.02-4 4.5-4 4.5 1.79 4.5 4-2.02 4-4.5 4z"/>
    </svg>
  `;

  // 📍 Restore saved position
  const savedPos = JSON.parse(localStorage.getItem('discordBubblePos'));
  if (savedPos?.left && savedPos?.top) {
    discordBubble.style.left = savedPos.left;
    discordBubble.style.top = savedPos.top;
    discordBubble.style.transform = 'none';
  }

  document.body.appendChild(discordBubble);

  // 🖱️ Drag handling
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
    const x = e.clientX || e.touches[0].clientX;
    const y = e.clientY || e.touches[0].clientY;
    discordBubble.style.left = `${x - offsetX}px`;
    discordBubble.style.top = `${y - offsetY}px`;
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

  // ⚡ Click toggle for WidgetBot
  discordBubble.addEventListener('click', () => {
    if (window.CrateInstance) {
      window.CrateInstance.toggle();
    } else {
      console.warn('⚠️ WidgetBot not yet ready — please wait a moment.');
    }
  });

  // 👁️ Reveal when Medusa visible
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) discordBubble.classList.add('visible');
        else discordBubble.classList.remove('visible');
      });
    },
    { threshold: 0.4 }
  );
  const medusa = document.querySelector('img[src*="Medusa"], .medusa-card, #medusa');
  if (medusa) {
    observer.observe(medusa);
    console.log('👁️ Chat bubble visibility linked to Medusa card.');
  }

  // 🕐 Lazy-load WidgetBot AFTER window load
  window.addEventListener('load', () => {
    // Disable telemetry BEFORE crate loads
    window.WidgetBot = { disableTelemetry: true };

    // Only load once
    if (!window.Crate && !document.getElementById('widgetbot-crate')) {
      const script = document.createElement('script');
      script.id = 'widgetbot-crate';
      script.src = 'https://cdn.jsdelivr.net/npm/@widgetbot/crate@3';
      script.async = true;
      script.defer = true;

      script.onload = () => {
        try {
          if (!window.CrateInstance && window.Crate) {
            window.CrateInstance = new window.Crate({
              server: '1365587542975713320', // CharlestonHacks
              channel: '1365587543696867384'
            });
            console.log('🟢 WidgetBot initialized successfully (telemetry off).');
          }
        } catch (err) {
          console.error('❌ WidgetBot init failed:', err);
        }
      };

      script.onerror = () => {
        console.error('❌ Failed to load WidgetBot Crate script.');
      };

      // small delay to reduce race conditions
      setTimeout(() => document.body.appendChild(script), 800);
    } else {
      console.log('🟢 WidgetBot already loaded — skipped.');
    }
  });

  console.log('✨ CharlestonHacks Chat Bubble active.');
}
