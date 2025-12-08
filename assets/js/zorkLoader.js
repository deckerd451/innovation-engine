// zorkLoader.js – Simplified, no Charleston extras
import { ZVM } from "./zvm.js";

let zork = null;

export async function startZork(write) {
  // Load the Z-machine story file from assets/zork/zork1.z3
  const response = await fetch("/assets/zork/zork1.z3");
  const arrayBuffer = await response.arrayBuffer();
  zork = new ZVM(new Uint8Array(arrayBuffer));
  zork.start();
  write(zork.readStoryOutput());
}

export function sendZorkCommand(cmd, write) {
  if (!zork) return;
  zork.sendCommand(cmd);
  write(zork.readStoryOutput());
}
