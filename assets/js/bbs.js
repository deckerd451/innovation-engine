// ======================================================================
// CharlestonHacks BBS – FINAL 2025 BUILD (Option B + Close Button)
// ======================================================================

import { startZork, sendZorkCommand, getZorkState, setZorkState } from "./zorkLoader.js";
import { supabase } from "./supabaseClient.js";
import { saveZorkState, loadZorkState } from "./zork-supabase.js";

let initialized = false;
let currentScreenRef = null;
let currentMode = "chat";

// ================================================================
// ENTRY POINT
// ================================================================
export async function initBBS() {
  if (initialized) return;
  initialized = true;

  const modal = document.getElementById("bbs-modal");
  modal.innerHTML = BBS_HTML;
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";

  const screen = modal.querySelector("#bbs-screen");
  const form = modal.querySelector("#bbs-form");
  const input = modal.querySelector("#bbs-input");
  const onlineDiv = modal.querySelector("#bbs-online");
  const closeBtn = modal.querySelector("#bbs-close");

  currentScreenRef = screen;
  currentMode = "chat";

  // Close button handler
  closeBtn.addEventListener("click", () => {
    if (currentMode === "zork") {
      write(screen, "Exited ZORK mode.\n");
      currentMode = "chat";
    }
    modal.style.display = "none";
  });

  const username = loadOrGenerateUsername();
  window.bbsUsername = username;

  await loadMessages(screen);

  supabase
    .channel("bbs_messages_channel")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "bbs_messages" },
      (payload) => {
        const msg = payload.new;
        if (msg.username !== username) {
          write(screen, `[${msg.username}] ${msg.text}`);
        }
      }
    )
    .subscribe();

  heartbeat(username);
  setInterval(() => heartbeat(username), 10000);

  loadOnlineUsers(onlineDiv);
  setInterval(() => loadOnlineUsers(onlineDiv), 7000);

  let mode = "chat";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text = input.value.trim();
    input.value = "";
    if (!text) return;

    if (mode === "zork") {
      if (text === "/exit") {
        write(screen, "Exited ZORK mode.\n");
        mode = "chat";
        currentMode = "chat";
        return;
      }

      if (text === "save") {
        await saveGame(username);
        return;
      }

      if (text === "restore") {
        await restoreGame(username);
        return;
      }

      sendZorkCommand(text, (txt) => write(screen, txt));
      return;
    }

    if (text === "zork" || text === "play zork" || text === "/zork") {
      write(screen, "Initializing ZORK… Type /exit to leave.\n");
      mode = "zork";
      currentMode = "zork";
      startZork((txt) => write(screen, txt));
      return;
    }

    write(screen, `[${username}] ${text}`);

    const { error } = await supabase.from("bbs_messages").insert({
      username,
      text
    });

    if (error) console.error("[BBS] Insert error:", error);
  });
}

// ================================================================
// HTML
// ================================================================
const BBS_HTML = `
  <div id="bbs-wrapper"
       style="background:black; border:3px solid #0f0; padding:20px;
              width:min(90vw, 600px); max-height:90vh;
              border-radius:12px; box-shadow:0 0 20px #0f0;
              position:relative; margin:auto; display:flex;
              flex-direction:column;">

    <button id="bbs-close"
            style="position:absolute; top:8px; right:10px;
                   background:black; color:#0f0; border:1px solid #0f0;
                   font-family:monospace; cursor:pointer; padding:4px 8px;
                   font-size:1rem; line-height:1;">
      ✕
    </button>

    <h2 style="color:#0f0; text-align:center; margin-bottom:12px;
               font-family:monospace; font-size:clamp(1.2rem, 3vw, 1.5rem);">
      CharlestonHacks BBS
    </h2>

    <div id="bbs-screen"
         style="background:#000; color:#0f0;
                height:min(300px, 40vh); overflow-y:auto;
                padding:10px; border:2px solid #0f0; margin-bottom:10px;
                font-family:monospace; font-size:clamp(0.85rem, 2vw, 1rem);
                line-height:1.4;"></div>

    <form id="bbs-form" style="display:flex; gap:10px; flex-wrap:wrap;">
      <input id="bbs-input"
             placeholder="type message..."
             style="flex:1; min-width:200px; background:black; color:#0f0;
                    border:2px solid #0f0; padding:8px;
                    font-family:monospace; font-size:0.95rem;" />
      <button style="padding:8px 16px; background:#0f0;
                     color:black; border:none; font-family:monospace;
                     font-weight:bold; cursor:pointer;">
        Send
      </button>
    </form>

    <div style="margin-top:12px; color:#0f0; font-family:monospace;
                font-size:0.9rem;">
      Online: <span id="bbs-online">loading…</span>
    </div>
  </div>
`;

// ================================================================
// HELPERS
// ================================================================
function write(screen, text) {
  text.split("\n").forEach((line) => {
    const div = document.createElement("div");
    div.textContent = line;
    screen.appendChild(div);
  });
  screen.scrollTop = screen.scrollHeight;
}

async function loadMessages(screen) {
  const { data } = await supabase
    .from("bbs_messages")
    .select("*")
    .order("created_at", { ascending: true });

  screen.innerHTML = "";
  data?.forEach((msg) => write(screen, `[${msg.username}] ${msg.text}`));
}

async function loadOnlineUsers(div) {
  const { data } = await supabase.from("bbs_online_active").select("*");
  const names = data?.map((u) => u.username) || [];
  div.textContent = names.length ? names.join(", ") : "none";
}

async function heartbeat(username) {
  await supabase.from("bbs_online").upsert({
    username,
    last_seen: new Date().toISOString(),
    zork_mode: currentMode === "zork"
  });
}

function loadOrGenerateUsername() {
  const stored = localStorage.getItem("bbs_username");
  if (stored) return stored;

  const g = "Guest" + Math.floor(Math.random() * 9999);
  localStorage.setItem("bbs_username", g);
  return g;
}

// ================================================================
// SAVE / RESTORE
// ================================================================
async function saveGame(username) {
  const state = getZorkState();
  if (!state) {
    write(currentScreenRef, "No game is active to save.\n");
    return;
  }
  const encoded = new TextEncoder().encode(JSON.stringify(state));
  await saveZorkState(username, encoded);
  write(currentScreenRef, "Game saved.\n");
}

async function restoreGame(username) {
  const data = await loadZorkState(username);
  if (!data) {
    write(currentScreenRef, "No saved game found.\n");
    return;
  }
  const json = JSON.parse(new TextDecoder().decode(data));
  setZorkState(json);
  write(currentScreenRef, "Game restored.\n");
}
