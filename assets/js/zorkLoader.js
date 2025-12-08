// ======================================================================
// ZORK COMMAND ROUTER — ZORK-COMPATIBLE VERSION
// ======================================================================

export function sendZorkCommand(cmd, write) {
  const clean = cmd.trim().toLowerCase();

  // -----------------------------------------------------------
  // 1. CORE ZORK VERBS — ALWAYS PASS THROUGH
  // -----------------------------------------------------------
  const coreZorkVerbs = [
    "i", "inventory", "inv",
    "look", "l",
    "n", "s", "e", "w", "ne", "nw", "se", "sw", "u", "d",
    "north", "south", "east", "west",
    "up", "down",
    "take", "get", "drop",
    "examine", "x",
    "open", "close",
    "attack",
    "move", "push", "pull",
    "read",
    "save", "restore",
    "restart", "quit"
  ];

  if (coreZorkVerbs.includes(clean)) {
    zork.sendCommand(cmd);
    return w(write, zork.readStoryOutput());
  }

  // -----------------------------------------------------------
  // 2. CHS MODE COMMANDS
  // -----------------------------------------------------------
  if (clean === "chs") {
    easterEggMode = true;
    return w(write, `
CHS mode enabled.
Special commands active:
  • scan node
  • prime node
  • deactivate chs
`);
  }

  if (clean === "deactivate chs") {
    easterEggMode = false;
    return w(write, "CHS enhancements disengaged.\n");
  }

  if (easterEggMode && clean === "scan node") {
    return w(write, primeNodeScan());
  }

  if (easterEggMode && clean === "prime node") {
    return w(write, `
The world fractures briefly.
Asterion hisses:
   “That phrase is forbidden… for now.”
`);
  }

  // -----------------------------------------------------------
  // 3. OTHER CHS OVERRIDES (NON-ZORK VERBS ONLY)
  // -----------------------------------------------------------
  if (easterEggMode) {
    const lore = injectCHSLore(clean);
    if (lore) return w(write, lore);
  }

  // -----------------------------------------------------------
  // 4. EVERYTHING ELSE → ZORK
  // -----------------------------------------------------------
  zork.sendCommand(cmd);
  w(write, zork.readStoryOutput());
}
