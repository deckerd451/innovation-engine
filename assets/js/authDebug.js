// ======================================================================
// CharlestonHacks – AUTH DEBUG PANEL (GLOBAL MODULE)
// Toggle with: CTRL + `
// Works on any page that loads supabaseClient.js
// ======================================================================

/* ---------------------------------------------------------
   1. Setup reusable login state guard
--------------------------------------------------------- */
window.__LOGIN_STATE__ = window.__LOGIN_STATE__ || { handled: false };

/* ---------------------------------------------------------
   2. Wait until supabase client is ready
--------------------------------------------------------- */
async function waitForSupabase() {
  while (!window.supabase) {
    await new Promise(res => setTimeout(res, 30));
  }
  return window.supabase;
}

/* ---------------------------------------------------------
   3. Initialize Debug Panel UI
--------------------------------------------------------- */
function createDebugPanel() {
  let panel = document.getElementById("auth-debug-overlay");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "auth-debug-overlay";
    panel.style.position = "fixed";
    panel.style.bottom = "0";
    panel.style.right = "0";
    panel.style.width = "380px";
    panel.style.maxHeight = "330px";
    panel.style.overflowY = "auto";
    panel.style.background = "rgba(0,0,0,0.88)";
    panel.style.color = "#0ff";
    panel.style.fontSize = "12px";
    panel.style.fontFamily = "monospace";
    panel.style.padding = "14px";
    panel.style.borderTopLeftRadius = "10px";
    panel.style.borderLeft = "1px solid #0ff";
    panel.style.borderTop = "1px solid #0ff";
    panel.style.zIndex = "999999";
    panel.style.whiteSpace = "pre-wrap";
    panel.style.display = "none";

    document.body.appendChild(panel);
  }

  return panel;
}

/* ---------------------------------------------------------
   4. Logging helper
--------------------------------------------------------- */
function makeLogger(panel) {
  return function log(message) {
    const entry = `[${new Date().toLocaleTimeString()}]\n${message}\n\n`;
    panel.textContent = entry + panel.textContent;

    panel.animate(
      [
        { borderColor: "#0ff" },
        { borderColor: "#f0f" },
        { borderColor: "#0ff" }
      ],
      { duration: 500, iterations: 1 }
    );
  };
}

/* ---------------------------------------------------------
   5. Initialize Debug Logic
--------------------------------------------------------- */
async function initAuthDebug() {
  const supabase = await waitForSupabase();
  const panel = createDebugPanel();
  const log = makeLogger(panel);

  let signInCount = 0;

  // Keyboard toggle
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "`") {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });

  // Auth event listener
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN") signInCount++;

    log(
`AUTH EVENT: ${event}
SIGNED_IN count: ${signInCount}
USER: ${session?.user?.email ?? "null"}
LOGIN GUARD: handled = ${window.__LOGIN_STATE__?.handled}
`
    );
  });

  // Poll session for debugging state transitions
  async function refreshState() {
    const { data } = await supabase.auth.getSession();

    log(
`CURRENT SESSION:
${JSON.stringify(data?.session, null, 2)}

URL HASH: ${window.location.hash.replace(/access_token.*/, "access_token…")}

localStorage Keys:
${Object.keys(localStorage).filter(k => k.includes("supabase")).join("\n")}
`
    );
  }

  setInterval(refreshState, 1500);
  refreshState();
}

/* ---------------------------------------------------------
   BOOTSTRAP DEBUGGER
--------------------------------------------------------- */
initAuthDebug();
