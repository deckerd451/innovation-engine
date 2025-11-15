// ===============================================================
//     CharlestonHacks ZORK Loader + CHS Mode + Prime Scan
// ===============================================================
//  ✔ Works with real ZORK 1 (zork1.z3)
//  ✔ Adds The Grid, Asterion, Charleston overlays
//  ✔ Adds "help" command (Zork + CHS extended)
//  ✔ Adds Easter Eggs, ghost glitches, Prime Node scan
//  ✔ Fully compatible with your BBS terminal
// ===============================================================

import { ZVM } from "../zork/zvm.js";

let zork = null;
let introShown = false;
let easterEggMode = false;

// Clean writer helper
function w(write, txt) {
  write(txt + (txt.endsWith("\n") ? "" : "\n"));
}

/* ============================================================
   START ZORK WITH MASSIVE CHARLESTONHACKS INTRO
============================================================ */
export async function startZork(write) {

  if (!introShown) {
    w(write, `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   C H A R L E S T O N H A C K S   •   T H E   E M P I R E    ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

A dim terminal awakens beneath the Old City Data Vault.

Asterion forms out of blue-white static:

   “Explorer… welcome to the ancient layers.
    Before The Grid, before the Network…
    the ancients trained inside this simulation.

    What you are about to enter is both artifact
    and weapon… a world stitched together from
    myth, memory, and raw computational will.

    Learn its logic.
    Survive its puzzles.
    And you will sense the Prime Node.”

Loading ZORK I: The Great Underground Empire…
Please stand by…
──────────────────────────────────────────────────────────────
`);

    introShown = true;
  }

  // Load Zork story file
  if (!zork) {
    const story = await fetch("/assets/zork/zork1.z3").then(r => r.arrayBuffer());
    zork = new ZVM(new Uint8Array(story));
    zork.start();
  }

  w(write, zork.readStoryOutput());
}

/* ============================================================
   MAIN COMMAND HANDLER
============================================================ */
export function sendZorkCommand(cmd, write) {
  const clean = cmd.trim().toLowerCase();

  // -----------------------------------------------------------
  // HELP — universal overlay
  // -----------------------------------------------------------
  if (clean === "help") {
    return w(write, buildHelpScreen());
  }

  // -----------------------------------------------------------
  // ENTER CHS MODE
  // -----------------------------------------------------------
  if (clean === "chs") {
    easterEggMode = true;
    return w(write, `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   ⭐ CHARLESTONHACKS MODE ENABLED ⭐   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Asterion leans close:

   “Ah… you found the ghost layer.
    Reality here may distort.
    Watch for overlays, anomalies,
    and whispers of the Prime Node.”

New commands unlocked:
  • scan node
  • prime node (restricted)
  • chs-enhanced look, north, south
  • deactivate chs
`);
  }

  // -----------------------------------------------------------
  // EXIT CHS MODE
  // -----------------------------------------------------------
  if (clean === "deactivate chs") {
    easterEggMode = false;
    return w(write, "CharlestonHacks enhancements disengaged.\n");
  }

  // -----------------------------------------------------------
  // PRIME NODE SCAN (minigame)
  // -----------------------------------------------------------
  if (easterEggMode && clean === "scan node") {
    return w(write, primeNodeScan());
  }

  // -----------------------------------------------------------
  // SECRET COMMAND
  // -----------------------------------------------------------
  if (easterEggMode && clean === "prime node") {
    return w(write, `
The world freezes… then fractures.

Asterion whispers sharply:
   “You should not know that phrase yet.”

Neural pathways briefly overlay the Zork map—
glowing, shifting, unreachable.

Then the simulation snaps back.
`);
  }

  // -----------------------------------------------------------
  // CHS WORLD OVERLAY INJECTIONS
  // -----------------------------------------------------------
  if (easterEggMode) {
    const lore = injectCHSLore(clean);
    if (lore) return w(write, lore);
  }

  // -----------------------------------------------------------
  // NORMAL ZORK EXECUTION
  // -----------------------------------------------------------
  zork.sendCommand(cmd);
  w(write, zork.readStoryOutput());
}

/* ============================================================
   HELP SCREEN (ZORK + CHS MODE)
============================================================ */
function buildHelpScreen() {

  let txt = `
─────────────  Z O R K   C O M M A N D S  ─────────────

Movement:
  north   south   east   west
  up      down    enter

Interaction:
  look                  examine <object>
  take <item>           drop <item>
  open <object>         read <object>
  attack <target>       inventory / i
  take all              move / push / pull

System:
  save                  restore
  quit                  exit

`;

  if (easterEggMode) {
    txt += `
──────────  C H A R L E S T O N H A C K S   M O D E  ──────────

Special Commands:
  chs                 enable ghost-layer
  deactivate chs      disable overlays
  scan node           run Prime Node diagnostic
  prime node          (restricted)
  
Enhancements:
  • look → reveals Charleston holograms
  • movement → overlays King St., Battery, Harbor echoes
  • inventory → Asterion commentary
  • hidden whispers during exploration

Type "/exit" to return to BBS chat.
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
    "King Street Alignment",
    "East Bay Convergence",
    "Pier 101 Ghost Layer",
    "Old City Data Vault"
  ];

  const hints = [
    "Look beneath the waves.",
    "Seek the ancient defenses.",
    "Follow the data currents.",
    "Charleston hides what it remembers.",
    "The Prime Node shifts… but not randomly."
  ];

  return `
Prime Node Diagnostic: ACTIVE
────────────────────────────────────
 • Alignment: ${sites[Math.floor(Math.random()*sites.length)]}
 • Stability: ${Math.floor(Math.random()*40)+60}%
 • Signal Strength: ${Math.floor(Math.random()*50)+40}%
 • Threat Level: ${["Low","Moderate","Elevated"][Math.floor(Math.random()*3)]}

Hint: ${hints[Math.floor(Math.random()*hints.length)]}
`;
}

/* ============================================================
   CHS OVERLAY LORE INJECTIONS
============================================================ */
function injectCHSLore(cmd) {

  const map = {

    "look": `
The scene glitches—  
A holographic Charleston overlays the terrain.

King Street.  
The Battery.  
Shadows of the Ravenel Bridge flicker in and out.`,

    "north": `
Asterion murmurs:
   “That direction aligns with King Street…
    though twisted through older geometry.”`,

    "south": `
A cool blue ripple washes over your vision.
   “The harbor watches you.”`,

    "inventory": `
Asterion scans your items:

   “Some objects resonate with Charleston…
    others remain inert.”`
  };

  return map[cmd] ?? null;
}
