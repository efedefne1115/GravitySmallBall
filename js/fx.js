/* ===========================================================================
 * fx.js - Unity'deki gorsel efekt script'lerinin birebir karsiliklari:
 *
 *   PlayerTrail.cs        -> Trail
 *   PlayerEffects.cs      -> Ring        (ekrana dokununca cikan halka)
 *   DeathAnimation.cs     -> DeathAnim   (olum parcaciklari + gecikmeli siyah)
 *   PlaceEffect.cs        -> PlaceDust   (zemine inisde zeminin renginde toz)
 *   BackgroundSpinner.cs  -> Spinners    (sahnedeki 289 arka plan carki)
 *
 * Butun ayarlar window.G5_COMP icinden okunur; o dosya Unity sahnesindeki
 * Inspector degerlerinin birebir kopyasidir.
 * ======================================================================== */

/* Unity AnimationCurve: iki anahtarli Hermite egrisi (t 0..1). */
function evalCurve(c, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * c.p0 +
         (t3 - 2 * t2 + t) * c.s0 +
         (-2 * t3 + 3 * t2) * c.p1 +
         (t3 - t2) * c.s1;
}

/* --------------------------------------------------------------- PlayerTrail
 * Unity TrailRenderer: gecmis noktalari `time` saniye tutar, genislik bastan
 * kuyruga WidthCurve ile incelir, renk 3 duraklı gradient.
 */
class Trail {
  constructor(cfg) {
    this.cfg = cfg;
    this.pts = [];                 // {x, y, age}
    this.emitting = false;
  }
  clear() { this.pts.length = 0; }

