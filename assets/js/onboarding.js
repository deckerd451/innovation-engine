// ================================================================
// CharlestonHacks Innovation Engine — ONBOARDING (ASSETS)
// File: assets/js/onboarding.js
// ================================================================
// Starts on:
//  - profile-loaded
//  - app-ready (fallback)
//  - plus a DOM-ready poll fallback so it never misses a fast event.
//
// Uses localStorage key:
//  innovation_engine_onboarding_completed
// ================================================================

console.log("%c🎓 Onboarding Loading…", "color:#0ff; font-weight:bold;");

const ONBOARDING_KEY = "innovation_engine_onboarding_completed";

const STEPS = [
  { title: "Welcome to Innovation Engine", icon: "🌐", desc: "Discover people, skills, and collaborations. Quick tour?", target: null },
  { title: "The Network Graph", icon: "🔮", desc: "Nodes are people/projects. Click nodes to explore.", target: "#synapse-svg" },
  { title: "Search", icon: "🔍", desc: "Search people, skills, or projects.", target: "#global-search" },
  { title: "Bottom Bar", icon: "📊", desc: "Messages, projects, endorsements and actions live down here.", target: ".bottom-stats-bar" },
  { title: "You're Ready!", icon: "🚀", desc: "Start connecting and building.", target: null }
];

const state = {
  active: false,
  step: 0,
  overlay: null,
  highlight: null,
  startedThisSession: false
};

export function shouldShowOnboarding() {
  return !localStorage.getItem(ONBOARDING_KEY);
}

export function resetOnboarding() {
  localStorage.removeItem(ONBOARDING_KEY);
  console.log("🔄 Onboarding reset");
}

