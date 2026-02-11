/**
 * CharlestonHacks — Portal Card System Controller
 * - Portal hover tooltip
 * - Portal click behavior (sound + navigate)
 * - Center portal delegates to Matrix BTC modal (via callback)
 * - Discovery tracker + progress bar (localStorage)
 * - Splash + tutorial gating (localStorage)
 * - Random video animations (preserved conceptually, simplified)
 */

const STORAGE = {
  splashSeen: "chs_splash_seen_once",
  tutorialDone: "chs_tutorial_completed",
  discovered: "chs_discovered_portals",
};

function $(id) {
  return document.getElementById(id);
}

function onDOMReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}

function playAudio(el) {
  if (!el) return;
  try {
    el.currentTime = 0;
    el.play().catch(() => {});
  } catch {}
}

// ------------------------------------
// Splash + Tutorial
// ------------------------------------
export function initSplashTutorial({
  splashId = "splash-overlay",
  tutorialId = "tutorial-overlay",
  communityBtnId = "community-site-btn",
  publicBtnId = "public-site-btn",
  skipBtnId = "skip-tutorial",
  dontShowAgainId = "dont-show-again",
  onAfterTutorial = () => {},
  publicSiteUrl = "https://charlestonhacks.mailchimpsites.com/",
} = {}) {
  const splash = $(splashId);
  const tutorial = $(tutorialId);

  const cBtn = $(communityBtnId);
  const pBtn = $(publicBtnId);
  const skipBtn = $(skipBtnId);
  const box = $(dontShowAgainId);

  if (!splash || !tutorial) {
    console.warn("⚠️ Splash/tutorial DOM not found, skipping initSplashTutorial()");
    // still run discovery start if asked
    onAfterTutorial();
    return;
  }

  function startDiscovery() {
    onAfterTutorial();
  }

  function hideSplash(immediate = false) {
    splash.classList.add("fade-out");
    document.body.classList.remove("splash-active");
    setTimeout(() => {
      splash.style.display = "none";
      checkTutorial();
    }, immediate ? 0 : 600);
  }

  function checkTutorial() {
    if (localStorage.getItem(STORAGE.tutorialDone) !== "true") {
      setTimeout(() => tutorial.classList.add("active"), 300);
    } else {
      startDiscovery();
    }
  }

  function dismissSplash() {
    if (box?.checked) localStorage.setItem(STORAGE.splashSeen, "true");
    hideSplash();
  }

  function closeTutorial() {
    tutorial.classList.remove("active");
    localStorage.setItem(STORAGE.tutorialDone, "true");
    startDiscovery();
  }

  onDOMReady(() => {
    // skip tutorial button
    skipBtn?.addEventListener("click", closeTutorial);

    // if already seen splash once, skip it
    if (localStorage.getItem(STORAGE.splashSeen) === "true") {
      hideSplash(true);
      return;
    }

    splash.style.display = "flex";
    document.body.classList.add("splash-active");

    cBtn && (cBtn.onclick = (e) => (e.preventDefault(), dismissSplash()));
    pBtn &&
      (pBtn.onclick = (e) => {
        e.preventDefault();
        dismissSplash();
        window.location.href = publicSiteUrl;
      });
  });

  // ESC closes tutorial if open
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && tutorial?.classList.contains("active")) {
      closeTutorial();
    }
  });
}

// ------------------------------------
// Discovery tracker
// ------------------------------------
export function initDiscoveryTracker({
  portalSelector = ".clickable-area",
  trackerId = "discovery-tracker",
  countId = "portals-count",
  fillId = "progress-fill",
  totalPortals = 9,
  chimeSoundId = "chimeSound",
} = {}) {
  const tracker = $(trackerId);
  const countEl = $(countId);
  const fillEl = $(fillId);

  const areas = Array.from(document.querySelectorAll(portalSelector));
  if (!areas.length || !countEl || !fillEl) {
    console.warn("⚠️ Discovery tracker DOM not ready/missing, skipping initDiscoveryTracker()");
    return { markDiscovered: () => {}, getProgress: () => 0 };
  }

  const discovered = new Set(JSON.parse(localStorage.getItem(STORAGE.discovered) || "[]"));

  function updateProgress() {
    const count = discovered.size;
    const pct = Math.min(100, (count / totalPortals) * 100);

    countEl.textContent = String(count);
    fillEl.style.width = pct + "%";

    if (tracker && count === totalPortals) {
      // quick celebration glow
      tracker.style.borderColor = "var(--gold)";
      tracker.style.boxShadow = "0 0 30px var(--gold-glow)";
      setTimeout(() => {
        tracker.style.borderColor = "";
        tracker.style.boxShadow = "";
      }, 2000);
    }
  }

  function markDiscovered(portalId) {
    if (!portalId) return;
    if (discovered.has(portalId)) return;

    discovered.add(portalId);
    localStorage.setItem(STORAGE.discovered, JSON.stringify([...discovered]));
    updateProgress();

    // chime
    playAudio($(chimeSoundId));
  }

  // apply already-discovered
  for (const area of areas) {
    const id = area.dataset.portal;
    if (discovered.has(id)) area.classList.add("discovered");
  }

  // click -> discover (does not handle navigation; that’s elsewhere)
  for (const area of areas) {
    area.addEventListener("click", () => {
      const id = area.dataset.portal;
      markDiscovered(id);
      area.classList.add("discovered");
    });
  }

  updateProgress();

  // optional visibility kickoff like your old code
  setTimeout(() => {
    $(trackerId)?.classList.add("visible");
    document.querySelector(".media-container")?.classList.add("idle");
  }, 500);

  // expose for debugging
  window.charlestonHacks = window.charlestonHacks || {};
  window.charlestonHacks.markDiscovered = markDiscovered;
  window.charlestonHacks.getProgress = () => discovered.size;

  return { markDiscovered, getProgress: () => discovered.size };
}

