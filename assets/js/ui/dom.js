// /assets/js/ui/dom.js
export const qs  = (sel, el=document) => el.querySelector(sel);
export const qsa = (sel, el=document) => [...el.querySelectorAll(sel)];
export const el  = (tag, attrs={}, ...children) => {
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) n.append(c?.nodeType ? c : document.createTextNode(String(c)));
  return n;
};
export function render(root, node) { root.replaceChildren(node); }
