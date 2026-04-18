/**
 * Effects — particle system, explosion rings, floating damage numbers,
 *           screen-shake, and water splash.
 * Pure rendering; no game-logic side-effects.
 */
class Effects {
  constructor() {
    this.particles = [];
    this.rings     = [];
    this.floats    = [];
    this._shake    = null;
  }

  // ── Triggers ────────────────────────────────────────────────────────────
  explosion(x, y, radius = 52) {
    this._shake = { str: 9, t: 0, dur: 0.35 };
    this.rings.push({ x, y, r: 0, maxR: radius * 1.4, t: 0, color: '#FFD700' });
    this.rings.push({ x, y, r: 0, maxR: radius * 0.7, t: 0.04, color: '#FF8800' });

    const COLS = ['#FF6B00','#FF3300','#FFD700','#FF9900','#FFF0AA','#FFCCAA'];
    for (let i = 0; i < 38; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 70 + Math.random() * 260;
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 55,
        life: 0.4 + Math.random() * 1.0, maxLife: 1.4,
        sz: 3 + Math.floor(Math.random() * 5),
        col: COLS[~~(Math.random() * COLS.length)], smoke: false,
      });
    }
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y - 5,
        vx: Math.cos(ang) * 30, vy: -45 - Math.random() * 55,
        life: 0.8 + Math.random() * 0.6, maxLife: 1.4,
        sz: 12 + Math.floor(Math.random() * 14), col: '#999', smoke: true,
      });
    }
  }

  splash(x, waterY) {
    for (let i = 0; i < 14; i++) {
      const ang = -Math.PI * 0.6 - Math.random() * Math.PI * 0.8;
      const spd = 40 + Math.random() * 120;
      this.particles.push({
        x, y: waterY,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 0.4 + Math.random() * 0.5, maxLife: 0.9,
        sz: 2 + Math.floor(Math.random() * 4), col: '#88CCFF', smoke: false,
      });
    }
  }

  floatText(text, x, y, col = '#FFFFFF') {
    this.floats.push({ text, x, y, vy: -55, life: 1.8, maxLife: 1.8, col });
  }

  // ── Update ──────────────────────────────────────────────────────────────
  update(dt) {
    this.particles = this.particles.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (!p.smoke) p.vy += 220 * dt;
      else          p.vy -= 15  * dt;
      p.life -= dt;
      return p.life > 0;
    });

    this.rings = this.rings.filter(r => {
      r.t += dt;
      r.r  = r.maxR * Math.min(1, (r.t - (r.delay ?? 0)) / 0.22);
      if (r.t < (r.delay ?? 0)) r.r = 0;
      return r.t < 0.50;
    });

    this.floats = this.floats.filter(f => {
      f.y += f.vy * dt;
      f.life -= dt;
      return f.life > 0;
    });

    if (this._shake) {
      this._shake.t += dt;
      if (this._shake.t >= this._shake.dur) this._shake = null;
    }
  }

  shakeOffset() {
    if (!this._shake) return { x: 0, y: 0 };
    const str = this._shake.str * (1 - this._shake.t / this._shake.dur);
    return {
      x: (Math.random() - 0.5) * str * 2,
      y: (Math.random() - 0.5) * str * 2,
    };
  }

  // ── Draw ────────────────────────────────────────────────────────────────
  draw(ctx) {
    // Particles
    for (const p of this.particles) {
      const a = Util.clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      if (p.smoke) {
        const s = Math.round(p.sz * (1 + (1 - a) * 0.6));
        ctx.fillStyle = `rgba(155,150,145,${a.toFixed(2)})`;
        ctx.fillRect(~~(p.x - s / 2), ~~(p.y - s / 2), s, s);
      } else {
        ctx.fillStyle = p.col;
        ctx.fillRect(~~(p.x - p.sz / 2), ~~(p.y - p.sz / 2), p.sz, p.sz);
      }
      ctx.restore();
    }

    // Explosion rings
    for (const r of this.rings) {
      if (r.r <= 0) continue;
      const a = Util.clamp(1 - r.t / 0.50, 0, 1);
      ctx.save();
      ctx.globalAlpha  = a;
      ctx.strokeStyle  = r.color;
      ctx.lineWidth    = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Floating text
    for (const f of this.floats) {
      const a = Util.clamp(f.life / f.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font        = 'bold 11px monospace';
      ctx.textAlign   = 'center';
      ctx.fillStyle   = '#000A';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle   = f.col;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }
}

window.Effects = Effects;
