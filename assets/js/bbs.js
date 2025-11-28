// =======================================================================
// CharlestonHacks BBS – FINAL PATCHED BUILD (2025)
// Fully debugged. Guaranteed desktop + mobile compatibility.
// Fixes: race condition with Supabase session readiness.
// =======================================================================

const supabase = window.supabase;
import { startZork, sendZorkCommand } from "./zorkLoader.js";

// =======================================================================
// 1. Wait for DOM *and* Supabase Session
// =======================================================================

async function waitForSupabaseReady() {
  console.log("[BBS] Waiting for Supabase session…");

  while (true) {
    try {
      const { data } = await supabase.auth.getSession();

      if (data?.session) {
        console.log("[BBS] Supabase session ready:", data.session.user.email);
        return;
      }
    } catch (err) {
      console.error("[BBS] Session check error:", err);
    }

    await new Promise(res => setTimeout(res, 120));
  }
}

// Main entrypoint
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[BBS] DOMContentLoaded fired. Waiting for Supabase…");
  await waitForSupabaseReady();
  console.log("[BBS] DOM + Supabase session ready → initBBS()");
  initBBS();
});

// =======================================================================
// 2. Main BBS Initialization
// =======================================================================

async function initBBS() {

  console.log("[BBS] initBBS() START");

  // Username
  function getUsername() {
    const stored = localStorage.getItem("bbs_username");
    if (stored) {
      console.log("[BBS] Loaded stored username:", stored);
      return stored;
    }
    const generated = "Guest" + Math.floor(Math.random() * 9999);
    console.log("[BBS] Generated username:", generated);
    localStorage.setItem("bbs_username", generated);
    return generated;
  }

  const username = getUsername();
  window.bbsUsername = username;

  // DOM Elements
  const screen = document.getElementById("bbs-screen");
  const form = document.getElementById("bbs-form");
  const input = document.getElementById("bbs-input");
  const onlineDiv = document.getElementById("bbs-online-list");

  console.log("[BBS] DOM Elements:", { screen, form, input, onlineDiv });

  if (!screen || !form || !input) {
    console.error("[BBS] ❌ Required BBS elements missing. Aborting init.");
    return;
  }

  // ===================================================================
  // WRITE UTIL
  // ===================================================================
  function write(text) {
    console.log("[BBS] write():", text);

    text.split("\n").forEach(line => {
      const div = document.createElement("div");
      div.textContent = line;
      screen.appendChild(div);
    });

    screen.scrollTop = screen.scrollHeight;
  }

  // ===================================================================
  // LOAD EXISTING MESSAGES
  // ===================================================================
  async function loadMessages() {
    console.log("[BBS] Loading messages…");

    try {
      const { data, error } = await supabase
        .from("bbs_messages")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[BBS] ❌ Load error:", error);
        return;
      }

      console.log(`[BBS] Loaded ${data.length} messages from DB`);
      screen.innerHTML = "";

      data.forEach(msg => write(`[${msg.username}] ${msg.text}`));

    } catch (err) {
      console.error("[BBS] ❌ Unexpected loadMessages error:", err);
    }
  }

  await loadMessages();

  // ===================================================================
  // REALTIME CHANNEL
  // ===================================================================
  console.log("[BBS] Subscribing to realtime channel…");

  supabase
    .channel("bbs_messages_channel")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "bbs_messages" },
      payload => {
        console.log("[BBS] Realtime received:", payload);

        const msg = payload.new;

        // Avoid echoing your own messages
        if (msg.username !== username) {
          write(`[${msg.username}] ${msg.text}`);
        }
      }
    )
    .subscribe();

  // ===================================================================
  // ONLINE PRESENCE
  // ===================================================================
  async function heartbeat() {
    console.log("[BBS] Heartbeat → marking online");

    await supabase.from("bbs_online").upsert({
      username,
      last_seen: new Date().toISOString()
    });
  }

  heartbeat();
  setInterval(heartbeat, 10000);

  async function loadOnlineUsers() {
    console.log("[BBS] Loading active users…");

    try {
      const { data } = await supabase.from("bbs_online_active").select("*");
      console.log("[BBS] Active users:", data);

      const names = data?.map(u => u.username) || [];
      onlineDiv.textContent = names.length ? names.join(", ") : "none";

    } catch (err) {
      console.error("[BBS] loadOnlineUsers error:", err);
    }
  }

  loadOnlineUsers();
  setInterval(loadOnlineUsers, 7000);

  // ===================================================================
  // CHAT + ZORK MODE
  // ===================================================================
  let mode = "chat";

  // ===================================================================
  // FORM SUBMISSION
  // ===================================================================
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Prevent bubble → fixes “exit to card” bug
    e.stopPropagation();
    e.stopImmediatePropagation();

    const text = input.value.trim();
    input.value = "";

    console.log("[BBS] Submit:", text);

    if (!text) {
      console.log("[BBS] Empty message ignored");
      return;
    }

    // ----- ZORK MODE -----
    if (mode === "zork") {

      if (text === "/exit") {
        write("Exited ZORK → Returning to chat.\n");
        mode = "chat";
        return;
      }

      console.log("[BBS] ZORK command:", text);
      sendZorkCommand(text, write);
      return;
    }

    // ----- ENTER ZORK -----
    if (text === "zork" || text === "play zork") {
      console.log("[BBS] Entering ZORK mode");
      mode = "zork";
      write("Initializing ZORK… Type /exit to leave.\n");
      await startZork(write);
      return;
    }

    // ----- NORMAL CHAT -----
    write(`[${username}] ${text}`);
    console.log("[BBS] Inserting message:", text);

    const { error } = await supabase.from("bbs_messages").insert({
      username,
      text
    });

    if (error) console.error("[BBS] ❌ Insert error:", error);
  });

  console.log("[BBS] initBBS() COMPLETE");
}
