/**
 * ================================================================
 * DAILY ENGAGEMENT SYSTEM (2026 — idempotent + auth-v4 safe)
 * ================================================================
 * Sticky engagement: daily check-ins, quests, XP, streaks.
 *
 * Guarantees (updated):
 * - init() is single-flight (concurrent calls reuse same promise)
 * - Listeners are bound once
 * - No duplicate init from getUser + auth events + profile-loaded
 */

console.log("%c🎯 Daily Engagement Loading...", "color:#0f0; font-weight: bold; font-size: 16px");

const DailyEngagement = (function () {
  "use strict";

  // ============================================================
  // STATE
  // ============================================================

  const state = {
    initialized: false,
    initializing: false,
    initError: null,

    supabase: null,
    currentUser: null,
    userStats: null,

    dailyQuests: [],
    activityFeed: [],
    streak: 0,
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
  };

  // Single-flight promise for init
  let initPromise = null;

  // Listener binding guard
  let listenersBound = false;

  // ============================================================
  // XP REWARDS TABLE
  // ============================================================

  const XP_REWARDS = {
    DAILY_LOGIN: 10,
    VIEW_PROFILE: 2,
    SEND_CONNECTION: 10,
    ACCEPT_CONNECTION: 15,
    ENDORSE_SKILL: 5,
    RECEIVE_ENDORSEMENT: 10,
    SEND_MESSAGE: 3,
    JOIN_PROJECT: 30,
    CREATE_PROJECT: 50,
    DAILY_QUEST: 25,
    WEEKLY_QUEST: 100,
    COMPLETE_PROFILE: 50,
    ADD_PHOTO: 25,
  };

  const LEVEL_THRESHOLDS = [
    { level: 1, xp: 0, title: "Newcomer" },
    { level: 2, xp: 100, title: "Explorer" },
    { level: 3, xp: 250, title: "Connector" },
    { level: 4, xp: 500, title: "Collaborator" },
    { level: 5, xp: 1000, title: "Innovator" },
    { level: 6, xp: 2000, title: "Leader" },
    { level: 7, xp: 5000, title: "Visionary" },
    { level: 8, xp: 10000, title: "Pioneer" },
    { level: 9, xp: 25000, title: "Legend" },
    { level: 10, xp: 50000, title: "Founder" },
  ];

  // ============================================================
  // INIT / BOOTSTRAP
  // ============================================================

  async function ensureSupabase(maxTries = 30, delayMs = 100) {
    for (let i = 0; i < maxTries; i++) {
      if (window.supabase) return window.supabase;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  }

  async function init(options = {}) {
    // Hard idempotency: if already initialized, return quickly.
    if (state.initialized) {
      console.log("🎯 Daily Engagement: Already initialized, skipping");
      return state;
    }

    // Single-flight: if init is already running, return same promise.
    if (initPromise) return initPromise;

    initPromise = (async () => {
      state.initializing = true;
      state.initError = null;

      // IMPORTANT: mark initialized early to prevent races
      // (If we fail, we’ll reset.)
      state.initialized = true;

      try {
        state.supabase = state.supabase || window.supabase;
        if (!state.supabase) {
          state.supabase = await ensureSupabase();
        }
        if (!state.supabase) throw new Error("Supabase not available");

        // Get current user (fast + accurate)
        const { data: { user }, error: userError } = await state.supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) throw new Error("No user logged in");

        state.currentUser = user;
        console.log("🎯 Daily Engagement: Loading stats for user:", user.email);

        await loadUserStats();
        await checkDailyCheckIn();

        initXPDisplay();
        initStreakDisplay();

        console.log("✅ Daily engagement initialized");
        return state;
      } catch (error) {
        console.error("❌ Failed to initialize daily engagement:", error);

        // Reset so it can retry later
        state.initialized = false;
        state.initError = error?.message || String(error);

        throw error;
      } finally {
        state.initializing = false;
        initPromise = null; // allow retries if initialization failed
      }
    })();

    return initPromise;
  }

  // ============================================================
  // USER STATS & LEVEL SYSTEM
  // ============================================================

  async function loadUserStats() {
    const { data: profile, error } = await state.supabase
      .from("community")
      .select("*")
      .eq("user_id", state.currentUser.id)
      .single();

    if (error) {
      console.error("❌ Error loading user stats:", error);
      throw error;
    }
    if (!profile) {
      console.warn("⚠️ No profile found for user:", state.currentUser.id);
      return;
    }

    console.log("✅ Loaded profile:", profile.name);

    state.userStats = {
      xp: profile.xp || 0,
      level: profile.level || 1,
      streak: profile.login_streak || 0,
      last_login: profile.last_login || null,
      daily_quests_completed: profile.daily_quests_completed || [],
      total_connections: profile.connection_count || 0,
      total_endorsements_given: profile.endorsements_given || 0,
      total_endorsements_received: profile.endorsements_received || 0,
    };

    state.xp = state.userStats.xp;
    state.level = state.userStats.level;
    state.streak = state.userStats.streak;

    const nextLevelData = LEVEL_THRESHOLDS.find((l) => l.level === state.level + 1);
    state.xpToNextLevel = nextLevelData ? nextLevelData.xp : state.xp;
  }

  async function awardXP(amount, reason) {
    if (!state.userStats) {
      console.warn("⚠️ Cannot award XP: user stats not loaded");
      return { didLevelUp: false, newLevel: state.level, totalXP: state.xp };
    }

    state.xp += amount;

    const newLevel = calculateLevel(state.xp);
    const didLevelUp = newLevel > state.level;

    if (didLevelUp) {
      state.level = newLevel;
      showLevelUpNotification(newLevel);
    }

    try {
      const { error } = await state.supabase
        .from("community")
        .update({
          xp: state.xp,
          level: state.level,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", state.currentUser.id);

      if (error) console.error("❌ Error updating XP in database:", error);
    } catch (e) {
      console.error("❌ Failed to update XP:", e);
    }

    updateXPDisplay();
    showXPNotification(amount, reason);

    return { didLevelUp, newLevel: state.level, totalXP: state.xp };
  }

  function calculateLevel(xp) {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (xp >= LEVEL_THRESHOLDS[i].xp) return LEVEL_THRESHOLDS[i].level;
    }
    return 1;
  }

  function getLevelTitle(level) {
    const data = LEVEL_THRESHOLDS.find((l) => l.level === level);
    return data ? data.title : "Newcomer";
  }

  // ============================================================
  // DAILY CHECK-IN SYSTEM
  // ============================================================

  async function checkDailyCheckIn() {
    const lastLogin = state.userStats?.last_login;
    const today = new Date().toDateString();

    if (lastLogin && new Date(lastLogin).toDateString() === today) {
      console.log("✅ Already checked in today");
      return;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    let newStreak = 1;
    if (lastLogin) {
      const lastLoginDate = new Date(lastLogin).toDateString();
      if (lastLoginDate === yesterdayStr) newStreak = state.streak + 1;
      else if (lastLoginDate === today) newStreak = state.streak;
    }

    state.streak = newStreak;

    await awardXP(XP_REWARDS.DAILY_LOGIN, "Daily login");

    try {
      const { error } = await state.supabase
        .from("community")
        .update({
          last_login: new Date().toISOString(),
          login_streak: newStreak,
        })
        .eq("user_id", state.currentUser.id);

      if (error) console.error("❌ Error updating streak in database:", error);
    } catch (e) {
      console.error("❌ Failed to update streak:", e);
    }

    await resetDailyQuests();
    showDailyCheckInModal();
  }

  // ============================================================
  // DAILY QUESTS SYSTEM
  // ============================================================

  async function resetDailyQuests() {
    state.dailyQuests = [
      {
        id: "view_profiles",
        title: "View 3 new profiles",
        description: "Explore the network and discover new connections",
        icon: "👀",
        progress: 0,
        target: 3,
        xp: XP_REWARDS.DAILY_QUEST,
        completed: false,
      },
      {
        id: "send_connection",
        title: "Send 1 connection request",
        description: "Expand your professional network",
        icon: "🤝",
        progress: 0,
        target: 1,
        xp: XP_REWARDS.DAILY_QUEST,
        completed: false,
      },
      {
        id: "endorse_skill",
        title: "Endorse 1 skill",
        description: "Support your network by endorsing skills",
        icon: "⭐",
        progress: 0,
        target: 1,
        xp: XP_REWARDS.DAILY_QUEST,
        completed: false,
      },
    ];
  }

  async function updateQuestProgress(questId, increment = 1) {
    const quest = state.dailyQuests.find((q) => q.id === questId);
    if (!quest || quest.completed) return;

    quest.progress += increment;

    if (quest.progress >= quest.target) {
      quest.completed = true;
      await awardXP(quest.xp, `Quest: ${quest.title}`);
      showQuestCompleteNotification(quest);
    }

    updateQuestTrackerUI();
  }

  // ============================================================
  // UI COMPONENTS
  // ============================================================

  function initXPDisplay() {
    const container = document.getElementById("engagement-displays");
    if (!container) {
      console.warn("Engagement displays container not found");
      return;
    }

    let xpDisplay = document.getElementById("xp-display");
    if (xpDisplay) {
      updateXPDisplay();
      return;
    }

    xpDisplay = document.createElement("div");
    xpDisplay.id = "xp-display";
    xpDisplay.style.cssText = `
      display: flex;
      align-items: center;
      gap: 1rem;
      background: linear-gradient(135deg, rgba(0,224,255,0.1), rgba(0,128,255,0.1));
      padding: 0.5rem 1rem;
      border-radius: 12px;
      border: 1px solid rgba(0,224,255,0.3);
    `;

    const levelTitle = getLevelTitle(state.level);
    const nextLevelXP = LEVEL_THRESHOLDS.find((l) => l.level === state.level + 1)?.xp || state.xp;
    const currentLevelXP = LEVEL_THRESHOLDS.find((l) => l.level === state.level)?.xp || 0;
    const progressPercent =
      nextLevelXP === currentLevelXP
        ? 100
        : ((state.xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;

    xpDisplay.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.25rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-weight: bold; color: #00e0ff;">Level ${state.level}</span>
          <span style="color: #aaa; font-size: 0.85rem;">${levelTitle}</span>
        </div>
        <div style="width: 150px; height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden;">
          <div id="xp-progress-bar" style="width: ${Math.max(0, Math.min(100, progressPercent))}%; height: 100%; background: linear-gradient(90deg, #00e0ff, #0080ff); transition: width 0.3s ease;"></div>
        </div>
        <div style="font-size: 0.75rem; color: #888;">
          <span id="xp-current">${state.xp}</span> / <span id="xp-next">${nextLevelXP}</span> XP
        </div>
      </div>
    `;

    container.appendChild(xpDisplay);
  }

  function initStreakDisplay() {
    const container = document.getElementById("engagement-displays");
    if (!container) {
      console.warn("Engagement displays container not found");
      return;
    }

    let streakDisplay = document.getElementById("streak-display");
    if (streakDisplay) {
      updateStreakDisplay();
      return;
    }

    streakDisplay = document.createElement("div");
    streakDisplay.id = "streak-display";
    streakDisplay.style.cssText = `
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: linear-gradient(135deg, rgba(255,107,107,0.1), rgba(255,140,140,0.1));
      padding: 0.5rem 1rem;
      border-radius: 12px;
      border: 1px solid rgba(255,107,107,0.3);
      cursor: pointer;
    `;

    streakDisplay.innerHTML = `
      <span style="font-size: 1.5rem;">🔥</span>
      <div>
        <div style="font-weight: bold; color: #ff6b6b;">${state.streak} Day Streak</div>
        <div style="font-size: 0.75rem; color: #aaa;">Keep it going!</div>
      </div>
    `;

    streakDisplay.onclick = showStreakDetails;

    container.appendChild(streakDisplay);
  }

  function updateStreakDisplay() {
    const streakDisplay = document.getElementById("streak-display");
    if (!streakDisplay) return;

    const streakText = streakDisplay.querySelector("div > div");
    if (streakText) streakText.textContent = `${state.streak} Day Streak`;
  }

  function updateXPDisplay() {
    const currentXPEl = document.getElementById("xp-current");
    const progressBar = document.getElementById("xp-progress-bar");
    const nextXPEl = document.getElementById("xp-next");

    if (currentXPEl) currentXPEl.textContent = state.xp;

    const nextLevelXP = LEVEL_THRESHOLDS.find((l) => l.level === state.level + 1)?.xp || state.xp;
    const currentLevelXP = LEVEL_THRESHOLDS.find((l) => l.level === state.level)?.xp || 0;
    const progressPercent =
      nextLevelXP === currentLevelXP
        ? 100
        : ((state.xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;

    if (nextXPEl) nextXPEl.textContent = nextLevelXP;
    if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, progressPercent))}%`;
  }

  function updateQuestTrackerUI() {
    const tracker = document.getElementById("quest-tracker");
    if (!tracker) return;

    tracker.innerHTML = state.dailyQuests
      .map(
        (quest) => `
      <div style="background: ${
        quest.completed ? "rgba(0,255,136,0.1)" : "rgba(0,224,255,0.05)"
      }; border: 1px solid ${
          quest.completed ? "rgba(0,255,136,0.3)" : "rgba(0,224,255,0.2)"
        }; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <span style="font-size: 2rem;">${quest.icon}</span>
          <div style="flex: 1;">
            <div style="font-weight: bold; color: ${
              quest.completed ? "#00ff88" : "white"
            }; margin-bottom: 0.25rem;">
              ${quest.completed ? "✓" : ""} ${quest.title}
            </div>
            <div style="font-size: 0.85rem; color: #aaa; margin-bottom: 0.5rem;">
              ${quest.description}
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="flex: 1; height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden;">
                <div style="width: ${Math.max(
                  0,
                  Math.min(100, (quest.progress / quest.target) * 100)
                )}%; height: 100%; background: ${
          quest.completed ? "#00ff88" : "#00e0ff"
        }; transition: width 0.3s ease;"></div>
              </div>
              <span style="font-size: 0.85rem; color: #888;">${quest.progress}/${quest.target}</span>
            </div>
          </div>
          <div style="text-align: center;">
            <div style="font-weight: bold; color: #00e0ff;">+${quest.xp}</div>
            <div style="font-size: 0.75rem; color: #888;">XP</div>
          </div>
        </div>
      </div>
    `
      )
      .join("");
  }

  // ============================================================
  // MODALS & NOTIFICATIONS (unchanged)
  // ============================================================

  function showDailyCheckInModal() {
    const modal = document.createElement("div");
    modal.id = "daily-checkin-modal";
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(0,0,0,0.85);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease;
    `;

    const content = document.createElement("div");
    content.style.cssText = `
      background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
      border: 2px solid rgba(0,224,255,0.5);
      border-radius: 20px;
      padding: 2rem;
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,224,255,0.3);
      position: relative;
    `;

    const levelTitle = getLevelTitle(state.level);

    content.innerHTML = `
      <!-- Close button at top right -->
      <button onclick="DailyEngagement.closeDailyCheckIn()" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; z-index: 1;">
        <i class="fas fa-times"></i>
      </button>

      <div style="text-align: center; margin-bottom: 2rem;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🌅</div>
        <h2 style="color: #00e0ff; margin-bottom: 0.5rem;">Welcome Back!</h2>
        <p style="color: #aaa; font-size: 1.1rem;">Day ${state.streak} of your journey</p>
      </div>

      <div style="background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.3); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">🔥</div>
        <div style="font-size: 2rem; font-weight: bold; color: #ff6b6b; margin-bottom: 0.25rem;">${state.streak} Day Streak!</div>
        <div style="color: #aaa;">Keep logging in to maintain your streak</div>
      </div>

      <div style="background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
          <div style="text-align: center;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #00e0ff;">Level ${state.level}</div>
            <div style="font-size: 0.85rem; color: #aaa;">${levelTitle}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #00e0ff;">+${XP_REWARDS.DAILY_LOGIN} XP</div>
            <div style="font-size: 0.85rem; color: #aaa;">Daily Bonus</div>
          </div>
        </div>
      </div>

      <div style="margin-bottom: 1.5rem;">
        <h3 style="color: #00e0ff; margin-bottom: 1rem; text-align: center;">Today's Quests</h3>
        <div id="quest-tracker"></div>
      </div>

      <button onclick="DailyEngagement.closeDailyCheckIn()" style="width: 100%; padding: 1rem; background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; border-radius: 12px; color: white; font-weight: bold; font-size: 1.1rem; cursor: pointer; margin-top: 0.5rem;">
        Let's Go! 🚀
      </button>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);
    updateQuestTrackerUI();

    // Mobile responsiveness: Adjust padding for smaller screens
    const mediaQuery = window.matchMedia('(max-width: 640px)');
    if (mediaQuery.matches) {
      content.style.padding = '1.5rem 1rem';
      content.style.width = '95%';
    }
  }

  function closeDailyCheckIn() {
    const modal = document.getElementById("daily-checkin-modal");
    if (modal) modal.remove();
  }

  function showXPNotification(amount, reason) {
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      bottom: 2rem;
      left: 2rem;
      background: linear-gradient(135deg, #00e0ff, #0080ff);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 12px;
      font-weight: bold;
      z-index: 1999;
      box-shadow: 0 4px 20px rgba(0,224,255,0.4);
      animation: slideInLeft 0.3s ease;
      max-width: 300px;
    `;

    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span style="font-size: 1.5rem;">⭐</span>
        <div>
          <div>+${amount} XP</div>
          <div style="font-size: 0.85rem; opacity: 0.9;">${reason}</div>
        </div>
      </div>
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  function showLevelUpNotification(newLevel) {
    const levelTitle = getLevelTitle(newLevel);

    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 10001;
      background: rgba(0,0,0,0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease;
    `;

    notification.innerHTML = `
      <div style="text-align: center; padding: 3rem;">
        <div style="font-size: 6rem; margin-bottom: 1rem; animation: bounce 0.6s ease;">🎉</div>
        <h1 style="font-size: 3rem; color: #00e0ff; margin-bottom: 0.5rem; text-shadow: 0 0 20px rgba(0,224,255,0.5);">Level Up!</h1>
        <div style="font-size: 2rem; color: white; margin-bottom: 0.5rem;">Level ${newLevel}</div>
        <div style="font-size: 1.5rem; color: #aaa;">${levelTitle}</div>
      </div>
    `;

    notification.onclick = () => notification.remove();
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 4000);
  }

  function showQuestCompleteNotification(quest) {
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: linear-gradient(135deg, #00ff88, #00cc66);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 12px;
      font-weight: bold;
      z-index: 9999;
      box-shadow: 0 4px 20px rgba(0,255,136,0.4);
      animation: slideInRight 0.3s ease;
    `;

    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span style="font-size: 1.5rem;">${quest.icon}</span>
        <div>
          <div>Quest Complete!</div>
          <div style="font-size: 0.85rem; opacity: 0.9;">${quest.title} - +${quest.xp} XP</div>
        </div>
      </div>
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }

  function showStreakDetails() {
    alert(
      `🔥 ${state.streak} Day Streak!\n\nKeep logging in daily to maintain your streak.\n\nStreak Milestones:\n• 7 days: +50 XP bonus\n• 30 days: +200 XP bonus + Special Badge\n• 100 days: +1000 XP bonus + Premium Badge`
    );
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  return {
    init,
    awardXP,
    updateQuestProgress,
    closeDailyCheckIn,
    XP_REWARDS,
    getState: () => ({ ...state }),
  };
})();

// Expose globally
window.DailyEngagement = DailyEngagement;

// ============================================================
// BOOTSTRAP (auth-v4 safe; bind once; no triple triggers)
// ============================================================

(function bindDailyEngagementOnce() {
  if (window.__CH_DAILY_ENGAGEMENT_BOUND__) return;
  window.__CH_DAILY_ENGAGEMENT_BOUND__ = true;

  const tryInit = async (why) => {
    const s = DailyEngagement.getState();
    if (s.initialized || s.initializing) {
      console.log("🎯 Daily Engagement: Already initialized, skipping");
      return;
    }
    console.log(`🎯 Daily Engagement: Initializing (${why})`);
    try {
      await DailyEngagement.init();
    } catch (_) {
      // errors already logged inside init()
    }
  };

  document.addEventListener(
    "DOMContentLoaded",
    async () => {
      // Prefer the canonical signal: profile-loaded (from auth.js)
      window.addEventListener("profile-loaded", () => tryInit("profile-loaded"), {
        once: true,
      });

      // Fallback: if profile-loaded never fires but session exists, init anyway
      const sb = await (async () => {
        for (let i = 0; i < 30; i++) {
          if (window.supabase) return window.supabase;
          await new Promise((r) => setTimeout(r, 100));
        }
        return null;
      })();

      if (!sb) return;

      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        // Let profile-loaded win if it arrives quickly; otherwise init after a short delay
        setTimeout(() => tryInit("getUser-fallback"), 400);
      }
    },
    { once: true }
  );
})();

console.log("✅ Daily engagement ready");
