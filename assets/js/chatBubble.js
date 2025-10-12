// ================================================================
// CharlestonHacks Chat Bubble (Self-Hosted Final with Pulse & Drag)
// ================================================================
// ✅ Always visible with smooth fade-in
// ✅ Pulses when Medusa element is visible
// ✅ Self-hosted WidgetBot crate loader (no telemetry)
// ✅ Responsive drag-and-drop with screen-edge snapping
// ================================================================

export function setupChatBubble() {
  // ----- 🧹 Cleanup stray duplicates -----
  document.querySelectorAll('#discord-bubble').forEach((b, i) => {
    if (i > 0) b.remove();
  });

  if (window.CH_BUBBLE_INITIALIZED && document.getElementById('discord-bubble')) return;
  window.CH_BUBBLE_INITIALIZED = true;

  // ----- 🎨 Global Styles -----
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
        box-shadow: 0 0 30px rgba(114,137,218,0.9);
      }

      #discord-bubble.dragging {
        opacity: 0.8;
        cursor: grabbing;
      }

      /* 🔆 Pulse Animation when Medusa visible */
      #discord-bubble.pulsing {
        animation: bubblePulse 1.8s ease-in-out infinite;
        box-shadow: 0 0 35px rgba(114,137,218,1), 0 0 10px rgba(255,255,255,0.6);
      }

      @keyframes bubblePulse {
        0%,100% { transform: scale(1); box-shadow: 0 0 20px rgba(114,137,218,0.6); }
        50% { transform: scale(1.1); box-shadow: 0 0 40px rgba(114,137,218,0.95); }
      }

      @media (max-width: 600px) {
        #discord-bubble {
          width: 50px;
          height: 50px;
          bottom: 16px;
          right: 16px;
        }
      }

      /* WidgetBot iframe fade-in */
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

  // ----- 💠 Create Bubble -----
  const discordBubble = document.createElement('div');
  discordBubble.id = 'discord-bubble';
  discordBubble.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="white" viewBox="0 0 24 24">
      <path d="M12 3C7.03 3 2.73 6.11 1 10.5c1.73 4.39 6.03 7.5 11 7.5s9.27-3.11 11-7.5C21.27 6.11 16.97 3 12 3zm0 12c-2.48 0-4.5-1.79-4.5-4s2.02-4 4.5-4 4.5 1.79 4.5 4-2.02 4-4.5 4z"/>
    </svg>
  `;

  // ----- 📍 Restore Saved Position -----
  const savedPos = JSON.parse(localStorage.getItem('discordBubblePos'));
  if (savedPos?.left && savedPos?.top) {
    discordBubble.style.left = savedPos.left;
    discordBubble.style.top = savedPos.top;
    discordBubble.style.transform = 'none';
  }
  document.body.appendChild(discordBubble);
  requestAnimationFrame(() => discordBubble.classList.add('visible'));

  // ----- 🖱️ Responsive Drag & Drop -----
  let dragging = false, offsetX = 0, offsetY = 0;

  const startDrag = (e) => {
    dragging = true;
    discordBubble.classList.add('dragging');
    const rect = discordBubble.getBoundingClientRect();
    const evt = e.touches ? e.touches[0] : e;
    offsetX = evt.clientX - rect.left;
    offsetY = evt.clientY - rect.top;
  };

  const drag = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const evt = e.touches ? e.touches[0] : e;
    const x = evt.clientX - offsetX;
    const y = evt.clientY - offsetY;
    const maxX = window.innerWidth - discordBubble.offsetWidth;
    const maxY = window.innerHeight - discordBubble.offsetHeight;
    // Clamp position within viewport
    const left = Math.min(Math.max(0, x), maxX);
    const top = Math.min(Math.max(0, y), maxY);
    discordBubble.style.left = `${left}px`;
    discordBubble.style.top = `${top}px`;
    discordBubble.style.transform = 'none';
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    discordBubble.classList.remove('dragging');
    // Snap to edge (left/right)
    const rect = discordBubble.getBoundingClientRect();
    const snapLeft = rect.left < window.innerWidth / 2 ? 16 : window.innerWidth - rect.width - 16;
    discordBubble.style.left = `${snapLeft}px`;
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

  // ----- ⚡ Click Toggle -----
  let pendingToggle = false;
  discordBubble.addEventListener('click', () => {
    if (window.CrateInstance) {
      window.CrateInstance.toggle();
    } else {
      pendingToggle = true;
      console.log('⏳ WidgetBot loading — will auto-open when ready...');
    }
  });

  // ----- 👁️ Pulse When Medusa Appears -----
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          discordBubble.classList.add('pulsing');
        } else {
          setTimeout(() => discordBubble.classList.remove('pulsing'), 1000);
        }
      });
    },
    { threshold: 0.4 }
  );

  const medusaImage = document.querySelector(
    'img[src*="Medusa"], #medusa, .medusa-card'
  );
  if (medusaImage) {
    observer.observe(medusaImage);
    console.log('👁️ Chat bubble glow linked to Medusa card.');
  } else {
    console.warn('⚠️ Medusa card not found — bubble will remain steady.');
  }

  // ----- 🕐 Self-Hosted WidgetBot Loader -----
  window.addEventListener('load', () => {
    window.WidgetBot = { disableTelemetry: true };
    const script = document.createElement('script');
    script.src = 'assets/js/widgetbot-crate.js';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (!window.CrateInstance && window.Crate) {
        window.CrateInstance = new window.Crate({
          server: '1365587542975713320', // CharlestonHacks
          channel: '1365587543696867384'
        });
        console.log('🟢 WidgetBot initialized successfully (self-hosted).');
        if (pendingToggle) {
          window.CrateInstance.toggle();
          pendingToggle = false;
        }
      } else {
        console.error('❌ WidgetBot loaded but Crate not found.');
      }
    };

    script.onerror = () => {
      console.error('❌ Failed to load local WidgetBot crate script.');
      const msg = document.createElement('div');
      msg.textContent = 'Chat temporarily unavailable.';
      msg.style.cssText = `
        position:fixed;bottom:100px;right:24px;
        color:#aaa;font-size:13px;z-index:9999;
      `;
      document.body.appendChild(msg);
    };

    document.body.appendChild(script);
  });

  console.log('✨ CharlestonHacks Chat Bubble active.');
}
