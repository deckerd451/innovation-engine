// =======================================================================
// CharlestonHacks BBS 2025 — DEBUG BUILD
// Logs everything. Prevents unintentional close. 
// =======================================================================

import { supabase } from "./supabaseClient.js";
import { startZork, sendZorkCommand } from "./zorkLoader.js";

// Wait for DOM — required fix
document.addEventListener("DOMContentLoaded", () => {
  console.log("[BBS] DOMContentLoaded fired → initializing BBS");
  initBBS();
});

async function initBBS() {

  console.log("[BBS] initBBS() START");

  // --------------------------------------------------------------
  // USERNAME
  // --------------------------------------------------------------
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

  // --------------------------------------------------------------
  // DOM CHECK
  // --------------------------------------------------------------
  const screen = document.getElementById("bbs-screen");
  const form   = document.getElementById("bbs-form");
  const input  = document.getElementById("bbs-input");
  const online = document.getElementById("bbs-online-list");

  console.log("[BBS] DOM Elements:", { screen, form, input, online });

  if (!screen || !form || !input) {
    console.error("[BBS] ❌ Required DOM nodes missing. ABORTING INIT.");
    return;
  }

  // --------------------------------------------------------------
  // WRITE TO SCREEN
  // --------------------------------------------------------------
  function write(text) {
    console.log("[BBS] write():", text);

    text.split("\n").forEach(line => {
      const div = document.createElement("div");
      div.textContent = line;
      screen.appendChild(div);
    });

    screen.scrollTop = screen.scrollHeight;
  }

  // --------------------------------------------------------------
  // LOAD MESSAGES
  // --------------------------------------------------------------
  async function loadMessages() {
    console.log("[BBS] Loading messages…");

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
  }

  await loadMessages();

  // --------------------------------------------------------------
  // REALTIME
  // --------------------------------------------------------------
  console.log("[BBS] Subscribing to realtime channel…");

  supabase
    .channel("bbs_messages_channel")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "bbs_messages" },
      payload => {
        console.log("[BBS] Realtime insert received:", payload);
        const msg = payload.new;
        if (msg.username !== username) {
          write(`[${msg.username}] ${msg.text}`);
        }
      }
    )
    .subscribe();

  // --------------------------------------------------------------
  // HEARTBEAT
  // --------------------------------------------------------------
  async function heartbeat() {
    console.log("[BBS] Heartbeat → marking user online");

    await supabase.from("bbs_online").upsert({
      username,
      last_seen: new Date().toISOString()
    });
  }

  heartbeat();
  setInterval(heartbeat, 10000);

  // --------------------------------------------------------------
  // LOAD ONLINE USERS
  // --------------------------------------------------------------
  async function loadOnline() {
    console.log("[BBS] Loading online users…");

    const { data } = await supabase.from("bbs_online_active").select("*");

    console.log("[BBS] Online users:", data);

    online.textContent = data?.map(u => u.username).join(", ") || "none";
  }

  loadOnline();
  setInterval(loadOnline, 7000);

  // --------------------------------------------------------------
  // ZORK MODE
  // --------------------------------------------------------------
  let mode = "chat";

  // --------------------------------------------------------------
  // FORM SUBMISSION
  // --------------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    console.log("[BBS] Form submit triggered with value:", input.value);

    // THE FIX: prevent the click from closing the popup
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const text = input.value.trim();
    input.value = "";

    if (!text) {
      console.log("[BBS] Empty message ignored.");
      return;
    }

    // ZORK mode
    if (mode === "zork") {
      console.log("[BBS] ZORK command:", text);

      if (text === "/exit") {
        write("Exited ZORK → Returning to chat.\n");
        mode = "chat";
        return;
      }

      sendZorkCommand(text, write);
      return;
    }

    // Enter ZORK
    if (text === "zork" || text === "play zork") {
      console.log("[BBS] Entering ZORK mode");
      mode = "zork";
      write("Initializing ZORK… Type /exit to leave.\n");
      await startZork(write);
      return;
    }

    // Normal chat
    write(`[${username}] ${text}`);
    console.log("[BBS] Sending message to Supabase:", text);

    const { error } = await supabase.from("bbs_messages").insert({
      username,
      text
    });

    if (error) console.error("[BBS] ❌ Insert error:", error);
  });

  console.log("[BBS] initBBS() COMPLETE");
}
