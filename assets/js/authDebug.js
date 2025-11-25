// ======================================================================
// CharlestonHacks – AUTH DEBUG PANEL (Viewport-Safe Version)
// Always visible — ignores page transforms
// Toggle with the on-screen 🐞 button
// ======================================================================

window.__LOGIN_STATE__ = window.__LOGIN_STATE__ || { handled: false };

// ---------------------------------------------------------
// 1. Create a top-level portal root that lives OUTSIDE layout
// ---------------------------------------------------------
function ensurePortalRoot() {
  let root = document.getElementById("auth-debug-portal");
  if (!root) {
    root = document.createElement("div");
    root.id = "auth-debug-portal";
    root.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      pointer-events: none !important;
      z-index: 999999999;
    `;
    document.body.appendChild(root);
  }
  return root;
}

// ---------------------------------------------------------
// 2. Create panel inside that portal (safe from transforms)
// ---------------------------------------------------------
function createDebugPanel(portal) {
  let panel = document.getElementById("auth-debug-overlay");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "auth-debug-overlay";

    panel.style.cssText = `
      position: absolute;
      bottom: 12px;
      right: 12px;
      width: 360px;
      max-height: 260px;
      overflow-y: auto;
      background: rgba(0,0,0,0.88);
      color: #0ff;
      font-size: 12px;
      font-family: monospace;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #0ff;
      display: none;
      pointer-events: auto;
      white-space: pre-wrap;
    `;

    portal.appendChild(panel);
  }
  return panel;
}

// ---------------------------------------------------------
// 3. Floating toggle button (also in portal)
// ---------------------------------------------------------
function createDebugButton(portal) {
  let btn = document.getElementById("debug-toggle-btn");
  if (!btn) {
    btn = document.createElement("div");
    btn.id = "debug-toggle-btn";

    btn.style.cssText = `
      position: absolute;
      bottom: 12px;
      right: 12px;
      width: 38px;
      height: 38px;
      background: rgba(0,255,255,0.14);
      backdrop-filter: blur(6px);
      border: 1px solid #0ff;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      font-size: 18px;
      color: #0ff;
      box-shadow: 0 0 10px rgba(0,255,255,0.4);
      z-index: 1000000000;
    `;

    btn.textContent = "🐞";
    portal.appendChild(btn);
  }
  return btn;
}

// ---------------------------------------------------------
// 4. Logging helper
// ---------------------------------------------------------
function makeLogger(panel) {
  return (msg) => {
    const entry = `[${new Date().toLocaleTimeString()}]\n${msg}\n\n`;
    panel.textContent = entry + panel.textContent;
  };
}

// ---------------------------------------------------------
// 5. Wait for supabase
// ---------------------------------------------------------
async function waitForSupabase() {
  while (!window.supabase) {
    await new Promise((r) => setTimeout(r, 30));
  }
  return window.supabase;
}

// ---------------------------------------------------------
// 6. Initialize the debugger
// ---------------------------------------------------------
async function initAuthDebug() {
  const supabase = await waitForSupabase();

  const portal = ensurePortalRoot();
  const panel = createDebugPanel(portal);
  const btn = createDebugButton(portal);

  const log = makeLogger(panel);
  let signInCount = 0;

  // Toggle handler
  btn.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  // Track auth events
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN") signInCount++;

    log(
`AUTH EVENT: ${event}
USER: ${session?.user?.email ?? "null"}
SIGNED_IN count: ${signInCount}
handled: ${window.__LOGIN_STATE__.handled}`
    );
  });

  // Polling
  async function refresh() {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;

    log(
`SESSION: ${session ? "ACTIVE" : "NONE"}
USER: ${session?.user?.email ?? "null"}

localStorage:
${Object.keys(localStorage).filter(k => k.includes("supabase")).join(", ")}

hash: ${window.location.hash.slice(0, 40)}…`
    );
  }

  setInterval(refresh, 2000);
  refresh();
}

initAuthDebug();
