// connections.js — Lightweight connection management (robust type-safe writes)
// Fixes / goals:
// - Prevent DB CHECK constraint failures by normalizing `type`
// - Provide a richer getConnectionStatus() shape compatible with Synapse UI
// - Provide exports required by connectionRequests.js
// - Keep legacy compatibility + stable default export mapping
// - Stay lightweight (no extra deps)

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
// connections.type allowed (per your earlier constraint note):
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

  // Supabase `.or(...)` expects comma-separated expressions:
  // (A AND B) OR (C AND D)
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
 * - canConnect (true when none/declined/withdrawn/canceled)
 */
export async function getConnectionStatus(targetCommunityId) {
  if (!currentUserCommunityId || !targetCommunityId) {
    return { status: "none", canConnect: true };
  }

  const conn = await getConnectionBetween(
    currentUserCommunityId,
    targetCommunityId
  );

  if (!conn) return { status: "none", canConnect: true };

  const status = conn.status || "pending";
  const isSender = conn.from_user_id === currentUserCommunityId;
  const isReceiver = conn.to_user_id === currentUserCommunityId;

  const canConnect =
    status === "declined" || status === "canceled" || status === "withdrawn";

  return {
    status,
    id: conn.id, // legacy alias
    connectionId: conn.id, // synapse expects this
    isSender,
    isReceiver,
    canConnect,
  };
}

/**
 * Used by Synapse to draw all edges.
 */
export async function getAllConnectionsForSynapse() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("connections").select("*");
  if (error) {
    console.warn("getAllConnectionsForSynapse error:", error);
    return [];
  }
  return data || [];
}

/**
 * Utility: can current user see email of target?
 * (Your logic: accepted connection required.)
 */
export async function canSeeEmail(targetCommunityId) {
  if (!currentUserCommunityId || !targetCommunityId) return false;
  if (targetCommunityId === currentUserCommunityId) return true;

  const conn = await getConnectionBetween(
    currentUserCommunityId,
    targetCommunityId
  );
  return String(conn?.status || "").toLowerCase() === "accepted";
}

// ========================
// REQUEST LISTS (for connectionRequests.js)
// ========================
/**
 * Accepted connections for the current user (either direction).
 */
export async function getAcceptedConnections() {
  if (!supabase || !currentUserCommunityId) return [];

  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .or(
      `and(from_user_id.eq.${currentUserCommunityId},status.eq.accepted),and(to_user_id.eq.${currentUserCommunityId},status.eq.accepted)`
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("getAcceptedConnections error:", error);
    return [];
  }

  return data || [];
}

/**
 * Pending requests RECEIVED by the current user (they are the recipient).
 * someone else -> you, status=pending
 */
export async function getPendingRequestsReceived() {
  if (!supabase || !currentUserCommunityId) return [];

  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("to_user_id", currentUserCommunityId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("getPendingRequestsReceived error:", error);
    return [];
  }

  return data || [];
}

/**
 * Pending requests SENT by the current user (they are the sender).
 * you -> someone else, status=pending
 */
export async function getPendingRequestsSent() {
  if (!supabase || !currentUserCommunityId) return [];

  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("from_user_id", currentUserCommunityId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("getPendingRequestsSent error:", error);
    return [];
  }

  return data || [];
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
      return { success: false, error };
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
    return { success: false, error: err };
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

  return { success: !error, error };
}

/**
 * Decline OR withdraw:
 * - If current user is sender => status='withdrawn'
 * - Else => status='declined'
 *
 * If we can't read the row (RLS), fallback to 'declined'.
 */
