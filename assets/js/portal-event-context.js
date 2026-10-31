// Event handoff from the CharlestonHacks swipe deck.
// The hub and Buildspace are different origins; accept only the known hub
// origin and keep event context local to this signed-in browser.
(() => {
  "use strict";
  const channel = "chs-portal-event-v1";
  const storageKey = "ie:portal-event-context:v1";
  const allowedHosts = new Set(["charlestonhacks.com", "www.charlestonhacks.com"]);
  let parentOrigin = "";
  try {
    const referrer = new URL(document.referrer);
    if (allowedHosts.has(referrer.hostname)) {
      parentOrigin = referrer.origin;
    }
  } catch (_) {}
  if (!parentOrigin || window.parent === window) return;

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch (_) { return ""; }
  }

  function readContext() {
    try { return JSON.parse(localStorage.getItem(storageKey) || "null"); }
    catch (_) { return null; }
  }

  function showContext(eventInfo) {
    const old = document.getElementById("portal-event-context");
    old?.remove();
    if (!eventInfo) return;

    const panel = document.createElement("aside");
    panel.id = "portal-event-context";
    panel.setAttribute("role", "status");
    panel.style.cssText = "position:fixed;z-index:100000;top:calc(env(safe-area-inset-top, 0px) + 12px);left:12px;right:12px;max-width:760px;margin:0 auto;padding:14px 16px;border:1px solid rgba(0,224,255,.7);border-radius:16px;background:rgba(4,15,28,.97);color:#f4e2b5;box-shadow:0 12px 36px rgba(0,0,0,.5);font:600 15px/1.4 system-ui,sans-serif;";
    const heading = document.createElement("strong");
    heading.textContent = "Continue from this event";
    heading.style.cssText = "display:block;font-size:16px;margin-bottom:4px;";
    const title = document.createElement("span");
    title.textContent = eventInfo.title;
    title.style.cssText = "display:block;color:#fff;margin-bottom:10px;";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:12px;";
    const people = document.createElement("button");
    people.type = "button";
    people.textContent = "See people you met";
    people.style.cssText = "border:0;border-radius:10px;padding:10px 14px;background:#00dff5;color:#07111d;font:700 14px system-ui,sans-serif;cursor:pointer;";
    people.addEventListener("click", () => {
      window.AppNav?.go?.("network");
      panel.remove();
    });
    actions.append(people);

    const eventLink = safeUrl(eventInfo.link);
    if (eventLink) {
      const link = document.createElement("a");
      link.href = eventLink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Event details";
      link.style.cssText = "color:#9bf4ff;font-weight:700;";
      actions.append(link);
    }

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Dismiss event context");
    dismiss.textContent = "×";
    dismiss.style.cssText = "margin-left:auto;border:0;background:transparent;color:#b8c4ce;font-size:24px;cursor:pointer;";
    dismiss.addEventListener("click", () => panel.remove());
    panel.append(heading, title, actions, dismiss);
    document.body.append(panel);
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== parentOrigin || event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.channel !== channel || message.type !== "EVENT_CONTEXT") return;
    const info = message.event;
    if (!info || typeof info.title !== "string" || !info.title.trim()) return;
    const context = {
      title: info.title.trim().slice(0, 200),
      startDate: String(info.startDate || "").slice(0, 40),
      link: safeUrl(info.link),
      source: String(info.source || "").slice(0, 80)
    };
    try { localStorage.setItem(storageKey, JSON.stringify(context)); } catch (_) {}
    showContext(context);
  });

  window.addEventListener("load", () => {
    window.parent.postMessage({ channel, type: "READY" }, parentOrigin);
    showContext(readContext());
  }, { once: true });
})();
