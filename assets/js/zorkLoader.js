// CharlestonHacks ZORK Loader + Ghosts + Prime Node Scan

import { ZVM } from "../zork/zvm.js";

let zork = null;
let introShown = false;
let easterEggMode = false;

function w(write, txt) {
  write(txt + (txt.endsWith("\n") ? "" : "\n"));
}

/* ============================================================
   START ZORK WITH CHARLESTONHACKS LORE
============================================================ */
export async function startZork(write) {

  if (!introShown) {
    w(write, `
─────────────────────────────────────────────
   C H A R L E S T O N H A C K S  •  Z O R K
─────────────────────────────────────────────

Asterion flickers into existence.

“Welcome explorer… The Grid requires training
in older architectures. The Empire awaits.”

Loading simulation…
`);
    introShown = true;
  }

  if (!zork) {
    const story = await fetch("/assets/zork/zork1.z3").then(r => r.arrayBuffer());
    zork = new ZVM(new Uint8Array(story));
    zork.start();
  }

  w(write, zork.readStoryOutput());
}

/* ============================================================
   COMMAND HANDLER + CHS MODE
============================================================ */
export function sendZorkCommand(cmd, write) {
  const clean = cmd.toLowerCase();

  /* -----------------------------------
     ENTER CHS MODE
  ----------------------------------- */
  if (clean === "chs") {
    easterEggMode = true;
    return w(write, `
──────────────────────────────────────────────
 ⭐ CHARLESTONHACKS NODE ACTIVE ⭐
──────────────────────────────────────────────
Asterion whispers:

"You now perceive deeper layers of the simulation."
`);
  }

  /* -----------------------------------
     EXIT CHS MODE
  ----------------------------------- */
  if (clean === "deactivate chs") {
    easterEggMode = false;
    return w(write, "CharlestonHacks mode disengaged.\n");
  }

  /* -----------------------------------
     PRIME NODE SCAN MINIGAME
  ----------------------------------- */
  if (easterEggMode && clean === "scan node") {
    return w(write, generatePrimeNodeScan());
  }

  /* -----------------------------------
     CHS OVERLAYS
  ----------------------------------- */
  if (easterEggMode) {
    const lore = injectCHSLore(clean);
    if (lore) return w(write, lore);
  }

  /* -----------------------------------
     NORMAL ZORK EXECUTION
  ----------------------------------- */
  zork.sendCommand(cmd);
  w(write, zork.readStoryOutput());
}

/* ============================================================
   PRIME NODE SCAN
============================================================ */
function generatePrimeNodeScan() {
  const sites = [
    "Harbor Gate", "Market Street Fracture",
    "Battery Node", "King St. Alignment",
    "East Bay Convergence"
  ];
  const hints = [
    "Look beneath the waves.", "Seek the old defenses.",
    "Watch the alleys.", "Follow the data currents."
  ];

  return `
Prime Node Signature Detected
 • Alignment: ${sites[Math.floor(Math.random()*sites.length)]}
 • Stability: ${Math.floor(Math.random()*40)+60}%
 • Threat: ${["Low","Moderate","Elevated"][Math.floor(Math.random()*3)]}
Hint: ${hints[Math.floor(Math.random()*hints.length)]}
`;
}

/* ============================================================
   CHS-ENHANCED RESPONSES
============================================================ */
function injectCHSLore(cmd) {

  const map = {
    "look": `
The environment flickers—
A hologram of Charleston overlays the scene.`,

    "north": `
Asterion murmurs:
"King Street lies somewhere beyond this layer…"`,
    
    "south": `
A ripple of water appears in your vision.
"Something stirs beneath the harbor."`,
  };

  return map[cmd] ?? null;
}
