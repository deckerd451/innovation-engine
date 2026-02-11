// assets/js/connections.js
// Connections — robust + RLS-safe + Synapse-compatible
//
// ✅ Works with your DB CHECK constraint:
//    status ∈ ['pending','accepted','rejected','canceled']
// ✅ Works with your RLS pattern:
//    - UPDATE typically only allowed for recipient (to_user_id)
//    - DELETE allowed for either participant (best-effort; we also fallback)
// ✅ Keeps existing API surface used by connectionRequests.js + synapse/data.js
// ✅ Always returns rows with `.community` populated (so UI never shows "Unknown")
// ✅ Ensures Synapse dotted lines disappear by filtering inactive statuses (or deleting rows)


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
// STATUS HELPERS (YOUR DB)
// ========================
const ACTIVE_STATUSES = new Set(["pending", "accepted"]);
const INACTIVE_STATUSES = new Set(["rejected", "canceled"]);

function normStatus(s) {
  return String(s || "").toLowerCase().trim();
}

function isActiveStatus(s) {
  return ACTIVE_STATUSES.has(normStatus(s));
}

function isInactiveStatus(s) {
  return INACTIVE_STATUSES.has(normStatus(s));
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
    // ✅ CRITICAL FIX: Use profile already loaded by auth.js
    // This ensures consistency and prevents loading wrong profile
    if (window.currentUserProfile?.id && window.currentAuthUser?.id) {
      console.log('✅ [CONNECTIONS] Using profile from auth.js:', {
        profileId: window.currentUserProfile.id,
        userId: window.currentAuthUser.id,
        name: window.currentUserProfile.name
      });
      currentUserCommunityId = window.currentUserProfile.id;
      currentUserId = window.currentAuthUser.id;
      return { currentUserId, currentUserCommunityId };
    }

    // Fallback: Query database if auth.js profile not available yet
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

    const { data: profile, error: pErr } = await supabase
      .from("community")
      .select("id")
      .eq("user_id", currentUserId)
      .single();

    if (pErr) {
      console.warn("⚠️ [CONNECTIONS] No profile found by user_id:", currentUserId);
      currentUserCommunityId = null;
      return { currentUserId, currentUserCommunityId: null };
    }

    currentUserCommunityId = profile?.id || null;
    console.log('✅ [CONNECTIONS] Profile loaded from database:', {
      profileId: currentUserCommunityId,
      userId: currentUserId
    });
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
// INTERNAL HELPERS
// ========================
function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

async function getCommunityByIds(ids) {
  if (!supabase) return new Map();
  const uniqueIds = uniq(ids);
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("community")
    .select("id, name, image_url, email")
    .in("id", uniqueIds);

  if (error) {
    console.warn("getCommunityByIds error:", error);
    return new Map();
  }

  const map = new Map();
  (data || []).forEach((row) => map.set(row.id, row));
  return map;
}

function attachCommunity(rows, pickCommunityIdFn, communityMap) {
  return (rows || []).map((row) => {
    const cid = pickCommunityIdFn(row);
    return { ...row, community: communityMap.get(cid) || null };
  });
}

async function safeDeleteConnectionRow(connectionId) {
  const { error } = await supabase.from("connections").delete().eq("id", connectionId);
  if (error) return { ok: false, error };
  return { ok: true };
}

async function safeUpdateConnectionRow(connectionId, patch) {
  const { error } = await supabase.from("connections").update(patch).eq("id", connectionId);
  if (error) return { ok: false, error };
  return { ok: true };
}

async function readConnectionRow(connectionId) {
  // Use select minimal fields; if RLS blocks, you'll get error
  const { data, error } = await supabase
    .from("connections")
    .select("id, from_user_id, to_user_id, status, type, created_at")
    .eq("id", connectionId)
    .maybeSingle?.();

  return { data, error };
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
 * Rich status object compatible with Synapse UI expectations.
 */
export async function getConnectionStatus(targetCommunityId) {
  if (!currentUserCommunityId || !targetCommunityId) {
    return { status: "none", canConnect: true };
  }

  const conn = await getConnectionBetween(currentUserCommunityId, targetCommunityId);
  if (!conn) return { status: "none", canConnect: true };

  const status = normStatus(conn.status) || "pending";
  const isSender = conn.from_user_id === currentUserCommunityId;
  const isReceiver = conn.to_user_id === currentUserCommunityId;

  // In your DB, connect again is reasonable when rejected/canceled
  const canConnect = status === "rejected" || status === "canceled";

  return {
    status,
    id: conn.id, // legacy alias
    connectionId: conn.id, // synapse expects
    isSender,
    isReceiver,
    canConnect,
  };
}

/**
 * Used by Synapse to draw edges.
 * IMPORTANT: Return only active statuses so canceled/rejected do NOT render dotted lines.
 */
export async function getAllConnectionsForSynapse() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .in("status", ["pending", "accepted"]);

  if (error) {
    console.warn("getAllConnectionsForSynapse error:", error);
    return [];
  }

  return data || [];
}

/**
 * Utility: can current user see email of target?
 * (accepted connection required.)
 */
export async function canSeeEmail(targetCommunityId) {
  if (!currentUserCommunityId || !targetCommunityId) return false;
  if (targetCommunityId === currentUserCommunityId) return true;

  const conn = await getConnectionBetween(currentUserCommunityId, targetCommunityId);
  return normStatus(conn?.status) === "accepted";
}

// ========================
// REQUEST LISTS (for connectionRequests.js)
// ALWAYS return rows with `.community`
// ========================
export async function getAcceptedConnections() {
  if (!supabase || !currentUserCommunityId) return [];

  const { data, error } = await supabase
    .from("connections")
    .select("id, from_user_id, to_user_id, created_at, status, type")
    .or(
      `and(from_user_id.eq.${currentUserCommunityId},status.eq.accepted),and(to_user_id.eq.${currentUserCommunityId},status.eq.accepted)`
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("getAcceptedConnections error:", error);
    return [];
  }

  const rows = data || [];
  const otherIds = rows.map((r) =>
    r.from_user_id === currentUserCommunityId ? r.to_user_id : r.from_user_id
  );
  const communityMap = await getCommunityByIds(otherIds);

  return attachCommunity(
    rows,
    (r) => (r.from_user_id === currentUserCommunityId ? r.to_user_id : r.from_user_id),
    communityMap
  );
}

export async function getPendingRequestsReceived() {
  if (!supabase || !currentUserCommunityId) return [];

  const { data, error } = await supabase
    .from("connections")
    .select("id, from_user_id, to_user_id, created_at, status, type")
    .eq("to_user_id", currentUserCommunityId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("getPendingRequestsReceived error:", error);
    return [];
  }

  const rows = data || [];
  const fromIds = rows.map((r) => r.from_user_id);
  const communityMap = await getCommunityByIds(fromIds);

  return attachCommunity(rows, (r) => r.from_user_id, communityMap);
}

export async function getPendingRequestsSent() {
  if (!supabase || !currentUserCommunityId) return [];

  const { data, error } = await supabase
    .from("connections")
    .select("id, from_user_id, to_user_id, created_at, status, type")
    .eq("from_user_id", currentUserCommunityId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("getPendingRequestsSent error:", error);
    return [];
  }

  const rows = data || [];
  const toIds = rows.map((r) => r.to_user_id);
  const communityMap = await getCommunityByIds(toIds);

  return attachCommunity(rows, (r) => r.to_user_id, communityMap);
}

// ========================
// MUTATIONS
// ========================
export async function sendConnectionRequest(recipientCommunityId, targetName = "User", type = "generic") {
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

    const existing = await getConnectionBetween(currentUserCommunityId, recipientCommunityId);
    const existingStatus = normStatus(existing?.status);

    // If active, don't create a duplicate
    if (existing && isActiveStatus(existingStatus)) {
      showToast(`Request already ${existingStatus}`, "info");
      return { success: false, status: existingStatus };
    }

    // If inactive (rejected/canceled), allow a new request OR reuse by updating if sender has rights.
    // To keep it simple and RLS-safe, insert a new row.
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

    if (window.DailyEngagement) {
      await window.DailyEngagement.awardXP(
        window.DailyEngagement.XP_REWARDS.SEND_CONNECTION,
        `Sent connection to ${targetName}`
      );
      await window.DailyEngagement.updateQuestProgress("send_connection", 1);
    }

    if (window.refreshSynapseConnections) {
      await window.refreshSynapseConnections();
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

  // Recipient-only update per your RLS
  const res = await safeUpdateConnectionRow(connectionId, { status: "accepted" });

  if (res.ok) {
    showToast("Accepted!", "success");

    if (window.DailyEngagement) {
      await window.DailyEngagement.awardXP(
        window.DailyEngagement.XP_REWARDS.ACCEPT_CONNECTION,
        "Accepted connection request"
      );
    }

    if (window.refreshSynapseConnections) {
      await window.refreshSynapseConnections();
    }

    return { success: true, status: "accepted" };
  }

  showToast(res.error?.message || "Failed to accept", "error");
  return { success: false, error: res.error };
}

export async function declineConnectionRequest(connectionId) {
  if (!supabase || !connectionId) return { success: false };

  try {
    const { data: row, error: readErr } = await readConnectionRow(connectionId);

    if (readErr) {
      showToast(readErr.message || "Failed to load request", "error");
      return { success: false, error: readErr };
    }

    if (!row?.id) {
      showToast("Request not found", "info");
      return { success: true, noOp: true };
    }

    const status = normStatus(row.status);
    if (status !== "pending") {
      showToast("Nothing to decline (not pending)", "info");
      return { success: true, noOp: true };
    }

    // Recipient-only update per your RLS
    const res = await safeUpdateConnectionRow(row.id, { status: "rejected" });

    if (!res.ok) {
      showToast(res.error?.message || "Failed to decline request", "error");
      return { success: false, error: res.error };
    }

    showToast("Request declined.", "info");
    if (window.refreshSynapseConnections) await window.refreshSynapseConnections();

    return { success: true, status: "rejected", id: row.id };
  } catch (err) {
    showToast("Failed to decline request", "error");
    return { success: false, error: err };
  }
}

/**
 * Cancel a pending request.
 * - If you are the sender: prefer DELETE so it disappears everywhere (and Synapse lines disappear).
 * - If you are the recipient: set status=canceled (UPDATE) if allowed, else fallback to DELETE.
 *
 * Accepts either connectionId OR targetCommunityId.
 */
export async function cancelConnectionRequest(connectionIdOrTargetCommunityId) {
  if (!supabase) return { success: false, error: "Supabase not initialized" };
  if (!currentUserCommunityId) return { success: false, error: "Profile not found" };
  if (!connectionIdOrTargetCommunityId) return { success: false, error: "Missing id" };

  const candidate = String(connectionIdOrTargetCommunityId);

  async function cancelRow(row) {
    const status = normStatus(row.status);
    if (status !== "pending") {
      showToast("Nothing to cancel (not pending)", "info");
      return { success: true, noOp: true, id: row.id, status };
    }

    const isSender = row.from_user_id === currentUserCommunityId;
    const isRecipient = row.to_user_id === currentUserCommunityId;

    // Preferred path: DELETE makes it vanish from lists + Synapse immediately
    // (and avoids any UPDATE permission weirdness)
    if (isSender || isRecipient) {
      const del = await safeDeleteConnectionRow(row.id);
      if (del.ok) {
        showToast("Request canceled.", "info");
        if (window.refreshSynapseConnections) await window.refreshSynapseConnections();
        return { success: true, action: "deleted", id: row.id };
      }

      // If DELETE blocked for some reason, try UPDATE to canceled (recipient-only)
      const upd = await safeUpdateConnectionRow(row.id, { status: "canceled" });
      if (upd.ok) {
        showToast("Request canceled.", "info");
        if (window.refreshSynapseConnections) await window.refreshSynapseConnections();
        return { success: true, action: "updated", status: "canceled", id: row.id };
      }

      showToast(del.error?.message || upd.error?.message || "Failed to cancel", "error");
      return { success: false, error: del.error || upd.error };
    }

    showToast("You can't cancel this request", "error");
    return { success: false, error: "Not sender or recipient" };
  }

  // 1) candidate as connection id
  try {
    const { data: row, error } = await supabase
      .from("connections")
      .select("id, from_user_id, to_user_id, status")
      .eq("id", candidate)
      .maybeSingle?.();

    if (!error && row?.id) return await cancelRow(row);
  } catch (_) {}

  // 2) candidate as target community id
  const conn = await getConnectionBetween(currentUserCommunityId, candidate);

  if (!conn?.id) {
    showToast("No request found to cancel", "info");
    return { success: true, noOp: true };
  }

  return await cancelRow(conn);
}

/**
 * Remove an accepted connection (hard delete).
 * Accepts either connectionId OR targetCommunityId.
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
  } catch (_) {}

  if (!idToDelete) {
    const conn = await getConnectionBetween(currentUserCommunityId, candidate);
    idToDelete = conn?.id || null;
  }

  if (!idToDelete) return { success: true, noOp: true };

  const del = await safeDeleteConnectionRow(idToDelete);

  if (!del.ok) {
    console.warn("removeConnection error:", del.error);
    showToast(del.error?.message || "Failed to remove connection", "error");
    return { success: false, error: del.error?.message || del.error };
  }

  showToast("Connection removed.", "success");
  if (window.refreshSynapseConnections) await window.refreshSynapseConnections();

  return { success: true };
}

// ========================
// UI HOOKS (lightweight)
// ========================
function updateConnectionUI(targetId) {
  if (typeof document === "undefined") return;

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

  // Core helpers
  getConnectionBetween,
  getConnectionStatus,
  getAllConnectionsForSynapse,
  canSeeEmail,

  // Lists
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
