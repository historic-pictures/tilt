/* install.js - "add it to your home screen" for phones and tablets (a CLASSIC script, loaded before the game).
 * The game needs the whole screen, landscape, no browser bars. On a real phone / tablet that is not running as an installed app,
 * this shows a blocking explainer instead of the game (and index.html then does not even load main.js).
 * The same explainer is offered, dismissible, from the pause menu: window.TiltInstall.show().
 *   Real phone/tablet = touch mode (coarse pointer, as in touch.js) AND a mobile/tablet user agent (or iPadOS posing as a Mac with touch).
 *   Installed = display-mode standalone / fullscreen / minimal-ui, or iOS navigator.standalone.
 *   Test hooks (not advertised): ?nogate=1 skips the gate for the session; ?ua=iphone|ipad|ioschrome|discord|android|samsung|firefox fakes the user agent. */
(function () {
  var Q = new URLSearchParams(location.search);
  var UAS = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    ioschrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1',
    discord: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Discord/1.0',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
    samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
    firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0'
  };
  var fakeUA = !!UAS[Q.get('ua')];
  var ua = fakeUA ? UAS[Q.get('ua')] : (navigator.userAgent || '');
  var iosDev = /iP(hone|ad|od)/.test(ua) || (!fakeUA && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var mobileUA = iosDev || /Android|Mobile|Silk|Tablet/i.test(ua);
  var touch = (function () {      // the same rule as touchMode in touch.js
    try { var q = Q.get('touch'); if (q === '1') return true; if (q === '0') return false; return !!(window.matchMedia && matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
  })();
  var inApp = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Discord|TikTok|musical_ly|BytedanceWebview|Snapchat|Messenger|\bLine\/|MicroMessenger|Twitter|LinkedInApp|Pinterest|; wv\)/i.test(ua);
  var kind = inApp ? 'inapp'
    : iosDev ? (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua) ? 'ios-other' : 'ios-safari')
    : /SamsungBrowser/.test(ua) ? 'samsung'
    : /Firefox/.test(ua) ? 'firefox'
    : /Android/.test(ua) ? 'android' : 'other';
  var installed = (function () {
    try { return !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)').matches)); } catch (e) { return false; }
  })();
  var skip = false;
  try { if (Q.get('nogate') === '1') sessionStorage.setItem('tilt.nogate', '1'); skip = sessionStorage.getItem('tilt.nogate') === '1'; } catch (e) { skip = Q.get('nogate') === '1'; }
  var realDevice = touch && mobileUA;
  var gated = realDevice && !installed && !skip;

  var deferred = null;      // Android's beforeinstallprompt
  var done = false;
  var el = null, soft = false;

  function icon(name) {
    var a = '<svg class="ig-ic" viewBox="0 0 48 48" aria-hidden="true">', z = '</svg>';
    if (name === 'share') return a + '<path d="M24 31V7M15 16l9-9 9 9M14 22h-3v20h26V22h-3" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>' + z;
    if (name === 'plus') return a + '<rect x="7" y="7" width="34" height="34" rx="7" fill="none" stroke="currentColor" stroke-width="3.2"/><path d="M24 15v18M15 24h18" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>' + z;
    if (name === 'dots') return a + '<circle cx="24" cy="10" r="3.6" fill="currentColor"/><circle cx="24" cy="24" r="3.6" fill="currentColor"/><circle cx="24" cy="38" r="3.6" fill="currentColor"/>' + z;
    if (name === 'bars') return a + '<path d="M9 14h30M9 24h30M9 34h30" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>' + z;
    if (name === 'home') return a + '<path d="M7 23L24 8l17 15M12 20v21h24V20" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>' + z;
    return '';
  }
  function step(n, ic, html) { return '<li><span class="ig-n">' + n + '</span>' + (ic ? icon(ic) : '') + '<span class="ig-t">' + html + '</span></li>'; }

  function body() {
    var home = step(3, 'home', 'Open <b>Joust Revival</b> from your home screen.');
    if (done) return '<p class="ig-lead">Installed. Close this page and open <b>Joust Revival</b> from your home screen.</p>';
    if (kind === 'inapp') return '<p class="ig-lead">This in-app browser cannot install the game.</p><ol>' +
      step(1, 'dots', 'Open this page in <b>' + (iosDev ? 'Safari' : 'Chrome') + '</b> first (use the menu in the corner of this window, or copy the link and paste it there).') +
      step(2, '', 'Then add it to your home screen from there.') + '</ol><button class="ig-btn" id="igCopy">Copy link</button>';
    if (kind === 'ios-safari') return '<ol>' +
      step(1, 'share', 'Tap the <b>Share</b> button (a square with an arrow) at the bottom of Safari.') +
      step(2, 'plus', 'Scroll down and tap <b>Add to Home Screen</b>.') + home + '</ol>';
    if (kind === 'ios-other') return '<ol>' +
      step(1, 'share', 'Tap the <b>Share</b> button (a square with an arrow) in the address bar, or open the <b>menu</b> (&middot;&middot;&middot;) and choose <b>Share</b>.') +
      step(2, 'plus', 'Scroll down and tap <b>Add to Home Screen</b>. (Needs iOS 16.4 or newer; if it is missing, open this page in Safari.)') + home + '</ol>';
    if (kind === 'samsung') return '<ol>' + step(1, 'bars', 'Tap the menu <b>&#9776;</b> at the bottom right.') + step(2, 'plus', 'Tap <b>Add page to</b>, then <b>Home screen</b>.') + home + '</ol>';
    if (kind === 'firefox') return '<ol>' + step(1, 'dots', 'Tap the menu <b>&#8942;</b>.') + step(2, 'plus', 'Tap <b>Install</b> (or <b>Add to Home screen</b>).') + home + '</ol>';
    var b = deferred ? '<button class="ig-btn" id="igInstall">Install</button><p class="ig-or">or by hand:</p>' : '';
    return b + '<ol>' + step(1, 'dots', 'Tap <b>&#8942;</b> (top right).') + step(2, 'plus', 'Tap <b>Install app</b> or <b>Add to Home screen</b>.') + home + '</ol>';
  }

  function render() {
    if (!el) return;
    el.innerHTML = '<div class="ig-panel"><img class="ig-logo" src="assets/ui/icons/emblem-128.webp" srcset="assets/ui/icons/emblem-128.webp 1x, assets/ui/icons/emblem-256.webp 2x" alt="" draggable="false">' +
      '<div class="ig-main"><h1>Install Joust Revival</h1>' + body() +
      '<p class="ig-why"><i>Why?</i> The game needs the whole screen, landscape, with no browser bars.</p>' +
      (soft ? '<button class="ig-btn ig-close" id="igClose">Close</button>' : '') + '</div></div>';
    var c = el.querySelector('#igCopy'); if (c) c.onclick = function () {
      var u = location.href.split('#')[0].replace(/([?&])(ua|nogate)=[^&]*&?/g, '$1').replace(/[?&]$/, '');
      try { navigator.clipboard.writeText(u).then(function () { c.textContent = 'Link copied'; }, function () { window.prompt('Copy this link', u); }); } catch (e) { window.prompt('Copy this link', u); }
    };
    var i = el.querySelector('#igInstall'); if (i) i.onclick = function () {
      var d = deferred; if (!d) return; deferred = null;
      try { d.prompt(); if (d.userChoice) d.userChoice.then(function (r) { if (r && r.outcome === 'accepted') done = true; render(); }); } catch (e) { render(); }
    };
    var x = el.querySelector('#igClose'); if (x) x.onclick = hide;
  }
  /** show({ blocking: true }) is the gate; show() is the dismissible panel (pause menu). */
  function show(opts) {
    if (el) hide();
    soft = !(opts && opts.blocking);
    el = document.createElement('div'); el.id = 'installGate'; el.className = soft ? 'ig-soft' : 'ig-hard';
    document.body.appendChild(el); render();
    document.body.classList.add('ig-open');
  }
  function hide() { if (el) el.remove(); el = null; document.body.classList.remove('ig-open'); }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; render(); });
  window.addEventListener('appinstalled', function () { done = true; deferred = null; render(); });

  // Installed on a phone: go full screen on the first tap and ask for landscape (each best-effort; iOS has neither API)
  function appMode() {
    if (!installed || !realDevice) return;
    var lock = function () { try { var r = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (r && r.catch) r.catch(function () {}); } catch (e) {} };
    var once = function () {
      document.removeEventListener('pointerup', once, true);
      try { var d = document.documentElement; var p = !document.fullscreenElement && d.requestFullscreen && d.requestFullscreen(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
      lock();
    };
    document.addEventListener('pointerup', once, true);
    lock();
  }

  // Chrome offers "Install" only to pages whose worker has a fetch handler; sw.js passes everything through and caches nothing
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {} });
  }

  window.__tiltGated = gated;
  window.TiltInstall = { gated: gated, kind: kind, installed: installed, realDevice: realDevice, mobileUA: mobileUA, show: show, hide: hide };
  function boot() {
    if (gated) { show({ blocking: true }); var l = document.getElementById('loading'); if (l) l.style.display = 'none'; }
    else appMode();
  }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
