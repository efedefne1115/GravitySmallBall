/* ===========================================================================
 * world.js - the SpriteRenderer scene graph.
 *
 * window.G5_WORLD:
 *   guids  : [guid, ...]                       sprite lookup table
 *   colors : [[r,g,b,a], ...]                  SpriteRenderer.color palette
 *   maps   : { "<root GameObject name>": { s:[...sprites], c:[...colliders] } }
 *
 * sprite record = [guidIdx, x, y, scaleX, scaleY, rotDeg, sortingOrder,
 *                  flipBits (1=flipX 2=flipY), colorIdx, activeInHierarchy, goId]
 * All positions/scales/rotations are already resolved to WORLD space by the
 * extractor (parent chains composed as full 2D affine matrices, then
 * decomposed - every rotation in this scene is around Z only, verified).
 * ======================================================================== */

const World = (function () {
  'use strict';

  const BUCKET = 8;             // world units per horizontal render bucket

  const maps = [];              // {name, sprites[], buckets:Map, grid, minX..maxY}
  const spritesByGo = new Map();// goId -> sprite record wrapper (used by Bird)
  const collidersByGo = new Map();
  let allColliders = [];

  const tintCache = new Map();  // "guidIdx|colorIdx" -> canvas

  function build() {
    const W = window.G5_WORLD;
    const guids = W.guids;
    const colors = W.colors;

    for (const name in W.maps) {
      const src = W.maps[name];
      const m = {
        name: name,
        sprites: [],
        buckets: new Map(),
        grid: new Physics2D.Grid(),
        minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
      };

      for (let i = 0; i < src.s.length; i++) {
        const r = src.s[i];
        const guid = guids[r[0]];
        const desc = Unity.sprites[guid];
        if (!desc) { console.warn('unknown sprite guid ' + guid); continue; }

        const sp = {
          desc: desc,
          guidIdx: r[0],
          x: r[1], y: r[2], sx: r[3], sy: r[4], rot: r[5],
          order: r[6],
          flipX: (r[7] & 1) !== 0,
          flipY: (r[7] & 2) !== 0,
          colorIdx: r[8],
          color: colors[r[8]],
          active: r[9] !== 0,
          go: r[10],
          seq: i,
        };
        // conservative half extents (rotation aware) for culling
        const hw = Math.abs(desc.worldW * sp.sx) * 0.5;
        const hh = Math.abs(desc.worldH * sp.sy) * 0.5;
        if (sp.rot === 0) { sp.hx = hw; sp.hy = hh; }
        else {
          const a = Math.abs(Math.cos(sp.rot * Math.PI / 180));
          const b = Math.abs(Math.sin(sp.rot * Math.PI / 180));
          sp.hx = hw * a + hh * b;
          sp.hy = hw * b + hh * a;
        }
        m.sprites.push(sp);
        spritesByGo.set(sp.go, sp);

        if (sp.x - sp.hx < m.minX) m.minX = sp.x - sp.hx;
        if (sp.x + sp.hx > m.maxX) m.maxX = sp.x + sp.hx;
        if (sp.y - sp.hy < m.minY) m.minY = sp.y - sp.hy;
        if (sp.y + sp.hy > m.maxY) m.maxY = sp.y + sp.hy;

        const b0 = Math.floor((sp.x - sp.hx) / BUCKET);
        const b1 = Math.floor((sp.x + sp.hx) / BUCKET);
        for (let b = b0; b <= b1; b++) {
          let arr = m.buckets.get(b);
          if (!arr) { arr = []; m.buckets.set(b, arr); }
          arr.push(sp);
        }
      }

      // The "Twoxwoob" root IS the player: its BoxCollider2D belongs to the
      // dynamic Rigidbody2D, not to the static world.
      const isPlayerRoot = (name === 'Twoxwoob');

      for (let i = 0; i < src.c.length && !isPlayerRoot; i++) {
        const col = Physics2D.makeCollider(src.c[i]);
        col.map = name;
        m.grid.add(col);
        allColliders.push(col);
        collidersByGo.set(col.go, col);
        if (col.minX < m.minX) m.minX = col.minX;
        if (col.maxX > m.maxX) m.maxX = col.maxX;
        if (col.minY < m.minY) m.minY = col.minY;
        if (col.maxY > m.maxY) m.maxY = col.maxY;
      }

      maps.push(m);
    }
  }

  // -----------------------------------------------------------------------
  // Colour tinting: Unity multiplies the sprite texture by SpriteRenderer.color
  // -----------------------------------------------------------------------
  function tinted(sp) {
    const c = sp.color;
    if (c[0] === 1 && c[1] === 1 && c[2] === 1) return sp.desc.img;
    const key = sp.guidIdx + '|' + sp.colorIdx;
    let cv = tintCache.get(key);
    if (cv) return cv;
    const img = sp.desc.img;
    if (!img) return null;
    cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')';
    g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, 0);
    tintCache.set(key, cv);
    return cv;
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------
  const visible = [];

  function collectVisible(bounds, extra) {
    visible.length = 0;
    for (const m of maps) {
      if (m.maxX < bounds.xMin || m.minX > bounds.xMax ||
          m.maxY < bounds.yMin || m.minY > bounds.yMax) continue;
      const b0 = Math.floor(bounds.xMin / BUCKET), b1 = Math.floor(bounds.xMax / BUCKET);
      for (let b = b0; b <= b1; b++) {
        const arr = m.buckets.get(b);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const sp = arr[i];
          if (!sp.active || sp.hidden || sp.dynamic) continue;
          if (sp.x + sp.hx < bounds.xMin || sp.x - sp.hx > bounds.xMax) continue;
          if (sp.y + sp.hy < bounds.yMin || sp.y - sp.hy > bounds.yMax) continue;
          if (sp.bucketMark === frameId) continue;   // de-dup across buckets
          sp.bucketMark = frameId;
          visible.push(sp);
        }
      }
    }
    if (extra) for (const sp of extra) if (sp && sp.active && !sp.hidden) visible.push(sp);
    visible.sort(cmp);
    return visible;
  }

  let frameId = 0;
  function cmp(a, b) { return a.order - b.order || a.seq - b.seq; }

  function draw(ctx, cam, extraSprites) {
    frameId++;
    const list = collectVisible(cam.bounds(), extraSprites);

    // world -> screen matrix (see the header comment in unity.js)
    const ppu = cam.ppu;
    const e = cam.w / 2 - cam.x * ppu;
    const f = cam.h / 2 + cam.y * ppu;

    ctx.imageSmoothingEnabled = true;   // TextureImporter filterMode: 1 (Bilinear)
    ctx.imageSmoothingQuality = 'high';

    for (let i = 0; i < list.length; i++) {
      const sp = list[i];
      const img = tinted(sp);
      if (!img) continue;
      const d = sp.desc;
      const a = sp.color[3];
      ctx.globalAlpha = a;
      ctx.setTransform(ppu, 0, 0, -ppu, e, f);
      ctx.translate(sp.x, sp.y);
      if (sp.rot !== 0) ctx.rotate(sp.rot * Math.PI / 180);
      ctx.scale(sp.sx * (sp.flipX ? -1 : 1), -sp.sy * (sp.flipY ? -1 : 1));
      ctx.drawImage(img,
        -d.px * d.worldW,
        -(1 - d.py) * d.worldH,
        d.worldW, d.worldH);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  // Debug overlay (colliders) - off by default, toggled with the C key.
  function drawColliders(ctx, cam) {
    const ppu = cam.ppu;
    const e = cam.w / 2 - cam.x * ppu;
    const f = cam.h / 2 + cam.y * ppu;
    const b = cam.bounds();
    ctx.setTransform(ppu, 0, 0, -ppu, e, f);
    ctx.lineWidth = 2 / ppu;
    for (const c of allColliders) {
      if (!c.active) continue;
      if (c.maxX < b.xMin || c.minX > b.xMax || c.maxY < b.yMin || c.minY > b.yMax) continue;
      ctx.strokeStyle = c.lethal ? '#ff2d2d' : (c.trigger ? '#2dd0ff' : '#39ff6a');
      if (c.type === 0) {
        ctx.beginPath();
        ctx.moveTo(c.pts[0], c.pts[1]);
        for (let i = 2; i < 8; i += 2) ctx.lineTo(c.pts[i], c.pts[i + 1]);
        ctx.closePath(); ctx.stroke();
      } else {
        for (const p of c.paths) {
          ctx.beginPath();
          ctx.moveTo(p[0], p[1]);
          for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
          ctx.closePath(); ctx.stroke();
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function queryColliders(minX, minY, maxX, maxY, out) {
    out.length = 0;
    const tmp = [];
    for (const m of maps) {
      if (m.maxX < minX || m.minX > maxX || m.maxY < minY || m.minY > maxY) continue;
      m.grid.query(minX, minY, maxX, maxY, tmp);
      for (let i = 0; i < tmp.length; i++) out.push(tmp[i]);
    }
    return out;
  }

  return {
    build, draw, drawColliders, queryColliders,
    maps, spritesByGo, collidersByGo,
    get allColliders() { return allColliders; },
  };
})();
