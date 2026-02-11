// /assets/js/uiHelpers.js
export const toggle   = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };
export const clear    = (el)     => { if (el) el.innerHTML = ''; };
export const text     = (el, s)  => { if (el) el.textContent = s ?? ''; };
export const createEl = (tag, attrs = {}, html = '') => {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (html) el.innerHTML = html;
  return el;
};

export default { toggle, clear, text, createEl };
