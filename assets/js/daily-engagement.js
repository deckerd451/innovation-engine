/**
 * ================================================================
 * DAILY ENGAGEMENT SYSTEM
 * ================================================================
 * Creates sticky user engagement through daily check-ins, quests,
 * XP tracking, streaks, and activity feeds.
 */

console.log("%c🎯 Daily Engagement Loading...", "color:#0f0; font-weight: bold; font-size: 16px");

const DailyEngagement = (function() {
  'use strict';

  // ============================================================
  // STATE
  // ============================================================

  const state = {
    initialized: false,
    supabase: null,
    currentUser: null,
    userStats: null,
    dailyQuests: [],
    activityFeed: [],
    streak: 0,
    level: 1,
    xp: 0,
    xpToNextLevel: 100
  };

  // ============================================================
  // XP REWARDS TABLE
  // ============================================================

  const XP_REWARDS = {
    // Daily actions
    DAILY_LOGIN: 10,
    VIEW_PROFILE: 2,
    SEND_CONNECTION: 10,
    ACCEPT_CONNECTION: 15,
    ENDORSE_SKILL: 5,
    RECEIVE_ENDORSEMENT: 10,
    SEND_MESSAGE: 3,

    // Project actions
    JOIN_PROJECT: 30,
    CREATE_PROJECT: 50,

    // Quest completion
    DAILY_QUEST: 25,
    WEEKLY_QUEST: 100,

    // Profile actions
    COMPLETE_PROFILE: 50,
    ADD_PHOTO: 25
  };

  // Level thresholds
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
    { level: 10, xp: 50000, title: "Founder" }
  ];

  // ============================================================
  // INITIALIZATION
  // ============================================================

  async function init() {
    if (state.initialized) return;

    try {
      state.supabase = window.supabase;
      if (!state.supabase) throw new Error('Supabase not available');

      // Get current user
      const { data: { user } } = await state.supabase.auth.getUser();
      if (!user) throw new Error('No user logged in');

      state.currentUser = user;

      // Load user stats
      await loadUserStats();

      // Check for daily check-in
      await checkDailyCheckIn();

      // Initialize UI components
      initXPDisplay();
      initStreakDisplay();

      state.initialized = true;
      console.log('✅ Daily engagement initialized');

    } catch (error) {
      console.error('Failed to initialize daily engagement:', error);
    }
  }

  // ============================================================
  // USER STATS & LEVEL SYSTEM
  // ============================================================

  async function loadUserStats() {
    const { data: profile } = await state.supabase
      .from('community')
      .select('*')
      .eq('user_id', state.currentUser.id)
      .single();

    if (!profile) return;

    // Initialize stats if they don't exist
    state.userStats = {
      xp: profile.xp || 0,
      level: profile.level || 1,
      streak: profile.login_streak || 0,
      last_login: profile.last_login || null,
      daily_quests_completed: profile.daily_quests_completed || [],
      total_connections: profile.connection_count || 0,
      total_endorsements_given: profile.endorsements_given || 0,
      total_endorsements_received: profile.endorsements_received || 0
    };

    state.xp = state.userStats.xp;
    state.level = state.userStats.level;
    state.streak = state.userStats.streak;

    // Calculate XP needed for next level
    const nextLevelData = LEVEL_THRESHOLDS.find(l => l.level === state.level + 1);
    state.xpToNextLevel = nextLevelData ? nextLevelData.xp : state.xp;
  }

  async function awardXP(amount, reason) {
    state.xp += amount;

    // Check for level up
    const newLevel = calculateLevel(state.xp);
    const didLevelUp = newLevel > state.level;

    if (didLevelUp) {
      state.level = newLevel;
      showLevelUpNotification(newLevel);
    }

    // Update database
    await state.supabase
      .from('community')
      .update({
        xp: state.xp,
        level: state.level,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', state.currentUser.id);

    // Update UI
    updateXPDisplay();

    // Show XP gain notification
    showXPNotification(amount, reason);

    return { didLevelUp, newLevel, totalXP: state.xp };
  }

  function calculateLevel(xp) {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (xp >= LEVEL_THRESHOLDS[i].xp) {
        return LEVEL_THRESHOLDS[i].level;
      }
    }
    return 1;
  }

  function getLevelTitle(level) {
    const data = LEVEL_THRESHOLDS.find(l => l.level === level);
    return data ? data.title : "Newcomer";
  }

  // ============================================================
  // DAILY CHECK-IN SYSTEM
  // ============================================================

  async function checkDailyCheckIn() {
    const lastLogin = state.userStats?.last_login;
    const today = new Date().toDateString();

    // If last login was today, skip check-in
    if (lastLogin && new Date(lastLogin).toDateString() === today) {
      console.log('✅ Already checked in today');
      return;
    }

    // Calculate streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    let newStreak = 1;
    if (lastLogin) {
      const lastLoginDate = new Date(lastLogin).toDateString();
      if (lastLoginDate === yesterdayStr) {
        // Continued streak
        newStreak = state.streak + 1;
      } else if (lastLoginDate === today) {
        // Already logged in today
        newStreak = state.streak;
      }
      // else: streak broken, reset to 1
    }

    state.streak = newStreak;

    // Award daily login XP
    await awardXP(XP_REWARDS.DAILY_LOGIN, 'Daily login');

    // Update last login and streak in database
    await state.supabase
      .from('community')
      .update({
        last_login: new Date().toISOString(),
        login_streak: newStreak
      })
      .eq('user_id', state.currentUser.id);

    // Reset daily quests
    await resetDailyQuests();

    // Show daily check-in modal
    showDailyCheckInModal();
  }

  // ============================================================
  // DAILY QUESTS SYSTEM
  // ============================================================

  async function resetDailyQuests() {
    state.dailyQuests = [
      {
        id: 'view_profiles',
        title: 'View 3 new profiles',
        description: 'Explore the network and discover new connections',
        icon: '👀',
        progress: 0,
        target: 3,
        xp: XP_REWARDS.DAILY_QUEST,
        completed: false
      },
      {
        id: 'send_connection',
        title: 'Send 1 connection request',
        description: 'Expand your professional network',
        icon: '🤝',
        progress: 0,
        target: 1,
        xp: XP_REWARDS.DAILY_QUEST,
        completed: false
      },
      {
        id: 'endorse_skill',
        title: 'Endorse 1 skill',
        description: 'Support your network by endorsing skills',
        icon: '⭐',
        progress: 0,
        target: 1,
        xp: XP_REWARDS.DAILY_QUEST,
        completed: false
      }
    ];
  }

  async function updateQuestProgress(questId, increment = 1) {
    const quest = state.dailyQuests.find(q => q.id === questId);
    if (!quest || quest.completed) return;

    quest.progress += increment;

    // Check if quest completed
    if (quest.progress >= quest.target) {
      quest.completed = true;
      await awardXP(quest.xp, `Quest: ${quest.title}`);
      showQuestCompleteNotification(quest);
    }

    // Update quest tracker UI
    updateQuestTrackerUI();
  }

  // ============================================================
  // UI COMPONENTS
  // ============================================================

  function initXPDisplay() {
    // Add XP counter to header
    const header = document.querySelector('.dashboard-header') || document.querySelector('header');
    if (!header) return;

    const xpDisplay = document.createElement('div');
    xpDisplay.id = 'xp-display';
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
    const nextLevelXP = LEVEL_THRESHOLDS.find(l => l.level === state.level + 1)?.xp || state.xp;
    const currentLevelXP = LEVEL_THRESHOLDS.find(l => l.level === state.level)?.xp || 0;
    const progressPercent = ((state.xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;

    xpDisplay.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.25rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-weight: bold; color: #00e0ff;">Level ${state.level}</span>
          <span style="color: #aaa; font-size: 0.85rem;">${levelTitle}</span>
        </div>
        <div style="width: 150px; height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden;">
          <div id="xp-progress-bar" style="width: ${progressPercent}%; height: 100%; background: linear-gradient(90deg, #00e0ff, #0080ff); transition: width 0.3s ease;"></div>
        </div>
        <div style="font-size: 0.75rem; color: #888;">
          <span id="xp-current">${state.xp}</span> / <span id="xp-next">${nextLevelXP}</span> XP
        </div>
      </div>
    `;

    header.appendChild(xpDisplay);
  }

  function initStreakDisplay() {
    // Add streak counter to header
    const header = document.querySelector('.dashboard-header') || document.querySelector('header');
    if (!header) return;

    const streakDisplay = document.createElement('div');
    streakDisplay.id = 'streak-display';
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

    header.appendChild(streakDisplay);
  }

  function updateXPDisplay() {
    const currentXPEl = document.getElementById('xp-current');
    const progressBar = document.getElementById('xp-progress-bar');

    if (currentXPEl) currentXPEl.textContent = state.xp;

    if (progressBar) {
      const nextLevelXP = LEVEL_THRESHOLDS.find(l => l.level === state.level + 1)?.xp || state.xp;
      const currentLevelXP = LEVEL_THRESHOLDS.find(l => l.level === state.level)?.xp || 0;
      const progressPercent = ((state.xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;
      progressBar.style.width = `${progressPercent}%`;
    }
  }

  function updateQuestTrackerUI() {
    const tracker = document.getElementById('quest-tracker');
    if (!tracker) return;

    tracker.innerHTML = state.dailyQuests.map(quest => `
      <div style="background: ${quest.completed ? 'rgba(0,255,136,0.1)' : 'rgba(0,224,255,0.05)'}; border: 1px solid ${quest.completed ? 'rgba(0,255,136,0.3)' : 'rgba(0,224,255,0.2)'}; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <span style="font-size: 2rem;">${quest.icon}</span>
          <div style="flex: 1;">
            <div style="font-weight: bold; color: ${quest.completed ? '#00ff88' : 'white'}; margin-bottom: 0.25rem;">
              ${quest.completed ? '✓' : ''} ${quest.title}
            </div>
            <div style="font-size: 0.85rem; color: #aaa; margin-bottom: 0.5rem;">
              ${quest.description}
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="flex: 1; height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden;">
                <div style="width: ${(quest.progress / quest.target) * 100}%; height: 100%; background: ${quest.completed ? '#00ff88' : '#00e0ff'}; transition: width 0.3s ease;"></div>
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
    `).join('');
  }

  // ============================================================
  // MODALS & NOTIFICATIONS
  // ============================================================

  function showDailyCheckInModal() {
    const modal = document.createElement('div');
    modal.id = 'daily-checkin-modal';
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

    const content = document.createElement('div');
    content.style.cssText = `
      background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
      border: 2px solid rgba(0,224,255,0.5);
      border-radius: 20px;
      padding: 2rem;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0,224,255,0.3);
    `;

    const levelTitle = getLevelTitle(state.level);

    content.innerHTML = `
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

      <button onclick="DailyEngagement.closeDailyCheckIn()" style="width: 100%; padding: 1rem; background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; border-radius: 12px; color: white; font-weight: bold; font-size: 1.1rem; cursor: pointer;">
        Let's Go! 🚀
      </button>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    // Initialize quest tracker
    updateQuestTrackerUI();
  }

  function closeDailyCheckIn() {
    const modal = document.getElementById('daily-checkin-modal');
    if (modal) modal.remove();
  }

  function showXPNotification(amount, reason) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: linear-gradient(135deg, #00e0ff, #0080ff);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 12px;
      font-weight: bold;
      z-index: 9999;
      box-shadow: 0 4px 20px rgba(0,224,255,0.4);
      animation: slideInRight 0.3s ease;
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

    const notification = document.createElement('div');
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
    const notification = document.createElement('div');
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
    alert(`🔥 ${state.streak} Day Streak!\n\nKeep logging in daily to maintain your streak.\n\nStreak Milestones:\n• 7 days: +50 XP bonus\n• 30 days: +200 XP bonus + Special Badge\n• 100 days: +1000 XP bonus + Premium Badge`);
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
    getState: () => ({ ...state })
  };
})();

// Expose globally
window.DailyEngagement = DailyEngagement;

// Auto-initialize when user logs in
document.addEventListener('DOMContentLoaded', () => {
  // Wait for auth to be ready
  setTimeout(() => {
    if (window.supabase) {
      window.supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          DailyEngagement.init();
        }
      });
    }
  }, 1000);
});

console.log('✅ Daily engagement ready');
