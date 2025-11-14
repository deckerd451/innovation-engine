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
