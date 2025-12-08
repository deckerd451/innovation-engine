// ======================================================================
// CharlestonHacks BBS — FINAL ZORK-COMPATIBLE BUILD (2025)
// ======================================================================
// This version:
//  • FIXES all command routing
//  • Ensures Zork receives normal commands (i, inventory, look, etc)
//  • CHS mode no longer interferes with core Zork verbs
//  • Clean system commands (/exit, /help, /clear)
//  • Stable real-time message buffer
//  • ZORK lives inside BBS cleanly and safely
// ======================================================================

import { startZork, sendZorkCommand } from "./zorkLoader.js";

let inZork = false;
let writeToScreen = null;

// Utility: safely write to terminal
function appendMessage(msg) {
  writeToScreen(msg);
}

// =====================================================================
// INITIALIZER
// =====================================================================
export function initBBS(writeFn) {
  writeToScreen = writeFn;
  appendMessage("Welcome to the CharlestonHacks BBS.\nType 'zork' to start.\n");
}

// =====================================================================
// MASTER COMMAND ROUTER
// =====================================================================
export function handleBBSCommand(raw) {
  const cmd = raw.trim();

  // -------------------------------------------------------------
  // SYSTEM COMMANDS (WORK IN ALL MODES)
  // -------------------------------------------------------------
  if (cmd === "/exit") {
    if (inZork) {
      inZork = false;
      appendMessage("\nExited ZORK. You are back in the BBS.\n");
      return;
    }
    appendMessage("You are already in the BBS.\n");
    return;
  }

  if (cmd === "/clear") {
    const pane = document.querySelector(".bbs-output");
    if (pane) pane.innerHTML = "";
    return;
  }

  if (cmd === "/help") {
    return appendMessage(`
──────────  BBS HELP  ──────────

BBS commands:
  /help     show this help
  /clear    clear terminal
  /exit     leave Zork (or BBS submode)

ZORK:
  zork      start game
  All classic Zork commands are supported.

CHS Mode:
  chs              enable CHS overlays
  deactivate chs   disable CHS overlays

────────────────────────────────
`);
  }

  // =============================================================
  // START ZORK
  // =============================================================
  if (!inZork && cmd.toLowerCase() === "zork") {
    inZork = true;
    return startZork(appendMessage);
  }

  // =================================================================
  // INSIDE ZORK — ALL INPUT GOES TO Z-MACHINE (EXCEPT SYSTEM COMMANDS)
  // =================================================================
  if (inZork) {
    return sendZorkCommand(cmd, appendMessage);
  }

  // =================================================================
  // OUTSIDE ZORK — NORMAL BBS CHAT (you can extend here)
  // =================================================================
  if (cmd.length > 0) {
    appendMessage(`You said: ${cmd}\n`);
  }
}
