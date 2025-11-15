import { supabase } from "./supabaseClient.js";

/* ============================
   Generate Username
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
   DOM ELEMENTS
   ============================ */
const screen = document.getElementById("bbs-screen");
const form = document.getElementById("bbs-form");
const input = document.getElementById("bbs-input");
const onlineDiv = document.getElementById("bbs-online-list");

/* ============================
   Load Messages (initial)
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
  data?.forEach(msg => {
    const line = document.createElement("div");
    line.textContent = `[${msg.username}] ${msg.text}`;
    screen.appendChild(line);
  });

  screen.scrollTop = screen.scrollHeight;
}

await loadMessages(); // load once only


/* ============================
   Send Message (instant local echo)
   ============================ */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  input.value = "";

  // 🟢 Instant LOCAL echo
  addMessage(username, text);

  // 🟢 Send to DB (no reload!)
  const { error } = await supabase
    .from("bbs_messages")
    .insert({ username, text });

  if (error) console.error("Insert error:", error);
});


/* ============================
   Helper: Add message to screen
   ============================ */
function addMessage(user, text) {
  const line = document.createElement("div");
  line.textContent = `[${user}] ${text}`;
  screen.appendChild(line);
  screen.scrollTop = screen.scrollHeight;
}


/* ============================
   FIXED REALTIME SUBSCRIPTION
   ============================ */

const channel = supabase.channel("bbs_messages_channel");

channel
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "bbs_messages" },
    (payload) => {
      const msg = payload.new;

      // 🛑 Prevent duplicating your own messages
      if (msg.username === username) return;

      console.log("Realtime message:", msg);
      addMessage(msg.username, msg.text);
    }
  )
  .subscribe((status) => {
    console.log("Realtime status:", status);
  });


/* ============================
   Presence Heartbeat
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
   Load Online Users
   ============================ */
async function loadOnlineList() {
  const { data, error } = await supabase
    .from("bbs_online_active")
    .select("*");

  if (error) {
    console.error("Online list error:", error);
    return;
  }

  if (!onlineDiv) return;

  const names = data.map(u => u.username);
  onlineDiv.textContent = names.length ? names.join(", ") : "no users online";
}

setInterval(loadOnlineList, 7000);
loadOnlineList();
// CharlestonHacks BBS + ZORK Integration
import { ZVM } from "/assets/zork/zvm.js";

let bbsMode = "chat";
let zorkInstance = null;

const screen = document.getElementById("bbs-screen");
const input = document.getElementById("bbs-input");

function write(text) {
  screen.textContent += text;
  screen.scrollTop = screen.scrollHeight;
}

async function startZork() {
  if (!zorkInstance) {
    const story = await fetch("/assets/zork/zork1.z3");
    await story.arrayBuffer(); // just for compatibility

    zorkInstance = new ZVM(new Uint8Array(100)); // fake story container
    zorkInstance.start();
  }
  return zorkInstance.readStoryOutput();
}

input.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;

  const text = input.value.trim();
  input.value = "";

  if (!text) return;

  // -----------------------------
  // ZORK MODE
  // -----------------------------
  if (bbsMode === "zork") {
    if (text === "/exit") {
      bbsMode = "chat";
      write("\nExited ZORK.\n\n");
      return;
    }

    zorkInstance.sendCommand(text);
    const out = zorkInstance.readStoryOutput();
    write(out);
    return;
  }

  // -----------------------------
  // NORMAL BBS MODE
  // -----------------------------
  if (text === "zork") {
    write("Starting ZORK I…\nType /exit to quit.\n\n");
    bbsMode = "zork";

    const intro = await startZork();
    write(intro);
    return;
  }

  // Otherwise normal message (local only)
  write("> " + text + "\n");
});

