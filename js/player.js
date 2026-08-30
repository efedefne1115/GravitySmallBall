/* ===========================================================================
 * player.js - 1:1 port of Assets/Scripts/PlayerController.cs
 *
 * Inspector values taken from the scene (GameObject "Twoxwoob", layer 7):
 *     moveSpeed          4      (overwritten by GameManager per level)
 *     gravityMagnitude   4
 *     spikeLayer         m_Bits 64  -> layer 6 ("Spike")
 *     flipSpriteOnGravity true
 *   Rigidbody2D: Dynamic, mass 1, drag 0, gravityScale 1 (code overrides),
 *                Interpolate, Continuous, FreezeRotation.
 *   BoxCollider2D: size (7.06, 6.10), offset (0,0), edgeRadius 0
 *                  transform scale 0.137718 -> world 0.97229 x 0.84008
 * ======================================================================== */

const PlayerState = { Idle: 0, WaitingToStart: 1, Playing: 2, Paused: 3 };

class PlayerController {
  constructor(spriteRecord, colliderRecord) {
    PlayerController.Instance = this;

    this.sprite = spriteRecord;            // the SpriteRenderer we move/flip
    this.baseFlipY = spriteRecord.flipY;   // scene value (0)

    const cfg = window.G5_CONFIG.player;
    this.moveSpeed = cfg.moveSpeed;                 // 4 in the scene
    this.gravityMagnitude = cfg.gravityMagnitude;   // 4
    this.flipSpriteOnGravity = cfg.flipSpriteOnGravity !== 0;

    // world-space half extents of the BoxCollider2D
    this.hw = Math.abs(colliderRecord.w * colliderRecord.sx) * 0.5;
    this.hh = Math.abs(colliderRecord.h * colliderRecord.sy) * 0.5;

    this.x = cfg.startPos[0];
    this.y = cfg.startPos[1];
    this.prevX = this.x; this.prevY = this.y;   // for Interpolate
    this.renderX = this.x; this.renderY = this.y;

    this.vx = 0; this.vy = 0;
    this.gravityScale = 0;
    this.isGravityDown = true;

    this.state = PlayerState.Idle;
    this.stateBeforePause = PlayerState.Playing;

    this.stuckTimer = 0;
    this.lastXPos = this.x;

    this.touching = new Set();   // collider ids we are already overlapping
    this._near = [];
  }

  get CurrentState() { return this.state; }

  // ------------------------------------------------------------------ Update
  update(dt) {
    switch (this.state) {
      case PlayerState.WaitingToStart:
        if (Input.getMouseButtonDown(0) && !Input.isPointerOverUI()) {
          this.state = PlayerState.Playing;
          this.applyGravity();
        }
        break;

      case PlayerState.Playing:
        if (Input.getMouseButtonDown(0) && !Input.isPointerOverUI()) {
          this.isGravityDown = !this.isGravityDown;
          this.applyGravity();
        }
        this.updateStuckCheck(dt);
        break;

      default: // Idle / Paused -> no input handled
        break;
    }
  }

  updateStuckCheck(dt) {
    const currentX = this.renderX;                    // transform.position.x
    const expectedMove = this.moveSpeed * dt;
    if ((currentX - this.lastXPos) < expectedMove * 0.1) {
      this.stuckTimer += dt;
      if (this.stuckTimer >= 1) {
        this.die();
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastXPos = currentX;
  }

  applyGravity() {
    this.gravityScale = this.isGravityDown ? this.gravityMagnitude : -this.gravityMagnitude;
    if (this.flipSpriteOnGravity && this.sprite) {
      this.sprite.flipY = !this.isGravityDown;
    }
  }

  // ------------------------------------------------------------- FixedUpdate
  fixedUpdate(dt) {
    this.prevX = this.x; this.prevY = this.y;

    if (this.state !== PlayerState.Playing) {
      // rb.gravityScale is 0 and linearVelocity is zeroed in every non-Playing
      // state, so the body simply does not move.
      return;
    }

    // PlayerController.FixedUpdate
    this.vx = this.moveSpeed;

    // Unity's integrator: v += gravity * gravityScale * dt ; p += v * dt
    this.vy += Physics2D.GRAVITY_Y * this.gravityScale * dt;

    const dx = this.vx * dt;
    const dy = this.vy * dt;

    // Continuous collision detection: split the move into small sub-steps.
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / Physics2D.MAX_SUBSTEP));
    const sdx = dx / steps, sdy = dy / steps;

    for (let s = 0; s < steps; s++) {
      this.x += sdx;
      this.y += sdy;
      this.resolve();
      if (this.state !== PlayerState.Playing) break;  // died mid-step
    }
  }

