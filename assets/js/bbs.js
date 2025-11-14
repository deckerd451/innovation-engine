// /assets/js/bbs.js
import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {

  const screen = document.getElementById("bbs-screen");
  const form = document.getElementById("bbs-form");
  const input = document.getElementById("bbs-input");

  if (!screen || !form || !input) {
    console.error("❌ BBS UI elements missing — check index.html placement.");
    return;
  }

  // 🟢 Load all messages
  async function loadMessages() {
    const { data, error } = await supabase
      .from("bbs_messages")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("BBS load error:", error);
      return;
    }

    screen.innerHTML = data
      .map(m => `[${new Date(m.created_at).toLocaleTimeString()}] ${m.text}`)
      .join("\n");

    screen.scrollTop = screen.scrollHeight;
  }

  // 🟢 Real-time listener
  supabase
    .channel("bbs-channel")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "bbs_messages" },
      loadMessages
    )
    .subscribe();

  // 🟢 Input handler
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text = input.value.trim();
    if (!text) return;

    const { error } = await supabase
      .from("bbs_messages")
      .insert({ text });

    if (error) console.error("BBS insert error:", error);

    input.value = "";
  });

  // 🟢 Initial load
  loadMessages();
});
