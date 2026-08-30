/* ===========================================================================
 * bird.js - 1:1 port of Assets/Scripts/Bird.cs
 *
 * 14 instances, all in Map1 ("Birds"), each with a trigger BoxCollider2D.
 * Start()  : records startPosition and targetPosition = start + targetOffset
 * Update() : while flying, Vector3.MoveTowards(pos, target, flySpeed * dt)
 * OnTriggerEnter2D(player) : StartFlying() -> swaps to the flySprite
 * ResetBird(): back to startPosition + staySprite
 * ======================================================================== */

class Bird {
  constructor(cfg, spriteRecord, colliderRecord) {
    this.sprite = spriteRecord;
    this.collider = colliderRecord;

    this.startX = cfg.x;
    this.startY = cfg.y;
    this.targetX = cfg.x + cfg.ox;
    this.targetY = cfg.y + cfg.oy;
    this.flySpeed = cfg.speed;

    this.staySprite = Unity.sprites[cfg.stay];
    this.flySprite = Unity.sprites[cfg.fly];

    this.isFlying = false;
    if (colliderRecord) colliderRecord.bird = this;
    this.resetBird();
  }

  update(dt) {
    if (!this.isFlying) return;
    const p = Unity.moveTowards2(this.sprite.x, this.sprite.y,
                                 this.targetX, this.targetY,
                                 this.flySpeed * dt);
    this.setPos(p[0], p[1]);
  }

  setPos(x, y) {
    this.sprite.x = x;
    this.sprite.y = y;
    // the trigger collider rides along with the transform
    const c = this.collider;
    if (c) {
      const dx = x - c.cx, dy = y - c.cy;
      c.cx = x; c.cy = y;
      for (let i = 0; i < c.pts.length; i += 2) { c.pts[i] += dx; c.pts[i + 1] += dy; }
      c.minX += dx; c.maxX += dx; c.minY += dy; c.maxY += dy;
    }
  }

  startFlying() {
    if (this.isFlying) return;
    this.isFlying = true;
    if (this.flySprite && this.sprite) this.applySprite(this.flySprite);
  }

  resetBird() {
    this.isFlying = false;
    this.setPos(this.startX, this.startY);
    if (this.staySprite && this.sprite) this.applySprite(this.staySprite);
  }

  // Changing SpriteRenderer.sprite keeps the transform scale, so the rendered
  // size changes with the new sprite's rect - exactly like Unity.
  applySprite(desc) {
    const sp = this.sprite;
    sp.desc = desc;
    sp.guidIdx = desc.guid;          // tint cache key (guid string is fine)
    const hw = Math.abs(desc.worldW * sp.sx) * 0.5;
    const hh = Math.abs(desc.worldH * sp.sy) * 0.5;
    sp.hx = hw; sp.hy = hh;
  }
}
