// /assets/js/connections.js
// Connection management (schema-aligned + request panel compatible)
//
// DB schema expectations:
// - connections(from_user_id -> community.id, to_user_id -> community.id)
// - connections.status CHECK: ('pending','accepted','rejected')
// - Emails are only shown after acceptance (you said this is fine)

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
  }, 2500);
}

let supabase = null;
let currentAuthUserId = null; // auth.users.id
let currentCommunityId = null; // community.id

const ALLOWED_TYPES = new Set(["generic", "friend", "mentor", "collaborator", "follower"]);
function normalizeType(v) {
  const t = String(v ?? "").toLowerCase().trim();
  return ALLOWED_TYPES.has(t) ? t : "generic";
}

// Allowed by your DB constraint
const STATUS = Object.freeze({
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
});

export async function initConnections(supabaseClient) {
  supabase = supabaseClient;
  await refreshCurrentUser();

  if (typeof window !== "undefined") {
    window.sendConnectionRequest = sendConnectionRequest;
  }

  console.log("%c✓ Connections module initialized", "color:#0f0");
  return { currentAuthUserId, currentCommunityId };
}

export async function refreshCurrentUser() {
  try {
    if (!supabase?.auth?.getSession) return null;

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user) return null;

    currentAuthUserId = session.user.id;

    const { data: profile, error: pErr } = await supabase
      .from("community")
      .select("id")
      .eq("user_id", currentAuthUserId)
      .single();

    if (pErr || !profile?.id) {
      currentCommunityId = null;
      return { currentAuthUserId, currentCommunityId: null };
    }

    currentCommunityId = profile.id;
    return { currentAuthUserId, currentCommunityId };
  } catch (e) {
    console.warn("refreshCurrentUser error:", e);
    return null;
  }
}

export function getCurrentUserCommunityId() {
  return currentCommunityId;
}

// ---------- Core helpers ----------

export async function getConnectionBetween(id1, id2) {
  if (!supabase || !id1 || !id2) return null;

  const filter =
    `and(from_user_id.eq.${id1},to_user_id.eq.${id2}),` +
    `and(from_user_id.eq.${id2},to_user_id.eq.${id1})`;

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

  return data?.[0] || null;
}

export async function getConnectionStatus(targetCommunityId) {
  if (!currentCommunityId || !targetCommunityId) {
    return { status: "none", canConnect: true };
  }

  const conn = await getConnectionBetween(currentCommunityId, targetCommunityId);
  if (!conn) return { status: "none", canConnect: true };

  const status = String(conn.status || STATUS.PENDING).toLowerCase();
  const isSender = conn.from_user_id === currentCommunityId;
  const isReceiver = conn.to_user_id === currentCommunityId;

  return {
    status,
    id: conn.id,
    connectionId: conn.id,
    isSender,
    isReceiver,
    canConnect: status === STATUS.REJECTED, // rejected can be re-requested
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
  if (!currentCommunityId || !targetCommunityId) return false;
  if (targetCommunityId === currentCommunityId) return true;

  const conn = await getConnectionBetween(currentCommunityId, targetCommunityId);
  return String(conn?.status || "").toLowerCase() === STATUS.ACCEPTED;
}

// ---------- Lists for connectionRequests.js (MUST include `community`) ----------

// Sent: join the recipient (to_user_id) as `community`
export async function getPendingRequestsSent() {
  if (!supabase || !currentCommunityId) return [];

  const { data, error } = await supabase
    .from("connections")
    .select(`
      id, from_user_id, to_user_id, created_at, status, type,
      community:to_user_id ( id, name, image_url, email )
    `)
    .eq("from_user_id", currentCommunityId)
    .eq("status", STATUS.PENDING)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("getPendingRequestsSent error:", error);
    return [];
  }

  // For pending, we do NOT expose email in the UI layer
  return (data || []).map((r) => ({
    ...r,
    community: r.community ? { ...r.community, email: null } : null,
  }));
}

// Received: join the sender (from_user_id) as `community`
export async function getPendingRequestsReceived() {
  if (!supabase || !currentCommunityId) return [];

  const { data, error } = await supabase
    .from("connections")
    .select(`
      id, from_user_id, to_user_id, created_at, status, type,
      community:from_user_id ( id, name, image_url, email )
    `)
    .eq("to_user_id", currentCommunityId)
    .eq("status", STATUS.PENDING)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("getPendingRequestsReceived error:", error);
    return [];
  }

  // For pending, we do NOT expose email in the UI layer
  return (data || []).map((r) => ({
    ...r,
    community: r.community ? { ...r.community, email: null } : null,
  }));
}

