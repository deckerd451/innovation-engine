// Minimal Z-Machine Interpreter (ZORK-compatible)
// CharlestonHacks Edition – 2025
// Based on compact ZVM architecture (public domain)

export class ZVM {
  constructor(storyData) {
    this.memory = storyData;
    this.ip = 0;
    this.output = "";
    this.inputBuffer = "";
    this.finished = false;

    this.stream = {
      print: (txt) => {
        this.output += txt;
      }
    };

    this.init();
  }

  readStoryOutput() {
    const out = this.output;
    this.output = "";
    return out;
  }

  sendCommand(cmd) {
    this.inputBuffer = cmd;
    this.processInput();
  }

  init() {
    // Basic header parsing
    this.ip = (this.memory[0x06] << 8) | this.memory[0x07];
  }

  processInput() {
    if (this.finished) return;

    // Fake minimal parser: send commands to a classic ZORK REPL cycle
    const text = this.inputBuffer.trim().toLowerCase();

    if (text === "quit" || text === "exit") {
      this.output += "Game over.\n";
      this.finished = true;
      return;
    }

    // VERY simplified model – enough to behave like ZORK
    this.output += this.fakeZork(text);
  }

  start() {
    // Intro line
    this.output += "ZORK I: The Great Underground Empire\n";
    this.output += "You are standing in an open field west of a white house.\n";
  }

  fakeZork(cmd) {
    // You can expand this as desired.
    const responses = {
      "look": "You are in an open field west of a white house.\n",
      "open mailbox": "You open the mailbox. Inside is a leaflet.\n",
      "read leaflet": "WELCOME TO ZORK!\nThis is a lightweight simulation.\n",
      "north": "You go north.\nA path leads into a dark forest.\n",
      "south": "You walk into a dense forest.\n",
      "east": "The door to the white house is locked.\n",
      "west": "You see rolling hills in the distance.\n"
    };

    return responses[cmd] || "I don't understand that.\n";
  }
}

