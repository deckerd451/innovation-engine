// assets/js/connections.js
// Connections — lightweight connection management (robust status-safe writes)
// Key rules (matches your DB):
// - connections.status allowed: 'pending' | 'accepted' | 'rejected' | 'canceled'
// - Sender can cancel only their own pending requests -> status 'canceled'
// - Receiver can accept/reject only requests sent to them
//
// Also:
// - Always attaches `.community` to rows returned for request lists,
//   so UI can show names without relying on embedded relationship joins.

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

// ------------------
// Module state
// ------------------
let supabase = null;
let currentUserId = null; // auth.users.id
let currentUserCommunityId = null; // community.id

// ------------------
// DB-safe type normalization (if you enforce a check on type)
// ------------------
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

// ------------------
// Init / current user resolution
// ------------------
export async function initConnections(supabaseClient) {
  supabase = supabaseClient;
  await refreshCurrentUser();

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

    const { data: profile, error: pErr } = await supabase
      .from("community")
      .select("id")
      .eq("user_id", currentUserId)
      .single();

    if (pErr) {
      currentUserCommunityId = null;
      return { currentUserId, currentUserCommunityId: null };
    }

    currentUserCommunityId = profile?.id || null;
    return { currentUserId, currentUserCommunityId };
  } catch (e) {
    console.warn("refreshCurrentUser error:", e);
    return null;
  }
}

export function getCurrentUserCommunityId() {
  return currentUserCommunityId;
}

// ------------------
// Helpers: fetch community rows and attach to connections
// ------------------
function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

async function getCommunityByIds(ids) {
  if (!supabase) return new Map();
  const uniqueIds = uniq(ids);
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("community")
    .select("id, name, image_url")
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

// ------------------
// Core: get connection between two community IDs
// ------------------
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

  return data && data.length ? data[0] : null;
}

// Status helper compatible with existing UI expectations
export async function getConnectionStatus(targetCommunityId) {
  if (!currentUserCommunityId || !targetCommunityId) {
    return { status: "none", canConnect: true };
  }

  const conn = await getConnectionBetween(currentUserCommunityId, targetCommunityId);
  if (!conn) return { status: "none", canConnect: true };

  const status = String(conn.status || "pending").toLowerCase();
  const isSender = conn.from_user_id === currentUserCommunityId;
  const isReceiver = conn.to_user_id === currentUserCommunityId;

  const canConnect = status === "rejected" || status === "canceled";

  return {
    status,
    id: conn.id, // legacy
    connectionId: conn.id,
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

// If you still use this in node panel, keep it strict on DB truth:
export async function canSeeEmail(targetCommunityId) {
  if (!currentUserCommunityId || !targetCommunityId) return false;
  if (targetCommunityId === currentUserCommunityId) return true;

  const conn = await getConnectionBetween(currentUserCommunityId, targetCommunityId);
  return String(conn?.status || "").toLowerCase() === "accepted";
}

// ------------------
// Lists for connectionRequests UI
// Always return rows with `.community`
// ------------------
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
  const map = await getCommunityByIds(otherIds);

  return attachCommunity(
    rows,
    (r) => (r.from_user_id === currentUserCommunityId ? r.to_user_id : r.from_user_id),
    map
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
  const map = await getCommunityByIds(fromIds);

  return attachCommunity(rows, (r) => r.from_user_id, map);
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
  const map = await getCommunityByIds(toIds);

  return attachCommunity(rows, (r) => r.to_user_id, map);
}

// ------------------
// Mutations
// ------------------
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

    const safeType = normalizeConnectionType(type);

    // Prevent duplicate pending requests to same person.
    // Note: this is client-side protection; you can also add a DB unique index later.
    const existing = await getConnectionBetween(currentUserCommunityId, recipientCommunityId);
    const existingStatus = String(existing?.status || "").toLowerCase();
    if (existing && (existingStatus === "pending" || existingStatus === "accepted")) {
      showToast(`Request already ${existingStatus}`, "info");
      return { success: false };
    }

    showToast(`Connecting with ${targetName}...`, "info");

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
  } catch (e) {
    console.error("sendConnectionRequest error:", e);
    showToast("Failed to send request", "error");
    return { success: false, error: e };
  }
}

