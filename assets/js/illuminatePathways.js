// illuminatePathways.js
// CharlestonHacks Innovation Engine — Illuminated Pathways (sequential recommendations)
// File: assets/js/illuminatePathways.js
//
// Purpose:
// - Owns the UX for "Illuminate Pathways" / Quick Connect
// - Shows recommended connections one-at-a-time with explanation + CTA
// - Draws the animated pathway via synapse/core.js + pathway-animations.js

function $(id) {
  return document.getElementById(id);
}

function safeText(v) {
  return (v === null || v === undefined) ? "" : String(v);
}

function safeArray(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  if (typeof v === "string") {
    // skills/interests can come in as comma-separated strings
    return v.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function formatReason(rec) {
  const parts = [];
  if (rec?.reason) parts.push(safeText(rec.reason));
  if (rec?.pathDistance !== undefined && rec?.pathDistance !== Infinity) {
    parts.push(`${rec.pathDistance} hop${rec.pathDistance === 1 ? "" : "s"} away`);
  }
  const skills = safeArray(rec?.matchedSkills);
  if (skills.length) parts.push(`Matched: ${skills.slice(0, 4).join(", ")}${skills.length > 4 ? "…" : ""}`);
  return parts.filter(Boolean).join(" • ");
}

async function sendConnectionRequestSafe({ fromId, toId }) {
  if (!fromId || !toId || fromId === toId) {
    return { ok: false, error: "missing_ids" };
  }

  // 1) Prefer a dedicated global module if present
  const cr = window.ConnectionRequests;
  const candidates = [
    cr?.sendConnectionRequest,
    cr?.sendRequest,
    cr?.requestConnection,
    cr?.createRequest,
    window.sendConnectionRequest,
    window.requestConnection,
  ].filter((fn) => typeof fn === "function");

  for (const fn of candidates) {
    try {
      const res = await fn(fromId, toId);
      return { ok: true, result: res };
    } catch (e) {
      // try next
    }
  }

  // 2) Fallback: direct insert into Supabase (schema-agnostic best-effort)
  try {
    const mod = await import("./supabaseClient.js");
    const sb = mod?.supabase || window.supabase;
    if (!sb?.from) throw new Error("Supabase client not available");

    const payloads = [
      { requester_id: fromId, requestee_id: toId, status: "pending" },
      { from_id: fromId, to_id: toId, status: "pending" },
      { source_id: fromId, target_id: toId, status: "pending" },
      { user_id: fromId, other_user_id: toId, status: "pending" },
    ];

    let lastErr = null;
    for (const data of payloads) {
      const { error } = await sb.from("connections").insert(data);
      if (!error) return { ok: true, result: { inserted: true, data } };
      lastErr = error;
    }

    return { ok: false, error: lastErr?.message || "insert_failed" };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function ensureNarratorUI(modalEl) {
  if (!modalEl) return null;
  let wrap = modalEl.querySelector("#illuminateNarrator");
  if (wrap) return wrap;

  // Try to find a reasonable body area inside the modal
  const body = modalEl.querySelector(".modal-body") || modalEl.querySelector(".modal-content") || modalEl;

  wrap = document.createElement("div");
  wrap.id = "illuminateNarrator";
  wrap.style.cssText = "display:flex; flex-direction:column; gap:12px; padding:14px; border:1px solid rgba(0,224,255,0.25); border-radius:14px; background:rgba(0,0,0,0.25);";

  wrap.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
      <div>
        <div id="illuminateTitle" style="font-weight:800; font-size:15px; letter-spacing:0.3px;">Illuminated Pathways</div>
        <div id="illuminateProgress" style="opacity:0.75; font-size:12px; margin-top:2px;">—</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button id="illuminatePrev" class="btn btn-sm" type="button">◀</button>
        <button id="illuminateNext" class="btn btn-sm" type="button">▶</button>
        <button id="illuminateStop" class="btn btn-sm" type="button">Stop</button>
      </div>
    </div>

    <div style="display:flex; gap:12px; align-items:flex-start;">
      <div id="illuminateAvatar" style="width:48px; height:48px; border-radius:14px; overflow:hidden; background:rgba(0,224,255,0.08); flex:0 0 48px;"></div>
      <div style="flex:1; min-width:0;">
        <div id="illuminateName" style="font-weight:800; font-size:16px; line-height:1.2;">—</div>
        <div id="illuminateMeta" style="opacity:0.75; font-size:12px; margin-top:2px;">—</div>
        <div id="illuminateReason" style="opacity:0.92; font-size:13px; margin-top:8px; line-height:1.35;">—</div>
        <div id="illuminateChips" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:10px;"></div>
      </div>
    </div>

    <div style="display:flex; gap:10px; align-items:center; justify-content:flex-end; flex-wrap:wrap;">
      <button id="illuminateView" class="btn" type="button">View Profile</button>
      <button id="illuminateConnect" class="btn btn-primary" type="button">Connect</button>
    </div>
  `;

  body.prepend(wrap);
  return wrap;
}

async function trySendConnectionRequest(fromId, toId) {
  // Prefer an existing app-level helper if present
  const cr = window.ConnectionRequests;
  if (cr && typeof cr.sendRequest === "function") return cr.sendRequest(fromId, toId);
  if (cr && typeof cr.requestConnection === "function") return cr.requestConnection(fromId, toId);
  if (typeof window.sendConnectionRequest === "function") return window.sendConnectionRequest(fromId, toId);

  // Fallback: attempt a direct insert with common column names
  const mod = await import("./supabaseClient.js").catch(() => null);
  const sb = mod?.supabase || window.supabase;
  if (!sb) throw new Error("Supabase client not available");

  const candidates = [
    { requester_id: fromId, requestee_id: toId, status: "pending" },
    { from_id: fromId, to_id: toId, status: "pending" },
    { source_id: fromId, target_id: toId, status: "pending" },
    { user_id: fromId, connected_user_id: toId, status: "pending" },
  ];

  let lastErr = null;
  for (const row of candidates) {
    const { error } = await sb.from("connections").insert(row).select().maybeSingle();
    if (!error) return true;
    lastErr = error;
  }
  throw lastErr || new Error("Failed to insert connection request");
}

function tryClickNodeElement(targetId) {
  if (!targetId) return false;

  const selectors = [
    `.synapse-node[data-id="${CSS.escape(targetId)}"]`,
    `.synapse-node[data-node-id="${CSS.escape(targetId)}"]`,
    `#node-${CSS.escape(targetId)}`,
    `[data-node="${CSS.escape(targetId)}"]`,
    `[data-id="${CSS.escape(targetId)}"]`,
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  }

  // Fallback: emit an event that the graph or node-panel can optionally listen to
  window.dispatchEvent(new CustomEvent("synapse:open-node", { detail: { id: targetId } }));
  return false;
}

function ensureModal() {
  let modal = $("illuminated-pathways-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "illuminated-pathways-modal";
  modal.style.cssText = `
    position: fixed;
    left: 16px;
    bottom: 76px;
    width: min(520px, calc(100vw - 32px));
    background: rgba(10, 12, 20, 0.92);
    border: 1px solid rgba(0, 224, 255, 0.25);
    box-shadow: 0 12px 40px rgba(0,0,0,0.45);
    border-radius: 16px;
    z-index: 9999;
    backdrop-filter: blur(10px);
    color: #e9f7ff;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  `;

  modal.innerHTML = `
    <div style="padding: 14px 14px 10px 14px; display:flex; gap:12px; align-items:flex-start;">
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div>
            <div style="font-size: 12px; opacity:0.75; letter-spacing:0.12em; text-transform: uppercase;">Illuminated Pathways</div>
            <div id="ip-title" style="font-size: 18px; font-weight: 750; margin-top:4px; line-height:1.15;">—</div>
          </div>
          <button id="ip-close" title="Close" style="
            border: 1px solid rgba(255,255,255,0.15);
            background: rgba(255,255,255,0.06);
            color: #fff;
            border-radius: 10px;
            padding: 6px 10px;
            cursor: pointer;
          ">✕</button>
        </div>

        <div id="ip-meta" style="margin-top:10px; font-size: 13px; opacity:0.9; line-height:1.35;"></div>

        <div id="ip-reason" style="margin-top:10px; font-size: 13px; opacity:0.85; line-height:1.35;"></div>

        <div style="margin-top: 12px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <button id="ip-connect" style="
            border: 1px solid rgba(0,224,255,0.45);
            background: rgba(0,224,255,0.14);
            color: #e9ffff;
            border-radius: 12px;
            padding: 10px 12px;
            cursor: pointer;
            font-weight: 700;
          ">Connect</button>

          <button id="ip-prev" style="
            border: 1px solid rgba(255,255,255,0.15);
            background: rgba(255,255,255,0.06);
            color: #fff;
            border-radius: 12px;
            padding: 10px 12px;
            cursor: pointer;
          ">◀ Prev</button>

          <button id="ip-next" style="
            border: 1px solid rgba(255,255,255,0.15);
            background: rgba(255,255,255,0.06);
            color: #fff;
            border-radius: 12px;
            padding: 10px 12px;
            cursor: pointer;
          ">Next ▶</button>

          <div id="ip-progress" style="margin-left:auto; font-size: 12px; opacity:0.75;"></div>
        </div>

        <div style="margin-top: 10px; font-size: 12px; opacity:0.65;">
          Tip: Use <b>Connect</b> to open the node panel for this recommendation.
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
}

async function loadCore() {
  // Keep this dynamic so dashboardPane can load without hard dependency ordering
  return import("./synapse/core.js");
}

async function loadFallbackRecommendations(limit) {
  // Fallback to pathway-animations.js recommendation engine
  const m = await import("./pathway-animations.js");
  const recs = await m.generateRecommendations();
  return (Array.isArray(recs) ? recs : []).slice(0, limit);
}

export function initIlluminatedPathways(opts = {}) {
  const collapseBottomBar = typeof opts.collapseBottomBar === "function" ? opts.collapseBottomBar : null;
  const expandBottomBar = typeof opts.expandBottomBar === "function" ? opts.expandBottomBar : null;
  const getCurrentUserCommunityId = typeof opts.getCurrentUserCommunityId === "function" ? opts.getCurrentUserCommunityId : () => null;

  let active = false;
  let index = 0;
  let currentUserId = null;
  let recommendations = [];

  function close() {
    active = false;
    const modal = $("illuminated-pathways-modal");
    if (modal) modal.remove();

    // Clear any remaining overlays
    loadCore()
      .then((core) => core.clearConnectPathways?.())
      .catch(() => {});
    if (expandBottomBar) expandBottomBar();
  }

  async function renderStep() {
    const modal = ensureModal();

    const titleEl = $("ip-title");
    const metaEl = $("ip-meta");
    const reasonEl = $("ip-reason");
    const progEl = $("ip-progress");

    const rec = recommendations[index];
    const name = safeText(rec?.name || rec?.node?.name || rec?.node?.title || "Recommended connection");
    const type = safeText(rec?.type || rec?.node?.type || "person");
    const score = rec?.score;
    const distance = rec?.pathDistance;

    titleEl.textContent = name;

    const metaParts = [];
    metaParts.push(type === "project" ? "Project" : "Person");
    if (typeof score === "number") metaParts.push(`Score: ${score}`);
    if (typeof distance === "number" && isFinite(distance)) metaParts.push(`Hops: ${distance}`);
    metaEl.innerHTML = metaParts.map((p) => `<span style="margin-right:10px; opacity:0.9;">${p}</span>`).join("");

    reasonEl.textContent = formatReason(rec);

    progEl.textContent = `${index + 1} / ${recommendations.length}`;

    // Buttons
    $("ip-close").onclick = close;
    $("ip-prev").onclick = () => {
      index = (index - 1 + recommendations.length) % recommendations.length;
      showPathForCurrent();
      renderStep();
    };
    $("ip-next").onclick = () => {
      index = (index + 1) % recommendations.length;
      showPathForCurrent();
      renderStep();
    };
    const connectBtn = $("ip-connect");
    const viewBtn = $("ip-view");

    viewBtn.onclick = () => {
      const targetId = rec?.userId || rec?.id || rec?.node?.id;
      if (!targetId) return;
      // Prefer explicit node panel opener if present
      if (typeof window.openNodePanel === "function") {
        window.openNodePanel(targetId);
        return;
      }
      // Fallback: simulate click on node
      tryClickNodeElement(targetId);
    };

    connectBtn.disabled = false;
    connectBtn.textContent = "Connect";
    connectBtn.onclick = async () => {
      const targetId = rec?.userId || rec?.id || rec?.node?.id;
      if (!targetId || !currentUserId) return;

      connectBtn.disabled = true;
      connectBtn.textContent = "Requesting…";

      const res = await sendConnectionRequestSafe({ fromId: currentUserId, toId: targetId });
      if (res?.ok) {
        connectBtn.textContent = "Requested ✓";
        if (window.showNotification) window.showNotification("Connection request sent", "success");
      } else {
        connectBtn.disabled = false;
        connectBtn.textContent = "Connect";
        const msg = res?.error ? `Couldn't send request (${res.error}).` : "Couldn't send request.";
        if (window.showNotification) window.showNotification(msg, "error");
        else console.warn(msg, res);
      }
    };

    // Auto draw path
    showPathForCurrent();
  }

  function showPathForCurrent() {
    const rec = recommendations[index];
    const targetId = rec?.userId || rec?.id || rec?.node?.id;
    if (!currentUserId || !targetId) return;

    loadCore()
      .then((core) => {
        core.clearConnectPathways?.();
        core.showConnectPathways?.(currentUserId, targetId, { duration: 1800 });
      })
      .catch(() => {});
  }

  async function showAnimatedPathways({ limit = 5 } = {}) {
    if (active) return;
    active = true;

    if (collapseBottomBar) collapseBottomBar();

    // determine current user
    const fromState = getCurrentUserCommunityId();
    currentUserId = fromState || null;

    // Fetch recommendations (prefer core.getRecommendations when available)
    try {
      const core = await loadCore();
      const stats = core.getSynapseStats?.() || {};
      if (!currentUserId) currentUserId = stats.currentUserCommunityId || null;

      if (typeof core.getRecommendations === "function") {
        recommendations = await core.getRecommendations({ limit });
      } else {
        recommendations = await loadFallbackRecommendations(limit);
      }
    } catch (e) {
      recommendations = await loadFallbackRecommendations(limit);
    }

    recommendations = Array.isArray(recommendations) ? recommendations.filter(Boolean) : [];

    if (!recommendations.length) {
      active = false;
      if (expandBottomBar) expandBottomBar();
      // Simple notification
      if (window.showNotification) window.showNotification("No recommendations yet—try adding skills/interests to your profile.", "info");
      else alert("No recommendations yet—try adding skills/interests to your profile.");
      return;
    }

    index = 0;
    await renderStep();
  }

  function openQuickConnectModal() {
    // Alias: Quick Connect now == illuminated pathways
    return showAnimatedPathways({ limit: 5 });
  }

  return { showAnimatedPathways, openQuickConnectModal, close };
}
