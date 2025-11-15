// CharlestonHacks Enhanced ZORK Loader (2025)
// ------------------------------------------
// ✔ Loads real Zork I (.z3)
// ✔ Adds CharlestonHacks intro narrative
// ✔ Adds Easter Egg Mode (“chs”)
// ✔ Clean terminal integration for your BBS
// ------------------------------------------

import { ZVM } from "../zork/zvm.js";

let zork = null;
let introShown = false;
let easterEggMode = false;

// Utility: newline-safe write
function w(write, txt) {
  write(txt + (txt.endsWith("\n") ? "" : "\n"));
}

// -----------------------------------------------------
// START ZORK I (with CHS intro)
// -----------------------------------------------------
export async function startZork(write) {

  // CharlestonHacks custom intro (first launch only)
  if (!introShown) {
    w(write, `
─────────────────────────────────────────────
      C H A R L E S T O N H A C K S  •  Z O R K  
─────────────────────────────────────────────

A hidden terminal flickers inside the Old City Data Vault.

Asterion materializes, formed from blue-white noise:

   “Before The Grid could be built, explorers trained 
    inside a much older simulation… The Empire.

    It is primitive. Brutal. Brilliant.

    Master it… and you may see things 
    the original players never did.”

Loading ZORK I: The Great Underground Empire…
─────────────────────────────────────────────
    `);

    introShown = true;
  }

  // Load story file only once
  if (!zork) {
    const story = await fetch("/assets/zork/zork1.z3").then(r => r.arrayBuffer());
    zork = new ZVM(new Uint8Array(story));
    zork.start();
  }

  w(write, zork.readStoryOutput());
}


// -----------------------------------------------------
// HANDLE ZORK COMMANDS (with CHS-mode injector)
// -----------------------------------------------------
export function sendZorkCommand(cmd, write) {
  if (!zork) return;

  const clean = cmd.trim().toLowerCase();

  // ---------------------------------------------------
  // ENTER CHARLESTONHACKS EASTER EGG MODE
  // ---------------------------------------------------
  if (clean === "chs") {
    easterEggMode = true;
    return w(write, `
──────────────────────────────────────────────
⭐  CHARLESTONHACKS EASTER EGG MODE ENABLED ⭐
──────────────────────────────────────────────

Asterion glitches back into view:

   “So… you found the Charleston Node.

    Beneath ZORK lies a ghost layer —
    stitched into the simulation by Grid engineers.”

CHS-mode unlocks:
  • Extra room descriptions
  • Hidden Charleston artifacts
  • Prime Node hints
  • Asterion commentary

Type "deactivate chs" to disable.
──────────────────────────────────────────────
`);
  }

  // ---------------------------------------------------
  // EXIT EASTER EGG MODE
  // ---------------------------------------------------
  if (clean === "deactivate chs") {
    easterEggMode = false;
    return w(write, `CharlestonHacks mode disengaged.\n`);
  }

  // ---------------------------------------------------
  // INTERCEPT COMMANDS WHEN CHS MODE IS ACTIVE
  // ---------------------------------------------------
  if (easterEggMode) {
    const injection = handleCharlestonEasterEggs(clean);
    if (injection) {
      return w(write, injection);
    }
  }

  // ---------------------------------------------------
  // NORMAL ZORK EXECUTION
  // ---------------------------------------------------
  zork.sendCommand(cmd);
  w(write, zork.readStoryOutput());
}


// -----------------------------------------------------
// CHARLESTONHACKS EASTER EGG BEHAVIORS
// -----------------------------------------------------
function handleCharlestonEasterEggs(cmd) {

  const eggResponses = {

    "look": `
You notice something the original game never described…

A faint blue shimmer overlays the terrain —
AR data leaking through The Grid.
Asterion whispers:

   “The simulation is testing your perception…”`,

    "inventory": `
Asterion analyzes your items.

   “Some resonate with Charleston.
    Others… do not.”`,

    "north": `
A holographic map of Charleston blinks into view:
 King St. • Meeting St. • East Bay • The Battery
Then it collapses back into darkness.`,

    "south": `
A watery echo follows…

   “The Prime Node rests beneath the harbor…”`,

    "open mailbox": `
The mailbox holds a leaflet… and something new:
A glowing sticker that reads:

   “CharlestonHacks — Making Invisible Networks Visible.”`
  };

  if (eggResponses[cmd]) return eggResponses[cmd];

  if (cmd === "prime node") {
    return `
Asterion freezes.

   “That phrase… You should not know it yet.”

For a moment the Zork map dissolves into glowing neural pathways,
like a living circuit emerging beneath the earth.

Then reality snaps back.

   “Continue… The Grid is watching.”`;
  }

  return null;
}
