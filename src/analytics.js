// analytics.js - one function for product events, so an analytics service can be plugged in later. No third-party script is loaded, nothing leaves the browser.
// Events so far: popup_shown, popup_cta, popup_dismiss (src/upsell.js), checkout_started, purchase_ok (src/store.js, src/donate.js).
// To plug something in later, either edit SINK below or listen:  window.addEventListener('tilt:analytics', (e) => send(e.detail))
// e.detail = { event, at (ms), ...props }. Props are small and never personal (no names, no ids): a reason, an item id, an amount.
// The last 50 events stay in window.__tiltEvents for testing; add ?debug=analytics to the address to see them in the console.
const SINK = null;      // (detail) => void: the one place to forward events, when there is somewhere to send them
const LOG = (() => { try { return new URLSearchParams(location.search).get('debug') === 'analytics'; } catch (e) { return false; } })();

export function track(event, props = {}) {
  const detail = { event: String(event), at: Date.now(), ...props };
  try {
    const buf = (window.__tiltEvents = window.__tiltEvents || []); buf.push(detail); if (buf.length > 50) buf.shift();
    window.dispatchEvent(new CustomEvent('tilt:analytics', { detail }));
    if (SINK) SINK(detail);
    if (LOG) console.info('[analytics]', detail);
  } catch (e) { /* analytics never breaks the game */ }
}
