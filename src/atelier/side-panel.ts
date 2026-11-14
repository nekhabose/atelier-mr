/**
 * The flat page's one side panel: a sheet of pattern paper on the left with
 * the sections the start-page systems fill in (welcome, make the form you,
 * your real clothes, share and accessibility). Replaces the separate corner
 * cards so the studio itself has the room. Runtime only (DOM).
 *
 * Systems call sideSection() for their part; StartSystem shows the panel on
 * the flat page and hides it in the headset and during the tour.
 */

const CSS = `
#atelier-side {
  position: fixed; left: 16px; top: 16px; bottom: 16px; z-index: 10;
  width: 340px; max-width: calc(100vw - 32px); box-sizing: border-box;
  display: flex; flex-direction: column; gap: 0;
  padding: 22px 22px 18px; overflow-y: auto; overscroll-behavior: contain;
  background: #f4ede1; color: #2a231c; border: 1px solid #d8ccb6; border-radius: 18px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 12px 36px rgba(60,44,28,0.16);
  font: 15px/1.45 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  scrollbar-width: thin; scrollbar-color: #cbbda5 transparent;
}
body.atelier-showcase #atelier-side { display: none !important; }
#atelier-side > * { flex-shrink: 0; }
#atelier-side .as-title { font: 400 38px/1.05 Georgia, "Iowan Old Style", "Times New Roman", serif; letter-spacing: 0.5px; }
#atelier-side .as-lead { margin-top: 6px; color: #4a4036; }
#atelier-side .as-note { margin-top: 8px; font-size: 12.5px; color: #7a6d5e; }
#atelier-side .as-status { margin-top: 8px; font-size: 13px; color: #4a4036; }
#atelier-side .as-error { color: #a8442c; }
#atelier-side .as-label { font-size: 12.5px; color: #7a6d5e; margin-top: 12px; }
#atelier-side .as-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
#atelier-side .as-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-sizing: border-box;
  cursor: pointer; border: 1.5px solid #cbbda5; border-radius: 999px; padding: 9px 14px;
  background: #fbf7f0; color: #2a231c; font: 600 14.5px/1.2 inherit; font-family: inherit; text-decoration: none;
}
#atelier-side .as-btn:hover { border-color: #2a231c; background: #fffdf8; }
#atelier-side .as-btn:disabled { cursor: default; opacity: 0.55; }
#atelier-side .as-btn-main { background: #2a231c; border-color: #2a231c; color: #f7f1e6; }
#atelier-side .as-btn-main:hover { background: #43382d; border-color: #43382d; }
#atelier-side .as-wide { display: flex; width: 100%; margin-top: 10px; padding: 12px 14px; font-size: 15.5px; }
#atelier-side .as-link { cursor: pointer; background: none; border: none; padding: 4px 0; color: #4a4036; font: inherit; text-decoration: underline; text-underline-offset: 3px; }
#atelier-side .as-chip { cursor: pointer; border: 1.5px solid #cbbda5; border-radius: 999px; padding: 3px 10px; background: #fbf7f0; color: #2a231c; font: 13px inherit; font-family: inherit; }
#atelier-side .as-chip[aria-pressed="true"] { background: #2a231c; border-color: #2a231c; color: #f7f1e6; }
#atelier-side input[type=text], #atelier-side input[type=number] {
  box-sizing: border-box; border: 1.5px solid #cbbda5; border-radius: 10px; background: #fffdf8; color: #2a231c;
  padding: 8px 10px; font: 14px inherit; font-family: inherit;
}
#atelier-side input[type=checkbox] { width: 18px; height: 18px; accent-color: #2a231c; }
#atelier-side :focus-visible { outline: 2px solid #a8442c; outline-offset: 2px; }
#atelier-side details { border-top: 1px solid #e0d5c2; margin-top: 16px; padding-top: 14px; }
#atelier-side summary {
  cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: baseline;
  font: 400 20px/1.2 Georgia, "Iowan Old Style", "Times New Roman", serif; color: #2a231c;
}
#atelier-side summary::-webkit-details-marker { display: none; }
#atelier-side summary::after { content: "+"; font: 300 22px/1 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #8a7a66; }
#atelier-side details[open] > summary::after { content: "\\2013"; }
#atelier-side .as-sub { font-size: 13px; color: #7a6d5e; margin-top: 4px; }
@media (max-width: 720px) {
  #atelier-side { top: auto; left: 8px; right: 8px; bottom: 8px; width: auto; max-height: 46vh; padding: 16px 16px 12px; }
  #atelier-side .as-title { font-size: 30px; }
}
`;

let root: HTMLElement | null = null;

/** The side panel (created on first use). */
export function sidePanel(): HTMLElement {
  if (root) return root;
  const style = document.createElement('style');
  style.id = 'atelier-side-style';
  style.textContent = CSS;
  document.head.appendChild(style);
  root = document.createElement('aside');
  root.id = 'atelier-side';
  root.setAttribute('aria-label', 'Atelier');
  document.body.appendChild(root);
  return root;
}

/**
 * A section of the side panel, placed by `order`. With a title it folds
 * (open or closed to start); without one it is a plain block.
 */
export function sideSection(id: string, order: number, title?: string, open = true, sub?: string): HTMLElement {
  const panel = sidePanel();
  const el = document.createElement(title ? 'details' : 'section');
  el.id = id;
  el.style.order = String(order);
  if (title) {
    (el as HTMLDetailsElement).open = open;
    const summary = document.createElement('summary');
    summary.textContent = title;
    el.appendChild(summary);
    if (sub) {
      const s = document.createElement('div');
      s.className = 'as-sub';
      s.textContent = sub;
      el.appendChild(s);
    }
  }
  // In order in the document too, so screen readers read it as it looks.
  const next = [...panel.children].find((c) => Number((c as HTMLElement).style.order) > order);
  panel.insertBefore(el, next ?? null);
  return el;
}

/** Width the panel takes from the left of the view (0 when it is a bottom sheet). */
export function sidePanelInset(): number {
  if (!root || root.style.display === 'none' || window.innerWidth <= 720) return 0;
  return root.getBoundingClientRect().right + 8;
}
