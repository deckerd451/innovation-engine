// ================================================================
// CharlestonHacks Innovation Engine — ONBOARDING (HARDENED BUILD)
// ================================================================
// Goals:
//  • Keep the same tour + styling you already have
//  • Eliminate "Cannot set properties of null (setting 'innerHTML')" errors
//  • Prevent double-starts from repeated `profile-loaded` events
//  • Gracefully skip steps whose target elements are missing
//
// Expected DOM (from dashboard layout):
//  - #synapse-svg
//  - #global-search
//  - .bottom-stats-bar
//
// Usage:
//  - This module auto-starts on `window` event: `profile-loaded`
//  - You may also call `startOnboarding()` manually.

console.log("%c🎓 Onboarding Loading (hardened)…", "color:#0ff; font-weight:bold; font-size: 16px");

const ONBOARDING_KEY = "innovation_engine_onboarding_completed";

// Keep your existing step content/targets.
const ONBOARDING_STEPS = [
  {
    title: "Welcome to Innovation Engine",
    description: "Discover people, skills, and collaborations in your innovation ecosystem. Let's take a quick tour!",
    target: null,
    position: "center",
    icon: "🌐",
  },
  {
    title: "The Network Graph",
    description:
      "Each node represents a person or project. Node size shows connection count, colors indicate skills and collaboration status.",
    target: "#synapse-svg",
    position: "center",
    icon: "🔮",
  },
  {
    title: "Click to Explore",
    description:
      "Click any node to view detailed profiles, mutual connections, and take actions like messaging, connecting, or inviting to projects.",
    target: "#synapse-svg",
    position: "center",
    icon: "👆",
  },
  {
    title: "Search & Filter",
    description:
      "Use the search bar to find people by name, skills, or projects. Filter the network to focus on specific expertise or collaboration opportunities.",
    target: "#global-search",
    position: "bottom",
    icon: "🔍",
  },
  {
    title: "Your Stats",
    description: "Monitor your messages, active projects, endorsements, and network growth from the bottom bar.",
    target: ".bottom-stats-bar",
    position: "top",
    icon: "📊",
  },
  {
    title: "Take Action",
    description: "Click these buttons to message connections, explore projects, edit your profile, or connect with new people.",
    target: ".bottom-stats-bar",
    position: "top",
    icon: "⚡",
  },
  {
    title: "You're Ready!",
    description:
      "Start exploring the network, connect with people who share your interests, and build something amazing together.",
    target: null,
    position: "center",
    icon: "🚀",
  },
];

// ---------------------------
// State (single source of truth)
// ---------------------------
const state = {
  active: false,
  currentStep: 0,
  overlayEl: null,
  highlightEl: null,
  startTimer: null,
  // One-run protection per page-load to avoid double starts from repeated events.
  startedThisSession: false,
};

export function shouldShowOnboarding() {
  return !localStorage.getItem(ONBOARDING_KEY);
}

export function resetOnboarding() {
  localStorage.removeItem(ONBOARDING_KEY);
  console.log("🔄 Onboarding reset");
}

// ---------------------------
// Overlay lifecycle helpers
// ---------------------------
function getExistingOverlayFromDOM() {
  return document.getElementById("onboarding-overlay");
}

