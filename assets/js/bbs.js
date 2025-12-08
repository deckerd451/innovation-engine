// ======================================================================
// CharlestonHacks BBS – FINAL 2025 BUILD (Option B)
// Anonymous-friendly, no auth-loop, stable real-time, ZORK support.
// ======================================================================

import { startZork, sendZorkCommand } from "./zorkLoader.js";
import { supabase } from "./supabaseClient.js";
// Import Supabase helpers for saving and loading Zork state.  These functions
// encode/decode state to base64 and store it in the `zork_saves` table.
import { saveZorkState, loadZorkState } from "./zork-supabase.js";

let initialized = false;

// References to DOM containers for map/compass/hints.  These will be set
// during initialization in initBBS().
let mapDivRef = null;
let compassDivRef = null;
let hintDivRef = null;

// Reference to the current output screen (the div where text is appended).
// We store this globally so compass clicks and other helpers know where to
// write Zork output.  Updated in initBBS().
let currentScreenRef = null;

// Track current mode globally so compass clicks can respect whether we
// are in chat or ZORK mode.  Valid values: "chat", "zork".
let currentMode = "chat";

// ----------------------------------------------------------------------
// MAP/COMPASS/HINT ENGINE CONFIGURATION
//
// The worldMap defines a tiny subset of the Zork world.  Each key is the
// canonical name of a location and lists the adjacent rooms by direction.
// As players explore, rooms will be added to the `discoveredRooms` map and
// the current room will track where the player is.  The compass widget
// reads from these structures to show clickable directions, and the
// mini‑map renders discovered rooms with fog‑of‑war for unexplored areas.
//
// Note: This map is intentionally minimal to demonstrate the concept.  You
// can extend it with additional rooms/directions as your interpreter grows.
const worldMap = {
  "Open Field": {
    north: "Forest Path",
    east: "White House (Front Door)",
    west: "Rolling Hills"
  },
  "White House (Front Door)": {
    west: "Open Field",
    east: "Behind House"
  },
  "Behind House": {
    west: "White House (Front Door)"
  },
  "Forest Path": {
    south: "Open Field"
  },
  "Rolling Hills": {
    east: "Open Field"
  }
};

let discoveredRooms = {};
let currentRoom = null;

// ================================================================
// ENTRY POINT (called from 2card.html when user opens modal)
// ================================================================
export async function initBBS() {
  if (initialized) return;
  initialized = true;

  console.log("[BBS] Init starting…");

  const modal = document.getElementById("bbs-modal");
  modal.innerHTML = BBS_HTML;

  // DOM refs
  const screen = modal.querySelector("#bbs-screen");
  const form = modal.querySelector("#bbs-form");
  const input = modal.querySelector("#bbs-input");
  const onlineDiv = modal.querySelector("#bbs-online");

  // Mini‑map / compass / hints refs
  mapDivRef = modal.querySelector("#bbs-mini-map");
  compassDivRef = modal.querySelector("#bbs-compass");
  hintDivRef = modal.querySelector("#bbs-hints");

  // Set global references for use in helpers
  currentScreenRef = screen;
  currentMode = "chat";

  // Username
  const username = loadOrGenerateUsername();
  window.bbsUsername = username;

  // Load messages
  await loadMessages(screen);

  // Subscribe realtime
  supabase
    .channel("bbs_messages_channel")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "bbs_messages" },
      (payload) => {
        const msg = payload.new;
        if (msg.username !== username) {
          write(screen, `[${msg.username}] ${msg.text}`);
        }
      })
    .subscribe();

  // Heartbeat
  heartbeat(username);
  setInterval(() => heartbeat(username), 10000);

  loadOnlineUsers(onlineDiv);
  setInterval(() => loadOnlineUsers(onlineDiv), 7000);

  // Chat + ZORK mode.  Keep this local for closure but mirror to
  // currentMode so compass clicks can access it.
  let mode = "chat";

  // Attach click handler to compass to enable click-to-move navigation.
  if (compassDivRef) {
    compassDivRef.addEventListener("click", (e) => {
      const target = e.target;
      const dir = target.getAttribute("data-dir");
      if (!dir) return;
      // Only respond in ZORK mode
      if (currentMode !== "zork") return;
      // Ensure direction exists in current room map
      const room = worldMap[currentRoom] || {};
      if (!room[dir]) return;
      // Send command and update state
      sendZorkCommand(dir, (txt) => {
        write(currentScreenRef, txt);
        updateZorkState(txt);
      });
    });
  }

  // Submit handler
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text = input.value.trim();
    input.value = "";

    if (!text) return;

    // /exit from ZORK
    if (mode === "zork") {
      // Leave ZORK mode
      if (text === "/exit") {
        write(screen, "Exited ZORK mode.\n");
        mode = "chat";
        currentMode = "chat";
        // Clear map/compass/hints on exit
        if (mapDivRef) mapDivRef.textContent = "";
        if (compassDivRef) compassDivRef.innerHTML = "";
        if (hintDivRef) hintDivRef.textContent = "";
        return;
      }

      // Save game state
      if (text === "save") {
        await saveGame(username);
        return;
      }

      // Restore game state
      if (text === "restore") {
        await restoreGame(username);
        return;
      }

      // Request hint
      if (text === "hint") {
        const hint = getHint();
        if (hintDivRef) hintDivRef.textContent = hint;
        write(screen, hint + "\n");
        return;
      }

      // Normal Zork command: send to interpreter
      sendZorkCommand(text, (txt) => {
        write(screen, txt);
        updateZorkState(txt);
      });
      return;
    }

    // ENTER ZORK MODE
    if (text === "zork" || text === "play zork") {
      write(screen, "Initializing ZORK… Type /exit to leave.\n");
      mode = "zork";
      currentMode = "zork";
      // Reset discovered rooms on each new session
      discoveredRooms = {};
      currentRoom = null;
      startZork((txt) => {
        write(screen, txt);
        updateZorkState(txt);
      });
      return;
    }

    // Normal chat
    write(screen, `[${username}] ${text}`);

    const { error } = await supabase.from("bbs_messages").insert({
      username,
      text
    });

    if (error) console.error("[BBS] Insert error:", error);
  });

  console.log("[BBS] Ready.");
}

