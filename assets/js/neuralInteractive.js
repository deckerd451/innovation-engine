// neuralInteractive.js
import { supabaseClient as supabase } from './supabaseClient.js';
import { fetchConnections } from './loadConnections.js';

window.supabase = supabase; // handy for console

// ───── MOBILE MODE DETECTION ────────────────────────────────────────────────
const MOBILE_MODE =
  window.matchMedia("(pointer: coarse)").matches ||
  window.matchMedia("(max-width: 820px)").matches;

// ───── GLOBAL STATE ─────────────────────────────────────────────────────────
const DEFAULT_NEURONS = [
  { name: "You", skills: ["Explorer"], interests: ["AI","Networks"], availability: "online", endorsements: 3 }
];

let combined = [];
let rawConnections = [];
let useGrid = false;
let neurons = [];
let connections = [];
let selectedNeuron = null;

let canvas, ctx, tooltip, user, userId;
let animationId = null, lastFrame = 0;
const FRAME_INTERVAL = 1000/30;

let initialized = false;
let animationStarted = false;

// ───── MOBILE JOURNEY STATE ────────────────────────────────────────────────
const journeyState = {
  active: false,
  mode: null, // 'discover' | 'connect' | 'grow'
  highlights: [],
  lastPicks: {}
};

// ───── AVATAR CACHE (MOBILE ONLY) ───────────────────────────────────────────
const avatarCache = new Map();

function setAuthStatus(msg, isError=false) {
  const el = document.getElementById('auth-status');
  if (!el) return;
  el.textContent = msg;
  el.className   = isError ? 'error':'success';
}

// Show/hide UI chunks that belong to the page (auth panes remain in dex.html)
function showAuthUI(needsLogin) {
  const authPane   = document.getElementById('auth-pane');
  const topActions = document.getElementById('top-actions');
  const canvasEl   = document.getElementById('neural-canvas');

  if (authPane)   authPane.style.display   = needsLogin ? 'block':'none';
  if (topActions) topActions.style.display = needsLogin ? 'none' :'flex';
  if (canvasEl)   canvasEl.style.display   = needsLogin ? 'none' :'block';
}

// ───── MOBILE HELPERS (MOBILE ONLY) ────────────────────────────────────────
function getCurrentUserNeuron() {
  if (!userId || !neurons.length) return null;
  return neurons.find(n => n.meta.user_id === userId);
}

function setMobileUIQuietMode(isQuiet) {
  if (!MOBILE_MODE) return;
  const topActions = document.getElementById('top-actions');
  if (topActions) {
    topActions.style.opacity = isQuiet ? '0.2' : '1';
    topActions.style.pointerEvents = isQuiet ? 'none' : 'auto';
  }
}

function centerOnNeuronOnce(neuron) {
  if (!neuron || !canvas) return;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const offsetX = centerX - neuron.x;
  const offsetY = centerY - neuron.y;

  // Shift all neurons by offset (simple translate)
  neurons.forEach(n => {
    n.x += offsetX;
    n.y += offsetY;
  });

  drawNetwork();
}

function applyMobileUserFirstFocus(options = {}) {
  if (!MOBILE_MODE) return;

  const userNeuron = getCurrentUserNeuron();
  if (!userNeuron) return;

  // Mark user neuron with special flags
  userNeuron._isMe = true;
  userNeuron.radius = 18 * 2.0; // Double radius
  userNeuron._opacity = 1.0;

  // Dim other neurons
  neurons.forEach(n => {
    if (n !== userNeuron) {
      n._opacity = 0.40;
    }
  });

  // Center on user neuron if requested
  if (options.center) {
    centerOnNeuronOnce(userNeuron);
  }

  drawNetwork();
}

