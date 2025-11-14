// assets/js/bbs.js
import { supabaseClient as supabase } from "./supabaseClient.js";

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
   LOAD INITIAL MESSAGES
================================ */
async function loadMessages() {
  const { data, error } = await supabase
    .from("bbs_messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("BBS load error:", error);
    return;
  }

  renderMessages(data);
}

function renderMessages(rows) {
  screenEl.innerHTML = rows
    .map(r => `> ${r.text}`)
    .join("\n");

  screenEl.scrollTop = screenEl.scrollHeight;
}

/* ================================
   INSERT NEW MESSAGE
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
  loadMessages(); // reload from DB
}

/* ================================
   FORM HANDLER
================================ */
formEl.addEventListener("submit", (e) => {
  e.preventDefault(); // IMPORTANT: stop page reload
  const text = inputEl.value;
  sendMessage(text);
});

/* ================================
   INIT
================================ */
loadMessages();
