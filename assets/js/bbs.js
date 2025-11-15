// ===============================================================
//   CharlestonHacks BBS + Realtime Chat + ZORK + Easter Eggs (2025)
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

/* ============================
   WRITE TO SCREEN
============================ */
function write(text) {
  text.split("\n").forEach(line => {
    const div = document.createElement("div");
    div.textContent = line;
    screen.appendChild(div);
  });

  screen.scrollTop = screen.scrollHeight;
}

/* ============================
   LOAD HISTORY
============================ */
async function loadMessages() {
  const { data, error } = await supabase
    .from("bbs_messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return console.error("Load error:", error);

  screen.innerHTML = "";
  data?.forEach(msg => write(`[${msg.username}] ${msg.text}`));
}

await loadMessages();

/* ============================
   REALTIME CHAT
============================ */
supabase.channel("bbs_messages_channel")
  .on("postgres_changes",
    { event: "INSERT", schema: "public", table: "bbs_messages" },
    (payload) => {
      const msg = payload.new;
      if (msg.username === username) return;
      write(`[${msg.username}] ${msg.text}`);
    }
  )
  .subscribe();

/* ============================
   ONLINE PRESENCE
============================ */
async function heartbeat() {
  await supabase.from("bbs_online").upsert({
    username,
    last_seen: new Date().toISOString()
  });
}
setInterval(heartbeat, 10000);
heartbeat();

/* ============================
   ONLINE LIST DISPLAY
============================ */
async function loadOnlineList() {
  const { data, error } = await supabase
    .from("bbs_online_active")
    .select("*");

  if (error) return;

  const names = data.map(u => u.username);
  onlineDiv.textContent = names.length ? names.join(", ") : "no users online";
}
setInterval(loadOnlineList, 7000);
loadOnlineList();

/* ============================
   MODES: chat | zork
============================ */
let mode = "chat";

/* ============================
   INPUT HANDLER
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
      return;
    }

    sendZorkCommand(text, write);
    return;
  }

  /* -----------------------------------
     ENTER ZORK MODE
  ----------------------------------- */
  if (text === "zork" || text === "play zork") {
    write("Initializing ZORK terminal… Type /exit to leave.\n");
    mode = "zork";
    await startZork(write);
    return;
  }

  /* -----------------------------------
     NORMAL CHAT MESSAGE
  ----------------------------------- */
  write(`[${username}] ${text}`);

  const { error } = await supabase.from("bbs_messages").insert({
    username,
    text
  });

  if (error) console.error("Insert error:", error);
});
