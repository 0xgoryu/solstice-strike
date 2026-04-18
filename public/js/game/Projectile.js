/**
 * Projectile — spawns from muzzle, travels with physics, detects hits.
 *
 * Critical rules:
 *   1. x,y MUST start at getMuzzle() output (not cat centre).
 *   2. firedById = id of the cat that fired; ignored for first 0.15s.
 *   3. Explosion is reported to server by the FIRER only.
 *   4. All clients apply explosion visuals after server confirms.
 */
class Projectile {
  /**
   * @param {number}   x,y          Muzzle tip world coords
   * @param {number}   angle        Launch angle (radians)
   * @param {number}   power        0–100
   * @param {number}   wind         horizontal accel per unit
   * @param {string}   firedById    Cat ID that fired (for grace period)
   * @param {boolean}  isMyShot     True if local player fired this
   * @param {Image}    logoImg      Solstice logo (circular projectile)
   */
  constructor(x, y, angle, power, wind, firedById, isMyShot, logoImg) {
    const SPD = power * 7.2;
    this.x          = x;
    this.y          = y;
    this.vx         = Math.cos(angle) * SPD;
    this.vy         = Math.sin(angle) * SPD;
    this.wind       = wind;
    this.firedById  = firedById;
    this.isMyShot   = isMyShot;
    this.logoImg    = logoImg;

    this.active     = true;
    this.age        = 0;        // seconds since launch
    this.rotation   = 0;
    this.trail      = [];       // [{x,y}]

    // Reported state — set to 'exploded' when impact occurs
    this.exploded   = false;
  }

  // ── Update ─────────────────────────────────────────────────────────────
  update(dt, terrain) {
    if (!this.active) return;

    this.age += dt;
    // Gravity
    this.vy += 300 * dt;
    // Wind
    this.vx += 55 * this.wind * dt;
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.rotation += dt * 6;

    // Trail
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 22) this.trail.shift();

    // OOB
    if (this.x < -80 || this.x > terrain.W + 80) {
      this.active = false;
      return { miss: true };
    }

    // Water / below map
    if (this.y >= terrain.waterY) {
      this.active = false;
      return { hit: true, x: this.x, y: terrain.waterY };
    }

    // Terrain
    if (this.y >= terrain.groundAt(this.x)) {
      this.active = false;
      return { hit: true, x: this.x, y: terrain.groundAt(this.x) };
    }

    return null;
  }

  /**
   * Check if projectile overlaps any alive cat.
   * Ignores firedById for first 0.15s (grace period).
   * @param {Cat[]} cats
   * @returns {Cat|null}
   */
  checkCatHit(cats) {
    if (!this.active) return null;
    for (const cat of cats) {
      if (!cat.alive) continue;
      if (this.age < 0.15 && cat.id === this.firedById) continue;
      // Hit box: 20px around body centre
      const bodyY = cat.y - 20;
      const d2    = Util.dist2(this.x, this.y, cat.x, bodyY);
      if (d2 < 20 * 20) {
        this.active = false;
        return cat;
      }
    }
    return null;
  }

  // ── Render ─────────────────────────────────────────────────────────────
  draw(ctx) {
    if (!this.active && !this.exploded) return;
    if (!this.active) return;

    const R = 10;

    // Pixel trail
    for (let i = 1; i < this.trail.length; i++) {
      const a  = (i / this.trail.length) * 0.75;
      const sz = Math.max(1, Math.round((i / this.trail.length) * 7));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle   = i > this.trail.length * 0.7 ? '#FF9900' : '#FF5500';
      ctx.fillRect(
        Math.round(this.trail[i].x) - ~~(sz / 2),
        Math.round(this.trail[i].y) - ~~(sz / 2),
        sz, sz,
      );
      ctx.restore();
    }

    // Solstice logo — circular clip + spin
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    ctx.rotate(this.rotation);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.clip();
    if (this.logoImg?.complete && this.logoImg.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.logoImg, -R, -R, R * 2, R * 2);
    } else {
      // Fallback: white/black circle resembling the logo
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(-2, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Gold ring
    ctx.save();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(Math.round(this.x), Math.round(this.y), R + 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

window.Projectile = Projectile;
