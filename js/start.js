/* ===========================================================================
 * start.js - Acilis ekrani.
 *
 * Kurulum yok, indirme yok: tek bir "OYUNU BASLAT" tusu.
 * Tusa basildiginda:
 *   1) tarayiciyi TAM EKRANA alir (adres cubugu, sekmeler, sistem cubuklari gider)
 *   2) mumkunse ekrani yatay moda kilitler
 *   3) oyunu baslatir
 *
 * Tam ekran ve yon kilidi tarayici tarafindan SADECE bir kullanici hareketi
 * icinde izin verilir - o yuzden ikisi de tusun click isleyicisinde cagriliyor.
 * ======================================================================== */

const Boot = (function () {
  'use strict';

  let started = false;

  // ------------------------------------------------------------- tam ekran
  async function goFullscreen() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
      } else if (el.webkitRequestFullscreen) {          // iOS Safari / eski WebKit
        el.webkitRequestFullscreen();
      } else if (el.mozRequestFullScreen) {
        el.mozRequestFullScreen();
      } else if (el.msRequestFullscreen) {
        el.msRequestFullscreen();
      }
    } catch (e) { /* reddedilirse oyun yine calisir */ }
  }

  async function lockLandscape() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch (e) { /* iPhone yon kilidine izin vermiyor - donme karti devreye girer */ }
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement ||
              document.mozFullScreenElement || document.msFullscreenElement);
  }

  // --------------------------------------------------------- yatay uyarisi
  function isPortraitTouch() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return coarse && window.innerHeight > window.innerWidth;
  }

  function updateRotate() {
    const r = document.getElementById('rotate-gate');
    if (!r) return;
    const portrait = started && isPortraitTouch();
    r.classList.toggle('show', portrait);
    window.G5_BLOCKED = portrait;
  }

  // --------------------------------------------------------- tam ekran tusu
  // Tam ekrandan cikilirsa (ESC / sistem hareketi) kose tusu geri gelir.
  function updateFsButton() {
    const b = document.getElementById('fs-btn');
    if (!b) return;
    b.classList.toggle('show', started && !isFullscreen() && document.fullscreenEnabled !== false);
  }

  // ------------------------------------------------------------------ baslat
  async function start() {
    if (started) return;
    started = true;

    await goFullscreen();
    await lockLandscape();

    const s = document.getElementById('start-gate');
    if (s) s.remove();
    document.body.classList.add('playing');

    updateRotate();
    updateFsButton();
    window.G5_START();
  }

  // Cevrimdisi onbellek. Sadece guvenli baglamda (https:// veya localhost)
  // vardir; GitHub Pages'te devreye girer, duz http:// LAN'da sessizce atlanir.
  function registerSW() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    const go = () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    if (document.readyState === 'complete') setTimeout(go, 0);
    else window.addEventListener('load', () => setTimeout(go, 0), { once: true });
  }

  function init() {
    registerSW();
    const btn = document.getElementById('start-btn');
    if (btn) btn.addEventListener('click', start);

    const fs = document.getElementById('fs-btn');
    if (fs) fs.addEventListener('click', () => { goFullscreen().then(lockLandscape); });

    window.addEventListener('resize', () => { updateRotate(); updateFsButton(); });
    window.addEventListener('orientationchange', () => setTimeout(updateRotate, 150));
    document.addEventListener('fullscreenchange', updateFsButton);
    document.addEventListener('webkitfullscreenchange', updateFsButton);
    if (screen.orientation) {
      screen.orientation.addEventListener('change', () => setTimeout(updateRotate, 150));
    }
  }

  return { init, start, updateRotate, goFullscreen };
})();
