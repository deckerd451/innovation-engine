// assets/js/bbs.js
import { supabase } from "./supabaseClient.js";

/* ================================
   DOM REFERENCES
================================ */
const screenEl = document.getElementById("bbs-screen");
const inputEl = document.getElementById("bbs-input");
const formEl = document.getElementById("bbs-form");

if (!screenEl || !inputEl || !formEl) {
  console.warn("BBS: Missing DOM elements");
}

/* ================================
   STATE (keeps messages in memory)
================================ */
let MESSAGES = [];

/* ================================
   RENDER MESSAGES
================================ */
function renderMessages() {
  screenEl.innerHTML = MESSAGES
    .map((m) => `> ${m.text}`)
    .join("\n");

  screenEl.scrollTop = screenEl.scrollHeight;
}

/* ================================
   LOAD INITIAL MESSAGES
================================ */
async function loadMessages() {
  const { data, error } = await supabase
    .from("bbs_messages")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("BBS load error:", error);
    return;
  }

  MESSAGES = data || [];
  renderMessages();
}

/* ================================
   SEND NEW MESSAGE
================================ */
async function sendMessage(text) {
  if (!text.trim()) return;

  const { error } = await supabase
    .from("bbs_messages")
    .insert({ text });

  if (error) {
    console.error("BBS insert error:", error);
    return;
  }

  inputEl.value = "";
}

/* ================================
   FORM SUBMIT
================================ */
formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(inputEl.value);
});

/* ================================
   REALTIME SUBSCRIPTION
================================ */
supabase
  .channel("bbs_realtime")
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "bbs_messages",
    },
    (payload) => {
      const newMsg = payload.new;

      // avoid duplicates if initial load already had it
      if (!MESSAGES.some((m) => m.id === newMsg.id)) {
        MESSAGES.push(newMsg);
        renderMessages();
      }
    }
  )
  .subscribe();

/* ================================
   INIT
================================ */
loadMessages();
