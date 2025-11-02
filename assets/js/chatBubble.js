// CharlestonHacks Chat Bubble – card-click version
export function setupChatBubble() {
  // prevent duplicates
  document.querySelectorAll('#discord-bubble').forEach((b, i) => i > 0 && b.remove());
  if (window.CH_BUBBLE_INITIALIZED && document.getElementById('discord-bubble')) return;
  window.CH_BUBBLE_INITIALIZED = true;

  // styles
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
        box-shadow: 0 0 20px rgba(64,78,237,0.6), 0 4px 16px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 28px;
        cursor: grab;
        user-select: none;
        transition: transform .25s ease, box-shadow .25s ease, opacity .4s ease;
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
        opacity: .8;
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
    `;
    document.head.appendChild(style);
  }

  // load WidgetBot crate (once)
  if (!window.Crate && !document.getElementById('widgetbot-crate')) {
    const s = document.createElement('script');
    s.id = 'widgetbot-crate';
    s.src = 'https://cdn.jsdelivr.net/npm/@widgetbot/crate@3';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      if (!window.CrateInstance) {
        window.CrateInstance = new window.Crate({
          server: '1365587542975713320',
          channel: '1365587543696867384'
        });
        console.log('🟢 WidgetBot ready');
      }
    };
    document.body.appendChild(s);
  }

  // create bubble
  const bubble = document.createElement('div');
  bubble.id = 'discord-bubble';
  bubble.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="white" viewBox="0 0 24 24">
      <path d="M12 3C7.03 3 2.73 6.11 1 10.5c1.73 4.39 6.03 7.5 11 7.5s9.27-3.11 11-7.5C21.27 6.11 16.97 3 12 3zm0 12c-2.48 0-4.5-1.79-4.5-4s2.02-4 4.5-4 4.5 1.79 4.5 4-2.02 4-4.5 4z"/>
    </svg>
  `;

  // restore position
  const saved = JSON.parse(localStorage.getItem('discordBubblePos') || 'null');
  if (saved && saved.left && saved.top) {
    bubble.style.left = saved.left;
    bubble.style.top = saved.top;
    bubble.style.right = 'auto';
    bubble.style.bottom = 'auto';
  }

  document.body.appendChild(bubble);

  // drag
  let dragging = false, offsetX = 0, offsetY = 0;
  const startDrag = e => {
    dragging = true;
    bubble.classList.add('dragging');
    const rect = bubble.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    offsetX = point.clientX - rect.left;
    offsetY = point.clientY - rect.top;
  };
  const moveDrag = e => {
    if (!dragging) return;
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    bubble.style.left = point.clientX - offsetX + 'px';
    bubble.style.top  = point.clientY - offsetY + 'px';
    bubble.style.right = 'auto';
    bubble.style.bottom = 'auto';
  };
  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    bubble.classList.remove('dragging');
    localStorage.setItem('discordBubblePos', JSON.stringify({
      left: bubble.style.left,
      top: bubble.style.top
    }));
  };

  bubble.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', stopDrag);
  bubble.addEventListener('touchstart', startDrag, { passive: true });
  window.addEventListener('touchmove', moveDrag, { passive: false });
  window.addEventListener('touchend', stopDrag);

  // toggle crate
  bubble.addEventListener('click', () => {
    if (bubble.classList.contains('dragging')) return; // don't toggle on drag
    if (window.CrateInstance) {
      window.CrateInstance.toggle();
    } else {
      console.warn('⚠️ WidgetBot not ready yet.');
    }
  });

  console.log('✨ CharlestonHacks chat bubble injected');
}
