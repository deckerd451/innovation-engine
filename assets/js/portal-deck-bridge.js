// Lets the CharlestonHacks card deck receive horizontal swipes that begin
// inside this cross-origin iframe. The parent cannot inspect this document;
// this page sends only a direction, and only to the verified hub origin.
(() => {
  "use strict";
  const channel = "chs-portal-deck-v1";
  const allowedHosts = new Set(["charlestonhacks.com", "www.charlestonhacks.com"]);
  let parentOrigin = "";
  try {
    const referrer = new URL(document.referrer);
    if (allowedHosts.has(referrer.hostname)) {
      parentOrigin = referrer.origin;
    }
  } catch (_) {}
  if (!parentOrigin || window.parent === window) return;

  let start = null;
  let suppressClickUntil = 0;
  const ignored = (target) => !!target?.closest?.(
    "input, textarea, select, button, a, [contenteditable='true'], [data-no-deck-swipe]"
  );

  function begin(x, y, target, pointerType) {
    if (ignored(target)) {
      start = null;
      return;
    }
    start = { x, y, target, pointerType, horizontal: false };
  }

  function move(x, y, event) {
    if (!start) return;
    const dx = x - start.x;
    const dy = y - start.y;
    if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    start.horizontal = true;
    if (start.pointerType === "touch" && event.cancelable) event.preventDefault();
  }

  function end(x, y, event) {
    if (!start) return;
    const dx = x - start.x;
    const dy = y - start.y;
    const horizontal = Math.abs(dx) >= 42 && Math.abs(dx) >= Math.abs(dy) * 1.2;
    const accepted = start.horizontal && horizontal;
    start = null;
    if (!accepted) return;
    suppressClickUntil = Date.now() + 450;
    if (event.cancelable) event.preventDefault();
    window.parent.postMessage({
      channel,
      type: "SWIPE",
      direction: dx < 0 ? "next" : "previous"
    }, parentOrigin);
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" || !event.isPrimary || event.button > 0) return;
    begin(event.clientX, event.clientY, event.target, event.pointerType);
  }, true);
  document.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    move(event.clientX, event.clientY, event);
  }, { capture: true, passive: false });
  document.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") return;
    end(event.clientX, event.clientY, event);
  }, true);
  document.addEventListener("pointercancel", () => { start = null; }, true);

  document.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) {
      start = null;
      return;
    }
    const touch = event.touches[0];
    begin(touch.clientX, touch.clientY, event.target, "touch");
  }, { capture: true, passive: true });
  document.addEventListener("touchmove", (event) => {
    if (!start || event.touches.length !== 1) return;
    const touch = event.touches[0];
    move(touch.clientX, touch.clientY, event);
  }, { capture: true, passive: false });
  document.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    if (touch) end(touch.clientX, touch.clientY, event);
    else start = null;
  }, { capture: true, passive: false });
  document.addEventListener("touchcancel", () => { start = null; }, true);
  document.addEventListener("click", (event) => {
    if (Date.now() > suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
})();
