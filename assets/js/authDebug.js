// ======================================================================
// CharlestonHacks – AUTH DEBUG PANEL (CLEAN OUTPUT VERSION)
// Toggle via on-screen 🐞 button
// ======================================================================

window.__LOGIN_STATE__ = window.__LOGIN_STATE__ || { handled: false };

async function waitForSupabase() {
  while (!window.supabase) {
    await new Promise(res => setTimeout(res, 30));
  }
  return window.supabase;
}

function createDebugPanel() {
  let panel = document.getElementById("auth-debug-overlay");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "auth-debug-overlay";
    panel.style.cssText = `
      position: fixed;
      bottom: 0;
      right: 0;
      width: 350px;
      max-height: 260px;
      overflow-y: auto;
      background: rgba(0,0,0,0.88);
      color: #0ff;
      font-size: 12px;
      font-family: monospace;
      padding: 12px;
      border-top-left-radius: 10px;
      border-left: 1px solid #0ff;
      border-top: 1px solid #0ff;
      z-index: 999999;
      white-space: pre-wrap;
      display: none;
    `;
    document.body.appendChild(panel);
  }
  return panel;
}

function makeLogger(panel) {
  return function log(msg) {
    const entry = `[${new Date().toLocaleTimeString()}]\n${msg}\n\n`;
    panel.textContent = entry + panel.textContent;

    panel.animate(
      [{ borderColor: "#0ff" }, { borderColor: "#f0f" }, { borderColor: "#0ff" }],
      { duration: 400, iterations: 1 }
    );
  };
}

async function initAuthDebug() {
  const supabase = await waitForSupabase();
  const panel = createDebugPanel();
  const log = makeLogger(panel);

  let signInCount = 0;

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN") signInCount++;

    const email = session?.user?.email || "null";

    log(
`AUTH EVENT: ${event}
USER: ${email}
SIGNED_IN count: ${signInCount}
handled: ${window.__LOGIN_STATE__.handled}`
    );
  });

  async function refresh() {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;

    log(
`SESSION: ${session ? "ACTIVE" : "NONE"}
USER: ${session?.user?.email || "null"}
localStorage:
${Object.keys(localStorage).filter(k => k.includes("supabase")).join(", ")}

hash: ${window.location.hash.slice(0, 40)}…`
    );
  }

  setInterval(refresh, 2000);
  refresh();
}

initAuthDebug();
