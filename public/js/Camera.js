/**
 * Camera — 2D scroll camera.
 * Translates the canvas so the active cat stays visible.
 * Usage:
 *   camera.begin(ctx)   // push transform
 *   ... draw world objects ...
 *   camera.end(ctx)     // pop transform
 *   camera.worldToScreen(wx, wy) → {x,y}
 *   camera.screenToWorld(sx, sy) → {x,y}
 */
class Camera {
  constructor(viewW, viewH, worldW, worldH) {
    this.vW     = viewW;
    this.vH     = viewH;
    this.wW     = worldW;
    this.wH     = worldH;
    this.x      = 0;   // top-left corner in world space
    this.y      = 0;
    this._tx    = 0;   // smoothed
    this._ty    = 0;
  }

  /** Move camera so (wx,wy) is roughly centred */
  follow(wx, wy, dt = 0.016) {
    const tx  = Util.clamp(wx - this.vW / 2, 0, this.wW - this.vW);
    const ty  = Util.clamp(wy - this.vH / 2, 0, this.wH - this.vH);
    const spd = 6;
    this._tx  = Util.lerp(this._tx, tx, Math.min(1, spd * dt));
    this._ty  = Util.lerp(this._ty, ty, Math.min(1, spd * dt));
    this.x    = Math.round(this._tx);
    this.y    = Math.round(this._ty);
  }

  /** Snap to target immediately */
  snap(wx, wy) {
    this.x = this._tx = Util.clamp(wx - this.vW / 2, 0, this.wW - this.vW);
    this.y = this._ty = Util.clamp(wy - this.vH / 2, 0, this.wH - this.vH);
  }

  begin(ctx) {
    ctx.save();
    ctx.translate(-this.x, -this.y);
  }

  end(ctx) { ctx.restore(); }

  worldToScreen(wx, wy) { return { x: wx - this.x, y: wy - this.y }; }
  screenToWorld(sx, sy) { return { x: sx + this.x, y: sy + this.y }; }
}

window.Camera = Camera;
