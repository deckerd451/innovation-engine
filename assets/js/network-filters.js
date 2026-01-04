// ============================================================================
// CharlestonHacks Innovation Engine — Network Filters (robust + self-healing)
// File: assets/js/network-filters.js
//
// Goals:
// - Filters button always works (no null.style errors)
// - Panel exists even if dashboardPane.js expects a different ID
// - Filters actively hide/show nodes + links in #synapse-svg
// - Uses D3 if present; falls back to vanilla DOM
// ============================================================================

(function () {
  "use strict";

  const PANEL_IDS = [
    "filters-panel",
    "network-filters-panel",
    "filters-modal",
    "filtersDrawer",
  ];

  const STORAGE_KEY = "ch:networkFilters:v1";

  const DEFAULT_FILTERS = {
    types: {
      person: true,
      you: true,
      project: true,
    },
    availability: "any", // any | available | mentoring | opportunities | busy | not_available
    query: "", // name/skills/interests free text
    showSuggested: true, // if you draw "suggested" links
    showPending: true,   // if you draw "pending" links
    showConnected: true, // if you draw "connected" links
  };

  let state = loadState();

  // ---------------------------
  // Public API
  // ---------------------------
  window.NetworkFilters = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!isOpen()),
    get: () => ({ ...state }),
    set: (next) => {
      state = { ...DEFAULT_FILTERS, ...state, ...next };
      persistState();
      renderUIFromState();
      applyFiltersToGraph();
      emitChange();
    },
    applyNow: () => applyFiltersToGraph(),
  };

  // Also provide a global toggle hook (in case dashboardPane.js calls it)
  window.toggleFilters = function toggleFilters(forceOpen = null) {
    if (forceOpen === null) window.NetworkFilters.toggle();
    else setOpen(!!forceOpen);
  };

  // ---------------------------
  // Init
  // ---------------------------
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    // Make sure panel exists (with multiple IDs to satisfy other scripts)
    const panel = ensurePanelExists();

    // Wire the Filters bottom-bar button (exists in your dashboard HTML)
    const btn = document.getElementById("btn-filters");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        window.NetworkFilters.toggle();
      });
    }

    // Close on ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) setOpen(false);
    });

    // Apply once after a short delay so synapse has time to render
    setTimeout(() => {
      renderUIFromState();
      applyFiltersToGraph();
      emitReady(panel);
    }, 350);

    console.log("✅ Network filters ready");
  }

  // ---------------------------
  // Panel / UI
  // ---------------------------
  function ensurePanelExists() {
    // If any of the expected IDs already exists, use the first one found.
    for (const id of PANEL_IDS) {
      const existing = document.getElementById(id);
      if (existing) return existing;
    }

    // Otherwise, inject a single panel and clone alias nodes for other IDs.
    const panel = document.createElement("div");
    panel.id = PANEL_IDS[0];
    panel.setAttribute("data-ch-filters", "true");
    panel.style.cssText = [
      "position:fixed",
      "top:0",
      "right:0",
      "height:100vh",
      "width:min(420px, 92vw)",
      "background:rgba(10,14,39,0.97)",
      "backdrop-filter: blur(14px)",
      "border-left:2px solid rgba(0,224,255,0.35)",
      "box-shadow:-12px 0 40px rgba(0,0,0,0.45)",
      "z-index:2000",
      "transform:translateX(110%)",
      "transition:transform 220ms ease",
      "padding:16px",
      "display:block",
    ].join(";");

    panel.innerHTML = panelMarkup();
    document.body.appendChild(panel);

    // Create “alias” elements with the other IDs that point to the same panel
    // (so older code that does getElementById('filters-modal') won’t return null).
    for (let i = 1; i < PANEL_IDS.length; i++) {
      const alias = document.createElement("div");
      alias.id = PANEL_IDS[i];
      alias.style.display = "none"; // just exists to prevent null lookups
      alias.setAttribute("data-ch-filters-alias", PANEL_IDS[0]);
      document.body.appendChild(alias);
    }

    wirePanel(panel);
    return panel;
  }

  function panelMarkup() {
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center;
                      background:rgba(0,224,255,0.10); border:1px solid rgba(0,224,255,0.25); color:#00e0ff;">
            <span style="font-weight:900;">⎇</span>
          </div>
          <div>
            <div style="color:#00e0ff; font-weight:900; letter-spacing:0.4px;">Network Filters</div>
            <div style="color:#9bb0c8; font-size:12px;">Filter nodes + connections in your Synapse view</div>
          </div>
        </div>

        <button id="ch-filters-close"
          style="width:38px; height:38px; border-radius:12px; cursor:pointer;
                 background:rgba(255,255,255,0.06);
                 border:1px solid rgba(255,255,255,0.12);
                 color:white; font-size:18px;">
          ✕
        </button>
      </div>

      <div style="display:grid; gap:12px;">
        <div style="background:rgba(0,224,255,0.05); border:1px solid rgba(0,224,255,0.16); border-radius:14px; padding:12px;">
          <div style="color:#00e0ff; font-weight:800; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">
            Node Types
          </div>

          <label style="display:flex; align-items:center; gap:10px; color:#e7efff; padding:6px 0;">
            <input id="ch-type-person" type="checkbox" />
            People
          </label>

          <label style="display:flex; align-items:center; gap:10px; color:#e7efff; padding:6px 0;">
            <input id="ch-type-you" type="checkbox" />
            You
          </label>

          <label style="display:flex; align-items:center; gap:10px; color:#e7efff; padding:6px 0;">
            <input id="ch-type-project" type="checkbox" />
            Projects
          </label>
        </div>

        <div style="background:rgba(0,224,255,0.05); border:1px solid rgba(0,224,255,0.16); border-radius:14px; padding:12px;">
          <div style="color:#00e0ff; font-weight:800; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">
            Search
          </div>

          <input id="ch-filter-query" type="text" placeholder="Search name, skills, interests..."
            style="width:100%; padding:10px 12px; border-radius:12px;
                   background:rgba(0,224,255,0.05);
                   border:1px solid rgba(0,224,255,0.18);
                   color:white; outline:none;" />
        </div>

        <div style="background:rgba(0,224,255,0.05); border:1px solid rgba(0,224,255,0.16); border-radius:14px; padding:12px;">
          <div style="color:#00e0ff; font-weight:800; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">
            Availability
          </div>

          <select id="ch-filter-availability"
            style="width:100%; padding:10px 12px; border-radius:12px;
                   background:rgba(0,224,255,0.05);
                   border:1px solid rgba(0,224,255,0.18);
                   color:white; outline:none;">
            <option value="any">Any</option>
            <option value="available">Available now</option>
            <option value="mentoring">Available for mentoring</option>
            <option value="opportunities">Looking for opportunities</option>
            <option value="busy">Busy</option>
            <option value="not_available">Not available</option>
          </select>
        </div>

        <div style="background:rgba(0,224,255,0.05); border:1px solid rgba(0,224,255,0.16); border-radius:14px; padding:12px;">
          <div style="color:#00e0ff; font-weight:800; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">
            Connections
          </div>

          <label style="display:flex; align-items:center; gap:10px; color:#e7efff; padding:6px 0;">
            <input id="ch-link-connected" type="checkbox" />
            Connected
          </label>

          <label style="display:flex; align-items:center; gap:10px; color:#e7efff; padding:6px 0;">
            <input id="ch-link-pending" type="checkbox" />
            Pending
          </label>

          <label style="display:flex; align-items:center; gap:10px; color:#e7efff; padding:6px 0;">
            <input id="ch-link-suggested" type="checkbox" />
            Suggested
          </label>
        </div>

        <div style="display:flex; gap:10px;">
          <button id="ch-filters-reset"
            style="flex:1; padding:12px 14px; border-radius:14px; cursor:pointer;
                   background:rgba(255,255,255,0.06);
                   border:1px solid rgba(255,255,255,0.12);
                   color:white; font-weight:800;">
            Reset
          </button>

          <button id="ch-filters-apply"
            style="flex:1; padding:12px 14px; border-radius:14px; cursor:pointer;
                   background:linear-gradient(135deg,#00e0ff,#0080ff);
                   border:none; color:white; font-weight:900;">
            Apply
          </button>
        </div>

        <div id="ch-filters-status" style="color:#9bb0c8; font-size:12px; margin-top:4px;"></div>
      </div>
    `;
  }

  function wirePanel(panel) {
    panel.querySelector("#ch-filters-close")?.addEventListener("click", () => setOpen(false));
    panel.querySelector("#ch-filters-reset")?.addEventListener("click", () => {
      state = { ...DEFAULT_FILTERS };
      persistState();
      renderUIFromState();
      applyFiltersToGraph();
      emitChange();
    });
    panel.querySelector("#ch-filters-apply")?.addEventListener("click", () => {
      readStateFromUI();
      persistState();
      applyFiltersToGraph();
      emitChange();
    });

    // Live update for query (nice UX)
    panel.querySelector("#ch-filter-query")?.addEventListener("input", () => {
      readStateFromUI();
      persistState();
      applyFiltersToGraph();
      emitChange();
    });

    // Change handlers for rest
    [
      "#ch-type-person",
      "#ch-type-you",
      "#ch-type-project",
      "#ch-filter-availability",
      "#ch-link-connected",
      "#ch-link-pending",
      "#ch-link-suggested",
    ].forEach((sel) => {
      panel.querySelector(sel)?.addEventListener("change", () => {
        readStateFromUI();
        persistState();
        applyFiltersToGraph();
        emitChange();
      });
    });
  }

  function renderUIFromState() {
    const panel = getPanel();
    if (!panel) return;

    setChecked(panel, "#ch-type-person", !!state.types.person);
    setChecked(panel, "#ch-type-you", !!state.types.you);
    setChecked(panel, "#ch-type-project", !!state.types.project);

    setValue(panel, "#ch-filter-query", state.query || "");
    setValue(panel, "#ch-filter-availability", state.availability || "any");

    setChecked(panel, "#ch-link-connected", !!state.showConnected);
    setChecked(panel, "#ch-link-pending", !!state.showPending);
    setChecked(panel, "#ch-link-suggested", !!state.showSuggested);

    updateStatus();
  }

  function readStateFromUI() {
    const panel = getPanel();
    if (!panel) return;

    state.types.person = !!panel.querySelector("#ch-type-person")?.checked;
    state.types.you = !!panel.querySelector("#ch-type-you")?.checked;
    state.types.project = !!panel.querySelector("#ch-type-project")?.checked;

    state.query = (panel.querySelector("#ch-filter-query")?.value || "").trim();
    state.availability = panel.querySelector("#ch-filter-availability")?.value || "any";

    state.showConnected = !!panel.querySelector("#ch-link-connected")?.checked;
    state.showPending = !!panel.querySelector("#ch-link-pending")?.checked;
    state.showSuggested = !!panel.querySelector("#ch-link-suggested")?.checked;

    updateStatus();
  }

  function updateStatus() {
    const panel = getPanel();
    const el = panel?.querySelector("#ch-filters-status");
    if (!el) return;

    const parts = [];
    parts.push(`Types: ${enabledTypesLabel()}`);
    if (state.query) parts.push(`Search: "${state.query}"`);
    if (state.availability !== "any") parts.push(`Availability: ${state.availability}`);
    el.textContent = parts.join(" • ");
  }

  function enabledTypesLabel() {
    const arr = [];
    if (state.types.person) arr.push("People");
    if (state.types.you) arr.push("You");
    if (state.types.project) arr.push("Projects");
    return arr.length ? arr.join(", ") : "None";
  }

  // ---------------------------
  // Open / Close
  // ---------------------------
  function getPanel() {
    return document.getElementById(PANEL_IDS[0]) || document.querySelector('[data-ch-filters="true"]');
  }

  function isOpen() {
    const panel = getPanel();
    if (!panel) return false;
    return panel.getAttribute("data-open") === "true";
  }

  function setOpen(open) {
    const panel = getPanel();
    if (!panel) return;

    panel.setAttribute("data-open", open ? "true" : "false");
    panel.style.transform = open ? "translateX(0)" : "translateX(110%)";

    // When opening, sync UI
    if (open) renderUIFromState();
  }

  // ---------------------------
  // Apply filters to graph
  // ---------------------------
  function applyFiltersToGraph() {
    // Prefer: if synapse exposes an API, use it (optional future)
    if (window.Synapse && typeof window.Synapse.applyFilters === "function") {
      window.Synapse.applyFilters({ ...state });
      return;
    }

    // Otherwise: filter DOM
    const svg = document.getElementById("synapse-svg");
    if (!svg) return;

    const d3ok = typeof window.d3 !== "undefined" && typeof window.d3.selectAll === "function";
    if (d3ok) applyWithD3(svg);
    else applyWithDOM(svg);
  }

  function applyWithD3(svg) {
    const nodeSel = window.d3.select(svg).selectAll(
      ".node, g.node, .synapse-node, g.synapse-node, .person-node, .project-node"
    );

    const linkSel = window.d3.select(svg).selectAll(
      ".link, line.link, path.link, .synapse-link, line.synapse-link, path.synapse-link"
    );

    // Build visibility map
    const visibleById = new Map();

    nodeSel.each(function (d) {
      const datum = d || this.__data__ || {};
      const id = pickId(datum);
      const visible = nodePasses(datum);
      if (id != null) visibleById.set(String(id), visible);
    });

    // Apply node visibility
    nodeSel.style("display", function (d) {
      const datum = d || this.__data__ || {};
      const id = pickId(datum);
      const visible = id != null ? visibleById.get(String(id)) : nodePasses(datum);
      return visible ? null : "none";
    });

    // Apply link visibility (hide if either endpoint hidden OR link-type filtered out)
    linkSel.style("display", function (d) {
      const datum = d || this.__data__ || {};
      const linkOk = linkPasses(datum);
      if (!linkOk) return "none";

      const s = pickEndpointId(datum.source);
      const t = pickEndpointId(datum.target);

      if (s && visibleById.has(s) && !visibleById.get(s)) return "none";
      if (t && visibleById.has(t) && !visibleById.get(t)) return "none";
      return null;
    });
  }

  function applyWithDOM(svg) {
    const nodes = svg.querySelectorAll(".node, g.node, .synapse-node, g.synapse-node");
    const links = svg.querySelectorAll(".link, line.link, path.link, .synapse-link, line.synapse-link, path.synapse-link");

    const visibleById = new Map();

    nodes.forEach((el) => {
      const datum = el.__data__ || {};
      const id = pickId(datum);
      const visible = nodePasses(datum);
      if (id != null) visibleById.set(String(id), visible);
      el.style.display = visible ? "" : "none";
    });

    links.forEach((el) => {
      const datum = el.__data__ || {};
      const linkOk = linkPasses(datum);
      if (!linkOk) {
        el.style.display = "none";
        return;
      }
      const s = pickEndpointId(datum.source);
      const t = pickEndpointId(datum.target);
      if (s && visibleById.has(s) && !visibleById.get(s)) el.style.display = "none";
      else if (t && visibleById.has(t) && !visibleById.get(t)) el.style.display = "none";
      else el.style.display = "";
    });
  }

  function nodePasses(d) {
    const type = normalizeType(d);
    if (type === "person" && !state.types.person) return false;
    if (type === "you" && !state.types.you) return false;
    if (type === "project" && !state.types.project) return false;

    // Availability filter (only meaningful on people/you)
    if (state.availability !== "any" && (type === "person" || type === "you")) {
      const av = String(d.availability || "").toLowerCase();
      if (!availabilityMatches(av, state.availability)) return false;
    }

    // Query filter (name, skills, interests)
    if (state.query) {
      const q = state.query.toLowerCase();
      const name = String(d.name || d.title || "").toLowerCase();
      const skills = normalizeTextArray(d.skills);
      const interests = normalizeTextArray(d.interests);

      const hay = [name, skills, interests].join(" ");
      if (!hay.includes(q)) return false;
    }

    return true;
  }

  function linkPasses(d) {
    // If your link datum has something like status/type: connected/pending/suggested
    const raw = String(d.status || d.type || d.kind || "").toLowerCase();

    // If it doesn't exist, we let it pass (so we don't accidentally hide everything)
    if (!raw) return true;

    if (raw.includes("connected") || raw.includes("accepted")) return !!state.showConnected;
    if (raw.includes("pending") || raw.includes("request")) return !!state.showPending;
    if (raw.includes("suggested") || raw.includes("recommend")) return !!state.showSuggested;

    return true;
  }

  function availabilityMatches(av, filter) {
    if (filter === "available") return av.includes("available now") || av === "available" || av.includes("available");
    if (filter === "mentoring") return av.includes("mentoring");
    if (filter === "opportunities") return av.includes("opportun");
    if (filter === "busy") return av.includes("busy");
    if (filter === "not_available") return av.includes("not available") || av.includes("unavailable");
    return true;
  }

  function normalizeType(d) {
    const t = String(d.type || d.node_type || d.kind || d.category || "").toLowerCase();

    // Common patterns seen in your UI/legend
    if (t.includes("project")) return "project";
    if (t.includes("you") || t.includes("self") || t.includes("me")) return "you";
    if (t.includes("person") || t.includes("user") || t.includes("community")) return "person";

    // Fallback: if it has "project" shape data
    if (d.members || d.project_name) return "project";

    // Default: treat as person (safer)
    return "person";
  }

  function normalizeTextArray(v) {
    if (!v) return "";
    if (Array.isArray(v)) return v.map((x) => String(x || "").toLowerCase()).join(" ");
    return String(v).toLowerCase();
  }

  function pickId(d) {
    return d.id ?? d.node_id ?? d.user_id ?? d.uuid ?? d.key ?? d.email ?? null;
  }

  function pickEndpointId(ep) {
    if (!ep) return null;
    if (typeof ep === "string" || typeof ep === "number") return String(ep);
    const d = ep.__data__ || ep;
    const id = pickId(d);
    return id != null ? String(id) : null;
  }

  // ---------------------------
  // Events + state
  // ---------------------------
  function emitChange() {
    window.dispatchEvent(new CustomEvent("network-filters-changed", { detail: { ...state } }));
  }

  function emitReady(panel) {
    window.dispatchEvent(new CustomEvent("network-filters-ready", { detail: { panelId: panel?.id || PANEL_IDS[0] } }));
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_FILTERS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_FILTERS, ...parsed, types: { ...DEFAULT_FILTERS.types, ...(parsed.types || {}) } };
    } catch {
      return { ...DEFAULT_FILTERS };
    }
  }

  // ---------------------------
  // Tiny helpers
  // ---------------------------
  function setChecked(root, sel, val) {
    const el = root.querySelector(sel);
    if (el) el.checked = !!val;
  }

  function setValue(root, sel, val) {
    const el = root.querySelector(sel);
    if (el) el.value = val;
  }
})();
