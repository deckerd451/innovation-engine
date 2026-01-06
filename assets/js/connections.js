// connections.js — Lightweight connection management (robust type-safe writes)
// Fixes:
// - Prevents DB CHECK constraint failures by normalizing `type`
// - Returns a richer getConnectionStatus() shape compatible with Synapse UI
// - Keeps existing exports + default export mapping
// - Stays lightweight (no extra deps)

// ========================
// TOAST NOTIFICATION SYSTEM
// ========================
function showToast(message, type = "info") {
  if (typeof document === "undefined") return;

  const toast = document.createElement("div");
  toast.className = `connection-toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas fa-${
      type === "success"
        ? "check-circle"
        : type === "error"
        ? "exclamation-circle"
        : "info-circle"
    }"></i>
    <span>${message}</span>
  `;

  toast.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: ${
      type === "error" ? "#f44336" : type === "success" ? "#4caf50" : "#00e0ff"
    };
    color: #fff;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    font-weight: 600;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    animation: slideInRight 0.3s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    min-width: 260px;
  `;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "slideOutRight 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ========================
// MODULE STATE
// ========================
let supabase = null;
let currentUserId = null; // auth.user.id
let currentUserCommunityId = null; // community.id

// ========================
// TYPE NORMALIZATION (DB CHECK CONSTRAINT SAFE)
// connections.type allowed:
// ['generic','friend','mentor','collaborator','follower']
// ========================
const ALLOWED_CONNECTION_TYPES = new Set([
  "generic",
  "friend",
  "mentor",
  "collaborator",
  "follower",
]);

function normalizeConnectionType(t) {
  const v = String(t ?? "").toLowerCase().trim();
  return ALLOWED_CONNECTION_TYPES.has(v) ? v : "generic";
}

// ========================
// INIT / CURRENT USER
// ========================
export async function initConnections(supabaseClient) {
  supabase = supabaseClient;
  await refreshCurrentUser();

  // Convenience (legacy callers)
  if (typeof window !== "undefined") {
    window.sendConnectionRequest = sendConnectionRequest;
  }

  console.log("%c✓ Connections module initialized", "color: #0f0");
  return { currentUserId, currentUserCommunityId };
}

export async function refreshCurrentUser() {
  try {
    if (!supabase?.auth?.getSession) return null;

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.warn("refreshCurrentUser session error:", error);
      return null;
    }

    if (!session?.user) return null;

    currentUserId = session.user.id;

    // community.id for this auth user
    const { data: profile, error: pErr } = await supabase
      .from("community")
      .select("id")
      .eq("user_id", currentUserId)
      .single();

    if (pErr) {
      // Not fatal; means profile not created yet
      currentUserCommunityId = null;
      return { currentUserId, currentUserCommunityId: null };
    }

    currentUserCommunityId = profile?.id || null;
    return { currentUserId, currentUserCommunityId };
  } catch (err) {
    console.warn("refreshCurrentUser error:", err);
    return null;
  }
}

export function getCurrentUserCommunityId() {
  return currentUserCommunityId;
}

// ========================
// CORE HELPERS
// ========================
/**
 * Get connection between two community IDs (either direction).
 * Returns most recent connection if duplicates exist.
 */
export async function getConnectionBetween(id1, id2) {
  if (!supabase || !id1 || !id2) return null;

  // NOTE: Keep your filter style; this works with Supabase JS `.or(...)`
  const filter = `and(from_user_id.eq.${id1},to_user_id.eq.${id2}),and(from_user_id.eq.${id2},to_user_id.eq.${id1})`;

  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .or(filter)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("getConnectionBetween error:", error);
    return null;
  }

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Rich status object compatible with Synapse UI expectations:
 * - status: 'none' | 'pending' | 'accepted' | 'declined' | ...
 * - connectionId: id of connection row
 * - isSender / isReceiver (relative to current user)
 * - canConnect (true when none/declined)
 */
export async function getConnectionStatus(targetCommunityId) {
  if (!currentUserCommunityId || !targetCommunityId) {
    return { status: "none", canConnect: true };
  }

  const conn = await getConnectionBetween(currentUserCommunityId, targetCommunityId);
  if (!conn) return { status: "none", canConnect: true };

  const status = conn.status || "pending";
  const isSender = conn.from_user_id === currentUserCommunityId;
  const isReceiver = conn.to_user_id === currentUserCommunityId;

  // When declined, allow new connect (optional; adjust if you want cooldown)
  const canConnect =
    status === "declined" || status === "canceled" || status === "withdrawn";

  return {
    status,
    id: conn.id, // legacy
    connectionId: conn.id, // synapse expects this
    isSender,
    isReceiver,
    canConnect,
  };
}

export async function getAllConnectionsForSynapse() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("connections").select("*");
  if (error) {
    console.warn("getAllConnectionsForSynapse error:", error);
    return [];
  }
  return data || [];
}

export async function canSeeEmail(targetCommunityId) {
  if (!currentUserCommunityId || !targetCommunityId) return false;
  if (targetCommunityId === currentUserCommunityId) return true;

  const conn = await getConnectionBetween(currentUserCommunityId, targetCommunityId);
  return String(conn?.status || "").toLowerCase() === "accepted";
}

// ========================
// MUTATIONS
// ========================
export async function sendConnectionRequest(
  recipientCommunityId,
  targetName = "User",
  type = "generic"
) {
  try {
    if (!supabase) return { success: false };
    if (!currentUserCommunityId) {
      showToast("Profile not found", "error");
      return { success: false };
    }
    if (!recipientCommunityId) {
      showToast("Invalid recipient", "error");
      return { success: false };
    }
    if (recipientCommunityId === currentUserCommunityId) {
      showToast("You can't connect to yourself", "info");
      return { success: false };
    }

    showToast(`Connecting with ${targetName}...`, "info");

    const existing = await getConnectionBetween(
      currentUserCommunityId,
      recipientCommunityId
    );

    const existingStatus = String(existing?.status || "").toLowerCase();
    if (existing && (existingStatus === "pending" || existingStatus === "accepted")) {
      showToast(`Request already ${existingStatus}`, "info");
      return { success: false };
    }

    const safeType = normalizeConnectionType(type);

    const { error } = await supabase.from("connections").insert({
      from_user_id: currentUserCommunityId,
      to_user_id: recipientCommunityId,
      status: "pending",
      type: safeType,
    });

    if (error) {
      if (error.code === "23505") showToast("Already exists", "info");
      else showToast(error.message || "Failed to connect", "error");
      return { success: false };
    }

    showToast(`✓ Request sent to ${targetName}!`, "success");
    updateConnectionUI(recipientCommunityId);

    // Award XP + quest progress (optional; safe-guarded)
    if (window.DailyEngagement) {
      await window.DailyEngagement.awardXP(
        window.DailyEngagement.XP_REWARDS.SEND_CONNECTION,
        `Sent connection to ${targetName}`
      );
      await window.DailyEngagement.updateQuestProgress("send_connection", 1);
    }

    return { success: true };
  } catch (err) {
    console.error("sendConnectionRequest error:", err);
    showToast("Failed to send request", "error");
    return { success: false };
  }
}

export async function acceptConnectionRequest(connectionId) {
  if (!supabase || !connectionId) return { success: false };

  const { error } = await supabase
    .from("connections")
    .update({ status: "accepted" })
    .eq("id", connectionId);

  if (!error) {
    showToast("Accepted!", "success");
    if (window.DailyEngagement) {
      await window.DailyEngagement.awardXP(
        window.DailyEngagement.XP_REWARDS.ACCEPT_CONNECTION,
        "Accepted connection request"
      );
    }
  } else {
    showToast(error.message || "Failed to accept", "error");
  }

  return { success: !error };
}

/**
 * Decline OR withdraw:
 * Your current Synapse withdraw button calls declineConnectionRequest(id).
 * This implementation keeps that behavior, but sets status depending on who acted:
 * - If current user is sender => 'withdrawn'
 * - Else => 'declined'
 *
 * If we can't read the row (RLS), fallback to 'declined'.
 */
export async function declineConnectionRequest(connectionId) {
  if (!supabase || !connectionId) return { success: false };

  let nextStatus = "declined";

  try {
    // Try to infer whether this is a withdraw vs decline
    if (currentUserCommunityId) {
      const { data: row } = await supabase
        .from("connections")
        .select("id, from_user_id, to_user_id, status")
        .eq("id", connectionId)
        .maybeSingle();

      if (row?.from_user_id === currentUserCommunityId) nextStatus = "withdrawn";
      else nextStatus = "declined";
    }
  } catch (_) {
    // ignore; fallback stays 'declined'
  }

  const { error } = await supabase
    .from("connections")
    .update({ status: nextStatus })
    .eq("id", connectionId);

  if (!error) {
    showToast(
      nextStatus === "withdrawn" ? "Request withdrawn." : "Connection declined.",
      "info"
    );
  } else {
    showToast(error.message || "Failed to update connection", "error");
  }

  return { success: !error };
}

// ========================
// UI HOOKS (lightweight)
// ========================
function updateConnectionUI(targetId) {
  if (typeof document === "undefined") return;

  // This is best-effort; keeps your existing behavior
  const buttons = document.querySelectorAll(`[onclick*="${targetId}"]`);
  buttons.forEach((btn) => {
    btn.disabled = true;
    btn.innerHTML = "✓ Sent";
  });
}

// Keep an export named formatTimeAgo for compatibility.
// (Your Synapse imports it, so keep it stable.)
export function formatTimeAgo(ts) {
  if (!ts) return "---";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "---";
  return d.toLocaleDateString();
}

// Default export mapping (kept for compatibility)
export default {
  initConnections,
  refreshCurrentUser,
  getCurrentUserCommunityId,
  sendConnectionRequest,
  acceptConnectionRequest,
  declineConnectionRequest,
  getConnectionBetween,
  getConnectionStatus,
  getAllConnectionsForSynapse,
  canSeeEmail,
  formatTimeAgo,
};