// ───── MOBILE JOURNEY UI ───────────────────────────────────────────────────
function showMobileHint() {
  if (!MOBILE_MODE) return;
  if (document.getElementById('mobile-hint-overlay')) return; // Already shown

  const hint = document.createElement('div');
  hint.id = 'mobile-hint-overlay';
  hint.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255,215,0,0.95);
    color: #000;
    padding: 12px 20px;
    border-radius: 20px;
    font-weight: 600;
    font-size: 14px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: fadeInOut 4s ease-in-out;
    pointer-events: none;
  `;
  hint.textContent = '👆 Tap your node to begin';
  document.body.appendChild(hint);

  // Auto-remove after animation
  setTimeout(() => {
    if (hint.parentNode) hint.remove();
  }, 4000);
}

function enterJourney() {
  journeyState.active = true;
  journeyState.mode = null;
  journeyState.highlights = [];
  showJourneyOverlay();
  setMobileUIQuietMode(true);
}

function exitJourney() {
  journeyState.active = false;
  journeyState.mode = null;
  journeyState.highlights = [];
  closeJourneyOverlay();
  closeNextStepOverlay();
  setMobileUIQuietMode(false);
  drawNetwork();
}

function showJourneyOverlay() {
  closeJourneyOverlay(); // Remove any existing

  const overlay = document.createElement('div');
  overlay.id = 'journey-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 1rem;
  `;

  overlay.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid rgba(0,224,255,0.4);
      border-radius: 16px;
      padding: 2rem;
      max-width: 400px;
      width: 100%;
      text-align: center;
    ">
      <h2 style="color: #ffd700; margin: 0 0 1.5rem 0; font-size: 24px;">
        Choose Your Journey
      </h2>
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <button onclick="window.selectJourneyMode('discover')" style="
          background: linear-gradient(135deg, #00e0ff, #0080ff);
          border: none;
          color: #fff;
          padding: 1rem;
          border-radius: 12px;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s;
        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          🚀 Discover
        </button>
        <button onclick="window.selectJourneyMode('connect')" style="
          background: linear-gradient(135deg, #ffd700, #ffed4e);
          border: none;
          color: #000;
          padding: 1rem;
          border-radius: 12px;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s;
        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          👥 Connect
        </button>
        <button onclick="window.selectJourneyMode('grow')" style="
          background: linear-gradient(135deg, #ff006e, #ff4d94);
          border: none;
          color: #fff;
          padding: 1rem;
          border-radius: 12px;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s;
        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          ⚡ Grow
        </button>
        <button onclick="window.exitJourneyGlobal()" style="
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.3);
          color: #fff;
          padding: 0.75rem;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 0.5rem;
        ">
          Cancel
        </button>
      </div>
    </div>
  `;

  // Close on outside click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) exitJourney();
  });

  document.body.appendChild(overlay);
}

function closeJourneyOverlay() {
  const overlay = document.getElementById('journey-overlay');
  if (overlay) overlay.remove();
}

function selectJourneyMode(mode) {
  journeyState.mode = mode;
  closeJourneyOverlay();

  // Highlight 1-3 relevant nodes based on mode (simple heuristic)
  const userNeuron = getCurrentUserNeuron();
  const otherNeurons = neurons.filter(n => n !== userNeuron && !n.owned);

  let highlights = [];
  if (mode === 'discover') {
    // Highlight nodes with different skills/interests
    highlights = otherNeurons.slice(0, 3).map(n => n.meta.id);
  } else if (mode === 'connect') {
    // Highlight nodes not yet connected
    const connectedIds = connections
      .filter(c => c.from === userNeuron || c.to === userNeuron)
      .map(c => (c.from === userNeuron ? c.to : c.from).meta.id);
    highlights = otherNeurons
      .filter(n => !connectedIds.includes(n.meta.id))
      .slice(0, 3)
      .map(n => n.meta.id);
  } else if (mode === 'grow') {
    // Highlight nodes with skills to endorse or learn from
    highlights = otherNeurons
      .filter(n => n.meta.skills && n.meta.skills.length > 0)
      .slice(0, 3)
      .map(n => n.meta.id);
  }

  journeyState.highlights = highlights;
  drawNetwork();
}

function showNextStepOverlay(neuron) {
  closeNextStepOverlay(); // Remove any existing

  const overlay = document.createElement('div');
  overlay.id = 'next-step-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 1rem;
  `;

  const userName = neuron.meta.name || 'User';
  const userId = neuron.meta.user_id;
  const skills = neuron.meta.skills || [];

  overlay.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid rgba(0,224,255,0.4);
      border-radius: 16px;
      padding: 2rem;
      max-width: 400px;
      width: 100%;
    ">
      <h3 style="color: #ffd700; margin: 0 0 1rem 0; font-size: 20px; text-align: center;">
        ${userName}
      </h3>
      <p style="color: rgba(255,255,255,0.7); text-align: center; margin-bottom: 1.5rem; font-size: 14px;">
        Choose an action:
      </p>
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <button onclick="window.journeyAction('connect', '${neuron.meta.id}')" style="
          background: linear-gradient(135deg, #00e0ff, #0080ff);
          border: none;
          color: #fff;
          padding: 0.75rem;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        ">
          🤝 Connect
        </button>
        <button onclick="window.journeyAction('endorse', '${userId}', '${userName}', '${skills.join(',')}')" style="
          background: linear-gradient(135deg, #ffd700, #ffed4e);
          border: none;
          color: #000;
          padding: 0.75rem;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        ">
          ⭐ Endorse
        </button>
        <button onclick="window.journeyAction('details', '${neuron.meta.id}')" style="
          background: rgba(255,255,255,0.15);
          border: 1px solid rgba(255,255,255,0.3);
          color: #fff;
          padding: 0.75rem;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        ">
          👤 View Details
        </button>
        <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
          <button onclick="window.journeyAction('back')" style="
            flex: 1;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.3);
            color: #fff;
            padding: 0.5rem;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          ">
            ← Back
          </button>
          <button onclick="window.journeyAction('done')" style="
            flex: 1;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.3);
            color: #fff;
            padding: 0.5rem;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          ">
            Done
          </button>
        </div>
      </div>
    </div>
  `;

  // Close on outside click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeNextStepOverlay();
  });

  document.body.appendChild(overlay);
  setMobileUIQuietMode(true);
}

function closeNextStepOverlay() {
  const overlay = document.getElementById('next-step-overlay');
  if (overlay) overlay.remove();
}

async function journeyAction(action, ...args) {
  if (action === 'connect') {
    const [targetId] = args;
    const target = neurons.find(n => n.meta.id === targetId);
    const userNeuron = getCurrentUserNeuron();
    if (target && userNeuron) {
      try {
        await supabase.from('connections').insert({
          from_id: userNeuron.meta.id,
          to_id: target.meta.id
        });
        connections.push({ from: userNeuron, to: target });
        drawNetwork();
        showToastMobile('✓ Connected!', 'success');
      } catch (err) {
        console.error('Connection error:', err);
        showToastMobile('Failed to connect', 'error');
      }
    }
    closeNextStepOverlay();
  } else if (action === 'endorse') {
    const [targetUserId, userName, skillsStr] = args;
    closeNextStepOverlay();
    exitJourney();
    // Call existing EndorsementsModule
    if (window.EndorsementsModule && window.EndorsementsModule.showEndorseModal) {
      const skills = skillsStr ? skillsStr.split(',').filter(s => s) : [];
      window.EndorsementsModule.showEndorseModal(targetUserId, userName, skills);
    } else {
      showToastMobile('Endorsements module not available', 'error');
    }
  } else if (action === 'details') {
    const [targetId] = args;
    const target = neurons.find(n => n.meta.id === targetId);
    closeNextStepOverlay();
    exitJourney();
    if (target) {
      // Use existing node panel if available
      if (window.openNodePanel) {
        window.openNodePanel(target.meta);
      } else {
        // Fallback: simple selection
        selectedNeuron = target;
        drawNetwork();
      }
    }
  } else if (action === 'back') {
    closeNextStepOverlay();
    showJourneyOverlay();
  } else if (action === 'done') {
    closeNextStepOverlay();
    exitJourney();
  }
}

function showToastMobile(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'error' ? '#f44' : type === 'success' ? '#4caf50' : '#00e0ff'};
    color: ${type === 'error' || type === 'success' ? '#fff' : '#000'};
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    z-index: 10001;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 3000);
}

// Expose functions to window for inline onclick handlers
window.selectJourneyMode = selectJourneyMode;
window.journeyAction = journeyAction;
window.exitJourneyGlobal = exitJourney;

// ───── AUTH & DATA LOADING ─────────────────────────────────────────────────
async function loadOrCreatePersonalNeurons() {
  const { data, error } = await supabase.from('community').select('*');
  if (error) {
    console.error(error);
    return setAuthStatus("Error loading neurons", true);
  }

  const mine   = data.filter(n => n.user_id === userId);
  const others = data.filter(n => n.user_id !== userId);

  if (!mine.length) {
    const toInsert = DEFAULT_NEURONS.map(n => ({ ...n, user_id:userId, x:0, y:0 }));
    const { error: insErr } = await supabase.from('community').insert(toInsert);
    if (insErr) {
      console.error(insErr);
      return setAuthStatus("Could not seed defaults", true);
    }
    return loadOrCreatePersonalNeurons();
  }

  combined = [
    ...mine .map(n => ({ ...n, owned:true  })),
    ...others.map(n => ({ ...n, owned:false }))
  ];

  neurons = useGrid
    ? arrangeNeuronsInGrid(combined)
    : clusteredLayout(combined, canvas.width, canvas.height);

  if (selectedNeuron) {
    const id = selectedNeuron.meta.id;
    selectedNeuron = neurons.find(n => n.meta.id === id) || null;
  }

  rawConnections = await fetchConnections();
  connections = rawConnections.map(({ from_id, to_id }) => ({
    from: neurons.find(n => n.meta.id === from_id),
    to:   neurons.find(n => n.meta.id === to_id)
  }));

  drawNetwork();

  // Apply mobile user-first focus (with center)
  applyMobileUserFirstFocus({ center: true });

  // Show mobile hint (once)
  if (MOBILE_MODE && !window.__MOBILE_HINT_SHOWN__) {
    window.__MOBILE_HINT_SHOWN__ = true;
    setTimeout(() => showMobileHint(), 1000);
  }

  if (!animationStarted) {
    animationId = requestAnimationFrame(animate);
    animationStarted = true;
  }
}

// ───── LAYOUT ───────────────────────────────────────────────────────────────
function arrangeNeuronsInGrid(users) {
  const total = users.length;
  const cols  = Math.ceil(Math.sqrt(total));
  const sx    = canvas.width  / (cols+1);
  const sy    = canvas.height / (Math.ceil(total/cols)+1);

  return users.map((u,i) => ({
    x:      sx*((i%cols)+1),
    y:      sy*(Math.floor(i/cols)+1),
    radius: 18, meta:u, owned:u.owned
  }));
}

function clusteredLayout(users,w,h) {
  const groupBy = u=>u.skills?.[0]||u.availability||'misc';
  const groups  = {};
  users.forEach(u=> (groups[groupBy(u)] ||= []).push(u));

  const keys = Object.keys(groups);
  const cx   = w/2, cy = h/2, R = Math.min(w,h)*0.35;
  const out  = [];

  keys.forEach((k,i)=>{
    const ang = 2*Math.PI*i/keys.length;
    const center = { x:cx+Math.cos(ang)*R, y:cy+Math.sin(ang)*R };
    groups[k].forEach((u,j)=>{
      const off   = 2*Math.PI*j/groups[k].length;
      const sp    = 40 + j*5;
      const baseX = u.x ?? center.x;
      const baseY = u.y ?? center.y;
      out.push({
        x:      baseX + Math.cos(off)*sp,
        y:      baseY + Math.sin(off)*sp,
        radius: 18, meta:u, owned:u.owned
      });
    });
  });

  return out;
}

// ───── RENDERING ───────────────────────────────────────────────────────────
function drawNeuron(n,t) {
  const pulse = 1 + Math.sin(t/400 + n.x + n.y)*0.3;
  const r     = n.radius*pulse;
  const opacity = n._opacity !== undefined ? n._opacity : 1.0;
  const baseCol = n.owned ? '#0ff' : 'rgba(255,255,255,0.3)';

  // Apply opacity to color
  const col = opacity < 1
    ? (n.owned ? `rgba(0,255,255,${opacity})` : `rgba(255,255,255,${opacity * 0.3})`)
    : baseCol;

  const glow  = ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,r);
  glow.addColorStop(0,col);
  glow.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(n.x,n.y,r,0,2*Math.PI); ctx.fill();

  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(n.x,n.y,5,0,2*Math.PI); ctx.fill();

  // MOBILE: Rich rendering for user node
  if (MOBILE_MODE && n._isMe) {
    // Draw avatar if available
    if (n.meta.image_url) {
      let img = avatarCache.get(n.meta.image_url);
      if (!img) {
        img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = n.meta.image_url;
        avatarCache.set(n.meta.image_url, img);
      }
      if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 0.6, 0, 2 * Math.PI);
        ctx.clip();
        ctx.drawImage(img, n.x - r * 0.6, n.y - r * 0.6, r * 1.2, r * 1.2);
        ctx.restore();
      }
    }

    // Draw name + info lines
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'center';
    ctx.fillText(n.meta.name || 'You', n.x, n.y - r - 15);

    // Info line 1: role or first skill
    const info1 = n.meta.role || (n.meta.skills && n.meta.skills[0]) || '';
    if (info1) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(info1, n.x, n.y - r - 2);
    }

    // Info line 2: availability or first interest
    const info2 = n.meta.availability || (n.meta.interests && n.meta.interests[0]) || '';
    if (info2) {
      ctx.font = '11px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(info2, n.x, n.y - r + 10);
    }
  } else {
    // Default name rendering
    ctx.font      = '15px sans-serif';
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.fillText(n.meta.name, n.x, n.y - r - 10);
  }

  // Journey highlight ring
  if (journeyState.active && journeyState.highlights.includes(n.meta.id)) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r + 8, 0, 2 * Math.PI);
    ctx.stroke();
  }

  if (n === selectedNeuron) {
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth   = 4;
    ctx.beginPath(); ctx.arc(n.x,n.y,r+6,0,2*Math.PI); ctx.stroke();
  }
}

function drawConnections() {
  ctx.lineWidth   = 1.5;
  ctx.strokeStyle = 'rgba(0,255,255,0.16)';
  connections.forEach(({from,to})=>{
    if (from && to) {
      ctx.beginPath();
      ctx.moveTo(from.x,from.y);
      ctx.lineTo(to.x,to.y);
      ctx.stroke();
    }
  });
}

function drawNetwork(time=0) {
  if (!neurons.length) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawConnections();
  neurons.forEach(n=>drawNeuron(n,time));
}

function animate(time) {
  // ✅ PERFORMANCE: Stop animation when idle or hidden
  if (document.hidden || (window.AnimationLifecycle && !window.AnimationLifecycle.isActive())) {
    animationId = null;
    animationStarted = false;
    return;
  }

  if (time - lastFrame >= FRAME_INTERVAL) {
    drawNetwork(time);
    lastFrame = time;
  }
  animationId = requestAnimationFrame(animate);
}

// ───── BOOTSTRAP ───────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async()=>{
  canvas   = document.getElementById('neural-canvas');
  ctx      = canvas.getContext('2d');
  tooltip  = document.getElementById('tooltip');

  const toggleBtn = document.getElementById('toggle-layout');

  window.addEventListener('resize',()=>{
    canvas.width  = innerWidth;
    canvas.height = innerHeight;
  });
  canvas.width  = innerWidth;
  canvas.height = innerHeight;

  // Toggle between layouts
  toggleBtn?.addEventListener('click', ()=>{
    useGrid = !useGrid;
    toggleBtn.textContent = useGrid ? 'Use Cluster':'Use Grid';

    neurons = useGrid
      ? arrangeNeuronsInGrid(combined)
      : clusteredLayout(combined, canvas.width, canvas.height);

    if (selectedNeuron) {
      const selId = selectedNeuron.meta.id;
      selectedNeuron = neurons.find(n=>n.meta.id===selId) || null;
    }

    connections = rawConnections.map(({from_id,to_id})=>({
      from: neurons.find(n=>n.meta.id===from_id),
      to:   neurons.find(n=>n.meta.id===to_id)
    }));

    drawNetwork();

    // Apply mobile user-first focus (with center)
    applyMobileUserFirstFocus({ center: true });
  });

  // Hover tooltip (desktop only)
  if (!MOBILE_MODE) {
    canvas.addEventListener('mousemove',e=>{
      const {left,top}=canvas.getBoundingClientRect();
      const x=e.clientX-left, y=e.clientY-top;
      const hit=neurons.find(n=>Math.hypot(n.x-x,n.y-y)<n.radius);
      if(hit){
        tooltip.style.display='block';
        tooltip.style.left=`${e.clientX+12}px`;
        tooltip.style.top =`${e.clientY+12}px`;
        tooltip.textContent=
          `${hit.meta.name}\nSkills: ${(hit.meta.skills||[]).join(', ')}\n`+
          `Endorsements: ${hit.meta.endorsements ?? 0}\nStatus: ${hit.meta.availability ?? ''}`;
      } else tooltip.style.display='none';
    });
    canvas.addEventListener('mouseleave', ()=>tooltip.style.display='none');
  }

  // Drag owned nodes to save x/y
  let dragging=null, offs={x:0,y:0};
  const onMove=e=>{
    if(!dragging) return;
    const {left,top}=canvas.getBoundingClientRect();
    const x=e.clientX-left, y=e.clientY-top;
    dragging.x=x-offs.x; dragging.y=y-offs.y;
    drawNetwork();
  };
  const onUp=()=>{
    if(!dragging) return;
    canvas.style.cursor='';
    supabase.from('community')
      .update({x:dragging.x,y:dragging.y})
      .eq('id',dragging.meta.id);
    dragging.meta.x=dragging.x;
    dragging.meta.y=dragging.y;
    window.removeEventListener('mousemove',onMove);
    window.removeEventListener('mouseup',  onUp);
    dragging=null;
  };
  canvas.addEventListener('mousedown',e=>{
    const {left,top}=canvas.getBoundingClientRect();
    const x=e.clientX-left, y=e.clientY-top;
    const hit=neurons.find(n=>Math.hypot(n.x-x,n.y-y)<n.radius && n.owned);
    if(!hit) return;
    dragging=hit;
    offs.x=x-hit.x; offs.y=y-hit.y;
    canvas.style.cursor='grabbing';
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',  onUp);
  });

  // Click-to-connect (with mobile journey support)
  canvas.addEventListener('click',async e=>{
    const {left,top}=canvas.getBoundingClientRect();
    const x=e.clientX-left,y=e.clientY-top;
    const hit=neurons.find(n=>Math.hypot(n.x-x,n.y-y)<n.radius);

    // MOBILE: Journey mode handling
    if (MOBILE_MODE) {
      // No hit + journey active => exit journey
      if (!hit && journeyState.active) {
        exitJourney();
        return;
      }

      // Hit user node => enter journey
      const userNeuron = getCurrentUserNeuron();
      if (hit && hit === userNeuron) {
        enterJourney();
        return;
      }

      // Journey active + hit highlighted node => show next step
      if (journeyState.active && hit && journeyState.highlights.includes(hit.meta.id)) {
        showNextStepOverlay(hit);
        return;
      }

      // Fall through to normal behavior if not in journey
    }

    // Default click-to-connect behavior (desktop + mobile when not in journey)
    if(!hit){ selectedNeuron=null; return; }
    if(!selectedNeuron){
      if(hit.owned) selectedNeuron=hit;
    } else if(hit!==selectedNeuron){
      await supabase.from('connections')
        .insert({from_id:selectedNeuron.meta.id,to_id:hit.meta.id});
      connections.push({from:selectedNeuron,to:hit});
      selectedNeuron=null;
      drawNetwork();
    }
  });

  // Tab changes from dex.html control canvas visibility and animation
  document.addEventListener('dex:tab-changed', (e) => {
    const isNetwork  = e.detail?.tab === 'network';
    const canvasEl   = document.getElementById('neural-canvas');
    const topActions = document.getElementById('top-actions');

    if (canvasEl) canvasEl.style.display = isNetwork ? 'block' : 'none';
    if (topActions) topActions.style.display = isNetwork ? 'flex' : 'none';

    if (!isNetwork && animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
      animationStarted = false;
    } else if (isNetwork && !animationId && !animationStarted) {
      animationStarted = true;
      animationId = requestAnimationFrame(animate);
      // Apply mobile user-first focus (no recenter on tab switch)
      applyMobileUserFirstFocus({ center: false });
    }
  });

  // ✅ PERFORMANCE: Restart animation when page becomes active
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !animationId && neurons.length > 0) {
      const isNetwork = document.getElementById('neural-canvas')?.style.display !== 'none';
      if (isNetwork) {
        animationStarted = true;
        animationId = requestAnimationFrame(animate);
      }
    }
  });

  // Auth state: load data when logged in
  supabase.auth.onAuthStateChange(async(_,sess)=>{
    if(sess?.user && !initialized){
      initialized=true;
      user=sess.user; userId=user.id;
      showAuthUI(false);
      await loadOrCreatePersonalNeurons();
    } else if(!sess?.user){
      initialized=false;
      showAuthUI(true);
      if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
    }
  });

  // First run: pick up existing session
  const { data:{session} } = await supabase.auth.getSession();
  if(session?.user){
    initialized=true;
    user=session.user; userId=user.id;
    showAuthUI(false);
    await loadOrCreatePersonalNeurons();
  } else {
    showAuthUI(true);
  }
});
