/* ============================================================
  CHARLESTONHACKS: THE GRID — MODULE 1
  Puzzle: "The Dormant Prototype"
  Format: Your custom ZORK-style JS engine
  Commands Supported: look, scan, attune, weave, inventory, help
============================================================ */

export const GRID_MODULE_1 = {
  id: "module_1",
  name: "The Dormant Prototype",
  startText: `
You descend into the Old City Data Vault.

Shelves curve around the circular chamber, stacked high with
abandoned blueprints, half-built gadgets, and flickering fragments
of ideas that shimmer like ghosts.

In the center of the room floats a crystal-like shard suspended by
magnetic fields. Its soft pulse echoes through the chamber.

Asterion emerges from the shadows.

  “The Grid left you something unfinished.
   To proceed, you must finish it.”

Type "look" to examine the chamber.
  `,
  
  state: {
    frameFound: false,
    coreFound: false,
    frameAttuned: false,
    coreAttuned: false,
    pulseKeyForged: false,
    inventory: []
  },

  commands: {
    "look": (S) => {
      return `
You scan the room.

To your left: a cluttered shelf containing a twisted copper framework.
To your right: a humming blue shard resting on a pedestal.

The floating crystal in the center pulses softly.
      `;
    },

    "scan": (S) => {
      if (S.pulseKeyForged)
        return "The chamber is stable. The Pulse Key resonates in your hands.";

      if (!S.frameFound || !S.coreFound)
        return "Two components resonate faintly but remain incompatible.";

      if (!S.frameAttuned || !S.coreAttuned)
        return "Resonance out of phase. Components misaligned.";

      return "The components vibrate in unison. They are ready to be woven.";
    },

    "take frame": (S) => {
      if (S.frameFound) return "You already have the Resonant Frame.";
      S.frameFound = true;
      S.inventory.push("Resonant Frame");
      return "You take the twisted copper Resonant Frame. It hums weakly.";
    },

    "take core": (S) => {
      if (S.coreFound) return "You already have the Signal Core.";
      S.coreFound = true;
      S.inventory.push("Signal Core");
      return "You gently lift the humming Signal Core. It vibrates like a heartbeat.";
    },

    "attune frame": (S) => {
      if (!S.frameFound) return "You don't see a frame.";
      if (S.frameAttuned) return "The frame is already attuned.";
      S.frameAttuned = true;
      return `
You align your breathing with the hum of the frame.

Its tangled copper loops unravel and reform,
settling into a graceful harmonic curve.

The Resonant Frame is now attuned.
      `;
    },

    "attune core": (S) => {
      if (!S.coreFound) return "You don't have the core.";
      if (S.coreAttuned) return "The core already pulses in perfect rhythm.";
      S.coreAttuned = true;
      return `
You place your palms around the humming shard.

A blue ripple passes through you.

The Signal Core stabilizes, shining like crystallized lightning.

The Core is now attuned.
      `;
    },

    "weave frame core": (S) => {
      if (!S.frameAttuned || !S.coreAttuned)
        return "The components refuse to merge. They’re still out of phase.";

      if (S.pulseKeyForged)
        return "The Pulse Key is already forged.";

      S.pulseKeyForged = true;
      S.inventory.push("Pulse Key");

      return `
The chamber brightens.

The Resonant Frame and Signal Core spiral together, locking into
perfect alignment as a wave of sonic light floods the air.

You have forged:

  ⭐  THE PULSE KEY ⭐

Asterion bows his head.

  “You built what the Vault could not.
   The Grid recognizes you now.”

Type "inventory" to view your items.
      `;
    },

    "inventory": (S) => {
      if (S.inventory.length === 0) return "Your inventory is empty.";
      return "You carry:\n- " + S.inventory.join("\n- ");
    },

    "help": () => {
      return `
Available Commands:
  look      — examine the room
  scan      — analyze component compatibility
  take ___  — (frame/core)
  attune ___ — (frame/core)
  weave frame core — forge the Pulse Key
  inventory — check what you're carrying
  help      — display this message
      `;
    }
  }
};
