// CharlestonHacks Enhanced ZORK Loader (2025)
// ------------------------------------------
// ✔ Loads real Zork I (.z3)
// ✔ Adds CharlestonHacks intro narrative
// ✔ Adds Easter Egg Mode (“chs”)
// ✔ Clean terminal integration for your BBS
// ------------------------------------------

import { ZVM } from "./ZVM.js";

let zork = null;
let introShown = false;
let easterEggMode = false;

// Utility: write with trailing newline support
function w(write, txt) {
  write(txt + (txt.endsWith("\n") ? "" : "\n"));
}

// -----------------------------------------------------
// START ZORK I (with CHS intro)
// -----------------------------------------------------
export async function startZork(write) {

  // ---------------------------------------------------
  // CHARLESTONHACKS CUSTOM INTRO (first time only)
  // ---------------------------------------------------
  if (!introShown) {
    w(write, `
─────────────────────────────────────────────
      C H A R L E S T O N H A C K S  •  Z O R K  
─────────────────────────────────────────────

A hidden terminal flickers inside the Old City Data Vault.

As you approach, Asterion materializes, formed from blue-white noise.

   “Before The Grid could be built, explorers trained 
    inside a much older simulation… The Empire.

    It is primitive. Brutal. Brilliant.

    If you master it, you may see things 
    the original players never did.”

Loading ZORK I: The Great Underground Empire…
Please wait…
─────────────────────────────────────────────
    `);

    introShown = true;
  }

  // ---------------------------------------------------
  // LOAD REAL ZORK STORY FILE
  // ---------------------------------------------------
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
  // ENTER HIDDEN CHARLESTONHACKS EASTER EGG MODE
  // ---------------------------------------------------
  if (clean === "chs") {
    easterEggMode = true;

    return w(write, `
──────────────────────────────────────────────
    ⭐  CHARLESTONHACKS EASTER EGG MODE  ⭐
──────────────────────────────────────────────

Asterion reappears, glitching at the edges.

   “Ahh… so you have found the hidden input.

    Few travelers discover the Charleston Node.
    It lies beneath the Zork architecture —
    a ghost layer, stitched into the simulation.”

New behaviors unlocked:
  • Additional room descriptions
  • Hidden Charleston-based artifacts
  • Shadow “Prime Node” whispers
  • Asterion commentary in certain actions

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
      w(write, injection);
      return;
    }
  }

  // ---------------------------------------------------
  // NORMAL ZORK COMMAND EXECUTION
  // ---------------------------------------------------
  zork.sendCommand(cmd);
  w(write, zork.readStoryOutput());
}


// -----------------------------------------------------
// CHARLESTONHACKS EASTER EGG BEHAVIORS
// -----------------------------------------------------
function handleCharlestonEasterEggs(cmd) {

  // Additional responses layered on top of Zork world
  const eggResponses = {

    "look": `
You notice something the original game never described…

A faint blue shimmer overlays the environment,
almost like AR data leaking into the simulation.
Asterion whispers:

   “The Grid is testing how you perceive older worlds.”`,

    "inventory": `
Asterion scans your items.

   “Some objects resonate with Charleston…
    others do not.”`,

    "north": `
A ghostly map of Charleston overlays briefly:
   King St.
   Meeting St.
   The Battery.
But the image collapses before you can grasp it.`,

    "south": `
A whisper follows you:

   “Seek the Prime Node beneath the harbor…”`,

    "open mailbox": `
The mailbox contains the leaflet — and something else.
A folded sticker reads:

   “CharlestonHacks — Making Invisible Networks Visible.”
`
  };

  if (eggResponses[cmd]) return eggResponses[cmd];

  // Secret command  
  if (cmd === "prime node") {
    return `
Asterion freezes.

   “You should not know that phrase yet.”

For a moment, the Zork map blurs into glowing neural pathways.

Then it snaps back.

   “Continue the simulation…”
`;
  }

  // default: no injection
  return null;
}