// ================================================================
// HTML -> MOUNTED INSIDE #bbs-modal
// ================================================================
const BBS_HTML = `
  <div id="bbs-wrapper"
       style="background:black; border:3px solid #0f0; padding:20px; width:80%; max-width:600px; border-radius:12px; box-shadow:0 0 20px #0f0; position:relative;">
    
    <h2 style="color:#0f0; text-align:center; margin-bottom:12px;">CharlestonHacks BBS</h2>

    <div id="bbs-screen"
         style="background:#000; color:#0f0; height:300px; overflow-y:auto; padding:10px; border:2px solid #0f0; margin-bottom:10px; font-family:monospace;"></div>

    <!-- Fog‑of‑war mini‑map and compass widgets.  The mini‑map shows rooms
         the player has discovered.  Unknown areas are hidden until
         explored.  The compass renders clickable directions based on
         available exits from the current room.  Hints will appear below
         when requested via the 'hint' command in Zork mode. -->
    <div id="bbs-mini-map"
         style="white-space:pre; color:#0f0; font-family:monospace; margin-bottom:8px;"></div>
    <div id="bbs-compass"
         style="margin-bottom:8px; color:#0f0; font-family:monospace;"></div>
    <div id="bbs-hints"
         style="margin-bottom:8px; color:#0f0; font-family:monospace; font-style:italic;"></div>
    
    <form id="bbs-form" style="display:flex; gap:10px;">
      <input id="bbs-input"
             placeholder="type message..."
             style="flex:1; background:black; color:#0f0; border:2px solid #0f0; padding:6px; font-family:monospace;" />
      <button style="padding:6px 12px; background:#0f0; color:black; border:none;">Send</button>
    </form>

    <div style="margin-top:12px; color:#0f0; font-family:monospace;">
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

    // If we are in ZORK mode, update the exploration state based on
    // each line of output.  This allows the mini‑map to react to
    // narrative descriptions printed outside of sendZorkCommand (e.g.
    // from startZork).  The update is idempotent when the line does
    // not reference a known location.
    if (currentMode === "zork") {
      updateZorkState(line);
    }
  });
  screen.scrollTop = screen.scrollHeight;
}

async function loadMessages(screen) {
  const { data, error } = await supabase
    .from("bbs_messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return;

  screen.innerHTML = "";
  data.forEach((msg) => write(screen, `[${msg.username}] ${msg.text}`));
}

async function loadOnlineUsers(div) {
  const { data } = await supabase
    .from("bbs_online_active")
    .select("*");

  const names = data?.map((u) => u.username) || [];
  div.textContent = names.length ? names.join(", ") : "none";
}

async function heartbeat(username) {
  await supabase.from("bbs_online").upsert({
    username,
    last_seen: new Date().toISOString(),
    zork_mode: false
  });
}

function loadOrGenerateUsername() {
  const stored = localStorage.getItem("bbs_username");
  if (stored) return stored;

  const g = "Guest" + Math.floor(Math.random() * 9999);
  localStorage.setItem("bbs_username", g);
  return g;
}

// =====================================================================
// ZORK MAP / COMPASS / HINT FUNCTIONS
// =====================================================================

/**
 * Update internal state based on Zork output.  Parses the first line of
 * output to identify the player's location.  Marks rooms as discovered
 * and updates the currentRoom.  Renders the mini‑map and compass
 * accordingly.  Only call this after a Zork response.
 * @param {string} text Zork output
 */
function updateZorkState(text) {
  // Normalize to lower case for matching
  const lower = text.toLowerCase();
  let found = false;
  Object.keys(worldMap).forEach((loc) => {
    if (lower.includes(loc.toLowerCase())) {
      discoveredRooms[loc] = true;
      currentRoom = loc;
      found = true;
    }
  });
  // Default room if none matched
  if (!currentRoom) {
    currentRoom = "Open Field";
    discoveredRooms[currentRoom] = true;
  }
  // Render updated UI
  renderMiniMap();
  renderCompass();
}

/**
 * Render the mini‑map with fog‑of‑war.  Only discovered rooms are shown.
 * Unknown exits are represented by "???".  The current room is shown
 * inside brackets.  The map is drawn in a simple compass layout.
 */
function renderMiniMap() {
  if (!mapDivRef || !currentRoom) return;
  const room = worldMap[currentRoom] || {};
  const north = room.north
    ? (discoveredRooms[room.north] ? `[${room.north}]` : "???")
    : "";
  const south = room.south
    ? (discoveredRooms[room.south] ? `[${room.south}]` : "???")
    : "";
  const east = room.east
    ? (discoveredRooms[room.east] ? `[${room.east}]` : "???")
    : "";
  const west = room.west
    ? (discoveredRooms[room.west] ? `[${room.west}]` : "???")
    : "";
  const lines = [];
  // Top (north)
  if (north) lines.push(`        ${north}`);
  if (north) lines.push("          |");
  // Middle row
  const middle = `${west ? west : ""} ${west && east ? "—" : ""} [${currentRoom}] ${east && west ? "—" : ""} ${east ? east : ""}`;
  lines.push(middle.trim());
  // Bottom (south)
  if (south) lines.push("          |");
  if (south) lines.push(`        ${south}`);
  mapDivRef.textContent = lines.join("\n");
}

/**
 * Render the compass widget showing available directions.  Only exits
 * present in the current room are interactive.  Other directions are
 * greyed out.  Clicking on an active direction triggers a movement
 * command (handled by a listener attached in initBBS).
 */
function renderCompass() {
  if (!compassDivRef || !currentRoom) return;
  const room = worldMap[currentRoom] || {};
  const directions = ["north", "south", "east", "west", "up", "down"];
  compassDivRef.innerHTML = directions
    .map((dir) => {
      const key = dir;
      const short = dir.charAt(0).toUpperCase();
      if (room[key]) {
        return `<span data-dir="${key}" style="cursor:pointer; text-decoration:underline; margin-right:8px;">${short}</span>`;
      }
      return `<span style="color:#555; margin-right:8px;">${short}</span>`;
    })
    .join("");
}

/**
 * Generate a simple hint.  This is a placeholder for the Asterion AI
 * engine.  You can enhance this to produce smarter context‑sensitive
 * hints based on the current room, inventory, or actions.  For now it
 * returns a random suggestion encouraging exploration.
 */
function getHint() {
  const hints = [
    "Try exploring a new direction using the compass.",
    "Look around carefully; perhaps there is an object to examine.",
    "Some paths may be hidden until you read the leaflet.",
    "Remember, you can type 'take' or 'open' to interact with objects.",
    "The mailbox might contain something interesting.",
    "Asterion whispers: 'Not all doors are locked forever.'",
    "Don't forget to save your game! Type 'save' anytime."
  ];
  return hints[Math.floor(Math.random() * hints.length)];
}

/**
 * Save the player's current exploration state to Supabase.  The game
 * interpreter itself does not currently expose its internal memory, so
 * we persist the discovered rooms and current location.  When extended
 * to a full Z-machine interpreter, you can also persist the byte state.
 * @param {string} username The player's username
 */
async function saveGame(username) {
  try {
    const state = { currentRoom, discoveredRooms };
    const encoded = new TextEncoder().encode(JSON.stringify(state));
    await saveZorkState(username, encoded);
    write(currentScreenRef, "Game saved.\n");
  } catch (err) {
    console.error("[BBS] Save error:", err);
    write(currentScreenRef, "Failed to save game.\n");
  }
}

/**
 * Restore the player's exploration state from Supabase.  If no state
 * exists, notifies the user.  After restoring, re-renders the map and
 * compass.  This does not restore the interpreter's internal state.
 * @param {string} username The player's username
 */
async function restoreGame(username) {
  try {
    const data = await loadZorkState(username);
    if (!data) {
      write(currentScreenRef, "No saved game found.\n");
      return;
    }
    const json = JSON.parse(new TextDecoder().decode(data));
    currentRoom = json.currentRoom;
    discoveredRooms = json.discoveredRooms || {};
    renderMiniMap();
    renderCompass();
    write(currentScreenRef, "Game restored.\n");
  } catch (err) {
    console.error("[BBS] Restore error:", err);
    write(currentScreenRef, "Failed to restore game.\n");
  }
}
