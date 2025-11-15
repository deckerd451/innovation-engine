// =====================================================================
//    CharlestonHacks ZORK Loader — Asterion + CHS Ghost Layer
// =====================================================================

import { loadZork, runZorkCommand, manualSave, manualRestore } from "./realZorkEngine.js";

let chsMode = false;
let introShown = false;

export async function startZork(write, writeStatus, username) {
  if (!introShown) {
    write(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  C H A R L E S T O N H A C K S  •  Z O R K  I
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Asterion emerges from static.

"Explorer… The Grid requires mastery of older
simulation layers. The Empire awaits."
`);
    introShown = true;
  }

  await loadZork(username, write, writeStatus);
}

export function sendZorkCommand(cmd, write) {
  const clean = cmd.trim().toLowerCase();

  if (clean === "chs") {
    chsMode = true;
    return write("CharlestonHacks ghost-layer activated.\n");
  }

  if (clean === "deactivate chs") {
    chsMode = false;
    return write("CHS mode deactivated.\n");
  }

  if (clean === "scan node" && chsMode) {
    return write(primeNodeScan());
  }

  if (clean === "help") {
    return write(helpScreen(chsMode));
  }

  if (clean === "save") return manualSave(write);
  if (clean === "restore") return manualRestore(write);

  // Otherwise run normal Zork command
  return runZorkCommand(cmd, write);
}

// Prime Node Scan
function primeNodeScan() {
  const sites = ["Harbor Gate", "Battery Node", "Market Fracture"];
  const n = sites[Math.floor(Math.random() * sites.length)];

  return `
Prime Node Diagnostic
 • Alignment: ${n}
 • Stability: ${Math.floor(Math.random() * 40) + 60}%
 • Signal: ${Math.floor(Math.random() * 50) + 40}%
`;
}

function helpScreen(chs) {
  let base = `
────────────── Z O R K   C O M M A N D S ──────────────
look, north/south/east/west, inventory, take/drop,
open, read, attack, save, restore, quit

`;

  if (chs) {
    base += `
────────── C H S   E N H A N C E D   M O D E ──────────
chs, deactivate chs, scan node
Charleston holograms, ghost overlays, Asterion hints
`;
  }

  return base;
}
