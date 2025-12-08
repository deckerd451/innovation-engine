// ==========================================================================
//  CharlestonHacks ZORK Loader — COMPLETE REWRITE (2025 FINAL BUILD)
// ==========================================================================
//  ✔ Loads full Zork I story file (Z-machine v3)
//  ✔ Stable command routing (no interference with core verbs)
//  ✔ Mini-map engine (auto-updating ASCII map)
//  ✔ CHS Mode (scan node, prime node, overlays)
//  ✔ Clean output, compatible with BBS streaming
//  ✔ Works from any page on GitHub Pages
// ==========================================================================

import { ZVM } from "./zvm.js";

// GLOBALS
let zork = null;
let introShown = false;
let easterEggMode = false;
let lastLocation = "Open Field";   // default known start area


// ==========================================================================
//  WRITER UTILITY
// ==========================================================================
function w(write, txt) {
  txt.split("\n").forEach((line) => write(line));
}


// ==========================================================================
//  MINI-MAP DATABASE (extendable)
// ==========================================================================
const MINI_MAP = {
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


// Extract location name from first-line ZORK output
function detectLocation(output) {
  const first = output.split("\n")[0].trim();
  for (let key of Object.keys(MINI_MAP)) {
    if (first.toLowerCase().includes(key.toLowerCase())) {
      lastLocation = key;
      return;
    }
  }
}


// Render ASCII mini-map
function renderMiniMap() {
  const room = MINI_MAP[lastLocation];
  if (!room) return "";

  const N = room.north ? `[${room.north}]` : "";
  const S = room.south ? `[${room.south}]` : "";
  const E = room.east  ? `[${room.east}]`  : "";
  const W = room.west  ? `[${room.west}]`  : "";

  return `
────────── MINI-MAP ──────────

        ${N}
          |
${W} — [${lastLocation}] — ${E}
          |
        ${S}

──────────────────────────────\n`;
}

export function getMiniMap() {
  return renderMiniMap();
}


// ==========================================================================
//  ZORK STARTUP
// ==========================================================================
export async function startZork(write) {

  // Intro block (only once)
  if (!introShown) {
    w(write, `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃      C H A R L E S T O N H A C K S   •   T H E   E M P I R E      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

A dim terminal awakens beneath the Old City Data Vault.

Asterion materializes in blue-white static:

   “Explorer… welcome.
    This simulation predates The Grid.
    Learn its vectors. Survive its patterns.”

Loading ZORK… please wait.
────────────────────────────────────────────────────────────
`);
    introShown = true;
  }

  // Load Zork story file
  if (!zork) {
    const story = await fetch("/assets/zork/zork1.z3")
      .then(r => r.arrayBuffer())
      .catch(err => {
        w(write, "[ERROR] Could not load Zork story file.\n");
        console.error(err);
      });

    if (!story) return;

    zork = new ZVM(new Uint8Array(story));
    zork.start();
  }

  const out = zork.readStoryOutput();
  detectLocation(out);
  w(write, out);
  w(write, getMiniMap());
}


// ==========================================================================
//  ZORK COMMAND ROUTER — 100% COMPATIBLE WITH INFICOM VERBS
// ==========================================================================
export function sendZorkCommand(cmd, write) {
  const clean = cmd.trim().toLowerCase();

  // -----------------------------------------------------------
  // CORE ZORK VERBS — ALWAYS PASS THROUGH
  // -----------------------------------------------------------
  const coreZorkVerbs = [
    "i", "inventory", "inv",
    "look", "l",
    "n", "s", "e", "w", "ne", "nw", "se", "sw",
    "north", "south", "east", "west",
    "up", "down", "u", "d",
    "take", "get", "drop",
    "open", "close",
    "examine", "x",
    "attack",
    "read",
    "move", "push", "pull",
    "save", "restore",
    "quit", "restart"
  ];

  if (coreZorkVerbs.includes(clean)) {
    zork.sendCommand(cmd);
    const out = zork.readStoryOutput();
    detectLocation(out);
    w(write, out);
    return w(write, getMiniMap());
  }


  // -----------------------------------------------------------
  //  CHS MODE COMMANDS
  // -----------------------------------------------------------
  if (clean === "chs") {
    easterEggMode = true;
    return w(write, `
CHS MODE ENABLED.
Ghost-layer commands activated:
  • scan node
  • prime node
  • deactivate chs
`);
  }

  if (clean === "deactivate chs") {
    easterEggMode = false;
    return w(write, "CHS mode disengaged.\n");
  }

  if (easterEggMode && clean === "scan node") {
    return w(write, primeNodeScan());
  }

  if (easterEggMode && clean === "prime node") {
    return w(write, `
The world fractures.

Asterion whispers:
   “You should NOT know that phrase yet.”

Neural vectors shimmer… then snap back.
`);
  }


  // -----------------------------------------------------------
  //  CHS LORE INJECTIONS — NON-CORE VERBS ONLY
  // -----------------------------------------------------------
  if (easterEggMode) {
    const lore = injectCHSLore(clean);
    if (lore) return w(write, lore);
  }


  // -----------------------------------------------------------
  // FALLBACK: NORMAL ZORK PASS-THROUGH
  // -----------------------------------------------------------
  zork.sendCommand(cmd);
  const out = zork.readStoryOutput();
  detectLocation(out);
  w(write, out);
  w(write, getMiniMap());
}


// ==========================================================================
//  CHS MODE — LORE INJECTION
// ==========================================================================
function injectCHSLore(cmd) {
  const map = {
    "scan": "Diagnostics incomplete. Try 'scan node'.",
    "status": "Asterion: “Status is a relative illusion.”",
    "forest": "You sense echoes of King Street weaving through the trees."
  };

  return map[cmd] ?? null;
}


// ==========================================================================
//  PRIME NODE SCAN
// ==========================================================================
function primeNodeScan() {
  const sites = [
    "Harbor Gate",
    "Market Street Fracture",
    "Battery Node",
    "King St. Alignment",
    "East Bay Convergence",
    "Pier 101 Ghost Layer",
    "Old City Data Vault"
  ];

  const hints = [
    "Look beneath the waves.",
    "Seek the ancient defenses.",
    "Follow the data currents.",
    "Charleston remembers everything.",
    "The Prime Node shifts unpredictably."
  ];

  return `
Prime Node Diagnostic
────────────────────────────────────────
 • Alignment: ${sites[Math.floor(Math.random()*sites.length)]}
 • Stability: ${Math.floor(Math.random()*40)+60}%
 • Signal Strength: ${Math.floor(Math.random()*50)+40}%
 • Threat Level: ${["Low","Moderate","Elevated"][Math.floor(Math.random()*3)]}

Hint: ${hints[Math.floor(Math.random()*hints.length)]}
`;
}
