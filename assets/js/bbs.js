// assets/js/bbs.js
import { supabase } from "./supabaseClient.js";

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

  const screen = document.getElementById("bbs-screen");
  screen.innerHTML = data
    .map(m => `[${new Date(m.created_at).toLocaleTimeString()}] ${m.text}`)
    .join("\n");

  screen.scrollTop = screen.scrollHeight;
}

// 🟢 Listen for new messages using realtime
supabase
  .channel("bbs-channel")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "bbs_messages" }, loadMessages)
  .subscribe();

// 🟢 Handle user input
document.getElementById("bbs-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const input = document.getElementById("bbs-input");
  const text = input.value.trim();
  if (!text) return;

  const { error } = await supabase.from("bbs_messages").insert({ text });
  if (error) console.error("BBS insert error:", error);

  input.value = "";
});

// 🟢 Initial fetch
loadMessages();
