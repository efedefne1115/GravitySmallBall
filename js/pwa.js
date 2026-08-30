/* ===========================================================================
 * pwa.js - install gate + landscape handling.
 *
 * Why the button works on GitHub Pages but not on a LAN http:// address:
 * Chrome only fires `beforeinstallprompt` (the event that lets a button open
 * the real "Install app" dialog) when the page is a SECURE CONTEXT, has a
 * manifest with 192+512 icons and a display mode, and is controlled by a
 * service worker with a fetch handler. Plain http://192.168.x.x is not a
 * secure context, so the service worker never registers and the event never
 * fires. https://<user>.github.io/... satisfies all of it.
 *
 * The button therefore:
 *   1. fires the real native install prompt when it is available,
 *   2. waits for it for a moment if the service worker is still warming up,
 *   3. only falls back to written steps on iOS, where Apple exposes no
 *      install API at all.
 * ======================================================================== */

const PWA = (function () {
  'use strict';

  let deferredPrompt = null;
  let promptWaiters = [];
  let started = false;

  // ---------------------------------------------------------------- detect
  function isAppMode() {
    try {
      const q = new URLSearchParams(location.search);
      if (q.get('app') === '1') return true;
    } catch (e) { /* ignore */ }
    if (window.navigator.standalone === true) return true;          // iOS
    const mm = window.matchMedia;
    if (mm) {
      if (mm('(display-mode: fullscreen)').matches) return true;
      if (mm('(display-mode: standalone)').matches) return true;
      if (mm('(display-mode: minimal-ui)').matches) return true;
      if (mm('(display-mode: window-controls-overlay)').matches) return true;
    }
    return false;
  }

  function platform() {
    const ua = navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (iOS) return /CriOS|FxiOS|EdgiOS/.test(ua) ? 'ios-other' : 'ios-safari';
    if (/Android/.test(ua)) return 'android';
    return 'desktop';
  }

  // `beforeinstallprompt` can arrive a second or two after load, once the
  // service worker takes control. Catch it as early as possible - before the
  // gate DOM even exists - so a fast tap is never missed.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const w = promptWaiters; promptWaiters = [];
    w.forEach((fn) => fn(e));
    const btn = document.getElementById('install-btn');
    const hint = document.getElementById('install-hint');
    if (btn) btn.classList.add('ready');
    if (hint) hint.textContent = 'Uygulamayi kurmak icin dokun.';
  });

  function waitForPrompt(ms) {
    if (deferredPrompt) return Promise.resolve(deferredPrompt);
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        promptWaiters = promptWaiters.filter((f) => f !== hit);
        resolve(null);
      }, ms);
      const hit = (e) => { clearTimeout(t); resolve(e); };
      promptWaiters.push(hit);
    });
  }

  // --------------------------------------------------------- service worker
  // Registering the worker is what unlocks the install prompt, so do it as
  // early as the browser allows instead of waiting for `load`.
  function registerSW() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    if (!window.isSecureContext) return Promise.resolve(null);
    return navigator.serviceWorker.register('./sw.js', { scope: './' })
      .catch(() => null);
  }

  // -------------------------------------------------------------- the gate
  function buildGate() {
    const gate = document.getElementById('app-gate');
    const btn = document.getElementById('install-btn');
    const hint = document.getElementById('install-hint');
    const steps = document.getElementById('install-steps');

    function showSteps(html) {
      steps.innerHTML = html;
      steps.classList.add('show');
    }

    function manualSteps() {
      switch (platform()) {
        case 'ios-safari':
          showSteps(
            '<b>iPhone / iPad</b>' +
            '<ol><li>Alt bardaki <b>Paylas</b> tusuna bas (yukari ok cikan kare).</li>' +
            '<li>Listeden <b>Ana Ekrana Ekle</b> secenegini sec.</li>' +
            '<li>Sag ustten <b>Ekle</b> de.</li>' +
            '<li>Ana ekrandaki <b>Game5</b> simgesinden ac.</li></ol>' +
            '<i>Apple, Safari&#39;de tek tusla kuruluma izin vermiyor; bu adimlar zorunlu.</i>');
          break;
        case 'ios-other':
          showSteps(
            '<b>iPhone / iPad</b>' +
            '<ol><li>Bu sayfayi <b>Safari</b> ile ac (Chrome iOS uygulama kuramaz).</li>' +
            '<li>Safari&#39;de <b>Paylas</b> &rarr; <b>Ana Ekrana Ekle</b>.</li></ol>');
          break;
        case 'android':
          showSteps(
            '<b>Android</b>' +
            '<ol><li>Sag ustteki <b>uc noktali</b> menuye bas.</li>' +
            '<li><b>Uygulamayi yukle</b> ya da <b>Ana ekrana ekle</b> sec.</li></ol>' +
            '<i>Sayfa ilk acilista biraz yuklendikten sonra tusa tekrar basarsan kurulum penceresi kendisi acilir.</i>');
          break;
        default:
          showSteps(
            '<b>Bilgisayar (Chrome / Edge)</b>' +
            '<ol><li>Adres cubugunun sagindaki <b>yukleme</b> simgesine bas,</li>' +
            '<li>ya da <b>uc noktali</b> menu &rarr; <b>Yukle / Install Game5</b>.</li></ol>');
      }
    }

    btn.addEventListener('click', async () => {
      if (btn.dataset.busy === '1') return;

      // 1) the real thing
      let p = deferredPrompt;

      // 2) still warming up? give the service worker a moment to take control
      if (!p && platform() !== 'ios-safari' && platform() !== 'ios-other') {
        btn.dataset.busy = '1';
        btn.classList.add('loading');
        const old = btn.textContent;
        btn.textContent = 'HAZIRLANIYOR...';
        p = await waitForPrompt(4000);
        btn.textContent = old;
        btn.classList.remove('loading');
        btn.dataset.busy = '0';
      }

      if (p) {
        deferredPrompt = null;
        try {
          p.prompt();
          const res = await p.userChoice;
          if (res && res.outcome === 'accepted') {
            markInstalled();
            return;
          }
          hint.textContent = 'Kurulum iptal edildi. Tekrar denemek icin dokun.';
          deferredPrompt = p;           // Chrome lets the same event be reused
          return;
        } catch (e) { /* fall through */ }
      }

      // 3) no API available (iOS, or the browser refuses)
      manualSteps();
    });

    window.addEventListener('appinstalled', markInstalled);

    function markInstalled() {
      deferredPrompt = null;
      btn.textContent = 'KURULDU';
      btn.classList.remove('ready');
      btn.classList.add('done');
      hint.textContent = 'Ana ekrandaki Game5 simgesinden ac.';
      steps.classList.remove('show');
    }

    if (deferredPrompt) {
      btn.classList.add('ready');
      hint.textContent = 'Uygulamayi kurmak icin dokun.';
    }

    gate.classList.remove('hidden');
  }

  // ------------------------------------------------------- landscape / full
  async function lockLandscape() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch (e) { /* iOS + most browsers outside fullscreen refuse: fine */ }
  }

  async function goFullscreen() {
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
      } else if (!document.webkitFullscreenElement && el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch (e) { /* ignore */ }
  }

  function isPortraitTouch() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return coarse && window.innerHeight > window.innerWidth;
  }

  function updateRotate() {
    const r = document.getElementById('rotate-gate');
    if (!r) return;
    const portrait = started && isPortraitTouch();
    r.classList.toggle('show', portrait);
    // While the "turn your phone" card is up the simulation is held, so the
    // player does not die behind the overlay.
    window.G5_BLOCKED = portrait;
  }

  // ------------------------------------------------------------------ boot
  function init() {
    registerSW();

    const gate = document.getElementById('app-gate');

    if (!isAppMode()) {
      buildGate();
      window.addEventListener('resize', updateRotate);
      return;                       // the game is NOT started in browser mode
    }

    gate.remove();
    started = true;
    document.body.classList.add('app-mode');

    // A user gesture is required for fullscreen + orientation lock; the very
    // first tap of the game doubles as that gesture.
    const arm = () => { goFullscreen().then(lockLandscape); };
    window.addEventListener('pointerdown', arm, { once: true });
    lockLandscape();

    window.addEventListener('resize', updateRotate);
    window.addEventListener('orientationchange', () => setTimeout(updateRotate, 150));
    if (screen.orientation) {
      screen.orientation.addEventListener('change', () => setTimeout(updateRotate, 150));
    }
    updateRotate();

    window.G5_START();
  }

  return { init, isAppMode, updateRotate };
})();
