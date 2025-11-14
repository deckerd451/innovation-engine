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
const onlineDiv = document.getElementById("bbs-online");

/* ============================
   Load Messages
   ============================ */
async function loadMessages() {
  const { data, error } = await supabase
    .from("bbs_messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) console.error("Load error:", error);

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
   Presence Heartbeat
   ============================ */
async function heartbeat() {
  await supabase.from("bbs_online").upsert({
    username,
    last_seen: new Date().toISOString()
  });
}

// Do heartbeat every 10 sec
setInterval(heartbeat, 10000);
heartbeat();

/* ============================
   Load Users Online
   ============================ */
async function loadOnlineList() {
  const { data, error } = await supabase
    .from("bbs_online_active")   // <-- VIEW
    .select("*");

  if (error) {
    console.error("Online list error:", error);
    return;
  }

  if (!onlineDiv) return;

  const names = data.map(u => u.username);

  onlineDiv.textContent =
    "Online: " + (names.length ? names.join(", ") : "no users");
}

// Update every 7 sec
setInterval(loadOnlineList, 7000);
loadOnlineList();
