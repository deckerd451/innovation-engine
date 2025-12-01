// =======================================================================
// CharlestonHacks BBS – FINAL WORKING BUILD (2025)
// Supabase-safe, waits for window.supabase, waits for session, fully stable
// =======================================================================

import { startZork, sendZorkCommand } from "./zorkLoader.js";

let supabase = null;

// =======================================================================
// 0. WAIT FOR window.supabase (main.js must load first)
// =======================================================================
async function waitForWindowSupabase() {
  return new Promise(resolve => {
    const check = setInterval(() => {
      if (window.supabase) {
        clearInterval(check);
        resolve(window.supabase);
      }
    }, 40);
  });
}

// =======================================================================
// 1. WAIT FOR AUTH SESSION
// =======================================================================
async function waitForSupabaseSession() {
  return new Promise(resolve => {
    let resolved = false;

    // Immediate session check
    window.supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        resolved = true;
        resolve(data.session);
      }
    });

    // Listener for future events
    window.supabase.auth.onAuthStateChange((event, session) => {
      if (!resolved && session) {
        resolved = true;
        resolve(session);
      }
    });
  });
}

// =======================================================================
// 2. DOMContentLoaded → Bootstrap BBS
// =======================================================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[BBS] DOMContentLoaded → Waiting for supabase…");

  // Wait for main.js to attach supabase
  supabase = await waitForWindowSupabase();
  console.log("[BBS] window.supabase is ready:", supabase);

  // Wait for a valid session
  console.log("[BBS] Waiting for auth session…");
  await waitForSupabaseSession();
  console.log("[BBS] Auth session detected.");

  initBBS();
});

// =======================================================================
// 3. MAIN BBS INITIALIZATION
// =======================================================================
async function initBBS() {
  console.log("[BBS] initBBS() START");

  // Username system
  function getUsername() {
    const stored = localStorage.getItem("bbs_username");
    if (stored) return stored;

    const generated = "Guest" + Math.floor(Math.random() * 9999);
    localStorage.setItem("bbs_username", generated);
    return generated;
  }

  const username = getUsername();
  window.bbsUsername = username;

  // DOM
  const screen = document.getElementById("bbs-screen");
  const form = document.getElementById("bbs-form");
  const input = document.getElementById("bbs-input");
  const onlineDiv = document.getElementById("bbs-online-list");

  if (!screen || !form || !input) {
    console.error("[BBS] ❌ Required BBS elements missing from DOM.");
    return;
  }

  // Write function
  function write(text) {
    text.split("\n").forEach(line => {
      const div = document.createElement("div");
      div.textContent = line;
      screen.appendChild(div);
    });
    screen.scrollTop = screen.scrollHeight;
  }

  // ===================================================================
  // LOAD MESSAGE HISTORY
  // ===================================================================
  async function loadMessages() {
    console.log("[BBS] Loading messages…");

    const { data, error } = await supabase
      .from("bbs_messages")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[BBS] Load messages failed:", error);
      return;
    }

    screen.innerHTML = "";
    data.forEach(msg => write(`[${msg.username}] ${msg.text}`));
  }

  await loadMessages();

  // ===================================================================
  // REALTIME CHANNEL
  // ===================================================================
  supabase
    .channel("bbs_messages_channel")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "bbs_messages" },
      payload => {
        const msg = payload.new;
        if (msg.username !== username) {
          write(`[${msg.username}] ${msg.text}`);
        }
      }
    )
    .subscribe();

  // ===================================================================
  // HEARTBEAT (online presence)
  // ===================================================================
  async function heartbeat() {
    await supabase.from("bbs_online").upsert({
      username,
      last_seen: new Date().toISOString()
    });
  }

  heartbeat();
  setInterval(heartbeat, 10000);

  // Active users
  async function loadOnlineUsers() {
    const { data } = await supabase.from("bbs_online_active").select("*");
    const names = data?.map(u => u.username) || [];
    onlineDiv.textContent = names.length ? names.join(", ") : "none";
  }

  loadOnlineUsers();
  setInterval(loadOnlineUsers, 7000);

  // ===================================================================
  // CHAT + ZORK MODE
  // ===================================================================
  let mode = "chat";

  form.addEventListener("submit", async e => {
    e.preventDefault();
    e.stopPropagation();

    const text = input.value.trim();
    input.value = "";

    if (!text) return;

    // ----- ZORK MODE -----
    if (mode === "zork") {
      if (text === "/exit") {
        write("Exited ZORK → back to chat.\n");
        mode = "chat";
        return;
      }

      sendZorkCommand(text, write);
      return;
    }

    // ----- ENTER ZORK -----
    if (text === "zork" || text === "play zork") {
      write("Entering ZORK… Type /exit to leave.\n");
      mode = "zork";
      await startZork(write);
      return;
    }

    // ----- NORMAL CHAT -----
    write(`[${username}] ${text}`);

    const { error } = await supabase.from("bbs_messages").insert({
      username,
      text
    });

    if (error) console.error("[BBS] Insert error:", error);
  });

  console.log("[BBS] initBBS() COMPLETE");
}