// ------------------------------------
// Portal hover tooltip + click routing
// ------------------------------------
export function initPortalInteractions({
  portalSelector = ".clickable-area",
  infoLineId = "infoLine",
  infoTextId = "infoText",
  // sounds are referenced in HTML as data-sound="cardflip" etc.
  soundMap = {
    cardflip: "cardflipSound",
    chime: "chimeSound",
    keys: "keysSound",
  },
  onOpenCenterPortal = null, // function called when data-portal="center"
  navigateDelayMs = 200,
} = {}) {
  const infoLine = $(infoLineId);
  const infoText = $(infoTextId);
  const areas = Array.from(document.querySelectorAll(portalSelector));

  if (!areas.length) {
    console.warn("⚠️ No clickable areas found for portal interactions.");
    return;
  }

  function showInfo(area) {
    if (!infoLine || !infoText) return;
    infoText.textContent = area.dataset.info || "";
    infoLine.classList.add("visible");
  }

  function hideInfo() {
    infoLine?.classList.remove("visible");
  }

  for (const area of areas) {
    area.addEventListener("mouseenter", () => showInfo(area));
    area.addEventListener("mouseleave", hideInfo);

    // accessibility
    area.setAttribute("tabindex", "0");
    area.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        area.click();
      }
    });

    area.addEventListener("click", (e) => {
      e.preventDefault();

      const portalId = area.dataset.portal;

      // sound
      const soundKey = area.dataset.sound; // e.g. "cardflip"
      const soundId = soundMap[soundKey] || (soundKey ? soundKey + "Sound" : null);
      if (soundId) playAudio($(soundId));

      // center portal = BTC Matrix modal
      if (portalId === "center") {
        if (typeof onOpenCenterPortal === "function") onOpenCenterPortal();
        return;
      }

      // normal navigation
      const url = area.dataset.url;
      if (url && url !== "#") {
        setTimeout(() => {
          window.location.href = url;
        }, navigateDelayMs);
      }
    });
  }
}

// ------------------------------------
// Random card/video animations (kept lightweight)
// ------------------------------------
function setupRandomVideoAnimations(CONFIG) {
  const missionImage = $("missionImage");
  const missionVideo = $("missionVideo");
  const cardFrame = $("cardFrame");
  if (!missionImage || !missionVideo || !cardFrame) return;

  let userHasInteracted = false;
  let videoPlaying = false;
  let timer = null;

  const cardImages = Array.isArray(CONFIG?.cardImages) ? CONFIG.cardImages : [];
  const videos = Array.isArray(CONFIG?.videos) ? CONFIG.videos : [];

  const markInteraction = () => {
    userHasInteracted = true;
    document.removeEventListener("click", markInteraction);
    document.removeEventListener("keydown", markInteraction);
    document.removeEventListener("touchstart", markInteraction);
  };

  document.addEventListener("click", markInteraction, { once: true });
  document.addEventListener("keydown", markInteraction, { once: true });
  document.addEventListener("touchstart", markInteraction, { once: true });

  function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function scheduleNext() {
    if (timer) clearTimeout(timer);
    const interval = 8000 + Math.random() * 7000;
    timer = setTimeout(playRandom, interval);
  }

  async function playRandom() {
    if (!userHasInteracted) return scheduleNext();
    if (videoPlaying) return scheduleNext();
    if (!videos.length) return scheduleNext();

    videoPlaying = true;

    const src = getRandom(videos);
    missionVideo.src = src;
    missionVideo.style.display = "block";
    missionImage.style.display = "none";

    try {
      await missionVideo.play();
    } catch {
      // autoplay blocked — just bail gracefully
      missionVideo.pause();
    }

    // stop video after a short burst, revert to image
    setTimeout(() => {
      missionVideo.pause();
      missionVideo.currentTime = 0;
      missionVideo.style.display = "none";
      missionImage.style.display = "block";

      // rotate image
      if (cardImages.length) {
        missionImage.src = getRandom(cardImages);
      }

      videoPlaying = false;
      scheduleNext();
    }, 2200);
  }

  // allow manual click
  missionImage.addEventListener("click", () => {
    if (videoPlaying) return;
    playRandom();
  });

  scheduleNext();
}

// ------------------------------------
// Main initializer used by index.html
// ------------------------------------
export function initCardFlip(CONFIG, { openBitcoinTracker } = {}) {
  // 1) random animations
  setupRandomVideoAnimations(CONFIG);

  // 2) discovery tracker
  initDiscoveryTracker();

  // 3) portal hover/click interactions
  initPortalInteractions({
    onOpenCenterPortal: openBitcoinTracker || null,
  });

  console.log("✅ Portal system initialized (modular)");
}
