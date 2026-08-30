/* ===========================================================================
 * script.js - bootstrap + the Unity player loop.
 *
 * Unity's per-frame order is reproduced literally:
 *     FixedUpdate x N  ->  (interpolate)  ->  Update  ->  LateUpdate  ->  render
 * with N driven by an accumulator against Time.fixedDeltaTime (0.02 s) and
 * clamped by Maximum Allowed Timestep (0.33333334 s).
 * ======================================================================== */

(function () {
  'use strict';

  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d', { alpha: false });

  let player = null;
  const birds = [];
  const extraSprites = [];
  let gm = null, menuManager = null, panelManager = null;
  let showColliders = false;

  // Camera m_ClearFlags 2 (Solid Color), m_BackGroundColor
  const BG = Unity.colorToCss([
    window.G5_CONFIG.camera.bg[0],
    window.G5_CONFIG.camera.bg[1],
    window.G5_CONFIG.camera.bg[2], 1]);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = Unity.viewport();
    const w = Math.max(1, Math.round(vp.w * dpr));
    const h = Math.max(1, Math.round(vp.h * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    // Pin the CSS box to the measured viewport too, so a fractional
    // devicePixelRatio can never leave a sliver of page background showing.
    canvas.style.width = vp.w + 'px';
    canvas.style.height = vp.h + 'px';
    Unity.Camera.setViewport(w, h);
    UI.resize();
  }

  function init() {
    Unity.initSprites();

    return Unity.loadSprites('assets/sprites/').then(() => {
      World.build();

      // ---- the player ("Twoxwoob" root) --------------------------------
      const pMap = World.maps.find((m) => m.name === 'Twoxwoob');
      const pSprite = pMap.sprites[0];
      pSprite.dynamic = true;
      extraSprites.push(pSprite);
      const pColRec = window.G5_WORLD.maps['Twoxwoob'].c[0];
      player = new PlayerController(pSprite, pColRec);

      // ---- the 14 Bird instances (Map1) --------------------------------
      for (const b of window.G5_CONFIG.birds) {
        const sp = World.spritesByGo.get(b.go);
        const col = World.collidersByGo.get(b.go);
        if (!sp) { console.warn('bird sprite missing', b.go); continue; }
        sp.dynamic = true;
        extraSprites.push(sp);
        birds.push(new Bird(b, sp, col));
      }

      // ---- UI ----------------------------------------------------------
      UI.build();

      gm = new GameManager();
      gm.bindUI();
      menuManager = new MenuManager();
      panelManager = new PanelManager();

      // Unity Start() order follows the scene; the three managers are
      // independent so any order works.
      panelManager.start();
      menuManager.start();
      gm.start();

      Input.init(document.getElementById('game-root'));
      window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', resize);
      window.addEventListener('keydown', (e) => {
        if (e.key === 'c' || e.key === 'C') showColliders = !showColliders;
      });
      resize();

      document.getElementById('boot').classList.add('done');
      if (window.PWA && PWA.updateRotate) PWA.updateRotate();
      requestAnimationFrame(loop);
    });
  }

  // ------------------------------------------------------------------ loop
  let last = 0;
  let accumulator = 0;

  function loop(now) {
    requestAnimationFrame(loop);

    if (!last) last = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > Unity.Time.maximumDeltaTime) dt = Unity.Time.maximumDeltaTime;

    // "Turn your phone" card is up -> hold the simulation (like Time.timeScale = 0)
    // but keep painting, so the player does not run into a spike behind it.
    if (window.G5_BLOCKED) {
      Unity.Time.deltaTime = 0;
      accumulator = 0;
      player.syncRender(0);
      gm.lateUpdate();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      World.draw(ctx, Unity.Camera, extraSprites);
      Input.endFrame();
      return;
    }

    Unity.Time.deltaTime = dt;
    Unity.Time.time += dt;

    // ---- FixedUpdate --------------------------------------------------
    const fdt = Unity.Time.fixedDeltaTime;
    accumulator += dt;
    let guard = 0;
    while (accumulator >= fdt && guard++ < 16) {
      player.fixedUpdate(fdt);
      accumulator -= fdt;
    }

    // ---- Rigidbody2D interpolation ------------------------------------
    player.syncRender(accumulator / fdt);

    // ---- Update -------------------------------------------------------
    player.update(dt);
    for (const b of birds) b.update(dt);
    gm.update(dt);
    UI.update(dt);
    Input.endFrame();

    // ---- LateUpdate ---------------------------------------------------
    gm.lateUpdate();

    // ---- render -------------------------------------------------------
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    World.draw(ctx, Unity.Camera, extraSprites);
    if (showColliders) World.drawColliders(ctx, Unity.Camera);
  }

  /* FrameRateLimiter.cs sets Application.targetFrameRate = 300 with vSync off.
     The browser caps us at the display refresh through requestAnimationFrame;
     because every system here is delta-time driven this only affects the
     sampling rate, not the simulation. */

  /* The game is booted by js/pwa.js: in a normal browser tab the install gate
     is shown instead, and only the installed / home-screen launch calls this. */
  let booted = false;
  window.G5_START = function () {
    if (booted) return;
    booted = true;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  };
})();
