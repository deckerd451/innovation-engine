/* ==========================================================================
 * illuminatePathways.js
 * Step 2 — Narrated Sequential Pathway Illumination
 * CharlestonHacks Innovation Engine
 * ========================================================================== */

import {
  generateRecommendations,
  animatePathway,
  clearAllPathways,
} from "./pathway-animations.js";

import { getSynapseStats } from "./synapse/core.js";

/* --------------------------------------------------------------------------
 * STATE
 * -------------------------------------------------------------------------- */

let recommendations = [];
let currentIndex = 0;
let active = false;

/* --------------------------------------------------------------------------
 * DOM HELPERS
 * -------------------------------------------------------------------------- */

function ensurePanel() {
  let panel = document.getElementById("illuminate-panel");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "illuminate-panel";
    panel.innerHTML = `
      <div class="ip-card">
        <div class="ip-step"></div>
        <div class="ip-title"></div>
        <div class="ip-reason"></div>
        <div class="ip-actions">
          <button id="ip-connect" class="primary">Connect</button>
          <button id="ip-next" class="secondary">Next</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
  }

  return panel;
}

function qs(id) {
  return document.getElementById(id);
}

/* --------------------------------------------------------------------------
 * RENDER STEP
 * -------------------------------------------------------------------------- */

function renderStep() {
  if (!active) return;
  if (!recommendations.length) return;

  const rec = recommendations[currentIndex];
  if (!rec) return;

  const panel = ensurePanel();

  const stepEl = panel.querySelector(".ip-step");
  const titleEl = panel.querySelector(".ip-title");
  const reasonEl = panel.querySelector(".ip-reason");

  if (stepEl) {
    stepEl.textContent = `Connection ${currentIndex + 1} of ${recommendations.length}`;
  }

  if (titleEl) {
    titleEl.textContent = rec.name || "Suggested Connection";
  }

  if (reasonEl) {
    reasonEl.textContent =
      rec.reason ||
      "This connection is recommended based on shared skills and interests.";
  }

  const connectBtn = qs("ip-connect");
  const nextBtn = qs("ip-next");

  if (connectBtn) {
    connectBtn.onclick = () => {
      if (window.openNodePanel && rec.userId) {
        window.openNodePanel(rec.userId);
      }
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => advance();
  }
}

/* --------------------------------------------------------------------------
 * ADVANCE
 * -------------------------------------------------------------------------- */

function advance() {
  if (!active) return;

  currentIndex++;

  if (currentIndex >= recommendations.length) {
    shutdown();
    return;
  }

  const stats = getSynapseStats();
  const me = stats?.currentUserCommunityId;
  const rec = recommendations[currentIndex];

  if (me && rec?.userId) {
    clearAllPathways();
    animatePathway(me, rec.userId, { duration: 1500 });
  }

  renderStep();
}

/* --------------------------------------------------------------------------
 * PUBLIC API
 * -------------------------------------------------------------------------- */

export async function showAnimatedPathways(options = {}) {
  if (active) return;

  active = true;
  currentIndex = 0;

  const limit = options.limit || 5;

  recommendations = await generateRecommendations();

  if (!recommendations?.length) {
    console.warn("No recommendations available");
    active = false;
    return;
  }

  recommendations = recommendations.slice(0, limit);

  const stats = getSynapseStats();
  const me = stats?.currentUserCommunityId;

  if (!me) {
    console.warn("No current user community ID");
    active = false;
    return;
  }

  clearAllPathways();

  animatePathway(me, recommendations[0].userId, { duration: 1500 });

  renderStep();
}

export function shutdown() {
  active = false;
  recommendations = [];
  currentIndex = 0;
  clearAllPathways();

  const panel = document.getElementById("illuminate-panel");
  if (panel) panel.remove();
}

/* --------------------------------------------------------------------------
 * GLOBAL HOOK (used by dashboardPane)
 * -------------------------------------------------------------------------- */

window.showAnimatedPathways = showAnimatedPathways;
