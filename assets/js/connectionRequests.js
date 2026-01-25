// assets/js/connections.js
// Canonical connection manager — DB + RLS aligned
// Statuses: pending | accepted | rejected | canceled

let supabase = null;
let currentAuthUserId = null;
let currentCommunityId = null;

/* -------------------------------------
   INIT / CURRENT USER
------------------------------------- */
export async function initConnections(sb) {
  supabase = sb;
  await refreshCurrentUser();
  console.log("✓ Connections module initialized");
}

async function refreshCurrentUser() {
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return null;

  currentAuthUserId = user.id;

  const { data: profile } = await supabase
    .from("community")
    .select("id")
    .eq("user_id", currentAuthUserId)
    .single();

  currentCommunityId = profile?.id || null;
  return currentCommunityId;
}

export function getCurrentUserCommunityId() {
  return currentCommunityId;
}

/* -------------------------------------
   CORE QUERIES
------------------------------------- */
export async function getConnectionBetween(a, b) {
  if (!a || !b) return null;

  const filter = `
    and(from_user_id.eq.${a},to_user_id.eq.${b}),
    and(from_user_id.eq.${b},to_user_id.eq.${a})
  `;

  const { data } = await supabase
    .from("connections")
    .select("*")
    .or(filter)
    .order("created_at", { ascending: false })
    .limit(1);

  return data?.[0] || null;
}

export async function getConnectionStatus(targetCommunityId) {
  if (!currentCommunityId || !targetCommunityId) {
    return { status: "none", canConnect: true };
  }

  const conn = await getConnectionBetween(
    currentCommunityId,
    targetCommunityId
  );

  if (!conn) return { status: "none", canConnect: true };

  const status = conn.status;
  const isSender = conn.from_user_id === currentCommunityId;
  const isReceiver = conn.to_user_id === currentCommunityId;

  const canConnect =
    status === "rejected" || status === "canceled";

  return {
    status,
    connectionId: conn.id,
    isSender,
    isReceiver,
    canConnect,
  };
}

/* -------------------------------------
   LISTS FOR UI
------------------------------------- */
export async function getPendingRequestsSent() {
  if (!currentCommunityId) return [];

  const { data } = await supabase
    .from("connections")
    .select("*")
    .eq("from_user_id", currentCommunityId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return data || [];
}

export async function getPendingRequestsReceived() {
  if (!currentCommunityId) return [];

  const { data } = await supabase
    .from("connections")
    .select("*")
    .eq("to_user_id", currentCommunityId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return data || [];
}

export async function getAcceptedConnections() {
  if (!currentCommunityId) return [];

  const { data } = await supabase
    .from("connections")
    .select("*")
    .or(
      `and(from_user_id.eq.${currentCommunityId},status.eq.accepted),
       and(to_user_id.eq.${currentCommunityId},status.eq.accepted)`
    );

  return data || [];
}

/* -------------------------------------
   MUTATIONS
------------------------------------- */
export async function sendConnectionRequest(targetCommunityId) {
  if (!currentCommunityId || !targetCommunityId) return;

  const existing = await getConnectionBetween(
    currentCommunityId,
    targetCommunityId
  );

  if (existing && existing.status === "pending") return;

  await supabase.from("connections").insert({
    from_user_id: currentCommunityId,
    to_user_id: targetCommunityId,
    status: "pending",
    type: "generic",
  });

  refreshUI();
}

export async function acceptConnectionRequest(id) {
  await supabase
    .from("connections")
    .update({ status: "accepted" })
    .eq("id", id);

  refreshUI();
}

export async function declineConnectionRequest(id) {
  await supabase
    .from("connections")
    .update({ status: "rejected" })
    .eq("id", id);

  refreshUI();
}

export async function cancelConnectionRequest(id) {
  await supabase
    .from("connections")
    .update({ status: "canceled" })
    .eq("id", id);

  refreshUI();
}

export async function removeConnection(id) {
  await supabase.from("connections").delete().eq("id", id);
  refreshUI();
}

/* -------------------------------------
   HELPERS
------------------------------------- */
function refreshUI() {
  if (window.refreshPendingCount) window.refreshPendingCount();
  if (window.refreshSynapseConnections) window.refreshSynapseConnections();
}

export function formatTimeAgo(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString();
}

export default {
  initConnections,
  getPendingRequestsSent,
  getPendingRequestsReceived,
  getAcceptedConnections,
  sendConnectionRequest,
  acceptConnectionRequest,
  declineConnectionRequest,
  cancelConnectionRequest,
  removeConnection,
  getConnectionStatus,
  formatTimeAgo,
};