function ensureOverlay() {
  if (state.overlay && document.body.contains(state.overlay)) return state.overlay;

  const existing = document.getElementById("onboarding-overlay");
  if (existing) {
    state.overlay = existing;
    return existing;
  }

  const overlay = document.createElement("div");
  overlay.id = "onboarding-overlay";
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:10000;
    background:rgba(0,0,0,0.85);
    backdrop-filter: blur(4px);
    display:flex; align-items:center; justify-content:center;
    opacity:0; transition:opacity .25s ease;
  `;
  document.body.appendChild(overlay);
  state.overlay = overlay;
  requestAnimationFrame(() => overlay.style.opacity = "1");
  return overlay;
}

function clearHighlight() {
  if (state.highlight && document.body.contains(state.highlight)) state.highlight.remove();
  state.highlight = null;
}

function highlight(selector) {
  clearHighlight();
  const el = document.querySelector(selector);
  if (!el) return;

  try { el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); } catch {}

  const r = el.getBoundingClientRect();
  const h = document.createElement("div");
  h.style.cssText = `
    position:fixed;
    top:${Math.max(8, r.top - 10)}px;
    left:${Math.max(8, r.left - 10)}px;
    width:${Math.max(20, r.width + 20)}px;
    height:${Math.max(20, r.height + 20)}px;
    border:3px solid #00e0ff;
    border-radius:12px;
    pointer-events:none;
    z-index:10001;
    box-shadow:0 0 24px rgba(0,224,255,.55);
    animation:pulse 2s infinite;
  `;
  document.body.appendChild(h);
  state.highlight = h;
}

function finish() {
  console.log("✅ Onboarding completed");
  localStorage.setItem(ONBOARDING_KEY, "true");
  state.active = false;
  state.step = 0;
  clearHighlight();

  const overlay = state.overlay || document.getElementById("onboarding-overlay");
  if (overlay) {
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 250);
  }
  state.overlay = null;
}

function renderStep(i) {
  if (!state.active) return;
  if (i < 0) i = 0;
  if (i >= STEPS.length) return finish();

  state.step = i;
  const overlay = ensureOverlay();

  overlay.innerHTML = "";
  const s = STEPS[i];

  const card = document.createElement("div");
  card.style.cssText = `
    width:min(520px, 92vw);
    background:linear-gradient(135deg, rgba(10,14,39,.98), rgba(26,26,46,.98));
    border:2px solid rgba(0,224,255,.5);
    border-radius:16px;
    padding:2rem;
    box-shadow:0 20px 60px rgba(0,224,255,.25);
    text-align:center;
  `;

  card.innerHTML = `
    <div style="font-size:3.5rem; margin-bottom:.75rem;">${s.icon}</div>
    <div style="color:#00e0ff; font-weight:900; font-size:1.6rem; margin-bottom:.75rem;">${s.title}</div>
    <div style="color:#ddd; font-size:1.05rem; line-height:1.6; margin-bottom:1.25rem;">${s.desc}</div>
    <div style="display:flex; justify-content:center; gap:.5rem; margin-bottom:1.25rem;">
      ${STEPS.map((_, idx) => `<div style="height:8px; width:${idx===i ? 32 : 8}px; border-radius:4px; background:${idx===i ? "#00e0ff" : "rgba(255,255,255,.25)"};"></div>`).join("")}
    </div>
  `;

  const row = document.createElement("div");
  row.style.cssText = "display:flex; justify-content:center; gap:1rem; flex-wrap:wrap;";

  const skip = document.createElement("button");
  skip.textContent = "Skip";
  skip.style.cssText = `
    padding:.75rem 1.5rem;
    background:rgba(255,255,255,.1);
    border:1px solid rgba(255,255,255,.2);
    border-radius:10px;
    color:#fff;
    font-weight:800;
    cursor:pointer;
  `;
  skip.onclick = finish;

  const next = document.createElement("button");
  next.textContent = i === STEPS.length - 1 ? "Get Started" : "Next";
  next.style.cssText = `
    padding:.75rem 2rem;
    background:linear-gradient(135deg,#00e0ff,#0080ff);
    border:none;
    border-radius:10px;
    color:#fff;
    font-weight:900;
    cursor:pointer;
    box-shadow:0 6px 18px rgba(0,224,255,.35);
  `;
  next.onclick = () => (i === STEPS.length - 1 ? finish() : renderStep(i + 1));

  if (i < STEPS.length - 1) row.appendChild(skip);
  row.appendChild(next);

  card.appendChild(row);
  overlay.appendChild(card);

  // highlight if available
  if (s.target) {
    const exists = document.querySelector(s.target);
    if (exists) highlight(s.target);
    else clearHighlight();
  } else {
    clearHighlight();
  }
}

export function startOnboarding() {
  if (!shouldShowOnboarding()) return;
  if (state.active || state.startedThisSession) return;

  state.active = true;
  state.startedThisSession = true;

  console.log("🎓 Starting onboarding walkthrough");
  ensureOverlay();
  renderStep(0);
}

// --- Start triggers
function maybeStart() {
  // do not start during login screen
  const main = document.getElementById("main-content");
  const login = document.getElementById("login-section");
  const mainVisible = main && !main.classList.contains("hidden");
  const loginHidden = login && (login.classList.contains("hidden") || login.style.display === "none");

  if (!shouldShowOnboarding()) return;
  if (state.active || state.startedThisSession) return;

  // require synapse or main visible
  const synapse = document.getElementById("synapse-svg");
  if (synapse && (mainVisible || loginHidden)) startOnboarding();
}

// profile-loaded should be sufficient (canonical)
if (!window.__IE_ONBOARDING_LISTENERS__) {
  window.__IE_ONBOARDING_LISTENERS__ = true;

  window.addEventListener("profile-loaded", () => setTimeout(maybeStart, 200));
  window.addEventListener("app-ready", () => setTimeout(maybeStart, 200));

  // Hard fallback: poll a few times so we never miss a fast event
  let tries = 0;
  const poll = () => {
    tries++;
    maybeStart();
    if (!state.startedThisSession && tries < 12) setTimeout(poll, 400);
  };
  setTimeout(poll, 900);

  window.addEventListener("keydown", (e) => {
    if (state.active && e.key === "Escape") finish();
  });
}

// Animations
if (!document.getElementById("ie-onboarding-style")) {
  const style = document.createElement("style");
  style.id = "ie-onboarding-style";
  style.textContent = `
    @keyframes pulse { 0%,100%{opacity:1; transform:scale(1)} 50%{opacity:.7; transform:scale(1.05)} }
  `;
  document.head.appendChild(style);
}

console.log("✅ Onboarding system ready");