// Accepted: join both sides; then choose the "other" person as `.community`
export async function getAcceptedConnections() {
  if (!supabase || !currentCommunityId) return [];

  const { data, error } = await supabase
    .from("connections")
    .select(`
      id, from_user_id, to_user_id, created_at, status, type,
      from_profile:from_user_id ( id, name, image_url, email ),
      to_profile:to_user_id ( id, name, image_url, email )
    `)
    .or(
      `and(from_user_id.eq.${currentCommunityId},status.eq.${STATUS.ACCEPTED}),` +
      `and(to_user_id.eq.${currentCommunityId},status.eq.${STATUS.ACCEPTED})`
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("getAcceptedConnections error:", error);
    return [];
  }

  return (data || []).map((row) => {
    const other =
      row.from_user_id === currentCommunityId ? row.to_profile : row.from_profile;

    return {
      ...row,
      community: other || null, // connectionRequests.js expects this
    };
  });
}

// ---------- Mutations ----------

export async function sendConnectionRequest(recipientCommunityId, targetName = "User", type = "generic") {
  try {
    if (!supabase) return { success: false, error: "Supabase not initialized" };
    if (!currentCommunityId) {
      showToast("Profile not found", "error");
      return { success: false, error: "Profile not found" };
    }
    if (!recipientCommunityId || recipientCommunityId === currentCommunityId) {
      showToast("Invalid recipient", "error");
      return { success: false, error: "Invalid recipient" };
    }

    const existing = await getConnectionBetween(currentCommunityId, recipientCommunityId);
    const existingStatus = String(existing?.status || "").toLowerCase();

    if (existing && (existingStatus === STATUS.PENDING || existingStatus === STATUS.ACCEPTED)) {
      showToast(`Request already ${existingStatus}`, "info");
      return { success: false, error: `Already ${existingStatus}` };
    }

    const safeType = normalizeType(type);

    const { error } = await supabase.from("connections").insert({
      from_user_id: currentCommunityId,
      to_user_id: recipientCommunityId,
      status: STATUS.PENDING,
      type: safeType,
    });

    if (error) {
      showToast(error.message || "Failed to connect", "error");
      return { success: false, error };
    }

    showToast(`✓ Request sent to ${targetName}`, "success");

    // Best-effort refresh hooks
    if (typeof window.refreshSynapseConnections === "function") {
      await window.refreshSynapseConnections();
    }
    window.dispatchEvent(new CustomEvent("connections-updated"));

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
    .update({ status: STATUS.ACCEPTED })
    .eq("id", connectionId);

  if (error) {
    showToast(error.message || "Failed to accept", "error");
    return { success: false, error };
  }

  showToast("Accepted!", "success");

  if (typeof window.refreshSynapseConnections === "function") {
    await window.refreshSynapseConnections();
  }
  window.dispatchEvent(new CustomEvent("connections-updated"));

  return { success: true };
}

// Receiver declines -> REJECTED (fits DB constraint + your UPDATE policy)
export async function declineConnectionRequest(connectionId) {
  if (!supabase || !connectionId) return { success: false };

  const { error } = await supabase
    .from("connections")
    .update({ status: STATUS.REJECTED })
    .eq("id", connectionId);

  if (error) {
    showToast(error.message || "Failed to decline", "error");
    return { success: false, error };
  }

  showToast("Request declined.", "info");

  if (typeof window.refreshSynapseConnections === "function") {
    await window.refreshSynapseConnections();
  }
  window.dispatchEvent(new CustomEvent("connections-updated"));

  return { success: true };
}

// Sender cancels a pending request -> DELETE the row
// This avoids status values your DB disallows and works with your DELETE policy.
export async function cancelConnectionRequest(connectionId) {
  if (!supabase || !connectionId) return { success: false };

  const { error } = await supabase
    .from("connections")
    .delete()
    .eq("id", connectionId);

  if (error) {
    showToast(error.message || "Failed to cancel request", "error");
    return { success: false, error };
  }

  showToast("Request cancelled.", "info");

  if (typeof window.refreshSynapseConnections === "function") {
    await window.refreshSynapseConnections();
  }
  window.dispatchEvent(new CustomEvent("connections-updated"));

  return { success: true };
}

export async function removeConnection(connectionId) {
  if (!supabase || !connectionId) return { success: false };

  const { error } = await supabase.from("connections").delete().eq("id", connectionId);

  if (error) {
    showToast(error.message || "Failed to remove connection", "error");
    return { success: false, error };
  }

  showToast("Connection removed.", "success");

  if (typeof window.refreshSynapseConnections === "function") {
    await window.refreshSynapseConnections();
  }
  window.dispatchEvent(new CustomEvent("connections-updated"));

  return { success: true };
}

// Compatibility utility expected by connectionRequests.js
export function formatTimeAgo(ts) {
  if (!ts) return "---";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "---";
  return d.toLocaleDateString();
}

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
