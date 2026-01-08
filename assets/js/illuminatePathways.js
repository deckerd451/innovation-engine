/* ==========================================================================
 * illuminatePathways.js — Narrated, Sequential "Illuminate Pathways" UI
 * CharlestonHacks Innovation Engine
 *
 * Purpose:
 * - Show recommended connections ONE AT A TIME with narration
 * - Draw a pathway to the currently narrated recommendation
 * - Provide a focused "Connect" CTA for the current recommendation
 *
 * Exports:
 * - initIlluminatedPathways()
 * - showAnimatedPathways()
 * - stopAnimatedPathways()
 * - isIlluminating()
 * ========================================================================== */

let state = {
  initialized: false,
  playing: false,
  timer: null,

  // data
  meId: null,
  recommendations: [],
  index: 0,

  // ui
  root: null,
  els: {},

  // deps (pulled from window by default)
  deps: {
    getSynapseStats: null,
    getRecommendations: null,
    showConnectPathways: null,
    clearConnectPathways: null,
  },
};

function log(...args) {
  console.log("%c💡 Illuminate", "color:#0ff;font-weight:700", ...args);
}

function warn(...args) {
  console.warn("%c💡 Illuminate", "color:#ff0;font-weight:700", ...args);
}

function clearTimer() {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

/* -------------------------
   UI CREATION
-------------------------- */

function ensureUI() {
  if (state.root && document.body.contains(state.root)) return;

  const root = document.createElement("div");
  root.id = "illuminate-pathways-ui";
  root.style.cssText = `
    position: fixed;
    right: 18px;
    bottom: 92px;
    width: 340px;
    max-height: calc(100vh - 24px);
    z-index: 9999;

    display: flex;
    flex-direction: column;
    overflow: hidden;

    background: rgba(0,0,0,0.72);
    border: 1px solid rgba(0,224,255,0.25);
    backdrop-filter: blur(10px);
    border-radius: 14px;
    padding: 12px 12px 10px;
    color: #eaffff;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35);
  `;

  // Header (always visible), Body (scrolls if needed), Footer (always visible)
  root.innerHTML = `
    <div id="illuminateHeader" style="
      display:flex;align-items:center;justify-content:space-between;gap:10px;
      padding-bottom:8px;
    ">
      <div style="font-weight:800;letter-spacing:0.2px;">Illuminate Pathways</div>
      <button id="illuminateClose" title="Close" style="
        border:0; background:transparent; color:#9ff; cursor:pointer;
        font-size:18px; line-height:1; padding:4px 6px;">✕</button>
    </div>

    <div id="illuminateBody" style="
      overflow:auto;
      -webkit-overflow-scrolling: touch;
      padding-right: 2px;
    ">
      <div id="illuminateSub" style="margin-top:0; opacity:0.9; font-size:12.5px;">
        Showing one suggested connection at a time.
      </div>

      <div style="margin-top:10px; padding:10px; border-radius:12px; background: rgba(0,224,255,0.06); border:1px solid rgba(0,224,255,0.18);">
        <div id="illuminateStep" style="font-size:12px; opacity:0.85;"></div>
        <div id="illuminateName" style="margin-top:6px; font-size:16px; font-weight:800;"></div>
        <div id="illuminateReason" style="margin-top:6px; font-size:12.5px; opacity:0.9; line-height:1.35;"></div>
      </div>
    </div>

    <div id="illuminateFooter" style="margin-top:10px;">
      <div style="display:flex; gap:8px;">
        <button id="illuminatePrev" style="flex:1; padding:9px 10px; border-radius:12px; border:1px solid rgba(0,224,255,0.25); background: rgba(0,0,0,0.2); color:#cfffff; cursor:pointer;">Prev</button>
        <button id="illuminateNext" style="flex:1; padding:9px 10px; border-radius:12px; border:1px solid rgba(0,224,255,0.25); background: rgba(0,0,0,0.2); color:#cfffff; cursor:pointer;">Next</button>
      </div>

      <div style="display:flex; gap:8px; margin-top:8px;">
        <button id="illuminatePlayPause" style="flex:1; padding:9px 10px; border-radius:12px; border:1px solid rgba(0,224,255,0.35); background: rgba(0,224,255,0.14); color:#eaffff; cursor:pointer; font-weight:800;">Play</button>
        <button id="illuminateConnect" style="flex:1; padding:9px 10px; border-radius:12px; border:1px solid rgba(0,224,255,0.55); background: rgba(0,224,255,0.22); color:#ffffff; cursor:pointer; font-weight:900;">Connect</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  state.root = root;
  state.els = {
    close: root.querySelector("#illuminateClose"),
    step: root.querySelector("#illuminateStep"),
    name: root.querySelector("#illuminateName"),
    reason: root.querySelector("#illuminateReason"),
    prev: root.querySelector("#illuminatePrev"),
    next: root.querySelector("#illuminateNext"),
    playPause: root.querySelector("#illuminatePlayPause"),
    connect: root.querySelector("#illuminateConnect"),
  };

  // Responsive positioning (keep size, but stay on-screen)
  const applyResponsive = () => {
    const pad = 12;
    const short = window.innerHeight < 700;

    root.style.right = `${pad}px`;
    root.style.bottom = `${short ? pad : 92}px`;

    const maxW = Math.max(260, window.innerWidth - pad * 2);
    root.style.width = `${Math.min(340, maxW)}px`;
    root.style.maxHeight = `calc(100vh - ${pad * 2}px)`;
  };

  applyResponsive();
  if (!state._resizeBound) {
    state._resizeBound = true;
    window.addEventListener("resize", applyResponsive, { passive: true });
  }

  // Safe wiring
  state.els.close.onclick = () => stopAnimatedPathways(true);
  state.els.prev.onclick = () => stepRelative(-1);
  state.els.next.onclick = () => stepRelative(+1);
  state.els.playPause.onclick = () => togglePlayPause();
  state.els.connect.onclick = () => connectToCurrent();
}


function updatePlayLabel() {
  if (!state.els.playPause) return;
  state.els.playPause.textContent = state.playing ? "Pause" : "Play";
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

/* -------------------------
   SEQUENCE CONTROL
-------------------------- */

function stepRelative(delta) {
  if (!state.recommendations?.length) return;
  clearTimer();
  state.playing = false;
  updatePlayLabel();

  state.index = (state.index + delta + state.recommendations.length) % state.recommendations.length;
  renderStep();
}

function togglePlayPause() {
  if (!state.recommendations?.length) return;

  state.playing = !state.playing;
  updatePlayLabel();

  clearTimer();
  if (state.playing) {
    scheduleNextAdvance();
  }
}

function scheduleNextAdvance() {
  clearTimer();
  if (!state.playing) return;

  state.timer = setTimeout(() => {
    state.index = (state.index + 1) % state.recommendations.length;
    renderStep();
    scheduleNextAdvance();
  }, 2600);
}

/* -------------------------
   RENDERING + PATH DRAWING
-------------------------- */

function renderStep() {
  ensureUI();

  const recs = state.recommendations || [];
  if (!recs.length) {
    setText(state.els.step, "No recommendations found.");
    setText(state.els.name, "");
    setText(state.els.reason, "");
    return;
  }

  const rec = recs[state.index];
  const total = recs.length;

  setText(state.els.step, `Suggestion ${state.index + 1} of ${total}`);
  setText(state.els.name, rec?.name || rec?.node?.name || rec?.node?.title || "Suggested connection");
  setText(state.els.reason, rec?.reason || "Recommended based on shared interests, skills, and network proximity.");

  // draw the single active pathway
  const fromId = state.meId;
  const toId = rec?.userId || rec?.node?.id;

  if (!fromId || !toId) {
    warn("Missing ids for pathway draw", { fromId, toId, rec });
    return;
  }

  try {
    state.deps.clearConnectPathways?.();
  } catch (e) {
    // safe
  }

  try {
    state.deps.showConnectPathways?.(fromId, toId, { duration: 2000 });
  } catch (e) {
    console.error("Illuminate: showConnectPathways failed", e);
  }
}

/* -------------------------
   CONNECT ACTION
-------------------------- */

async function connectToCurrent() {
  const recs = state.recommendations || [];
  const rec = recs[state.index];
  const targetId = rec?.userId || rec?.node?.id;
  if (!targetId) return;

  log("Connect clicked", { targetId, rec });

  // Try common connection request hooks (safe fallbacks)
  const candidates = [
    window.sendConnectionRequest,
    window.requestConnection,
    window.createConnectionRequest,
    window.connectToUser,
  ].filter(Boolean);

  for (const fn of candidates) {
    try {
      const result = fn(targetId, rec);
      // allow promise or sync
      if (result?.then) await result;
      return;
    } catch (e) {
      // try next
    }
  }

  // Fallback: open node panel if available
  if (typeof window.openNodePanel === "function") {
    try {
      window.openNodePanel(rec.node || { id: targetId });
      return;
    } catch (e) {}
  }

  // Last fallback: dispatch an event
  window.dispatchEvent(
    new CustomEvent("illuminate-connect", {
      detail: { targetId, rec },
    })
  );

  warn("No connect handler found. Dispatched 'illuminate-connect' event.");
}

/* -------------------------
   PUBLIC API
-------------------------- */

export function initIlluminatedPathways(options = {}) {
  // wire deps (prefer explicit, else window)
  state.deps.getSynapseStats =
    options.getSynapseStats || window.getSynapseStats || null;
  state.deps.getRecommendations =
    options.getRecommendations || window.getRecommendations || null;
  state.deps.showConnectPathways =
    options.showConnectPathways || window.showConnectPathways || null;
  state.deps.clearConnectPathways =
    options.clearConnectPathways || window.clearConnectPathways || null;

  ensureUI();

  // expose legacy global expected by dashboard/actions
  window.showAnimatedPathways = showAnimatedPathways;

  state.initialized = true;
  log("Initialized");
  return true;
}

export async function showAnimatedPathways(opts = {}) {
  if (!state.initialized) initIlluminatedPathways();

  ensureUI();
  clearTimer();

  const limit = Number.isFinite(opts.limit) ? opts.limit : 10;

  // pull meId from synapse stats if available
  try {
    const stats = state.deps.getSynapseStats?.();
    state.meId = stats?.currentUserCommunityId || stats?.meId || state.meId;
  } catch (e) {}

  if (!state.meId) {
    warn("No current user community id available (meId).");
  }

  // get recs
  let recs = [];
  try {
    const maybe = await state.deps.getRecommendations?.({ limit });
    if (Array.isArray(maybe)) recs = maybe;
  } catch (e) {
    console.error("Illuminate: getRecommendations failed", e);
  }

  state.recommendations = recs || [];
  state.index = 0;

  if (!state.recommendations.length) {
    warn("No recommendations returned.");
    renderStep();
    return [];
  }

  state.playing = Boolean(opts.autoplay ?? true);
  updatePlayLabel();

  renderStep();
  if (state.playing) scheduleNextAdvance();

  return state.recommendations;
}

export function stopAnimatedPathways(hideUI = false) {
  clearTimer();
  state.playing = false;
  updatePlayLabel();

  try {
    state.deps.clearConnectPathways?.();
  } catch (e) {}

  if (hideUI && state.root) {
    state.root.remove();
    state.root = null;
    state.els = {};
  }

  log("Stopped");
}

export function isIlluminating() {
  return Boolean(state.playing);
}

export default {
  initIlluminatedPathways,
  showAnimatedPathways,
  stopAnimatedPathways,
  isIlluminating,
};
