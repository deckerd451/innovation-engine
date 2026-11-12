// Shared modal focus lifecycle. Existing remove() close paths are supported.
(function () {
  'use strict';
  if (window.A11yDialog) return;
  const frames = [];
  const originals = new Map();
  let active = null;
  let sequence = 0;
  const context = () => document.body.dataset.destination || '';
  const visible = el => {
    if (!el.isConnected || el.closest('[hidden]') || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return false;
    for (let details = el.closest('details'); details; details = details.parentElement?.closest('details')) {
      if (!details.open && !details.querySelector(':scope > summary')?.contains(el)) return false;
    }
    return true;
  };
  const focusables = root => [...root.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex]')]
    .filter(el => !el.matches(':disabled') && el.tabIndex >= 0 && visible(el) && !el.closest('[inert]'));
  function restore() {
    for (const [el, value] of originals) if (el.isConnected) el.inert = value;
    originals.clear();
  }
  function focusFrame(frame) {
    const requested = frame.lastFocus?.isConnected && visible(frame.lastFocus) ? frame.lastFocus : frame.initialFocus && frame.root.querySelector(frame.initialFocus);
    const target = requested && visible(requested) ? requested : focusables(frame.root)[0] || frame.root;
    target.focus({ preventScroll: true });
  }
  function sync() {
    const removed = frames.filter(frame => !frame.root.isConnected);
    for (const frame of removed) {
      frame.root.removeEventListener('keydown', frame.keydown);
      frames.splice(frames.indexOf(frame), 1);
    }
    if (removed.length) watch();
    const previous = active;
    active = [...frames].reverse().find(frame => frame.context === context() && visible(frame.root)) || null;
    if (active !== previous || removed.length) restore();
    for (const frame of frames) {
      const modal = String(frame === active);
      if (frame.root.getAttribute('aria-modal') !== modal) frame.root.setAttribute('aria-modal', modal);
    }
    if (active) {
      // Inert siblings along the ancestor path, including nested dialogs.
      let current = active.root;
      while (current !== document.body && current.parentElement) {
        for (const sibling of current.parentElement.children) {
          if (sibling === current || ['SCRIPT','STYLE','LINK'].includes(sibling.tagName)) continue;
          if (!originals.has(sibling)) originals.set(sibling, sibling.inert);
          if (!sibling.inert) sibling.inert = true;
        }
        current = current.parentElement;
      }
    }
    const retiring = removed.at(-1) || (previous && !visible(previous.root) ? previous : null);
    if (retiring) {
      const opener = retiring.opener;
      if (opener?.isConnected && visible(opener) && !opener.closest('[inert]') && (!active || active.root.contains(opener))) opener.focus({ preventScroll: true });
      else if (active) focusFrame(active);
      else {
        const target = document.querySelector(`#app-nav [data-destination="${CSS.escape(context())}"]`) || document.getElementById('main-content');
        if (target && visible(target) && !target.closest('[inert]')) target.focus({preventScroll:true});
      }
    } else if (active && active !== previous) focusFrame(active);
  }
  const observer = new MutationObserver(sync);
  function watch() {
    observer.disconnect();
    if (!frames.length) return;
    const targets = new Map([[document.body, {childList:true}]]);
    for (const frame of frames) {
      targets.set(frame.root, {...targets.get(frame.root),attributes:true,attributeFilter:['style','hidden','class']});
      if (frame.root.parentElement) targets.set(frame.root.parentElement, {...targets.get(frame.root.parentElement),childList:true});
    }
    for (const [target, options] of targets) observer.observe(target, options);
  }
  window.addEventListener('app-destination-changed', () => {
    // AppNav applies its own inert state synchronously after this event.
    restore(); active = null;
    for (const frame of frames) {
      if (frame.context !== context()) {
        if (frame.suspendedDisplay === undefined) frame.suspendedDisplay = frame.root.style.display;
        frame.root.style.display = 'none';
      } else if (frame.suspendedDisplay !== undefined) {
        frame.root.style.display = frame.suspendedDisplay;
        delete frame.suspendedDisplay;
      }
    }
    queueMicrotask(sync);
  });
  document.addEventListener('focusin', event => {
    if (!active?.root.isConnected) return;
    if (!active.root.contains(event.target)) focusFrame(active);
    else active.lastFocus = event.target;
  });
  function open(root, options = {}) {
    if (!root) return;
    const existing = frames.find(frame => frame.root === root);
    if (existing) {
      existing.context = context();
      if (!root.contains(document.activeElement)) existing.opener = document.activeElement;
      frames.splice(frames.indexOf(existing), 1); frames.push(existing); watch(); sync(); focusFrame(existing); return;
    }
    const heading = root.querySelector('h1,h2,h3');
    root.setAttribute('role', 'dialog'); root.tabIndex = -1;
    if (options.label) root.setAttribute('aria-label', options.label);
    else if (heading) {
      if (!heading.id) heading.id = `a11y-dialog-title-${++sequence}`;
      root.setAttribute('aria-labelledby', heading.id);
    } else root.setAttribute('aria-label', 'Dialog');
    const frame = {root,context:context(),opener:options.opener || document.activeElement,initialFocus:options.initialFocus};
    frame.keydown = event => {
      if (frame !== active || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (options.onClose) options.onClose(); else root.remove();
        sync();
      } else if (event.key === 'Tab') {
        const list = focusables(root), first = list[0], last = list.at(-1);
        if (!first) { event.preventDefault(); root.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) { event.preventDefault(); first.focus(); }
      }
    };
    root.addEventListener('keydown', frame.keydown);
    frames.push(frame); watch(); sync();
  }
  window.A11yDialog = {open};
})();
