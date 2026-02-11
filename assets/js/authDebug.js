// AUTH DEBUG PANEL – CLEAN FINAL VERSION (NO HTML COMMENTS)
// Creates a debug panel + works with a floating toggle button

window.__LOGIN_STATE__ = window.__LOGIN_STATE__ || { handled: false };

function createDebugPanel() {
  let panel = document.getElementById("auth-debug-overlay");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "auth-debug-overlay";
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      max-width: 90vw;
      width: 360px;
      max-height: 40vh;
      overflow-y: auto;
      background: rgba(0,0,0,0.88);
      color: #0ff;
      font-size: 12px;
      font-family: monospace;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid #0ff;
      z-index: 999999;
      white-space: pre-wrap;
      display: none;
    `;
    document.body.appendChild(panel);
  }
  return panel;
}

function logger(panel) {
  return function (msg) {
    const entry = `[${new Date().toLocaleTimeString()}]\n${msg}\n\n`;
    panel.textContent = entry + panel.textContent;
  };
}

async function waitForSupabase() {
  while (!window.supabase) {
    await new Promise(res => setTimeout(res, 30));
  }
  return window.supabase;
}

async function initAuthDebug() {
  const supabase = await waitForSupabase();
  const panel = createDebugPanel();
  const log = logger(panel);

  let signInCount = 0;

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN") signInCount++;

    log(
      `AUTH EVENT: ${event}
USER: ${session?.user?.email || "null"}
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
localStorage: ${Object.keys(localStorage).filter(k => k.includes("supabase")).join(", ")}

hash: ${window.location.hash.slice(0, 50)}`
    );
  }

  setInterval(refresh, 2000);
  refresh();

  const btn = document.getElementById("debug-toggle-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    });
  }
}

initAuthDebug();
