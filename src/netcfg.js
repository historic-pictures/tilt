// netcfg.js - the connection settings for "Joust a friend" (PeerJS / WebRTC).
//
// PeerJS 1.5.4's own default TURN relays (turn:eu-0 / us-0.turn.peerjs.com) no longer hand out relay candidates, so they are not used.
// STUN alone connects most home networks; a pair of networks that block direct connections needs a TURN relay. When TURN_CREDENTIALS_URL
// is set (a Metered-style endpoint that returns a JSON array of iceServers), it is fetched before each Peer is made and appended.
export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
export const TURN_CREDENTIALS_URL = '';

export async function iceServers() {
  const list = ICE_SERVERS.slice();
  if (!TURN_CREDENTIALS_URL) return list;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(TURN_CREDENTIALS_URL, { signal: ctl.signal }); clearTimeout(t);
    const arr = await r.json();
    if (Array.isArray(arr)) for (const s of arr) if (s && (typeof s.urls === 'string' || Array.isArray(s.urls))) list.push(s);
  } catch (e) { console.warn('[net] TURN credentials not available, carrying on without a relay:', e && e.message); }
  return list;
}