  update(dt, x, y, emitting) {
    const c = this.cfg;
    for (let i = this.pts.length - 1; i >= 0; i--) {
      this.pts[i].age += dt;
      if (this.pts[i].age >= c.duration) this.pts.splice(i, 1);
    }
    if (!c.enabled || !emitting) return;

    const last = this.pts[this.pts.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) >= c.minVertexDistance) {
      this.pts.push({ x: x, y: y, age: 0 });
    }
  }

  // Unity gradient: 0 -> head, 0.45 -> mid, 1 -> tail
  colorAt(t) {
    const c = this.cfg;
    let a, b, k;
    if (t < 0.45) { a = c.headColor; b = c.midColor; k = t / 0.45; }
    else { a = c.midColor; b = c.tailColor; k = (t - 0.45) / 0.55; }
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k,
            a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
  }

  draw(ctx, cam) {
    const c = this.cfg;
    if (!c.enabled || this.pts.length < 2) return;

    const ppu = cam.ppu;
    const e = cam.w / 2 - cam.x * ppu;
    const f = cam.h / 2 + cam.y * ppu;
    ctx.setTransform(ppu, 0, 0, -ppu, e, f);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // En yeni nokta bas (t=0), en eski kuyruk (t=1)
    const n = this.pts.length;
    for (let i = n - 1; i > 0; i--) {
      const p = this.pts[i], q = this.pts[i - 1];
      const t = 1 - (i / (n - 1));            // 0 = bas
      const col = this.colorAt(t);
      if (col[3] <= 0.002) continue;

      const w = c.startWidth + (c.endWidth - c.startWidth) * t;
      ctx.strokeStyle = 'rgba(' + Math.round(col[0] * 255) + ',' + Math.round(col[1] * 255) +
                        ',' + Math.round(col[2] * 255) + ',' + col[3] + ')';
      ctx.lineWidth = Math.max(w, 0.001);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

/* ------------------------------------------------------------- PlayerEffects
 * Her tikta oyuncunun icinden cikip buyuyerek seffaflasan halka.
 */
class Ring {
  constructor(cfg) {
    this.cfg = cfg;
    this.desc = Unity.sprites[cfg.sprite] || null;
    this.pool = [];
    // NormalizeSpriteSize: olcek degerleri sprite boyutundan bagimsiz olsun
    this.unit = 1;
    if (cfg.normalizeSpriteSize && this.desc) {
      const m = Math.max(this.desc.worldW, this.desc.worldH);
      if (m > 0.0001) this.unit = 1 / m;
    }
  }
  clear() { for (const r of this.pool) r.alive = false; }

  spawn(px, py) {
    const c = this.cfg;
    if (!c.enabled || !this.desc) return;
    let r = this.pool.find((o) => !o.alive);
    if (!r) {
      if (this.pool.length >= c.maxSimultaneous) {
        r = this.pool.reduce((a, b) => (a.age > b.age ? a : b));
      } else { r = {}; this.pool.push(r); }
    }
    r.alive = true; r.age = 0;
    r.x = px + c.offset[0];
    r.y = py + c.offset[1];
  }

  update(dt, px, py) {
    const c = this.cfg;
    for (const r of this.pool) {
      if (!r.alive) continue;
      r.age += dt;
      if (r.age >= c.duration) { r.alive = false; continue; }
      if (c.followPlayer) { r.x = px + c.offset[0]; r.y = py + c.offset[1]; }
    }
  }

  collect(out, seq) {
    const c = this.cfg;
    if (!this.desc) return seq;
    for (const r of this.pool) {
      if (!r.alive) continue;
      const t = c.duration <= 0 ? 1 : r.age / c.duration;
      const s = (c.startScale + (c.endScale - c.startScale) * evalCurve(c.scaleCurve, t)) * this.unit;
      const a = c.color[3] * Math.max(0, evalCurve(c.alphaCurve, t));
      if (a <= 0.002 || s <= 0) continue;
      out.push(FX.makeSprite(this.desc, r.x, r.y, s, s, 0, c.orderInLayer,
                             [c.color[0], c.color[1], c.color[2], a], seq++));
    }
    return seq;
  }
}

/* ------------------------------------------------------------ DeathAnimation
 * Olum: oyuncu gizlenir, 3 renkte parcalar sacilir, kamera olum yerinde
 * tutulur, sonra siyah ekran + acilis.
 */
class DeathAnim {
  constructor(cfg) {
    this.cfg = cfg;
    this.pool = [];
    this.phase = 0;          // 0 yok, 1 parcalar, 2 siyah, 3 aciliyor
    this.phaseTime = 0;
    this.heldCamX = 0; this.heldCamY = 0;
    this.blackAlpha = 0;
  }

  begin(x, y, camX, camY) {
    const c = this.cfg;
    this.heldCamX = camX; this.heldCamY = camY;
    this.phase = c.parcaSuresi > 0 ? 1 : 2;
    this.phaseTime = 0;
    this.blackAlpha = 0;

    const cols = [c.renk1, c.renk2, c.renk3];
    for (let i = 0; i < c.parcaSayisi; i++) {
      let p = this.pool.find((o) => !o.alive);
      if (!p) { p = {}; this.pool.push(p); }
      const ang = Math.random() * Math.PI * 2;
      const sp = c.hizMin + Math.random() * (c.hizMax - c.hizMin);
      p.alive = true; p.age = 0;
      p.life = c.yasamMin + Math.random() * (c.yasamMax - c.yasamMin);
      p.x = x + Math.cos(ang) * Math.random() * c.yayilmaYaricapi;
      p.y = y + Math.sin(ang) * Math.random() * c.yayilmaYaricapi;
      p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
      p.rot = Math.random() * 360;
      p.spin = (Math.random() * 2 - 1) * c.donmeHizi;
      p.col = cols[(Math.random() * 3) | 0];
    }
  }

  // true dondururse siyah perdeyi bu sinif suruyor demektir
  get active() { return this.phase !== 0; }

  update(dt) {
    const c = this.cfg;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.age += dt;
      const t = p.life <= 0 ? 1 : p.age / p.life;
      if (t >= 1) { p.alive = false; continue; }
      p.vy += c.yercekimi * dt;
      const d = Math.min(1, c.suruklenme * dt);
      p.vx -= p.vx * d; p.vy -= p.vy * d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.t = t;
    }
    if (this.phase === 0) return;

    this.phaseTime += dt;
    const hold = c.siyahBeklemeSuresi, fade = c.acilmaSuresi;

    if (this.phase === 1) {
      this.blackAlpha = 0;
      if (this.phaseTime >= c.parcaSuresi) { this.phase = 2; this.phaseTime = 0; }
    } else if (this.phase === 2) {
      this.blackAlpha = 1;
      if (this.phaseTime >= hold) { this.phase = 3; this.phaseTime = 0; }
    } else if (this.phase === 3) {
      this.blackAlpha = fade <= 0 ? 0 : Math.max(0, 1 - this.phaseTime / fade);
      if (this.phaseTime >= fade) { this.phase = 0; this.blackAlpha = 0; }
    }
  }

  collect(out, seq) {
    const c = this.cfg;
    const d = Unity.spriteByName['Square'];
    for (const p of this.pool) {
      if (!p.alive) continue;
      const s = c.baslangicBoyutu + (c.bitisBoyutu - c.baslangicBoyutu) * p.t;
      const a = p.col[3] * (1 - p.t * p.t);
      if (a <= 0.002 || s <= 0) continue;
      out.push(FX.makeSprite(d, p.x, p.y, s, s, p.rot, c.orderInLayer,
                             [p.col[0], p.col[1], p.col[2], a], seq++));
    }
    return seq;
  }
}

/* ---------------------------------------------------------------- PlaceEffect
 * Zemine inisde, indigi noktadaki zeminin BASKIN renginde kucuk toz.
 */
class PlaceDust {
  constructor(cfg) {
    this.cfg = cfg;
    this.pool = [];
    this.lastTime = -99;
    this.domCache = new Map();
  }

  // Sprite'in baskin rengi (Unity'deki RenderTexture okumasinin karsiligi:
  // burada dokuyu dogrudan okuyabiliyoruz, offscreen canvas yeter).
  dominant(desc) {
    if (!desc || !desc.img) return null;
    let c = this.domCache.get(desc.guid);
    if (c) return c;

    const MAX = 64;
    const k = Math.min(1, MAX / Math.max(desc.img.width, desc.img.height));
    const w = Math.max(1, Math.round(desc.img.width * k));
    const h = Math.max(1, Math.round(desc.img.height * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(desc.img, 0, 0, w, h);

    let data;
    try { data = g.getImageData(0, 0, w, h).data; }
    catch (e) { return null; }

    const bits = this.cfg.renkHassasiyeti, shift = 8 - bits;
    const minA = this.cfg.enAzPikselAlfasi * 255;
    const cnt = new Map(), sum = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < minA) continue;
      const key = ((data[i] >> shift) << (bits * 2)) | ((data[i + 1] >> shift) << bits) | (data[i + 2] >> shift);
      cnt.set(key, (cnt.get(key) || 0) + 1);
      const s = sum.get(key) || [0, 0, 0];
      s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2];
      sum.set(key, s);
    }
    let best = -1, bestN = 0;
    for (const [k2, n] of cnt) if (n > bestN) { bestN = n; best = k2; }
    if (bestN === 0) return null;
    const s = sum.get(best);
    c = [s[0] / bestN / 255, s[1] / bestN / 255, s[2] / bestN / 255];
    this.domCache.set(desc.guid, c);
    return c;
  }

  resolveColor(sp) {
    const c = this.cfg;
    let base = null;
    if (sp && sp.desc && sp.color[3] >= c.enAzPikselAlfasi) {
      const dom = this.dominant(sp.desc);
      if (dom) base = [dom[0] * sp.color[0], dom[1] * sp.color[1], dom[2] * sp.color[2]];
    }
    if (!base) base = [c.yedekRenk[0], c.yedekRenk[1], c.yedekRenk[2]];
    const l = c.aydinlatma;
    return [base[0] + (1 - base[0]) * l, base[1] + (1 - base[1]) * l, base[2] + (1 - base[2]) * l];
  }

  burst(x, y, nx, ny, gravityDown, groundSprite, now) {
    const c = this.cfg;
    if (now - this.lastTime < c.enAzAralik) return;
    this.lastTime = now;

    const col = this.resolveColor(groundSprite);
    const tx = ny, ty = -nx;                       // yuzeye paralel
    const g = gravityDown ? -c.yercekimi : c.yercekimi;
    const cone = Math.cos(c.yayilmaAcisi * Math.PI / 180);

    for (let i = 0; i < c.parcaSayisi; i++) {
      let p = this.pool.find((o) => !o.alive);
      if (!p) { p = {}; this.pool.push(p); }
      const side = Math.random() < 0.5 ? -1 : 1;
      const t = 0.15 + Math.random() * 0.85;
      let dx = tx * side * t + nx * cone;
      let dy = ty * side * t + ny * cone;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const sp = c.hizMin + Math.random() * (c.hizMax - c.hizMin);

      p.alive = true; p.age = 0;
      p.life = c.yasamMin + Math.random() * (c.yasamMax - c.yasamMin);
      p.x = x + tx * (Math.random() - 0.5) * c.yayilmaGenisligi + nx * 0.02;
      p.y = y + ty * (Math.random() - 0.5) * c.yayilmaGenisligi + ny * 0.02;
      p.vx = dx * sp; p.vy = dy * sp;
      p.g = g; p.col = col; p.t = 0;
    }
  }

  update(dt) {
    const c = this.cfg;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.age += dt;
      const t = p.life <= 0 ? 1 : p.age / p.life;
      if (t >= 1) { p.alive = false; continue; }
      p.vy += p.g * dt;
      const d = Math.min(1, c.suruklenme * dt);
      p.vx -= p.vx * d; p.vy -= p.vy * d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.t = t;
    }
  }

  collect(out, seq) {
    const c = this.cfg;
    const d = Unity.spriteByName['Square'];
    for (const p of this.pool) {
      if (!p.alive) continue;
      const s = c.baslangicBoyutu + (c.bitisBoyutu - c.baslangicBoyutu) * p.t;
      const a = c.renkCarpani[3] * (1 - p.t);
      if (a <= 0.002 || s <= 0) continue;
      out.push(FX.makeSprite(d, p.x, p.y, s, s, 0, c.orderInLayer,
                             [p.col[0] * c.renkCarpani[0], p.col[1] * c.renkCarpani[1],
                              p.col[2] * c.renkCarpani[2], a], seq++));
    }
    return seq;
  }
}

