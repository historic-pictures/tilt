// Recorded voice clips (ElevenLabs v4, made by tools/voice/gen_voices.py; files in assets/audio/voice/<group>/<id>.mp3, listed in assets/audio/voice/manifest.json):
//   pell    the commentator's lines (src/booth.js)            squire  the squire's rare encouragement (src/main.js squireCheer)
//   crowd   the stands' shouts and war cries (src/crowd_voices.js)
// Everything is optional: no manifest, no file, not yet fetched, or the audio context not up -> has() is false and the caller uses the browser's speech (booth, squire) or stays silent (crowd).
// The files are fetched in the background AFTER the menu is up (the game calls clips.start() once the audio module is in), Pell's first, in small batches; a clip is decoded when it is
// first played (and the last few kept), so the memory stays small. The manifest maps id -> { f: file, d: seconds, t: the exact words (the subtitle shows these) }.
const BASE = 'assets/audio/voice/';
const KEEP = 40;      // decoded clips kept

export function createClips(getAudio) {
  const C = { man: null, bytes: new Map(), bufs: new Map(), started: false, byText: new Map(), log: [] };

  const key = (g, id) => g + '/' + id;
  const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim();

  async function load() {
    try {
      const r = await fetch(BASE + 'manifest.json'); if (!r.ok) return;
      C.man = await r.json();
      for (const [id, e] of Object.entries(C.man.crowd || {})) { const k = norm(e.t); if (!C.byText.has(k)) C.byText.set(k, []); C.byText.get(k).push(id); }
    } catch (e) { return; }
    const order = [];
    for (const g of ['squire', 'pell', 'crowd']) {
      const ids = Object.keys((C.man || {})[g] || {});
      if (g === 'pell') ids.sort((a, b) => rank(a) - rank(b));      // the quick calls first: they are the ones that cannot wait
      for (const id of ids) order.push([g, id]);
    }
    let next = 0;
    const worker = async () => {
      while (next < order.length) {
        const [g, id] = order[next++], e = C.man[g][id];
        try { const r = await fetch(BASE + e.f); if (r.ok) C.bytes.set(key(g, id), await r.arrayBuffer()); } catch (err) { /* stays a fallback */ }
        await new Promise(res => setTimeout(res, 15));      // never hog the connection while the match loads
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }
  const rank = (id) => (/\.(exclaim|away|charge)\./.test(id) ? 0 : /\.(after|momentum|result)\./.test(id) ? 1 : /\.(ready|celebrate|aftermath)\./.test(id) ? 2 : 3);

  /** Start the background fetch (once; the game calls it when the menu is up and the audio module is loaded). */
  C.start = function start() { if (C.started) return; C.started = true; load(); };

  /** The clip's entry { f, d, t } when it can be played now (fetched or decoded, and the audio context is up), else null. */
  C.get = function get(group, id) {
    const a = getAudio(); if (!C.man || !a || !a.ctx || !id) return null;
    const e = (C.man[group] || {})[id]; if (!e) return null;
    const k = key(group, id);
    return C.bufs.has(k) || C.bytes.has(k) ? e : null;
  };
  /** Clip ids (crowd) whose words are `text` (a shout from src/crowd_lines.js). */
  C.crowdIds = (text) => C.byText.get(norm(text)) || null;
  C.pick = function pick(group, text, alt) {
    for (const t of [text, alt]) { if (!t) continue; const ids = C.crowdIds(t); if (ids) { const id = ids[(Math.random() * ids.length) | 0]; if (C.get(group, id)) return id; } }
    return null;
  };

  async function decode(group, id) {
    const k = key(group, id), a = getAudio();
    if (C.bufs.has(k)) { const b = C.bufs.get(k); C.bufs.delete(k); C.bufs.set(k, b); return b; }      // (most recently used goes last)
    const ab = C.bytes.get(k); if (!ab || !a || !a.ctx) return null;
    const buf = await a.ctx.decodeAudioData(ab.slice(0));
    C.bufs.set(k, buf);
    while (C.bufs.size > KEEP) C.bufs.delete(C.bufs.keys().next().value);
    return buf;
  }

  /** Play a clip through the game's audio (the voice stem). o: { db, pan, dist, onend }. Returns { stop(), dur } at once (the sound starts after the short decode), or null. */
  C.play = function play(group, id, o = {}) {
    const e = C.get(group, id), a = getAudio(); if (!e || !a) return null;
    let h = null, dead = false;
    const handle = { dur: e.d, stop: () => { dead = true; if (h) h.stop(); } };
    decode(group, id).then((buf) => {
      if (dead || !buf) { if (!buf && o.onend) o.onend(); return; }
      h = a.playVoice(buf, o); if (!h && o.onend) o.onend();
    }).catch(() => { if (o.onend) o.onend(); });
    if (C.log.length < 3000) C.log.push({ group, id });
    return handle;
  };
  /** Decode a few clips ahead so a quick call starts without the decode delay. */
  C.warm = function warm(group, ids) { for (const id of ids) if (C.get(group, id)) decode(group, id).catch(() => {}); };
  return C;
}
