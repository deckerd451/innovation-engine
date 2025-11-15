// ===============================================================
//  CharlestonHacks ZORK Loader (2025) – FULL VERSION
// ===============================================================
//  ✔ Loads real Zork (.z5 file)
//  ✔ CharlestonHacks intro narrative
//  ✔ CHS Mode ("chs")
//  ✔ Prime Node Scan
//  ✔ Overlays + Lore Injections
//  ✔ HELP command (Zork + CHS)
//  ✔ Clean newline handling
// ===============================================================

import { ZVM } from "../zork/zvm.js";

let zork = null;
let introShown = false;
let easterEggMode = false;

// Clean writer: automatically adds a line break
function w(write, txt) {
  txt.split("\n").forEach(line => write(line));
}

/* ============================================================
   START ZORK WITH CHARLESTONHACKS INTRO
============================================================ */
export async function startZork(write) {

  if (!introShown) {
    w(write, `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃      C H A R L E S T O N H A C K S   •   T H E   E M P I R E      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

A dim terminal awakens beneath the Old City Data Vault.

Asterion, formed of blue-white static, materializes:

   “Explorer… welcome.
    Before The Grid was built, before the Network—
    the ancients trained inside this simulation.

    What you are about to enter is both artifact and weapon.

    Learn its rules.
    Survive its patterns.
    And you may sense the Prime Node.”

Loading ZORK… please wait.
────────────────────────────────────────────────────────────
`);

    introShown = true;
  }

  // Load the .z5 file
  if (!zork) {
    const story = await fetch("/assets/zork/zork1.z3").then(r => r.arrayBuffer());
    zork = new ZVM(new Uint8Array(story));
    zork.start();
  }

  w(write, zork.readStoryOutput());
}

/* ============================================================
   MAIN COMMAND ROUTING
============================================================ */
export function sendZorkCommand(cmd, write) {
  const clean = cmd.trim().toLowerCase();

  // HELP OVERLAY
  if (clean === "help") {
    return w(write, buildHelpScreen());
  }

  // ENTER CHS MODE
  if (clean === "chs") {
    easterEggMode = true;
    return w(write, `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃    ⭐ CHARLESTONHACKS MODE ENABLED ⭐    ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Asterion whispers:
   “The ghost-layer responds to your awareness…”

New commands:
  • scan node
  • prime node (restricted)
  • deactivate chs

Movement + look now reveal Charleston overlays.
`);
  }

  // EXIT CHS MODE
  if (clean === "deactivate chs") {
    easterEggMode = false;
    return w(write, "CharlestonHacks enhancements disengaged.\n");
  }

  // PRIME NODE SCAN
  if (easterEggMode && clean === "scan node") {
    return w(write, primeNodeScan());
  }

  // SECRET PRIME NODE COMMAND
  if (easterEggMode && clean === "prime node") {
    return w(write, `
The world fractures.

Asterion hisses:
   “You should NOT know that phrase yet.”

Neural pathways flash across the sky—
glowing, incomplete.

Then everything snaps back.
`);
  }

  // CHS LORE INJECTIONS
  if (easterEggMode) {
    const lore = injectCHSLore(clean);
    if (lore) return w(write, lore);
  }

  // NORMAL ZORK EXECUTION
  zork.sendCommand(cmd);
  w(write, zork.readStoryOutput());
}

/* ============================================================
   HELP COMMAND
============================================================ */
function buildHelpScreen() {
  let txt = `
──────────────  Z O R K   C O M M A N D S  ──────────────

Movement:
  north  south  east  west  up  down

Actions:
  look     examine <obj>
  take     take all
  open     read
  move / push / pull
  attack <target>
  inventory   (also: i)

System:
  save      restore      quit

`;

  if (easterEggMode) {
    txt += `
────────────  C H A R L E S T O N H A C K S   M O D E  ────────────

Special:
  chs               enable ghost-layer
  deactivate chs    return to normal
  scan node         Prime Node diagnostic
  prime node        (restricted)

Enhancements:
  • look reveals Charleston holograms
  • movement echoes King St, Battery, Harbor nodes
  • Asterion comments on your inventory
  • random ghost-layer anomalies

Type "/exit" to leave ZORK and return to chat.
`;
  }

  return txt;
}

/* ============================================================
   PRIME NODE SCAN
============================================================ */
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
    "Charleston hides what it remembers.",
    "The Prime Node shifts… unpredictably."
  ];

  return `
Prime Node Diagnostic
──────────────────────────────────────
 • Alignment: ${sites[Math.floor(Math.random()*sites.length)]}
 • Stability: ${Math.floor(Math.random()*40)+60}%
 • Signal Strength: ${Math.floor(Math.random()*50)+40}%
 • Threat Level: ${["Low","Moderate","Elevated"][Math.floor(Math.random()*3)]}

Hint: ${hints[Math.floor(Math.random()*hints.length)]}
`;
}

/* ============================================================
   CHS OVERLAY INJECTIONS
============================================================ */
function injectCHSLore(cmd) {
  const map = {
    "look": `
The simulation flickers—
Charleston overlays the terrain:
King Street… The Battery… shadows of the Ravenel Bridge.`,

    "north": `
Asterion murmurs:
   “That direction aligns with King St…
    twisted through ancient geometry.”`,

    "south": `
A blue wave ripples across your vision:
   “The harbor watches you.”`,

    "inventory": `
Asterion scans your items:
   “Some resonate with Charleston…
    others remain inert.”`
  };

  return map[cmd] ?? null;
}