function ensureOverlay() {
  // If we already have an overlay ref, but it was removed, re-sync from DOM.
  if (state.overlayEl && !document.body.contains(state.overlayEl)) {
    state.overlayEl = null;
  }

  // If missing, try to grab from DOM (supports hot reload / duplicates).
  if (!state.overlayEl) {
    const existing = getExistingOverlayFromDOM();
    if (existing) state.overlayEl = existing;
  }

  // If still missing, create it.
  if (!state.overlayEl) {
    const overlay = document.createElement("div");
    overlay.id = "onboarding-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(4px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s;
    `;

    // Clicking the dark background does NOT auto-close (prevents accidental teardown).
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        // no-op
      }
    });

    document.body.appendChild(overlay);
    state.overlayEl = overlay;

    // Fade in
    requestAnimationFrame(() => {
      if (state.overlayEl) state.overlayEl.style.opacity = "1";
    });
  }

  return state.overlayEl;
}

function clearHighlight() {
  if (state.highlightEl && document.body.contains(state.highlightEl)) {
    state.highlightEl.remove();
  }
  state.highlightEl = null;
}

function finishOnboarding() {
  console.log("✅ Onboarding completed");

  state.active = false;
  state.currentStep = 0;
  clearHighlight();

  localStorage.setItem(ONBOARDING_KEY, "true");

  const overlay = state.overlayEl || getExistingOverlayFromDOM();
  if (overlay) {
    overlay.style.opacity = "0";
    setTimeout(() => {
      if (overlay && overlay.parentNode) overlay.remove();
      if (state.overlayEl === overlay) state.overlayEl = null;
    }, 250);
  } else {
    state.overlayEl = null;
  }

  showToast("Welcome to Innovation Engine! Start exploring the network.", "success");
}

// ---------------------------
// UI rendering
// ---------------------------
function showStep(stepIndex) {
  // HARD GUARD: no work if onboarding is not active.
  if (!state.active) return;

  // Bounds protection
  if (stepIndex < 0) stepIndex = 0;
  if (stepIndex >= ONBOARDING_STEPS.length) {
    finishOnboarding();
    return;
  }

  state.currentStep = stepIndex;

  const overlay = ensureOverlay();
  if (!overlay) return; // ultra-defensive

  // Clear previous content safely
  overlay.innerHTML = "";

  const step = ONBOARDING_STEPS[stepIndex];

  const card = document.createElement("div");
  card.className = "onboarding-card";
  card.style.cssText = `
    background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
    border: 2px solid rgba(0, 224, 255, 0.5);
    border-radius: 16px;
    padding: 2rem;
    max-width: 520px;
    width: 92%;
    box-shadow: 0 20px 60px rgba(0, 224, 255, 0.3);
    text-align: center;
    animation: slideUp 0.25s ease-out;
  `;

  // Icon
  const icon = document.createElement("div");
  icon.style.cssText = `font-size: 4rem; margin-bottom: 1rem;`;
  icon.textContent = step.icon || "✨";
  card.appendChild(icon);

  // Title
  const title = document.createElement("h2");
  title.style.cssText = `
    color: #00e0ff;
    font-size: 1.75rem;
    margin-bottom: 1rem;
    font-weight: 800;
  `;
  title.textContent = step.title || "Welcome";
  card.appendChild(title);

  // Description
  const description = document.createElement("p");
  description.style.cssText = `
    color: #ddd;
    font-size: 1.1rem;
    line-height: 1.6;
    margin-bottom: 1.5rem;
  `;
  description.textContent = step.description || "";
  card.appendChild(description);

  // If step has a target but it's missing, show a gentle hint (and don't highlight).
  const targetExists = step.target ? !!document.querySelector(step.target) : true;
  if (step.target && !targetExists) {
    const hint = document.createElement("div");
    hint.style.cssText = `
      margin: 0 auto 1.25rem auto;
      max-width: 440px;
      padding: 0.75rem 1rem;
      border-radius: 12px;
      border: 1px dashed rgba(0,224,255,0.35);
      background: rgba(0,224,255,0.06);
      color: #aeefff;
      font-size: 0.95rem;
    `;
    hint.textContent = "Heads up: this UI element isn't available yet on this screen — the tour will continue anyway.";
    card.appendChild(hint);
  }

  // Progress dots
  const progress = document.createElement("div");
  progress.style.cssText = `
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-bottom: 1.25rem;
  `;

  ONBOARDING_STEPS.forEach((_, i) => {
    const dot = document.createElement("div");
    dot.style.cssText = `
      width: ${i === stepIndex ? "32px" : "8px"};
      height: 8px;
      border-radius: 4px;
      background: ${i === stepIndex ? "#00e0ff" : "rgba(255, 255, 255, 0.3)"};
      transition: all 0.25s;
    `;
    progress.appendChild(dot);
  });
  card.appendChild(progress);

  // Buttons row
  const buttons = document.createElement("div");
  buttons.style.cssText = `display:flex; gap:1rem; justify-content:center; flex-wrap:wrap;`;

  // Skip button (only if not last step)
  if (stepIndex < ONBOARDING_STEPS.length - 1) {
    const skipBtn = document.createElement("button");
    skipBtn.textContent = "Skip Tour";
    skipBtn.style.cssText = `
      padding: 0.75rem 1.5rem;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: white;
      cursor: pointer;
      font-weight: 700;
      font-size: 1rem;
      transition: all 0.2s;
    `;
    skipBtn.onmouseover = () => (skipBtn.style.background = "rgba(255, 255, 255, 0.2)");
    skipBtn.onmouseout = () => (skipBtn.style.background = "rgba(255, 255, 255, 0.1)");
    skipBtn.onclick = () => {
      if (!state.active) return;
      finishOnboarding();
    };
    buttons.appendChild(skipBtn);
  }

  // Next/Finish button
  const nextBtn = document.createElement("button");
  nextBtn.textContent = stepIndex === ONBOARDING_STEPS.length - 1 ? "Get Started!" : "Next";
  nextBtn.style.cssText = `
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #00e0ff, #0080ff);
    border: none;
    border-radius: 8px;
    color: white;
    cursor: pointer;
    font-weight: 800;
    font-size: 1rem;
    box-shadow: 0 4px 12px rgba(0, 224, 255, 0.4);
    transition: all 0.2s;
  `;
  nextBtn.onmouseover = () => {
    nextBtn.style.transform = "translateY(-2px) scale(1.05)";
    nextBtn.style.boxShadow = "0 6px 20px rgba(0, 224, 255, 0.6)";
  };
  nextBtn.onmouseout = () => {
    nextBtn.style.transform = "translateY(0) scale(1)";
    nextBtn.style.boxShadow = "0 4px 12px rgba(0, 224, 255, 0.4)";
  };
  nextBtn.onclick = () => {
    if (!state.active) return;

    // If overlay disappeared for any reason, re-create it rather than throwing.
    ensureOverlay();

    if (stepIndex === ONBOARDING_STEPS.length - 1) {
      finishOnboarding();
      return;
    }

    showStep(stepIndex + 1);
  };
  buttons.appendChild(nextBtn);

  card.appendChild(buttons);
  overlay.appendChild(card);

  // Highlight target if it exists
  clearHighlight();
  if (step.target && targetExists) {
    highlightElement(step.target);
  }
}

function highlightElement(selector) {
  const element = document.querySelector(selector);
  if (!element) return;

  // If element is off-screen, try to bring it into view gently.
  try {
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  } catch {}

  const rect = element.getBoundingClientRect();

  const highlight = document.createElement("div");
  highlight.className = "onboarding-highlight";
  highlight.style.cssText = `
    position: fixed;
    top: ${Math.max(8, rect.top - 10)}px;
    left: ${Math.max(8, rect.left - 10)}px;
    width: ${Math.max(20, rect.width + 20)}px;
    height: ${Math.max(20, rect.height + 20)}px;
    border: 3px solid #00e0ff;
    border-radius: 12px;
    pointer-events: none;
    z-index: 10001;
    box-shadow: 0 0 20px rgba(0, 224, 255, 0.6);
    animation: pulse 2s infinite;
  `;

  document.body.appendChild(highlight);
  state.highlightEl = highlight;
}

// ---------------------------
// Public API
// ---------------------------
export function startOnboarding() {
  if (!shouldShowOnboarding()) return;

  // Prevent re-entrancy / double-starts
  if (state.active) return;
  if (state.startedThisSession) return;

  console.log("🎓 Starting onboarding walkthrough");

  state.active = true;
  state.startedThisSession = true;

  ensureOverlay();
  showStep(0);
}

// ---------------------------
// Auto-start on profile load (debounced + safe)
// ---------------------------
function onProfileLoaded() {
  // Debounce: clear any pending start timer.
  if (state.startTimer) clearTimeout(state.startTimer);

  state.startTimer = setTimeout(() => {
    if (shouldShowOnboarding()) startOnboarding();
  }, 750);
}

// Avoid registering multiple listeners if the module is loaded twice.
if (!window.__IE_ONBOARDING_LISTENER__) {
  window.__IE_ONBOARDING_LISTENER__ = true;
  window.addEventListener("profile-loaded", onProfileLoaded);

  // Allow Esc to skip tour (optional, but helpful)
  window.addEventListener("keydown", (e) => {
    if (!state.active) return;
    if (e.key === "Escape") finishOnboarding();
  });
}

// ---------------------------
// Toast + animations
// ---------------------------
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: ${
      type === "success" ? "linear-gradient(135deg, #00ff88, #00cc66)" : "linear-gradient(135deg, #00e0ff, #0080ff)"
    };
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10002;
    font-weight: 800;
    animation: slideIn 0.25s ease-out;
  `;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideOut 0.25s ease-in";
    setTimeout(() => toast.remove(), 250);
  }, 2600);
}

// Inject animations once
if (!document.getElementById("ie-onboarding-styles")) {
  const style = document.createElement("style");
  style.id = "ie-onboarding-styles";
  style.textContent = `
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%      { opacity: 0.7; transform: scale(1.05); }
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(100px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes slideOut {
      from { opacity: 1; transform: translateX(0); }
      to   { opacity: 0; transform: translateX(100px); }
    }
  `;
  document.head.appendChild(style);
}

console.log("✅ Onboarding system ready (hardened)");
