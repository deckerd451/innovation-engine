// ======================================================
//  CharlestonHacks Z-Machine Core (Parchment Compact VM)
//  MIT License – Modified loader for BBS integration
// ======================================================

import { ZVM } from "./vendor/parchment-zvm.js";

export function createZMachine(storyUint8Array) {
  const vm = new ZVM({
    story: storyUint8Array,
    output: "",
    onOutput: null,   // we attach this later
    onStatus: null,   // classic status line callback
    onInput: null,    // not used, we drive input manually
  });

  return vm;
}