export async function acceptConnectionRequest(connectionId) {
  if (!supabase || !connectionId) return { success: false };

  const { data, error } = await supabase
    .from("connections")
    .update({ status: "accepted" })
    .eq("id", connectionId)
    .eq("to_user_id", currentUserCommunityId)
    .eq("status", "pending")
    .select("id,status");

  if (error) {
    showToast(error.message || "Failed to accept", "error");
    return { success: false, error };
  }

  if (!data || data.length === 0) {
    showToast("Nothing to accept (already processed)", "info");
    return { success: false, noOp: true };
  }

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

  return { success: true };
}

// Recipient rejects (DB uses 'rejected')
export async function declineConnectionRequest(connectionId) {
  if (!supabase || !connectionId) return { success: false };

  const { data, error } = await supabase
    .from("connections")
    .update({ status: "rejected" })
    .eq("id", connectionId)
    .eq("to_user_id", currentUserCommunityId)
    .eq("status", "pending")
    .select("id,status");

  if (error) {
    showToast(error.message || "Failed to reject", "error");
    return { success: false, error };
  }

  if (!data || data.length === 0) {
    showToast("Nothing to reject (already processed)", "info");
    return { success: false, noOp: true };
  }

  showToast("Request rejected.", "info");

  if (window.refreshSynapseConnections) {
    await window.refreshSynapseConnections();
  }

  return { success: true };
}

// Sender cancels pending (DB uses 'canceled')
export async function cancelConnectionRequest(connectionId) {
  if (!supabase) return { success: false, error: "Supabase not initialized" };
  if (!currentUserCommunityId) return { success: false, error: "Profile not found" };
  if (!connectionId) return { success: false, error: "Missing connection id" };

  const { data, error } = await supabase
    .from("connections")
    .update({ status: "canceled" })
    .eq("id", connectionId)
    .eq("from_user_id", currentUserCommunityId)
    .eq("status", "pending")
    .select("id,status");

  if (error) return { success: false, error: error.message };

  if (!data || data.length === 0) {
    return { success: false, error: "No pending request updated (already processed or not permitted)" };
  }

  return { success: true, id: data[0].id, status: data[0].status };
}

export async function removeConnection(connectionIdOrTargetCommunityId) {
  if (!supabase || !currentUserCommunityId || !connectionIdOrTargetCommunityId) {
    return { success: false };
  }

  const candidate = String(connectionIdOrTargetCommunityId);
  let idToDelete = null;

  // Treat as row id first
  try {
    const { data: row } = await supabase
      .from("connections")
      .select("id")
      .eq("id", candidate)
      .maybeSingle?.();

    if (row?.id) idToDelete = row.id;
  } catch (_) {}

  // Fallback: treat as target community id
  if (!idToDelete) {
    const conn = await getConnectionBetween(currentUserCommunityId, candidate);
    idToDelete = conn?.id || null;
  }

  if (!idToDelete) return { success: true, noOp: true };

  const { error } = await supabase.from("connections").delete().eq("id", idToDelete);

  if (error) {
    showToast(error.message || "Failed to remove connection", "error");
    return { success: false, error: error.message };
  }

  showToast("Connection removed.", "success");

  if (window.refreshSynapseConnections) {
    await window.refreshSynapseConnections();
  }

  return { success: true };
}

// ------------------
// UI hooks (best-effort)
// ------------------
function updateConnectionUI(targetId) {
  if (typeof document === "undefined") return;
  const buttons = document.querySelectorAll(`[onclick*="${targetId}"]`);
  buttons.forEach((btn) => {
    btn.disabled = true;
    btn.innerHTML = "✓ Sent";
  });
}

export function formatTimeAgo(ts) {
  if (!ts) return "---";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "---";
  return d.toLocaleDateString();
}

// ------------------
// Default export (compat)
// ------------------
export default {
  initConnections,
  refreshCurrentUser,
  getCurrentUserCommunityId,

  getConnectionBetween,
  getConnectionStatus,
  getAllConnectionsForSynapse,
  canSeeEmail,

  getAcceptedConnections,
  getPendingRequestsReceived,
  getPendingRequestsSent,

  sendConnectionRequest,
  acceptConnectionRequest,
  declineConnectionRequest,
  cancelConnectionRequest,
  removeConnection,

  formatTimeAgo,
};