  // Static-collider resolution + the OnCollisionEnter2D / OnTriggerEnter2D
  // callbacks that PlayerController, LevelFinishZone and Bird rely on.
  resolve() {
    const pad = 0.05;
    const near = World.queryColliders(
      this.x - this.hw - pad, this.y - this.hh - pad,
      this.x + this.hw + pad, this.y + this.hh + pad, this._near);

    const stillTouching = new Set();

    // 1) solid response (only non-trigger, non-spike colliders exist as solids)
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (let i = 0; i < near.length; i++) {
        const c = near[i];
        if (!c.active || !c.solid || c.type !== 0) continue;
        const mtv = Physics2D.satBox(this.x, this.y, this.hw, this.hh, c);
        if (!mtv) continue;
        this.x += mtv.nx * mtv.depth;
        this.y += mtv.ny * mtv.depth;
        // kill the velocity component pushing into the surface
        const vn = this.vx * mtv.nx + this.vy * mtv.ny;
        if (vn < 0) { this.vx -= vn * mtv.nx; this.vy -= vn * mtv.ny; }
        moved = true;
      }
      if (!moved) break;
    }

    // 2) contacts / triggers
    for (let i = 0; i < near.length; i++) {
      const c = near[i];
      if (!c.active) continue;
      if (!Physics2D.overlaps(c, this.x, this.y, this.hw, this.hh)) continue;
      stillTouching.add(c);
      if (!this.touching.has(c)) this.onEnter(c);
    }
    this.touching = stillTouching;
  }

  onEnter(c) {
    // PlayerController.CheckSpikeCollision (spikeLayer == layer 6)
    if (c.layer === Physics2D.LAYER_SPIKE) { this.die(); return; }

    // LevelFinishZone.OnTriggerEnter2D
    if (c.finishId !== undefined) {
      if (GameManager.Instance) GameManager.Instance.onLevelFinished(c.finishId);
      return;
    }
    // Bird.OnTriggerEnter2D
    if (c.bird) c.bird.startFlying();
  }

  die() {
    if (this.state !== PlayerState.Playing) return;
    this.freezeImmediately();
    if (GameManager.Instance) GameManager.Instance.onPlayerDied();
  }

  // ---- API used by GameManager / MenuManager -----------------------------
  setMoveSpeed(s) { this.moveSpeed = s; }

  resetForNewAttempt(px, py) {
    this.state = PlayerState.Idle;
    this.x = px; this.y = py;
    this.prevX = px; this.prevY = py;
    this.renderX = px; this.renderY = py;
    this.vx = 0; this.vy = 0;
    this.gravityScale = 0;
    this.isGravityDown = true;
    if (this.flipSpriteOnGravity && this.sprite) this.sprite.flipY = false;
    this.stuckTimer = 0;
    this.lastXPos = px;
    this.touching.clear();
  }

  beginWaitingForInput() {
    this.state = PlayerState.WaitingToStart;
    this.vx = 0; this.vy = 0;
    this.gravityScale = 0;
  }

  freezeImmediately() {
    this.state = PlayerState.Idle;
    this.vx = 0; this.vy = 0;
    this.gravityScale = 0;
  }

  freezeAtLobby(px, py) {
    this.state = PlayerState.Idle;
    this.x = px; this.y = py;
    this.prevX = px; this.prevY = py;
    this.renderX = px; this.renderY = py;
    this.vx = 0; this.vy = 0;
    this.gravityScale = 0;
    this.isGravityDown = true;
    if (this.flipSpriteOnGravity && this.sprite) this.sprite.flipY = false;
    this.touching.clear();
  }

  pause() {
    if (this.state !== PlayerState.Playing && this.state !== PlayerState.WaitingToStart) return;
    this.stateBeforePause = this.state;
    this.state = PlayerState.Paused;
    this.vx = 0; this.vy = 0;
    this.gravityScale = 0;
  }

  resume() {
    if (this.state !== PlayerState.Paused) return;
    this.state = this.stateBeforePause;
    if (this.state === PlayerState.Playing) this.applyGravity();
    else this.gravityScale = 0;
  }

  // Rigidbody2D interpolation (rb.interpolation = Interpolate)
  syncRender(alpha) {
    this.renderX = this.prevX + (this.x - this.prevX) * alpha;
    this.renderY = this.prevY + (this.y - this.prevY) * alpha;
    if (this.sprite) { this.sprite.x = this.renderX; this.sprite.y = this.renderY; }
  }
}
PlayerController.Instance = null;
