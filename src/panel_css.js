// panel_css.js - the little bit of layout the Settings > Graphics and Account panels need (flat rows inside the menu page). The UI skin owns the look: this only undoes the HUD
// `.panel { position: absolute }` and lays rows out. Everything is under `.pf` so nothing else changes.
let done = false;
export function ensurePanelCss() {
  if (done || typeof document === 'undefined') return; done = true;
  const s = document.createElement('style'); s.id = 'panelCss';
  s.textContent = `
.panel.pf { position: static; padding: 0; margin: 12px 0 0; }
.panel.pf::before { display: none; }
.pf [hidden] { display: none !important; }
.pf .row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding: 6px 0; border-bottom: 1px dotted var(--rule); }
.pf .row > label, .pf .row > .slabel { display: block; margin: 0; min-width: 118px; font-family: var(--caps); font-size: 15px; letter-spacing: .06em; color: var(--ink); }
.pf .sctl { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.pf .val { font-size: 17px; }
.pf .note, .pf .why { font-size: 15px; font-style: italic; color: var(--ink2); margin: 5px 0; }
.pf .when, .pf small { font-size: 13px; font-style: italic; color: var(--ink2); }
.pf .select, .pf input.name { font: inherit; font-size: 16px; color: var(--ink); background: rgba(255, 250, 228, .45); border: 1px solid var(--ink-soft); border-radius: 2px; padding: 3px 8px; max-width: 100%; }
.menu .pf button.toggle { display: inline-block; width: auto; text-align: center; font: inherit; font-size: 16px; color: var(--ink); background: rgba(255, 250, 228, .35); border: 1px solid var(--ink-soft); border-radius: 2px; padding: 3px 14px; cursor: pointer; }
.menu .pf button.toggle::before { display: none; }
.menu .pf button.toggle:hover { padding-left: 14px; border-color: var(--red); }
.menu .pf button.toggle[aria-checked="true"] { color: var(--vellum3, #fff6e0); background: var(--red); border-color: var(--red); }
.menu .pf button.toggle:disabled { opacity: .5; cursor: default; }
.pf .btn { cursor: pointer; } .pf .btn:disabled { opacity: .5; cursor: default; }
.pf .row.danger .btn { color: var(--red); }
.pf details > summary { cursor: pointer; font-size: 15px; color: var(--ink2); padding: 4px 0; }
.pf .err { color: var(--red); } .pf .wait { font-style: italic; color: var(--ink2); }
body.touch .pf .select, body.touch .pf input.name, body.touch .pf .toggle { min-height: 40px; }
`;
  document.head.appendChild(s);
}