export async function declineConnectionRequest(connectionId) {
  if (!supabase || !connectionId) return { success: false };

  let nextStatus = "declined";

  try {
    if (currentUserCommunityId) {
      const { data: row } = await supabase
        .from("connections")
        .select("id, from_user_id, to_user_id, status")
        .eq("id", connectionId)
        .maybeSingle?.();

      if (row?.from_user_id === currentUserCommunityId) nextStatus = "withdrawn";
    }
  } catch (_) {
    // ignore
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

  return { success: !error, status: nextStatus, error };
}

/**
 * Cancel/withdraw a pending connection request.
 * Accepts either:
 *  - connectionId (preferred), OR
 *  - targetCommunityId (fallback)
 *
 * Behavior:
 *  - If current user is the sender and status is pending -> set status='withdrawn'
 *  - If not sender -> set status='canceled'
 */
export async function cancelConnectionRequest(connectionIdOrTargetCommunityId) {
  if (!supabase) return { success: false, error: "Supabase not initialized" };
  if (!currentUserCommunityId) return { success: false, error: "Profile not found" };
  if (!connectionIdOrTargetCommunityId) return { success: false, error: "Missing id" };

  const candidate = String(connectionIdOrTargetCommunityId);

  // 1) Try treating candidate as connection row id
  try {
    const { data: row, error } = await supabase
      .from("connections")
      .select("id, from_user_id, to_user_id, status")
      .eq("id", candidate)
      .maybeSingle?.();

    if (!error && row?.id) {
      const status = String(row.status || "").toLowerCase();
      const isSender = row.from_user_id === currentUserCommunityId;

      if (status !== "pending") {
        showToast("Nothing to cancel (not pending)", "info");
        return { success: true, noOp: true };
      }

      const nextStatus = isSender ? "withdrawn" : "canceled";

      const { error: uErr } = await supabase
        .from("connections")
        .update({ status: nextStatus })
        .eq("id", row.id);

      if (uErr) {
        showToast(uErr.message || "Failed to cancel request", "error");
        return { success: false, error: uErr.message };
      }

      showToast("Request canceled.", "info");
      return { success: true, status: nextStatus, id: row.id };
    }
  } catch (_) {
    // ignore and fall back
  }

  // 2) Treat candidate as target community id and find the row between users
  const targetCommunityId = candidate;
  const conn = await getConnectionBetween(currentUserCommunityId, targetCommunityId);

  if (!conn?.id) {
    showToast("No request found to cancel", "info");
    return { success: true, noOp: true };
  }

  const status = String(conn.status || "").toLowerCase();
  if (status !== "pending") {
    showToast("Nothing to cancel (not pending)", "info");
    return { success: true, noOp: true };
  }

  const isSender = conn.from_user_id === currentUserCommunityId;
  const nextStatus = isSender ? "withdrawn" : "canceled";

  const { error: uErr } = await supabase
    .from("connections")
    .update({ status: nextStatus })
    .eq("id", conn.id);

  if (uErr) {
    showToast(uErr.message || "Failed to cancel request", "error");
    return { success: false, error: uErr.message };
  }

  showToast("Request canceled.", "info");
  return { success: true, status: nextStatus, id: conn.id };
}

/**
 * Remove a connection (hard delete).
 * Accepts either:
 *  - connection row id, OR
 *  - target community id (fallback)
 */
export async function removeConnection(connectionIdOrTargetCommunityId) {
  if (!supabase || !currentUserCommunityId || !connectionIdOrTargetCommunityId) {
    return { success: false };
  }

  const candidate = String(connectionIdOrTargetCommunityId);

  // Try as row id first
  let idToDelete = null;

  try {
    const { data: row, error } = await supabase
      .from("connections")
      .select("id")
      .eq("id", candidate)
      .maybeSingle?.();

    if (!error && row?.id) idToDelete = row.id;
  } catch (_) {
    // ignore
  }

  if (!idToDelete) {
    const conn = await getConnectionBetween(currentUserCommunityId, candidate);
    idToDelete = conn?.id || null;
  }

  if (!idToDelete) return { success: true, noOp: true };

  const { error } = await supabase.from("connections").delete().eq("id", idToDelete);

  if (error) {
    console.warn("removeConnection error:", error);
    showToast(error.message || "Failed to remove connection", "error");
    return { success: false, error: error.message };
  }

  showToast("Connection removed.", "success");
  return { success: true };
}

// ========================
// UI HOOKS (lightweight)
// ========================
function updateConnectionUI(targetId) {
  if (typeof document === "undefined") return;

  // Best-effort legacy behavior
  const buttons = document.querySelectorAll(`[onclick*="${targetId}"]`);
  buttons.forEach((btn) => {
    btn.disabled = true;
    btn.innerHTML = "✓ Sent";
  });
}

// Keep an export named formatTimeAgo for compatibility.
export function formatTimeAgo(ts) {
  if (!ts) return "---";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "---";
  return d.toLocaleDateString();
}

// ========================
// DEFAULT EXPORT (compat)
// ========================
export default {
  initConnections,
  refreshCurrentUser,
  getCurrentUserCommunityId,

  // Queries / status
  getConnectionBetween,
  getConnectionStatus,
  getAllConnectionsForSynapse,
  canSeeEmail,

  // Lists for requests UI
  getAcceptedConnections,
  getPendingRequestsReceived,
  getPendingRequestsSent,

  // Mutations
  sendConnectionRequest,
  acceptConnectionRequest,
  declineConnectionRequest,
  cancelConnectionRequest,
  removeConnection,

  // Utils
  formatTimeAgo,
};
