// ===============================================================
//   CharlestonHacks BBS + Realtime Chat + ZORK Multiplayer (2025)
// ===============================================================

import { supabase } from "./supabaseClient.js";
import { startZork, sendZorkCommand } from "./zorkLoader.js";

/* ============================
   USERNAME
============================ */
function getUsername() {
  const stored = localStorage.getItem("bbs_username");
  if (stored) return stored;

  const generated = "Guest" + Math.floor(Math.random() * 9999);
  localStorage.setItem("bbs_username", generated);
  return generated;
}

const username = getUsername();

/* ============================
   DOM
============================ */
const screen = document.getElementById("bbs-screen");
const form = document.getElementById("bbs-form");
const input = document.getElementById("bbs-input");
const onlineDiv = document.getElementById("bbs-online-list");

function write(text) {
  text.split("\n").forEach(line => {
    const div = document.createElement("div");
    div.textContent = line;
    screen.appendChild(div);
  });

  screen.scrollTop = screen.scrollHeight;
}

/* ============================
   INITIAL LOAD
============================ */
await loadMessages();
async function loadMessages() {
  const { data } = await supabase
    .from("bbs_messages")
    .select("*")
    .order("created_at", { ascending: true });

  screen.innerHTML = "";
  data?.forEach(msg => write(`[${msg.username}] ${msg.text}`));
}

/* ============================
   REALTIME CHAT
============================ */
supabase.channel("bbs_messages_channel")
  .on("postgres_changes",
    { event: "INSERT", schema: "public", table: "bbs_messages" },
    (payload) => {
      const msg = payload.new;
      if (msg.username !== username) write(`[${msg.username}] ${msg.text}`);
    }
  )
  .subscribe();

/* ============================
   PRESENCE HEARTBEAT
============================ */
async function heartbeat(zorkMode = false) {
  await supabase.from("bbs_online").upsert({
    username,
    zork_mode: zorkMode,
    last_seen: new Date().toISOString()
  });
}
setInterval(() => heartbeat(mode === "zork"), 8000);
heartbeat(false);

/* ============================
   ONLINE LIST
============================ */
async function loadOnlineList() {
  const { data } = await supabase.from("bbs_online_active").select("*");
  const names = data.map(u => u.username);
  onlineDiv.textContent = names.length ? names.join(", ") : "no users online";
}
setInterval(loadOnlineList, 6000);
loadOnlineList();

/* ============================
   MODE: chat | zork
============================ */
let mode = "chat";

/* ============================
   MAIN INPUT HANDLER
============================ */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = input.value.trim();
  input.value = "";
  if (!text) return;

  /* -----------------------------------
     ZORK MODE
  ----------------------------------- */
  if (mode === "zork") {

    if (text === "/exit") {
      write("\nExited ZORK. Returning to chat.\n");
      mode = "chat";
      heartbeat(false);
      return;
    }

    // Send player movement/action to others
    await supabase.from("zork_events").insert({
      username,
      action: text
    });

    sendZorkCommand(text, write);
    return;
  }

  /* -----------------------------------
     ENTER ZORK MODE
  ----------------------------------- */
  if (text === "zork" || text === "play zork") {
    mode = "zork";
    heartbeat(true);
    write("Initializing ZORK terminal… Type /exit to leave.\n");

    await startZork(write);
    subscribeToZorkEvents(write);
    return;
  }

  /* -----------------------------------
     NORMAL CHAT
  ----------------------------------- */
  write(`[${username}] ${text}`);
  await supabase.from("bbs_messages").insert({ username, text });
});

/* ============================
   MULTIPLAYER ZORK EVENT FEED
============================ */
function subscribeToZorkEvents(write) {

  supabase.channel("zork_event_stream")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "zork_events" },
      (payload) => {
        const evt = payload.new;
        if (evt.username === username) return;

        write(`\nA faint whisper: ${evt.username} → ${evt.action}\n`);
      }
    )
    .subscribe();
}
