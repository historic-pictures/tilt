// attract_pref.js - the player's choice for the menu joust (Settings > Graphics > "Menu joust") and the cap the frame-time check leaves when a device cannot keep it up.
// A tiny module with no imports: Settings and the game both read it without pulling in the riders.
const K = { pref: 'tilt.attract', cap: 'tilt.attractcap2' };      // (cap2, 28 Nov: the caps set while the game ran slowly before the performance fixes are forgotten; the joust is back for everyone)
const CAP_DAYS = 3;
const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
const listeners = [];
const q = (() => { try { return new URLSearchParams(location.search).get('attract'); } catch (e) { return null; } })();

/** ?attract=off keeps the menu static, ?attract=force ignores the device tier and the frame-time check (tests); otherwise null. */
export const attractParam = () => (q === 'off' || q === 'force' ? q : null);
/** Menu joust: the player's switch (on unless he turned it off). */
export const menuJoustOn = () => get(K.pref) !== 'off';
export function setMenuJoust(on) { set(K.pref, on ? null : 'off'); if (on) set(K.cap, null); for (const f of listeners) f(on); }
/** The frame-time check switched it off on this device: { why, at } or null (it lapses after a month, and "Detect again" or turning the switch on clears it). */
export function joustCap() {
  try { const c = JSON.parse(get(K.cap)); if (c && c.at && Date.now() - c.at < CAP_DAYS * 86400e3) return c; } catch (e) { /* ignore */ }
  return null;
}
export const capMenuJoust = (why) => set(K.cap, JSON.stringify({ why, at: Date.now() }));
export const clearJoustCap = () => set(K.cap, null);
export const onJoustChange = (f) => { listeners.push(f); };
