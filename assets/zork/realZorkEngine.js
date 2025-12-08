// =====================================================================
//   CharlestonHacks REAL ZORK ENGINE
//   - Real Zork I (Story file)
//   - Continuous output mode
//   - Auto-save every 5 commands (Hybrid)
//   - Save/Restore via Supabase
// =====================================================================

import { createZMachine } from "./engine-core.js";
import { createUI } from "./engine-ui.js";
import { saveZorkState, loadZorkState } from "./zork-supabase.js";

let vm = null;
let ui = null;

let commandCount = 0;
let username = null;

export async function loadZork(user, write, writeStatus) {
  username = user;

  // Fetch the Zork story file relative to this module.  The original code
  // expected the story to live under `/assets/zork/zork1.z3`, but in this
  // environment the file is co-located with the source.  Adjusting the
  // path ensures the fetch succeeds when the engine is bundled.
  const story = await fetch("./zork1.z3").then((r) => r.arrayBuffer());

  vm = createZMachine(new Uint8Array(story));

  // Try restoring save
  const saved = await loadZorkState(username);
  if (saved) {
    try {
      vm.restore(saved);
      write("[ZORK] Restored your previous session.\n");
    } catch (e) {
      write("[ZORK] Save was corrupt — starting fresh.\n");
    }
  } else {
    write("[ZORK] Starting a new adventure...\n");
  }

  ui = createUI(vm, write, writeStatus);

  vm.run();
}

export async function runZorkCommand(cmd, write) {
  if (!vm || !ui) return;

  ui.runCommand(cmd);
  commandCount++;

  // Hybrid mode — auto-save every 5 commands
  if (commandCount >= 5) {
    commandCount = 0;
    const save = vm.save();
    await saveZorkState(username, save);
    write("\n[Auto-Saved]\n");
  }
}

export async function manualSave(write) {
  if (!vm) return;
  const save = vm.save();
  await saveZorkState(username, save);
  write("[Saved]\n");
}

export async function manualRestore(write) {
  if (!vm) return;
  const saved = await loadZorkState(username);
  if (!saved) return write("[No save found]\n");

  vm.restore(saved);
  write("[Restored]\n");
  vm.run();
}
