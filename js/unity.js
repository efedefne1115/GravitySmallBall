/* ===========================================================================
 * unity.js - Unity runtime primitives reproduced for the browser.
 *
 * COORDINATE CONVERSION (Unity -> screen), documented once here:
 *
 *   The Unity camera is orthographic with `orthographic size` = 5, i.e. it
 *   shows 2*5 = 10 world units vertically, whatever the aspect ratio.
 *
 *     ppu   = canvasHeightPx / (2 * orthoSize)      // screen px per world unit
 *     sx    = (wx - camX) * ppu + canvasWidthPx / 2
 *     sy    = canvasHeightPx / 2 - (wy - camY) * ppu   // Unity +Y is up
 *
 *   A sprite's on-screen size comes from its texture rect and its import PPU:
 *     worldW = rect.width  / sprite.ppu * transform.lossyScale.x
 *     worldH = rect.height / sprite.ppu * transform.lossyScale.y
 *   and it is centred on the sprite pivot (all sprites in this project use
 *   alignment 0 = Center, except the built-in Triangle whose custom pivot is
 *   (0.5, 0.28866667)).
 * ======================================================================== */

const Unity = (function () {
  'use strict';

  // ---- Mathf ------------------------------------------------------------
  const Mathf = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    clamp01: (v) => (v < 0 ? 0 : v > 1 ? 1 : v),
    lerp: (a, b, t) => a + (b - a) * Mathf.clamp01(t),
    lerpUnclamped: (a, b, t) => a + (b - a) * t,
    moveTowards(cur, target, maxDelta) {
      const d = target - cur;
      if (Math.abs(d) <= maxDelta) return target;
      return cur + Math.sign(d) * maxDelta;
    },
  };

  // Vector3.MoveTowards (used by Bird.Update)
  function moveTowards2(cx, cy, tx, ty, maxDistanceDelta) {
    const dx = tx - cx, dy = ty - cy;
    const sq = dx * dx + dy * dy;
    if (sq === 0 || (maxDistanceDelta >= 0 && sq <= maxDistanceDelta * maxDistanceDelta)) {
      return [tx, ty];
    }
    const d = Math.sqrt(sq);
    return [cx + dx / d * maxDistanceDelta, cy + dy / d * maxDistanceDelta];
  }

  // ---- Color ------------------------------------------------------------
  function colorToCss(c) {
    // Unity stores linear-ish 0..1 floats; the project renders in Gamma space
    // (URP 2D default for this project => colors are used as-is on screen).
    const r = Math.round(Mathf.clamp01(c[0]) * 255);
    const g = Math.round(Mathf.clamp01(c[1]) * 255);
    const b = Math.round(Mathf.clamp01(c[2]) * 255);
    const a = c.length > 3 ? Mathf.clamp01(c[3]) : 1;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function mulColor(a, b) {
    return [a[0] * b[0], a[1] * b[1], a[2] * b[2], a[3] * b[3]];
  }

  // ---- Sprite table -----------------------------------------------------
  // window.G5_SPRITES : guid -> {file,w,h,ppu,px,py,name}
  const sprites = {};      // guid -> descriptor (+ .img once loaded)
  const spriteByName = {};

  function initSprites() {
    for (const guid in window.G5_SPRITES) {
      const s = Object.assign({}, window.G5_SPRITES[guid]);
      s.guid = guid;
      s.worldW = s.w / s.ppu;    // size in world units at scale 1
      s.worldH = s.h / s.ppu;
      s.img = null;
      sprites[guid] = s;
      spriteByName[s.name] = s;
    }
  }

  function loadSprites(basePath) {
    const jobs = [];
    for (const guid in sprites) {
      const s = sprites[guid];
      jobs.push(new Promise((res) => {
        const img = new Image();
        img.onload = () => { s.img = img; res(); };
        img.onerror = () => { console.warn('sprite missing: ' + s.file); res(); };
        img.src = basePath + s.file;
      }));
    }
    return Promise.all(jobs);
  }

  // ---- Time -------------------------------------------------------------
  const Time = {
    deltaTime: 0,
    fixedDeltaTime: 0.02,   // ProjectSettings/TimeManager: Fixed Timestep
    maximumDeltaTime: 1 / 3, // Maximum Allowed Timestep 0.33333334
    time: 0,
  };

  // ---- Coroutine helper -------------------------------------------------
  // Minimal re-implementation of the couple of Unity coroutine primitives the
  // project uses: `yield return new WaitForSeconds(t)` and `yield return null`.
  class WaitForSeconds { constructor(t) { this.t = t; } }

  class CoroutineRunner {
    constructor() { this.routines = []; }
    start(gen) {
      const co = { gen, wait: 0, done: false };
      this.routines.push(co);
      this.step(co, undefined);
      return co;
    }
    stopAll() {
      for (const c of this.routines) c.done = true;
      this.routines.length = 0;
    }
    step(co, sent) {
      if (co.done) return;
      let r;
      try { r = co.gen.next(sent); }
      catch (e) { console.error(e); co.done = true; return; }
      if (r.done) { co.done = true; return; }
      const y = r.value;
      if (y instanceof WaitForSeconds) co.wait = y.t;
      else co.wait = 0;              // `yield return null` -> next frame
    }
    update(dt) {
      for (let i = 0; i < this.routines.length; i++) {
        const co = this.routines[i];
        if (co.done) continue;
        if (co.wait > 0) {
          co.wait -= dt;
          if (co.wait > 0) continue;
        }
        this.step(co);
      }
      for (let i = this.routines.length - 1; i >= 0; i--) {
        if (this.routines[i].done) this.routines.splice(i, 1);
      }
    }
  }

  // ---- Viewport ---------------------------------------------------------
  // One single source of truth for "how big is the screen", used by both the
  // world canvas and the uGUI CanvasScaler. `clientWidth/Height` is the layout
  // viewport, which with `viewport-fit=cover` already spans the notch/cutout,
  // and unlike innerWidth it never includes a scrollbar - so the two layers can
  // never disagree by a pixel and leave a bright strip at an edge.
  function viewport() {
    const d = document.documentElement;
    const w = (d && d.clientWidth) || window.innerWidth || 1;
    const h = (d && d.clientHeight) || window.innerHeight || 1;
    return { w: w, h: h };
  }

  // ---- Camera -----------------------------------------------------------
  const Camera = {
    x: 0, y: 0,
    orthoSize: 5,
    // screen metrics, refreshed on resize
    w: 1, h: 1, ppu: 1,
    setViewport(w, h) {
      this.w = w; this.h = h;
      this.ppu = h / (2 * this.orthoSize);
    },
    worldToScreenX(wx) { return (wx - this.x) * this.ppu + this.w / 2; },
    worldToScreenY(wy) { return this.h / 2 - (wy - this.y) * this.ppu; },
    // visible world rect
    bounds() {
      const hh = this.orthoSize;
      const hw = hh * (this.w / this.h);
      return { xMin: this.x - hw, xMax: this.x + hw, yMin: this.y - hh, yMax: this.y + hh };
    },
  };

  return {
    Mathf, moveTowards2, colorToCss, mulColor,
    sprites, spriteByName, initSprites, loadSprites,
    Time, WaitForSeconds, CoroutineRunner, Camera, viewport,
  };
})();
