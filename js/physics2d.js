/* ===========================================================================
 * physics2d.js - the slice of Unity 2D physics this game actually uses.
 *
 * What the Unity project does:
 *   * The player is the ONLY Rigidbody2D (Dynamic, mass 1, gravityScale set
 *     from code to +-4, m_Constraints = 4 => FreezeRotation Z,
 *     m_CollisionDetection = 1 => Continuous, m_Interpolate set to Interpolate
 *     from PlayerController.Awake).
 *   * Everything else is a *static* collider (no Rigidbody2D):
 *       - BoxCollider2D  x808   (all m_EdgeRadius 0, m_AutoTiling 0)
 *       - PolygonCollider2D x2605 (all on layer 6 = "Spike")
 *   * Physics2D gravity = (0, -9.81), Fixed Timestep = 0.02.
 *
 * Consequences that let us keep this small and still be faithful:
 *   * Only ONE dynamic body -> no body-vs-body solver needed.
 *   * Every PolygonCollider2D is on layer 6 ("Spike"), and touching layer 6
 *     kills the player on the very same physics step
 *     (PlayerController.CheckSpikeCollision). So polygons never need a
 *     collision *response*, only an overlap *test* - which is what lets us
 *     support the concave, 455-point sprite outlines exactly instead of
 *     approximating them with convex hulls.
 *   * Solid response is therefore only ever AABB(player) vs OBB(static box),
 *     which is exact.
 *
 * Continuous collision detection is reproduced by sub-stepping the
 * displacement of one 0.02 s tick (velocity integration itself still happens
 * once per 0.02 s tick, exactly like Unity, so trajectories match).
 * ======================================================================== */

