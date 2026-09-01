/* ===========================================================================
 * ui.js - Unity uGUI (Canvas / RectTransform / Image / TMP_Text / Button /
 *         ScrollRect / Mask) reproduced with DOM + CSS.
 *
 * CanvasScaler on both canvases:
 *     m_UiScaleMode        1  -> ScaleWithScreenSize
 *     m_ReferenceResolution   (1920, 1080)
 *     m_ScreenMatchMode    0  -> MatchWidthOrHeight
 *     m_MatchWidthOrHeight 0  -> match WIDTH
 *   => scaleFactor  = screenWidth / 1920
 *      canvasRect   = (1920, screenHeight / scaleFactor)
 *   The whole tree is laid out in those reference units and then CSS-scaled
 *   once by scaleFactor, which is exactly what Unity does.
 *
 * RectTransform -> box:
 *     w        = (aMax.x - aMin.x) * parentW + sizeDelta.x
 *     h        = (aMax.y - aMin.y) * parentH + sizeDelta.y
 *     pivotX   = aMin.x*parentW + (aMax.x-aMin.x)*parentW*pivot.x + anchoredPos.x
 *     left     = pivotX - pivot.x*w
 *     (same for Y, then flipped because CSS measures from the top)
 * ======================================================================== */

const UI = (function () {
  'use strict';

  const REF_W = 1920, REF_H = 1080;

  // Unity built-in UI sprites live in `unity_builtin_extra`, a binary asset that
  // is not part of the project folder, so their pixels cannot be extracted.
  // They are all plain white (rounded) rectangles that get sliced; we rebuild
  // them as CSS rounded rectangles with the corresponding corner radius.
  const BUILTIN = {
    10905: { radius: 6, draw: true },   // "UISprite"   (buttons)
    10907: { radius: 0, draw: true },   // "Background" (panels)
    10917: { radius: 0, draw: false },  // "UIMask"
  };

  // Image.color multiplies the sprite, exactly like SpriteRenderer.color.
  // The tint is painted into a per-element <canvas> rather than a data: URL,
  // because a canvas that has drawn a file:// image is tainted and toDataURL()
  // would throw - this way the page also works when opened straight off disk.
  // UI sprites are drawn at a few hundred CSS px at most, so the working
  // surface is capped at 512 px on its longest side.
  const MAX_UI_TEX = 512;

  function paintTint(cv, desc, color) {
    const img = desc.img;
    if (!img) return;
    const k = Math.min(1, MAX_UI_TEX / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * k));
    const h = Math.max(1, Math.round(img.height * k));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const g = cv.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(img, 0, 0, w, h);
    if (!(color[0] === 1 && color[1] === 1 && color[2] === 1)) {
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = 'rgb(' + Math.round(color[0] * 255) + ',' + Math.round(color[1] * 255) + ',' + Math.round(color[2] * 255) + ')';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(img, 0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    }
  }

  class Node {
    constructor(data, parent, canvas) {
      this.data = data;
      this.parent = parent;
      this.canvas = canvas;
      this.children = [];
      this.aPos = data.aPos.slice();      // may be driven (ScrollRect content)
      this.activeSelf = data.active !== 0;
      this.alpha = 1;                      // CanvasGroup
      this.rect = { w: 0, h: 0, left: 0, bottom: 0 };

      const el = document.createElement('div');
      el.className = 'rt';
      el.dataset.name = data.name;
      el.dataset.id = data.id;
      this.el = el;

      if (data.img) this.buildImage(data.img);
      if (data.txt) this.buildText(data.txt);
      if (data.mask) el.classList.add('masked');

      // Graphic raycast target -> receives pointer events
      const isRay = (data.img && data.img.raycast) || (data.txt);
      el.classList.add(isRay ? 'raycast' : 'noraycast');

      if (data.btn) {
        el.classList.add('btn');
        this.interactable = data.btn.interactable !== 0;
        this.hover = false;
        this.pressed = false;
        el.addEventListener('pointerenter', () => { this.hover = true; this.refreshTint(); });
        el.addEventListener('pointerleave', () => { this.hover = false; this.pressed = false; this.refreshTint(); });
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.pressed = true; this.refreshTint(); });
        el.addEventListener('pointerup', (e) => {
          e.stopPropagation();
          const was = this.pressed;
          this.pressed = false; this.refreshTint();
          if (was && this.interactable && !canvas.suppressClick) {
            const cbs = UI.clickHandlers.get(data.btn.cid);
            if (cbs) for (const cb of cbs) cb();
          }
        });
      }

      if (data.scroll) this.buildScroll(data.scroll);

      parent.appendChild(el);
      for (const c of data.children) {
        this.children.push(new Node(c, el, canvas));
      }
    }

    buildImage(img) {
      if (!img.enabled) return;
      const g = document.createElement('div');
      g.className = 'img';
      this.imgEl = g;
      this.el.appendChild(g);
      this.imgData = img;
      this.applyImage(img.color);
    }

    applyImage(color) {
      const img = this.imgData, g = this.imgEl;
      if (!g) return;
      const desc = img.sprite ? Unity.sprites[img.sprite] : null;
      if (desc) {
        // Simple (m_Type 0) - stretched to the rect, aspect NOT preserved
        if (!this.imgCanvas) {
          const cv = document.createElement('canvas');
          cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
          g.appendChild(cv);
          this.imgCanvas = cv;
        }
        paintTint(this.imgCanvas, desc, color);
        g.style.backgroundColor = 'transparent';
        g.style.borderRadius = '0';
        g.style.opacity = color[3];
      } else {
        const b = BUILTIN[img.spriteFid];
        if (b && !b.draw) { g.style.display = 'none'; return; }
        g.style.backgroundColor = Unity.colorToCss(color);
        g.style.borderRadius = (b ? b.radius : 0) + 'px';
      }
    }

    refreshTint() {
      const d = this.data;
      if (!d.btn) return;
      let state = d.btn.normal;
      if (!this.interactable) state = d.btn.disabled;
      else if (this.pressed) state = d.btn.pressed;
      else if (this.hover) state = d.btn.highlighted;
      const base = this.imgData ? this.imgData.color : [1, 1, 1, 1];
      this.applyImage(Unity.mulColor(base, state));
      this.el.classList.toggle('disabled', !this.interactable);
    }

    setInteractable(v) {
      this.interactable = !!v;
      this.refreshTint();
    }

    // --- Image.Type = Filled / Horizontal / Left (BarManager kullaniyor) ---
    setFilled(v) {
      if (!this.imgEl) return;
      const k = Unity.Mathf.clamp01(v);
      this.imgEl.style.clipPath = 'inset(0 ' + ((1 - k) * 100) + '% 0 0)';
      this.imgEl.style.webkitClipPath = this.imgEl.style.clipPath;
    }

    // Panelin KENDI rengini degistirir (PlayPanelSystem her bolum icin)
    setGraphicColor(color) {
      if (!this.imgData) return;
      this.imgData.color = color.slice();
      this.applyImage(this.imgData.color);
    }

    // Rozet sprite'ini degistirir
    setSprite(guid) {
      if (!this.imgData) return;
      if (this.imgData.sprite === guid) return;
      this.imgData.sprite = guid;
      if (this.imgCanvas) { this.imgCanvas.remove(); this.imgCanvas = null; }
      this.applyImage(this.imgData.color);
    }

    setImageVisible(on) {
      if (this.imgEl) this.imgEl.style.display = on ? '' : 'none';
    }

    buildText(t) {
      const g = document.createElement('div');
      g.className = 'tmp';
      g.textContent = t.text;
      g.style.color = Unity.colorToCss(t.color);
      g.style.fontSize = t.size + 'px';
      g.style.fontWeight = (t.style & 1) ? '700' : '400';
      if (t.style & 2) g.style.fontStyle = 'italic';
      // HorizontalAlignmentOptions: 1 Left, 2 Center, 4 Right
      g.style.justifyContent = (t.hAlign & 2) ? 'center' : (t.hAlign & 4) ? 'flex-end' : 'flex-start';
      // VerticalAlignmentOptions: 256 Top, 512 Middle, 1024 Bottom
      g.style.alignItems = (t.vAlign & 512) ? 'center' : (t.vAlign & 1024) ? 'flex-end' : 'flex-start';
      g.style.textAlign = (t.hAlign & 2) ? 'center' : (t.hAlign & 4) ? 'right' : 'left';
      if (t.margin && (t.margin[0] || t.margin[1] || t.margin[2] || t.margin[3])) {
        g.style.padding = t.margin[1] + 'px ' + t.margin[2] + 'px ' + t.margin[3] + 'px ' + t.margin[0] + 'px';
      }
      this.txtEl = g;
      this.el.appendChild(g);
    }

    buildScroll(s) {
      this.scroll = {
        cfg: s,
        velocity: 0,
        dragging: false,
        lastY: 0,
        content: null,
        viewport: null,
      };
      const el = this.el;
      el.classList.add('raycast');
      el.style.pointerEvents = 'auto';
      let pid = null;
      el.addEventListener('pointerdown', (e) => {
        if (!this.scroll.content) return;
        pid = e.pointerId;
        this.scroll.dragging = true;
        this.scroll.lastY = e.clientY;
        this.scroll.velocity = 0;
        this.scroll.moved = 0;
        el.setPointerCapture(pid);
      });
      el.addEventListener('pointermove', (e) => {
        if (!this.scroll.dragging) return;
        const sf = this.canvas.scaleFactor || 1;
        const dy = (e.clientY - this.scroll.lastY) / sf;   // screen px -> ref units
        this.scroll.lastY = e.clientY;
        this.scroll.moved += Math.abs(dy);
        // dragging down (dy>0) scrolls the content down => anchoredPosition.y decreases
        this.addScroll(-dy);
        this.scroll.velocity = -dy / Math.max(Unity.Time.deltaTime, 1e-4);
        if (this.scroll.moved > 6) this.canvas.suppressClick = true;
      });
      const end = () => {
        if (!this.scroll.dragging) return;
        this.scroll.dragging = false;
        setTimeout(() => { this.canvas.suppressClick = false; }, 0);
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        // ScrollRect.m_ScrollSensitivity = 1 ; Unity scrolls by sensitivity*delta
        this.addScroll(Math.sign(e.deltaY) * 60 * this.scroll.cfg.scrollSens);
        this.scroll.velocity = 0;
      }, { passive: false });
    }

    addScroll(dy) {
      const c = this.scroll.content;
      if (!c) return;
      c.aPos[1] += dy;
      this.clampScroll();
      UI.layoutCanvas(this.canvas);
    }

    clampScroll() {
      const c = this.scroll.content, vp = this.scroll.viewport;
      if (!c || !vp) return;
      const max = Math.max(0, c.rect.h - vp.rect.h);
      c.aPos[1] = Unity.Mathf.clamp(c.aPos[1], 0, max);
    }

    updateScroll(dt) {
      const s = this.scroll;
      if (!s || s.dragging || !s.content) return;
      if (Math.abs(s.velocity) < 1) { s.velocity = 0; return; }
      // ScrollRect inertia: v *= pow(decelerationRate, dt)
      s.velocity *= Math.pow(s.cfg.decel, dt);
      const before = s.content.aPos[1];
      s.content.aPos[1] += s.velocity * dt;
      this.clampScroll();
      if (s.content.aPos[1] === before) s.velocity = 0;
      UI.layoutCanvas(this.canvas);
    }

    find(name) {
      if (this.data.name === name) return this;
      for (const c of this.children) { const r = c.find(name); if (r) return r; }
      return null;
    }
    findById(id) {
      if (this.data.id === id) return this;
      for (const c of this.children) { const r = c.findById(id); if (r) return r; }
      return null;
    }
    setActive(v) {
      this.activeSelf = !!v;
      this.el.classList.toggle('inactive', !this.activeSelf);
    }
    setAlpha(a) {
      this.alpha = a;
      this.el.style.opacity = a;
      this.el.style.pointerEvents = a > 0 ? '' : 'none';
    }
    each(fn) { fn(this); for (const c of this.children) c.each(fn); }
  }

  // -----------------------------------------------------------------------
  const canvases = [];
  const clickHandlers = new Map();

  function build() {
    for (const cdata of window.G5_UI.canvases) {
      const host = document.getElementById(cdata.name);
      const space = document.createElement('div');
      space.className = 'canvas-space';
      host.appendChild(space);

      const canvas = { name: cdata.name, host: host, space: space, scaleFactor: 1, suppressClick: false };
      canvas.root = { children: [], data: cdata, rect: { w: REF_W, h: REF_H, left: 0, bottom: 0 } };
      for (const c of cdata.children) canvas.root.children.push(new Node(c, space, canvas));
      canvas.find = (n) => { for (const c of canvas.root.children) { const r = c.find(n); if (r) return r; } return null; };
      canvas.findById = (id) => { for (const c of canvas.root.children) { const r = c.findById(id); if (r) return r; } return null; };
      canvas.findByBtnCid = (cid) => {
        let hit = null;
        canvas.each((n) => { if (!hit && n.data.btn && n.data.btn.cid === cid) hit = n; });
        return hit;
      };
      canvas.each = (fn) => { for (const c of canvas.root.children) c.each(fn); };
      canvases.push(canvas);

      // hook up ScrollRect content / viewport references
      canvas.each((n) => {
        if (!n.scroll) return;
        const vp = n.children.find((c) => c.data.mask) || n.children[0];
        n.scroll.viewport = vp;
        n.scroll.content = vp ? vp.children[0] : null;
      });

      host.classList.toggle('inactive', cdata.active === 0);
    }
    resize();
  }

  function layoutNode(n, parentW, parentH) {
    const d = n.data;
    const w = (d.aMax[0] - d.aMin[0]) * parentW + d.size[0];
    const h = (d.aMax[1] - d.aMin[1]) * parentH + d.size[1];
    const anchorRefX = d.aMin[0] * parentW + (d.aMax[0] - d.aMin[0]) * parentW * d.pivot[0];
    const anchorRefY = d.aMin[1] * parentH + (d.aMax[1] - d.aMin[1]) * parentH * d.pivot[1];
    const pivotX = anchorRefX + n.aPos[0];
    const pivotY = anchorRefY + n.aPos[1];
    const left = pivotX - d.pivot[0] * w;
    const bottom = pivotY - d.pivot[1] * h;

    n.rect.w = w; n.rect.h = h; n.rect.left = left; n.rect.bottom = bottom;

    const s = n.el.style;
    s.left = left + 'px';
    s.top = (parentH - bottom - h) + 'px';
    s.width = w + 'px';
    s.height = h + 'px';
    s.transformOrigin = (d.pivot[0] * 100) + '% ' + ((1 - d.pivot[1]) * 100) + '%';
    let tr = '';
    if (d.rot) tr += 'rotate(' + (-d.rot) + 'deg) ';
    if (d.scale[0] !== 1 || d.scale[1] !== 1) tr += 'scale(' + d.scale[0] + ',' + d.scale[1] + ')';
    s.transform = tr;

    for (const c of n.children) layoutNode(c, w, h);
  }

  function layoutCanvas(canvas) {
    const vp = Unity.viewport();
    const sw = vp.w, sh = vp.h;
    const sf = sw / REF_W;                     // match = 0 -> match width
    const refH = sh / sf;
    canvas.scaleFactor = sf;
    canvas.space.style.width = REF_W + 'px';
    canvas.space.style.height = refH + 'px';
    canvas.space.style.transform = 'scale(' + sf + ')';
    canvas.root.rect.w = REF_W;
    canvas.root.rect.h = refH;
    for (const c of canvas.root.children) layoutNode(c, REF_W, refH);
  }

  function resize() { for (const c of canvases) layoutCanvas(c); }

  function update(dt) {
    for (const c of canvases) c.each((n) => { if (n.scroll) n.updateScroll(dt); });
  }

  function onClick(cid, fn) {
    let a = clickHandlers.get(cid);
    if (!a) { a = []; clickHandlers.set(cid, a); }
    a.push(fn);
  }

  function canvasByName(n) { return canvases.find((c) => c.name === n); }

  function setCanvasActive(name, v) {
    const c = canvasByName(name);
    if (c) c.host.classList.toggle('inactive', !v);
  }

  return {
    REF_W, REF_H, build, resize, update, layoutCanvas,
    canvases, canvasByName, setCanvasActive, onClick, clickHandlers,
  };
})();
