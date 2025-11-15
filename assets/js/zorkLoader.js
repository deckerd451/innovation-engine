import { ZVM } from "./ZVM.js";

let zork = null;
let introShown = false;

export async function startZork(write) {

  // ------------------------------------------
  // ★ CHARLESTONHACKS CUSTOM ZORK INTRO
  // ------------------------------------------
  if (!introShown) {
    write(`
─────────────────────────────────────────────
     C H A R L E S T O N H A C K S  •  Z O R K  
─────────────────────────────────────────────

  You descend beneath Charleston’s cobblestones,
  into the forgotten Data Vault of the Old City.

  As the air cools, a terminal flickers to life…

  Asterion murmurs:

      “Before The Grid… there was The Empire.
       An ancient simulation of logic, exploration,
       and danger. Few have completed it.”

  Loading ZORK I: The Great Underground Empire…
─────────────────────────────────────────────
    `);

    introShown = true;
  }

  // ------------------------------------------
  // Load the real ZORK story file
  // ------------------------------------------
  if (!zork) {
    const story = await fetch("/assets/zork/zork1.z3").then(r => r.arrayBuffer());
    zork = new ZVM(new Uint8Array(story));
    zork.start();
  }

  write(zork.readStoryOutput());
}

export function sendZorkCommand(cmd, write) {
  if (!zork) return;
  zork.sendCommand(cmd);
  write(zork.readStoryOutput());
}