const Physics2D = (function () {
  'use strict';

  const GRAVITY_Y = -9.81;      // ProjectSettings/Physics2DSettings m_Gravity
  const MAX_SUBSTEP = 0.12;     // world units per collision sub-move
  const SKIN = 0.0;             // Unity default contact offset is 0.01; kept 0
                                // so the player can pass through gaps that are
                                // exactly collider-sized, like in the editor.
  const LAYER_SPIKE = 6;
  const CELL = 6;               // broadphase grid cell size, world units

  const DEG = Math.PI / 180;

  // -----------------------------------------------------------------------
  // Building colliders from the extracted scene data
  // -----------------------------------------------------------------------
  function makeCollider(rec) {
    const c = {
      type: rec.t, layer: rec.l, trigger: !!rec.tr, go: rec.go, name: rec.n,
      active: rec.a !== 0,
    };
    const rot = rec.r * DEG;
    const cs = Math.cos(rot), sn = Math.sin(rot);

    if (rec.t === 0) {
      // BoxCollider2D: offset is local (scaled then rotated), size is local.
      const ox = rec.ox * rec.sx, oy = rec.oy * rec.sy;
      c.cx = rec.x + cs * ox - sn * oy;
      c.cy = rec.y + sn * ox + cs * oy;
      c.hw = Math.abs(rec.w * rec.sx) * 0.5;
      c.hh = Math.abs(rec.h * rec.sy) * 0.5;
      c.cos = cs; c.sin = sn;
      c.axisAligned = Math.abs(rec.r % 180) < 1e-4;
      // world corners (CCW)
      const pts = [[-c.hw, -c.hh], [c.hw, -c.hh], [c.hw, c.hh], [-c.hw, c.hh]];
      c.pts = [];
      for (const p of pts) {
        c.pts.push(c.cx + cs * p[0] - sn * p[1], c.cy + sn * p[0] + cs * p[1]);
      }
    } else {
      // PolygonCollider2D: m_Points are local space; apply full TRS.
      c.paths = [];
      for (const path of rec.p) {
        const out = new Float64Array(path.length);
        for (let i = 0; i < path.length; i += 2) {
          const lx = (path[i] + rec.ox) * rec.sx;
          const ly = (path[i + 1] + rec.oy) * rec.sy;
          out[i] = rec.x + cs * lx - sn * ly;
          out[i + 1] = rec.y + sn * lx + cs * ly;
        }
        c.paths.push(out);
      }
      c.pts = [];
      for (const p of c.paths) for (let i = 0; i < p.length; i++) c.pts.push(p[i]);
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < c.pts.length; i += 2) {
      if (c.pts[i] < minX) minX = c.pts[i];
      if (c.pts[i] > maxX) maxX = c.pts[i];
      if (c.pts[i + 1] < minY) minY = c.pts[i + 1];
      if (c.pts[i + 1] > maxY) maxY = c.pts[i + 1];
    }
    c.minX = minX; c.minY = minY; c.maxX = maxX; c.maxY = maxY;
    c.lethal = c.layer === LAYER_SPIKE;
    c.solid = !c.trigger && !c.lethal;
    return c;
  }

  // -----------------------------------------------------------------------
  // Uniform-grid broadphase
  // -----------------------------------------------------------------------
  class Grid {
    constructor() { this.cells = new Map(); this.all = []; }
    add(c) {
      this.all.push(c);
      const x0 = Math.floor(c.minX / CELL), x1 = Math.floor(c.maxX / CELL);
      const y0 = Math.floor(c.minY / CELL), y1 = Math.floor(c.maxY / CELL);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const k = x + ',' + y;
          let a = this.cells.get(k);
          if (!a) { a = []; this.cells.set(k, a); }
          a.push(c);
        }
      }
    }
    query(minX, minY, maxX, maxY, out) {
      out.length = 0;
      const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
      const y0 = Math.floor(minY / CELL), y1 = Math.floor(maxY / CELL);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const a = this.cells.get(x + ',' + y);
          if (!a) continue;
          for (let i = 0; i < a.length; i++) {
            const c = a[i];
            if (out.indexOf(c) === -1) out.push(c);
          }
        }
      }
      return out;
    }
  }

  // -----------------------------------------------------------------------
  // AABB (player) vs OBB (static box) - SAT with minimum translation vector
  // -----------------------------------------------------------------------
  function satBox(px, py, phw, phh, box) {
    // Fast path: axis-aligned static box -> plain AABB overlap
    if (box.axisAligned) {
      const dx = px - box.cx, dy = py - box.cy;
      const ox = phw + box.hw - Math.abs(dx);
      if (ox <= 0) return null;
      const oy = phh + box.hh - Math.abs(dy);
      if (oy <= 0) return null;
      if (ox < oy) return { nx: dx < 0 ? -1 : 1, ny: 0, depth: ox };
      return { nx: 0, ny: dy < 0 ? -1 : 1, depth: oy };
    }

    // General case: 4 candidate axes (2 from the AABB, 2 from the OBB)
    const axes = [1, 0, 0, 1, box.cos, box.sin, -box.sin, box.cos];
    let bestDepth = Infinity, bnx = 0, bny = 0;
    const pcx = px, pcy = py;
    for (let a = 0; a < 8; a += 2) {
      const ax = axes[a], ay = axes[a + 1];
      // project player AABB
      const pr = phw * Math.abs(ax) + phh * Math.abs(ay);
      const pc = pcx * ax + pcy * ay;
      // project OBB
      const br = box.hw * Math.abs(box.cos * ax + box.sin * ay)
               + box.hh * Math.abs(-box.sin * ax + box.cos * ay);
      const bc = box.cx * ax + box.cy * ay;
      const d = pc - bc;
      const overlap = pr + br - Math.abs(d);
      if (overlap <= 0) return null;
      if (overlap < bestDepth) {
        bestDepth = overlap;
        const s = d < 0 ? -1 : 1;
        bnx = ax * s; bny = ay * s;
      }
    }
    return { nx: bnx, ny: bny, depth: bestDepth };
  }

  // -----------------------------------------------------------------------
  // Arbitrary (possibly concave, possibly multi-path) polygon vs AABB overlap
  // -----------------------------------------------------------------------
  function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const r1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const r2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    const r3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const r4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    return ((r1 > 0) !== (r2 > 0)) && ((r3 > 0) !== (r4 > 0));
  }

  function polyOverlapAABB(col, px, py, phw, phh) {
    const l = px - phw, r = px + phw, b = py - phh, t = py + phh;
    if (col.maxX < l || col.minX > r || col.maxY < b || col.minY > t) return false;

    let inside = false; // even-odd test of the AABB centre against all paths
    for (const p of col.paths) {
      const n = p.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = p[i * 2], yi = p[i * 2 + 1];
        const xj = p[j * 2], yj = p[j * 2 + 1];
        // vertex inside the box?
        if (xi >= l && xi <= r && yi >= b && yi <= t) return true;
        // edge crossing any box side?
        if (segIntersect(xi, yi, xj, yj, l, b, r, b)) return true;
        if (segIntersect(xi, yi, xj, yj, r, b, r, t)) return true;
        if (segIntersect(xi, yi, xj, yj, r, t, l, t)) return true;
        if (segIntersect(xi, yi, xj, yj, l, t, l, b)) return true;
        // ray cast for containment
        if (((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
      }
    }
    return inside;
  }

  function overlaps(col, px, py, phw, phh) {
    if (col.type === 0) return satBox(px, py, phw, phh, col) !== null;
    return polyOverlapAABB(col, px, py, phw, phh);
  }

  return {
    GRAVITY_Y, MAX_SUBSTEP, SKIN, LAYER_SPIKE, CELL,
    makeCollider, Grid, satBox, polyOverlapAABB, overlaps,
  };
})();
