// zorkLoader.js – simplified loader with save/restore support
import { ZVM } from "./zvm.js";

let zork = null;

export async function startZork(write) {
  if (!zork) {
    const story = await fetch("./zork1.z3").then(r => r.arrayBuffer());
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

// Serialize interpreter state (memory, instruction pointer, finished flag)
export function getZorkState() {
  if (!zork) return null;
  return {
    memory: Array.from(zork.memory),
    ip: zork.ip,
    finished: zork.finished
  };
}

// Restore interpreter state
export function setZorkState(state) {
  if (!state) return;
  if (!zork) {
    zork = new ZVM(new Uint8Array(state.memory));
  }
  zork.memory = new Uint8Array(state.memory);
  zork.ip = state.ip;
  zork.finished = state.finished;
}
