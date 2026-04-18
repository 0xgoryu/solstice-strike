/**
 * Terrain — heightmap + canvas rendering + crater deformation.
 *
 * heights[x] = ground Y at column x (top surface of solid).
 * Anything above is air; at/below is solid.
 */
class Terrain {
  constructor(heights, W, H, waterY) {
    this.heights = Array.from(heights).map(Number);
    this.W       = W;
    this.H       = H;
    this.waterY  = waterY;
    this._dirty  = true;

    // Off-screen canvas for terrain body
    this._oc     = document.createElement('canvas');
    this._oc.width  = W;
    this._oc.height = H;
    this._octx   = this._oc.getContext('2d');

    this._redraw();
  }

  // ── Rendering ─────────────────────────────────────────────────────────
  _redraw() {
    const ctx = this._octx;
    const W = this.W, H = this.H, wY = this.waterY;
    ctx.clearRect(0, 0, W, H);

    const S = 2; // terrain pixel strip width
    for (let x = 0; x < W; x += S) {
      const gy = Math.floor(this.heights[x] ?? H * 0.6);

      // Grass cap (2px)
      ctx.fillStyle = '#4A8C3A';
      ctx.fillRect(x, gy,      S, 3);

      // Brighter grass highlight
      ctx.fillStyle = '#5DB348';
      ctx.fillRect(x, gy,      S, 1);

      // Topsoil
      ctx.fillStyle = '#8A5A2A';
      ctx.fillRect(x, gy + 3,  S, 10);

      // Deep dirt
      ctx.fillStyle = '#5C3818';
      ctx.fillRect(x, gy + 13, S, H - gy - 13);
    }

    // Water
    ctx.fillStyle = 'rgba(20,100,180,0.85)';
    ctx.fillRect(0, wY, W, H - wY);
    ctx.fillStyle = 'rgba(40,150,220,0.9)';
    ctx.fillRect(0, wY, W, 4);

    this._dirty = false;
  }

  draw(ctx) {
    if (this._dirty) this._redraw();
    ctx.drawImage(this._oc, 0, 0);

    // Animated water shimmer
    const t = Date.now() / 700;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#88CCFF';
    ctx.lineWidth   = 2;
    for (let x = 0; x < this.W; x += 28) {
      const wy = this.waterY + 2 + Math.sin(x * 0.08 + t) * 2.5;
      ctx.beginPath();
      ctx.moveTo(x, wy);
      ctx.lineTo(x + 14, wy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Queries ───────────────────────────────────────────────────────────
  groundAt(x) {
    const xi = Util.clamp(Math.round(x), 0, this.W - 1);
    const v  = this.heights[xi];
    return isFinite(v) ? v : this.H * 0.6;
  }

  isSolid(x, y) {
    if (y >= this.waterY) return true;
    return y >= this.groundAt(x);
  }

  /** Circular crater centred at (cx,cy) with radius r */
  deform(cx, cy, r) {
    const r2   = r * r;
    const xMin = Math.max(0,         Math.floor(cx - r));
    const xMax = Math.min(this.W - 1, Math.ceil(cx  + r));
    let   any  = false;
    for (let x = xMin; x <= xMax; x++) {
      const dx  = x - cx;
      const dy2 = r2 - dx * dx;
      if (dy2 < 0) continue;
      const bottom = cy + Math.sqrt(dy2);
      if (bottom > this.heights[x]) {
        this.heights[x] = Math.min(this.waterY - 8, bottom);
        any = true;
      }
    }
    if (any) this._dirty = true;
  }
}

window.Terrain = Terrain;
