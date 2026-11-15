// A small parchment speech label above the head of whoever is speaking on the field: projected from the 3D scene every frame, follows him, fades with the line.
// The voice director shows one line at a time, so there is one label. The ticker at the bottom stays as it is; this is the same line, at the speaker.
// speaker: an Object3D (the label sits just above its world position), a THREE.Vector3 (the point itself), or a getter returning either (or null).
import * as THREE from 'three';

const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };

export function createSpeech(camera) {
  const el = document.createElement('div'); el.id = 'speech3d'; el.innerHTML = '<b></b><span></span>'; document.body.appendChild(el);
  const nm = el.firstChild, tx = el.lastChild, v = new THREE.Vector3();
  let sp = null;
  const L = {
    /** A line begins: who (the name, shown above the text), text, speaker (see top). No speaker: no label. */
    show(text, who, speaker) { sp = speaker || null; nm.textContent = String(who).replace(/<[^>]+>/g, ''); tx.textContent = strip(text); el.classList.toggle('on', !!sp); if (sp) L.update(); },
    hide() { sp = null; el.classList.remove('on'); },
    /** Call once per frame after the camera has moved. */
    update() {
      if (!sp) return;
      const o = typeof sp === 'function' ? sp() : sp;
      if (!o || (o.isObject3D && !shown(o))) { el.classList.add('off'); return; }
      if (o.isObject3D) { o.getWorldPosition(v); v.y += 0.5; } else v.copy(o);
      camera.updateMatrixWorld(); const d = v.distanceTo(camera.position); v.project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.04 || v.y > 1.1 || v.y < -1.04 || d > 70 || d < 0.6) { el.classList.add('off'); return; }
      el.classList.remove('off');
      el.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - v.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
    },
  };
  return L;
}
