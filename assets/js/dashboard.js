/*
 * Dashboard Module (UPDATED)
 * File: assets/js/dashboard.js
 *
 * Works with the new single-page “Innovation Engine” layout:
 * - Initializes on `profile-loaded`
 * - Updates bottom stats bar counters (if present)
 * - Optionally renders EcosystemConnector dashboard into #dashboard-container (if present)
 */

(() => {
  "use strict";

  let isInitialized = false;
  let updateInterval = null;

  let currentProfile = null; // community row from your profile system

  // ---------------------------------------------
  // Small utilities
  // ---------------------------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitForSupabase(timeoutMs = 8000) {
    const start = Date.now();
    while (!window.supabase) {
      if (Date.now() - start > timeoutMs) return null;
      await sleep(50);
    }
    return window.supabase;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value ?? 0);
  }

  async function countExact(queryBuilder) {
    // Use head:true so we only get the count without fetching rows
    const { count, error } = await queryBuilder.select("id", { count: "exact", head: true });
    if (error) throw error;
    return count ?? 0;
  }

  // ---------------------------------------------
  // Core: render dashboard + stats
  // ---------------------------------------------
  async function renderDashboard() {
    // 1) If you still have a dashboard container + EcosystemConnector renderer, keep using it
    const container = document.getElementById("dashboard-container");
    if (container && window.EcosystemConnector?.renderDashboard) {
      try {
        window.EcosystemConnector.renderDashboard("dashboard-container");
      } catch (err) {
        console.error("Dashboard render failed:", err);
        container.innerHTML = `
          <div class="empty-state">
            <p>Failed to load dashboard. Please refresh the page.</p>
          </div>
        `;
      }
    }

    // 2) Always update the bottom stats bar if those elements exist
    await renderBottomStats();
  }

  async function renderBottomStats() {
    try {
      const supabase = await waitForSupabase();
      if (!supabase) return;

      // If your profile system dispatches `profile-loaded` with `detail.profile`,
      // we can use it (preferred). Otherwise attempt to infer from auth user.
      let profile = currentProfile;

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) return;

      if (!profile?.id) {
        const { data: prof, error: profErr } = await supabase
          .from("community")
          .select("id, user_id")
          .eq("user_id", user.id)
          .single();
        if (profErr) throw profErr;
        profile = prof;
        currentProfile = prof;
      }

      // ---- counts (safe even if some tables don’t exist; we catch errors) ----
      // Unread messages: assumes messages.read boolean + messages.sender_id is community.id
      let unread = 0;
      try {
        unread = await countExact(
          supabase
            .from("messages")
            .select("id", { count: "exact", head: true }) // overwritten by countExact, but harmless
            .eq("read", false)
            .neq("sender_id", profile.id)
        );
      } catch (e) {
        console.warn("Unread messages count skipped:", e?.message || e);
      }

      // Active projects: assumes projects.status = 'active'
      let projects = 0;
      try {
        projects = await countExact(
          supabase
            .from("projects")
            .select("id", { count: "exact", head: true })
            .eq("status", "active")
        );
      } catch (e) {
        console.warn("Projects count skipped:", e?.message || e);
      }

      // Total endorsements received: assumes endorsements.endorsed_community_id
      let endorsements = 0;
      try {
        endorsements = await countExact(
          supabase
            .from("endorsements")
            .select("id", { count: "exact", head: true })
            .eq("endorsed_community_id", profile.id)
        );
      } catch (e) {
        console.warn("Endorsements count skipped:", e?.message || e);
      }

      // Network size: simplest = total community rows (or your connections count if you prefer)
      let network = 0;
      try {
        network = await countExact(
          supabase
            .from("community")
            .select("id", { count: "exact", head: true })
        );
      } catch (e) {
        console.warn("Network size count skipped:", e?.message || e);
      }

      setText("unread-messages", unread);
      setText("active-projects", projects);
      setText("total-endorsements", endorsements);
      setText("network-size", network);
    } catch (err) {
      console.error("Bottom stats render failed:", err);
      // Don’t throw—keep the app alive.
    }
  }

  // ---------------------------------------------
  // Init / cleanup
  // ---------------------------------------------
  async function init() {
    if (isInitialized) return;

    console.log("📊 Dashboard init…");

    // Initial render
    await renderDashboard();

    // Auto-refresh every 30 seconds (like your old module)
    updateInterval = setInterval(() => {
      renderDashboard().catch((e) => console.error("Dashboard refresh failed:", e));
    }, 30000);

    isInitialized = true;
    console.log("✅ Dashboard initialized");
  }

  function cleanup() {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
    isInitialized = false;
    console.log("🧹 Dashboard cleaned up");
  }

  // ---------------------------------------------
  // Event hooks (keeps behavior from the old file)
  // ---------------------------------------------
  window.addEventListener("profile-loaded", (e) => {
    // Your system appears to dispatch this when the user is ready.
    currentProfile = e?.detail?.profile || currentProfile;
    init().catch((err) => console.error("Dashboard init failed:", err));
  });

  window.addEventListener("recommendations-updated", () => {
    if (isInitialized) renderDashboard();
  });

  window.addEventListener("ecosystem-notification", () => {
    if (isInitialized) renderDashboard();
  });

  window.addEventListener("profile-updated", () => {
    if (isInitialized) setTimeout(() => renderDashboard(), 1000);
  });

  // Manual controls (handy for debugging)
  window.Dashboard = {
    init,
    cleanup,
    refresh: renderDashboard,
  };

  // If DOM loads and user is already logged in, you can still try initializing.
  document.addEventListener("DOMContentLoaded", async () => {
    const supabase = await waitForSupabase(1500);
    if (!supabase) return;

    const { data } = await supabase.auth.getUser();
    if (data?.user && !isInitialized) {
      // Wait for profile-loaded normally, but don’t block forever:
      setTimeout(() => {
        if (!isInitialized) init().catch(console.error);
      }, 1200);
    }
  });
})();
