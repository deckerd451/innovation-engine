// =======================================================================
// CharlestonHacks BBS – MINIMAL WORKING EDITION (2025)
// =======================================================================

let supabase = null;
let initialized = false;

// -----------------------------------------------------------------------
// 1. WAIT FOR READY (supabase + DOM)
// -----------------------------------------------------------------------

async function waitForSupabaseReady() {
  return new Promise(resolve => {
    function tryResolve() {
      if (window.supabase) {
        supabase = window.supabase;
        resolve();
      }
    }

    // Try immediately
    tryResolve();

    // Try again after short delay
    const interval = setInterval(() => {
      if (window.supabase) {
        clearInterval(interval);
        supabase = window.supabase;
        resolve();
      }
    }, 50);
  });
}

// -----------------------------------------------------------------------
// 2. INIT BBS — CALLED ONLY WHEN TAB IS ACTIVATED
// -----------------------------------------------------------------------

export async function initBBS() {
  if (initialized) return;
  initialized = true;

  await waitForSupabaseReady();

  console.log("[BBS] Initializing…");

  const screen = document.getElementById("bbs-screen");
  const form = document.getElementById("bbs-form");
  const input = document.getElementById("bbs-input");
  const onlineList = document.getElementById("bbs-online-list");

  if (!screen || !form || !input) {
    console.error("[BBS] Missing DOM elements");
    return;
  }

  // username management
  function getUsername() {
    const cached = localStorage.getItem("bbs_username");
    if (cached) return cached;
    const generated = "Guest" + Math.floor(Math.random() * 9999);
    localStorage.setItem("bbs_username", generated);
    return generated;
  }

  const username = getUsername();

  // write utility
  function write(text) {
    const line = document.createElement("div");
    line.textContent = text;
    screen.appendChild(line);
    screen.scrollTop = screen.scrollHeight;
  }

  // load messages
  async function loadMessages() {
    const { data, error } = await supabase
      .from("bbs_messages")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[BBS] loadMessages error:", error);
      return;
    }

    screen.innerHTML = "";

    data.forEach(msg => write(`[${msg.username}] ${msg.text}`));
  }

  await loadMessages();

  // realtime
  supabase
    .channel("bbs_messages_channel")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "bbs_messages" },
      payload => {
        const msg = payload.new;
        if (msg.username !== username) {
          write(`[${msg.username}] ${msg.text}`);
        }
      }
    )
    .subscribe();

  // heartbeat presence
  async function heartbeat() {
    await supabase.from("bbs_online").upsert({
      username,
      last_seen: new Date().toISOString()
    });
  }

  heartbeat();
  setInterval(heartbeat, 10000);

  // load online users
  async function loadOnline() {
    const { data } = await supabase
      .from("bbs_online_active")
      .select("*");

    const names = data?.map(u => u.username) || [];
    onlineList.textContent = names.length ? names.join(", ") : "none";
  }

  loadOnline();
  setInterval(loadOnline, 6000);

  // chat submit
  form.addEventListener("submit", async e => {
    e.preventDefault();

    const text = input.value.trim();
    input.value = "";
    if (!text) return;

    write(`[${username}] ${text}`);

    const { error } = await supabase.from("bbs_messages").insert({
      username,
      text
    });

    if (error) console.error("[BBS] insert error:", error);
  });

  console.log("[BBS] Ready!");
}
