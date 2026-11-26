// Notification lettering ("Combo B"): the first A-Z letter of a callout is set as a red Lombardic initial (span.ci), the rest in Pirata One (see ui.css, "notifications").
// Lombardic has no digits or punctuation, so the initial is only a leading letter: after an optional "1. " number it still takes the letter; text that starts with
// anything else (a digit run, a quote, an arrow) is left alone and simply reads in Pirata One. watchInitial(el) keeps an element dressed whatever the game writes into it.
const LEAD = /^(\s*(?:\d+[.)]\s+)?)([A-Za-z])/;
function firstText(el, skip) {
  for (const n of el.childNodes) {
    if (n.nodeType === 3) { if (n.nodeValue.trim()) return n; }
    else if (n.nodeType === 1 && !(skip && n.matches(skip)) && !n.classList.contains('ci')) { const t = firstText(n, skip); if (t) return t; else continue; }
  }
  return null;
}
/** Wrap the leading letter of el's text in span.ci. skip: a selector of children to leave out (the ticker's speaker label). Returns true if wrapped. */
export function dressInitial(el, skip) {
  if (!el || el.querySelector(':scope > .ci, :scope > * > .ci')) return false;
  const t = firstText(el, skip); if (!t) return false;
  const m = LEAD.exec(t.nodeValue); if (!m) return false;
  const rest = t.splitText(m[0].length);            // t = lead + the letter; rest = the remainder
  const sp = document.createElement('span'); sp.className = 'ci'; sp.textContent = t.nodeValue.slice(m[1].length);
  t.nodeValue = m[1]; t.parentNode.insertBefore(sp, rest);
  return true;
}
/** Dress the element now and again whenever its content changes. */
export function watchInitial(el, skip) {
  if (!el || typeof MutationObserver === 'undefined') return;
  const go = () => { mo.disconnect(); try { dressInitial(el, skip); } finally { mo.observe(el, { childList: true, characterData: true, subtree: true }); } };
  const mo = new MutationObserver(go); go();
}
/** The same as markup, for strings built into templates: initialHtml('Celebrate') -> '<span class="ci">C</span>elebrate' (the text must be plain). */
export function initialHtml(s) { const m = LEAD.exec(s); return m ? `${m[1]}<span class="ci">${m[2]}</span>${s.slice(m[0].length)}` : s; }
