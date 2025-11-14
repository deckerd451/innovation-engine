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
// 🔥 FIX: You originally pointed to #bbs-online, 
// but the list is inside #bbs-online-list. 
// This change ensures online users display correctly.

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

await loadMessages(); // 🔥 IMPORTANT: ensures realtime doesn’t duplicate

/* ============================
   Send Message (with instant echo)
   ============================ */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  input.value = "";

  // 🟢 1. LOCAL ECHO (instant)
  const line = document.createElement("div");
  line.textContent = `[${username}] ${text}`;
  screen.appendChild(line);
  screen.scrollTop = screen.scrollHeight;

  // 🟢 2. Insert into Supabase
  supabase
    .from("bbs_messages")
    .insert({ username, text })
    .then(() => {
      // Optional sync
      loadMessages();
    });
});

/* ============================
   Realtime subscription FIXED
   ============================ */
const channel = supabase.channel("bbs-messages", {
  config: {
    broadcast: { ack: true },
    presence: { key: username }
  }
});

channel
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "bbs_messages"
    },
    payload => {
      const msg = payload.new;

      // 🛑 Prevent echoing our own just-sent message
      if (msg.username === username) return;

      const line = document.createElement("div");
      line.textContent = `[${msg.username}] ${msg.text}`;
      screen.appendChild(line);
      screen.scrollTop = screen.scrollHeight;
    }
  )
  .subscribe(status => {
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
   Load Users Online
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

  onlineDiv.textContent =
    names.length ? names.join(", ") : "no users";
}

setInterval(loadOnlineList, 7000);
loadOnlineList();
