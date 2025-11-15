// ======================================================
//   CharlestonHacks BBS + Realtime + ZORK Mode (2025)
// ======================================================

import { supabase } from "./supabaseClient.js";
import { ZVM } from "/assets/zork/zvm.js";

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
   SCREEN WRITE
============================ */
function write(text) {
  const line = document.createElement("div");
  line.textContent = text;
  screen.appendChild(line);
  screen.scrollTop = screen.scrollHeight;
}

/* ============================
   LOAD CHAT MESSAGES
============================ */
async function loadMessages() {
  const { data, error } = await supabase
    .from("bbs_messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return console.error("Load error:", error);

  screen.innerHTML = "";

  data?.forEach(msg => {
    write(`[${msg.username}] ${msg.text}`);
  });
}

await loadMessages();

/* ============================
   REALTIME SUBSCRIPTION
============================ */
supabase.channel("bbs_messages_channel")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "bbs_messages" },
    (payload) => {
      const msg = payload.new;
      if (msg.username === username) return;
      write(`[${msg.username}] ${msg.text}`);
    }
  )
  .subscribe();

/* ============================
   ONLINE PRESENCE HEARTBEAT
============================ */
async function heartbeat() {
  await supabase.from("bbs_online").upsert({
    username,
    last_seen: new Date().toISOString()
  });
}
setInterval(heartbeat, 10000);
heartbeat();

async function loadOnlineList() {
  const { data, error } = await supabase.from("bbs_online_active").select("*");
  if (error) return;

  const names = data.map(u => u.username);
  onlineDiv.textContent = names.length ? names.join(", ") : "no users online";
}
setInterval(loadOnlineList, 7000);
loadOnlineList();

/* ============================
   ZORK MODE
============================ */
let bbsMode = "chat";
let zorkInstance = null;

async function startZork() {
  if (!zorkInstance) {
    const placeholder = await fetch("/assets/zork/zork1.z3");
    await placeholder.arrayBuffer();

    zorkInstance = new ZVM(new Uint8Array(100));
    zorkInstance.start();
  }
  return zorkInstance.readStoryOutput();
}

/* ============================
   UNIFIED MESSAGE HANDLER
============================ */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = input.value.trim();
  input.value = "";
  if (!text) return;

  // -----------------------------------
  // ZORK MODE
  // -----------------------------------
  if (bbsMode === "zork") {
    if (text === "/exit") {
      bbsMode = "chat";
      write("Exited ZORK.\n");
      return;
    }

    zorkInstance.sendCommand(text);
    const out = zorkInstance.readStoryOutput();
    write(out);
    return;
  }

  // -----------------------------------
  // ENTER ZORK
  // -----------------------------------
  if (text === "zork") {
    write("Starting ZORK I… (type /exit to quit)");
    bbsMode = "zork";

    const intro = await startZork();
    write(intro);
    return;
  }

  // -----------------------------------
  // NORMAL CHAT MESSAGE
  // -----------------------------------
  write(`[${username}] ${text}`);

  const { error } = await supabase.from("bbs_messages").insert({
    username,
    text
  });

  if (error) console.error(error);
});
