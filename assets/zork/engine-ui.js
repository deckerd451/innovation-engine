// ======================================================
//   CharlestonHacks Zork UI Bridge (Continuous Output)
// ======================================================

export function createUI(vm, writeCallback, statusCallback) {
  vm.onOutput = (txt) => {
    // Continuous, real-time printing
    writeCallback(txt);
  };

  vm.onStatus = (location, score, moves) => {
    // Classic Infocom status line used by your BBS
    const line = `${location}     ${moves} Moves   ${score} Score`;
    statusCallback(line);
  };

  return {
    runCommand(cmd) {
      vm.acceptInput(cmd + "\n");
    },
  };
}