/* ------------------------------------------------------- BackgroundSpinner
 * Sahnedeki 289 arka plan carki. Her biri: cubuk + duran buyuk yuvarlak +
 * etrafinda donen kucuk yuvarlaklar. Oyuncu yercekimini cevirince hizlanip
 * kisa sureligine buyurler.
 */
const Spinners = (function () {
  'use strict';
  const list = [];
  const buckets = new Map();
  const BUCKET = 24;

  function build() {
    const src = window.G5_SPINNERS || [];
    for (let i = 0; i < src.length; i++) {
      const r = src[i];
      const cubuk = Unity.sprites[r.CubukSprite];
      const yuv = Unity.sprites[r.YuvarlakSprite];
      if (!cubuk || !yuv) continue;

      const g = r.GenelBoyut || 1;
      const s = {
        x: r.x, y: r.y, rot: (r.rot || 0) * Math.PI / 180,
        sx: r.sx || 1, sy: r.sy || 1,
        cubukDesc: cubuk, yuvDesc: yuv,
        uzunluk: r.CubukUzunlugu * g,
        kalinlik: r.CubukKalinligi * g,
        girinti: (r.CubukGirinti || 0) * g,
        buyukCap: r.BuyukCap * g,
        yaricap: r.Yaricap * g,
        kucukCap: r.KucukCap * g,
        n: r.KucukSayisi | 0,
        temelHiz: r.TemelHiz,
        tepki: r.TepkiVer !== 0,
        hizCarpani: r.HizCarpani, hizSonme: r.HizSonmeSuresi,
        buyume: r.BuyumeMiktari, buyumeSonme: r.BuyumeSonmeSuresi,
        order: r.OrderInLayer | 0,
        cubukRenk: r.CubukRengi, buyukRenk: r.BuyukRenk, kucukRenk: r.KucukRenk,
        angle: 0, spinPop: 0, scalePop: 0
      };
      s.cubukBoy = Math.max(0.001, s.uzunluk - s.buyukCap * 0.5 + s.girinti);
      s.reach = s.uzunluk + s.yaricap + s.kucukCap;
      list.push(s);

      const b0 = Math.floor((s.x - s.reach) / BUCKET);
      const b1 = Math.floor((s.x + s.reach) / BUCKET);
      for (let b = b0; b <= b1; b++) {
        let a = buckets.get(b);
        if (!a) { a = []; buckets.set(b, a); }
        a.push(s);
      }
    }
  }

  function flip() {
    for (const s of list) if (s.tepki) { s.spinPop = 1; s.scalePop = 1; }
  }

  function update(dt) {
    for (const s of list) {
      if (s.spinPop > 0) s.spinPop = Math.max(0, s.spinPop - dt / Math.max(0.01, s.hizSonme));
      if (s.scalePop > 0) s.scalePop = Math.max(0, s.scalePop - dt / Math.max(0.01, s.buyumeSonme));
      const sp = s.spinPop * s.spinPop;
      s.angle += s.temelHiz * (1 + (s.hizCarpani - 1) * sp) * dt;
    }
  }

  // Gorunur carklarin parcalarini ciz listesine ekler
  function collect(out, bounds, seq) {
    const b0 = Math.floor(bounds.xMin / BUCKET), b1 = Math.floor(bounds.xMax / BUCKET);
    const seen = new Set();
    for (let b = b0; b <= b1; b++) {
      const arr = buckets.get(b);
      if (!arr) continue;
      for (const s of arr) {
        if (seen.has(s)) continue;
        seen.add(s);
        if (s.x + s.reach < bounds.xMin || s.x - s.reach > bounds.xMax) continue;
        if (s.y + s.reach < bounds.yMin || s.y - s.reach > bounds.yMax) continue;
        seq = emit(out, s, seq);
      }
    }
    return seq;
  }

  function emit(out, s, seq) {
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    // kok yerel (0,y) -> dunya
    const L = (lx, ly) => [s.x + (c * lx * s.sx - sn * ly * s.sy),
                           s.y + (sn * lx * s.sx + c * ly * s.sy)];
    const rotDeg = s.rot * 180 / Math.PI;

    // cubuk
    const cp = L(0, s.cubukBoy * 0.5);
    out.push(FX.makeSpriteWH(s.cubukDesc, cp[0], cp[1], s.kalinlik, s.cubukBoy,
                             rotDeg, s.order, s.cubukRenk, seq++));

    // tepedeki kap (buyume buna uygulanir)
    const sc = s.scalePop * s.scalePop;
    const k = 1 + s.buyume * sc;
    const hp = L(0, s.uzunluk);

    // buyuk yuvarlak - DONMEZ
    out.push(FX.makeSpriteWH(s.yuvDesc, hp[0], hp[1], s.buyukCap * k, s.buyukCap * k,
                             rotDeg, s.order + 1, s.buyukRenk, seq++));

    // kucukler - buyugun etrafinda doner, kendi eksenlerinde donmez
    if (s.n > 0) {
      const step = (Math.PI * 2) / s.n;
      const a0 = s.angle * Math.PI / 180;
      const r = s.yaricap * k;
      const cap = s.kucukCap * k;
      for (let i = 0; i < s.n; i++) {
        const a = a0 + step * i;
        const lx = Math.cos(a) * r, ly = Math.sin(a) * r;
        const p = L(lx, s.uzunluk + ly);
        out.push(FX.makeSpriteWH(s.yuvDesc, p[0], p[1], cap, cap, rotDeg, s.order + 2,
                                 s.kucukRenk, seq++));
      }
    }
    return seq;
  }

  return { build, update, flip, collect, get count() { return list.length; } };
})();

/* ------------------------------------------------------------------- ortak */
const FX = {
  // Dunya birimi olcekle sprite kaydi (olcek = sprite'in kendi boyutuna gore)
  makeSprite(desc, x, y, sx, sy, rot, order, color, seq) {
    return {
      desc: desc, x: x, y: y, sx: sx, sy: sy, rot: rot, order: order,
      flipX: false, flipY: false, color: color, active: true, dynamic: true,
      hx: Math.abs(desc.worldW * sx) * 0.5, hy: Math.abs(desc.worldH * sy) * 0.5,
      seq: seq,
      tintKey: desc.guid + '|' + color[0].toFixed(3) + ',' + color[1].toFixed(3) + ',' + color[2].toFixed(3)
    };
  },
  // Istenen GERCEK dunya genisligi/yuksekligi ile sprite kaydi
  makeSpriteWH(desc, x, y, w, h, rot, order, color, seq) {
    const sx = desc.worldW > 0.0001 ? w / desc.worldW : 1;
    const sy = desc.worldH > 0.0001 ? h / desc.worldH : 1;
    return FX.makeSprite(desc, x, y, sx, sy, rot, order, color, seq);
  }
};
