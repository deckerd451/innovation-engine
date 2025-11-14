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
// 🟢 Update "online" status
async function heartbeat() {
  const username = getUsername();
  await supabase.from("bbs_online")
    .upsert({ username, last_seen: new Date().toISOString() });
}
setInterval(heartbeat, 10000); // every 10 seconds
heartbeat(); // run immediately


const username = getUsername();

/* ============================
   DOM ELEMENTS
   ============================ */
const screen = document.getElementById("bbs-screen");
const form = document.getElementById("bbs-form");
const input = document.getElementById("bbs-input");
const onlineList = document.getElementById("bbs-online-list");

/* ============================
   Load Messages
   ============================ */
async function loadMessages() {
  const { data } = await supabase
    .from("bbs_messages")
    .select("*")
    .order("created_at", { ascending: true });

  screen.innerHTML = "";
  data?.forEach(msg => {
    const line = document.createElement("div");
    line.textContent = `[${msg.username}] ${msg.text}`;
    screen.appendChild(line);
  });

  screen.scrollTop = screen.scrollHeight;
}

/* ============================
   Send Message
   ============================ */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  await supabase.from("bbs_messages").insert({
    username,
    text
  });
});

/* ============================
   Realtime Messages
   ============================ */
supabase
  .channel("bbs-messages")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "bbs_messages" }, loadMessages)
  .subscribe();

loadMessages();

/* ============================
   Presence: Heartbeat
   ============================ */
async function heartbeat() {
  await supabase.from("bbs_presence").insert({
    username
  });
}

// Send heartbeat every 20 sec
setInterval(heartbeat, 20000);
heartbeat();

/* ============================
   Load Users Online
   ============================ */
async function loadOnlineUsers() {
  // users seen in last 30 sec
  const cutoff = new Date(Date.now() - 30000).toISOString();

  const { data } = await supabase
    .from("bbs_presence")
    .select("username, last_seen")
    .gt("last_seen", cutoff)
    .order("last_seen", { ascending: false });

  if (!data || data.length === 0) {
    onlineList.textContent = "No one online";
    return;
  }

  onlineList.innerHTML = data
    .map(u => `• ${u.username}`)
    .join("<br>");
}

// refresh every 5 seconds
setInterval(loadOnlineUsers, 5000);
loadOnlineUsers();
