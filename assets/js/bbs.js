// ========================================================================
//   CharlestonHacks BBS + Realtime Chat + ZORK + Easter Eggs (2025)
//   MOBILE-SAFE VERSION (supports iOS + Android keyboards)
// ========================================================================

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

window.bbsUsername = username;


/* ============================
   DOM REFERENCES
============================ */
const screen = document.getElementById("bbs-screen");
const form = document.getElementById("bbs-form");
const input = document.getElementById("bbs-input");
const onlineDiv = document.getElementById("bbs-online-list");

/* ============================
   CLEAN WRITE FUNCTION
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
   LOAD EXISTING MESSAGES
============================ */
async function loadMessages() {
  const { data, error } = await supabase
    .from("bbs_messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Load error:", error);
    return;
  }

  screen.innerHTML = "";
  data?.forEach(msg => write(`[${msg.username}] ${msg.text}`));
}

await loadMessages();

/* ============================
   REALTIME MESSAGES
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
   ONLINE USERS LIST
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
   BBS MODES
============================ */
let mode = "chat";

/* ============================
   UNIVERSAL INPUT HANDLER
   (Works on desktop + iOS + Android)
============================ */
async function handleInput(e) {
  e.preventDefault();

  let text = input.value;
  input.value = "";
  if (!text) return;

  const clean = text.trim().toLowerCase();
  console.log("BBS INPUT:", clean);

  /* -----------------------------------
     ZORK MODE ACTIVE
  ----------------------------------- */
  if (mode === "zork") {
    if (clean === "/exit" || clean === "exit") {
      write("\nExited ZORK. Returning to chat.\n");
      mode = "chat";
      return;
    }

    sendZorkCommand(clean, write);
    return;
  }

  /* -----------------------------------
     ENTER ZORK MODE
  ----------------------------------- */
  if (clean === "zork" || clean === "play zork") {
    mode = "zork";
    write("Initializing ZORK terminal… Type /exit to leave.\n");

    await startZork(write);
    return;
  }

  /* -----------------------------------
     NORMAL BBS MESSAGE
  ----------------------------------- */
  write(`[${username}] ${text}`);

  const { error } = await supabase
    .from("bbs_messages")
    .insert({ username, text });

  if (error) console.error("Insert error:", error);
}

/* ============================
   MOBILE-SAFE EVENT BINDINGS
============================ */
form.addEventListener("submit", handleInput);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    handleInput(e);
  }
});
