/* ============================================================
   CharlestonHacks — Master Interaction Controller (2025)
   Handles:
   - Card click → animation → open BBS drawer automatically
   - Button hotspots (sound + redirect + hover info)
   - Countdown + BTC price
   - BBS drawer toggling
   - Calendar modal open/close
   ============================================================ */

import { CONFIG } from "./config.js";
import { initCardFlip } from "./cardFlip.js";
import { startBTCPriceTracker } from "./btc.js";

/* -----------------------------------------------------------
   0) GLOBAL ELEMENTS
----------------------------------------------------------- */
const card = document.getElementById("missionImage");
const video = document.getElementById("missionVideo");
const frame = document.getElementById("cardFrame");
const bbsContainer = document.getElementById("bbs-container");
const bbsOnline = document.getElementById("bbs-online");
const openCalendar = document.getElementById("open-calendar");
const eventsOverlay = document.getElementById("events-overlay");
const eventsClose = document.getElementById("close-overlay");

/* Drawer State */
let bbsOpen = false;

/* CSS-driven drawer behavior */
function openBBS() {
  if (bbsOpen) return;
  bbsContainer.style.maxHeight = "400px";
  bbsOnline.style.maxHeight = "200px";
  bbsContainer.style.opacity = "1";
  bbsOnline.style.opacity = "1";
  bbsOpen = true;
}

function closeBBS() {
  bbsContainer.style.maxHeight = "0px";
  bbsOnline.style.maxHeight = "0px";
  bbsContainer.style.opacity = "0";
  bbsOnline.style.opacity = "0";
  bbsOpen = false;
}

/* Start closed */
closeBBS();

/* -----------------------------------------------------------
   1) CARD CLICK → PLAY ANIMATION → OPEN BBS
----------------------------------------------------------- */

function setupCardInteraction() {
  if (!card) return;

  card.style.cursor = "pointer";

  card.addEventListener("click", () => {
    const sound = document.getElementById("cardflipSound");
    sound?.play();

    // Play animation
    card.classList.add("card-animate");

    // Remove class after animation ends
    setTimeout(() => {
      card.classList.remove("card-animate");
      openBBS(); // Auto-open BBS drawer
    }, 900);
  });
}

/* -----------------------------------------------------------
   2) HOTSPOT BUTTONS (sound + info hover + navigation)
----------------------------------------------------------- */

function setupHotspots() {
  const buttons = document.querySelectorAll(".clickable-area");
  const infoLine = document.getElementById("infoLine");
  const infoText = document.getElementById("infoText");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const sound = document.getElementById(btn.dataset.sound + "Sound");
      sound?.play();

      const url = btn.dataset.url;
      if (url) setTimeout(() => window.location.href = url, 350);
    });

    btn.addEventListener("mouseover", () => {
      infoLine.style.opacity = "1";
      infoText.textContent = btn.dataset.info || "";
    });

    btn.addEventListener("mouseout", () => {
      infoLine.style.opacity = "0";
      infoText.textContent = "";
    });
  });
}

/* -----------------------------------------------------------
   3) CALENDAR MODAL
----------------------------------------------------------- */

function setupCalendarModal() {
  if (!openCalendar || !eventsOverlay) return;

  openCalendar.addEventListener("click", () => {
    eventsOverlay.classList.add("active");
  });

  eventsClose.addEventListener("click", () => {
    eventsOverlay.classList.remove("active");
  });

  eventsOverlay.addEventListener("click", (e) => {
    const modal = document.querySelector(".events-modal");
    if (modal && !modal.contains(e.target)) {
      eventsOverlay.classList.remove("active");
    }
  });
}

/* -----------------------------------------------------------
   4) COUNTDOWN + BTC PRICE
----------------------------------------------------------- */

function setupCounters() {
  startBTCPriceTracker("btcPrice");
}

/* -----------------------------------------------------------
   5) AUTO-INIT
----------------------------------------------------------- */

window.addEventListener("DOMContentLoaded", () => {
  CONFIG.sounds = {
    cardflip: document.getElementById("cardflipSound"),
    chime: document.getElementById("chimeSound"),
    keys: document.getElementById("keysSound"),
  };

  initCardFlip(CONFIG);
  setupCardInteraction();
  setupHotspots();
  setupCalendarModal();
  setupCounters();
});

