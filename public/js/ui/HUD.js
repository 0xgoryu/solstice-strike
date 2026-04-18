/**
 * HUD — fixed-screen overlay.
 * Drawn AFTER camera.end() so it's always in screen space.
 * Never mixed with world objects.
 *
 * Layout (800×450):
 *   ┌─────────────────────────────────────────────────────┐
 *   │ [Timer box] top-left   [Wind bar] top-right         │
 *   │                                                     │
 *   │                   GAME WORLD                        │
 *   │                                                     │
 *   │ [Team HP strips] bottom           [Power bar]       │
 *   └─────────────────────────────────────────────────────┘
 */
class HUD {
  constructor(W, H) {
    this.W  = W;
    this.H  = H;
    // State updated by GameScene each frame
    this.timeLeft      = 30;
    this.wind          = 0;
    this.power         = 50;
    this.charging      = false;
    this.myTurn        = false;
    this.teams         = [];
    this.currentTeamIdx = 0;
    this.message       = null;
    this._msgTimer     = 0;
    this.phase         = 'waiting'; // waiting | moving | fired
  }

  showMessage(text, dur = 2.5) {
    this.message   = text;
    this._msgTimer = dur;
  }

  update(dt) {
    if (this._msgTimer > 0) this._msgTimer -= dt;
  }

  draw(ctx) {
    // ── Timer (top-left) ───────────────────────────────────────────────
    this._drawTimer(ctx);

    // ── Wind (top-right) ──────────────────────────────────────────────
    this._drawWind(ctx);

    // ── Team HP strips (bottom) ───────────────────────────────────────
    this._drawTeamBars(ctx);

    // ── Power bar (bottom-centre, only my turn) ───────────────────────
    if (this.myTurn && this.phase === 'moving') {
      this._drawPowerBar(ctx);
    }

    // ── Centre message ─────────────────────────────────────────────────
    if (this._msgTimer > 0 && this.message) {
      this._drawMessage(ctx);
    }
  }

  _drawTimer(ctx) {
    const bx = 10, by = 10, bw = 105, bh = 54;
    const team = this.teams[this.currentTeamIdx];
    const col  = team?.color ?? '#888';

    // Box
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = col;
    ctx.fillRect(bx, by, 4, bh); // left accent

    // Team name
    ctx.save();
    ctx.font      = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = col;
    ctx.fillText((team?.name ?? '???').toUpperCase().slice(0, 9), bx + 10, by + 14);

    // "YOUR TURN" badge
    if (this.myTurn) {
      ctx.fillStyle = '#FFD700';
      ctx.font      = 'bold 8px monospace';
      ctx.fillText('YOUR TURN', bx + 10, by + 26);
    }

    // Big seconds
    const urgent = this.timeLeft <= 8;
    ctx.font      = `bold ${urgent ? 28 : 24}px monospace`;
    ctx.fillStyle = urgent ? '#FF4444' : '#FFFFFF';
    ctx.fillText(String(this.timeLeft).padStart(2, '0'), bx + 10, by + 50);

    // "sec"
    ctx.font      = '8px monospace';
    ctx.fillStyle = '#667788';
    ctx.fillText('sec', bx + (urgent ? 50 : 44), by + 50);
    ctx.restore();
  }

  _drawWind(ctx) {
    const bw = 110, bh = 28;
    const bx = this.W - bw - 10, by = 10;

    ctx.fillStyle = 'rgba(0,0,0,0.80)';
    ctx.fillRect(bx, by, bw, bh);

    ctx.save();
    ctx.font      = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#667788';
    ctx.fillText('WIND', bx + 6, by + 12);

    // Bar track
    const bkX = bx + 36, bkY = by + 8, bkW = 56, bkH = 10;
    ctx.fillStyle = '#0A1828';
    ctx.fillRect(bkX - 1, bkY - 1, bkW + 2, bkH + 2);

    const mid = bkX + bkW / 2;
    if (this.wind !== 0) {
      ctx.fillStyle = this.wind < 0 ? '#4488FF' : '#FF8844';
      const w = Math.min(Math.abs(this.wind) * 12, bkW / 2);
      ctx.fillRect(this.wind < 0 ? mid - w : mid, bkY, w, bkH);
    }
    // Centre needle
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(mid - 1, bkY - 2, 2, bkH + 4);

    // Value
    ctx.fillStyle = '#CCDDEE';
    ctx.font      = '8px monospace';
    ctx.fillText(
      `${this.wind >= 0 ? '>' : '<'} ${Math.abs(this.wind).toFixed(1)}`,
      bkX + bkW + 4, by + 18,
    );
    ctx.restore();
  }

  _drawTeamBars(ctx) {
    const panH  = 28;
    const panY  = this.H - panH - 2;
    const cols  = this.teams.length;
    const colW  = Math.floor(this.W / cols);

    ctx.fillStyle = 'rgba(0,0,0,0.80)';
    ctx.fillRect(0, panY, this.W, panH + 2);

    this.teams.forEach((team, ti) => {
      const alive = team.cats.filter(c => c.alive);
      const tx    = ti * colW + 8;

      // Team colour + name
      ctx.save();
      ctx.font      = 'bold 8px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = team.color;
      ctx.fillText(team.name.toUpperCase().slice(0, 8), tx, panY + 12);

      // Individual HP bars
      team.cats.forEach((cat, ci) => {
        const barX  = tx + ci * 68;
        const barY  = panY + 16;
        const barW  = 62;
        const barH  = 7;

        // Track
        ctx.fillStyle = '#111';
        ctx.fillRect(barX, barY, barW, barH);

        if (cat.alive) {
          const pct = cat.hp / 100;
          ctx.fillStyle = pct > 0.5 ? '#44DD66' : pct > 0.25 ? '#FFCC00' : '#FF4444';
          ctx.fillRect(barX, barY, Math.round(barW * pct), barH);
        } else {
          // Dead — skull
          ctx.fillStyle = '#444';
          ctx.fillRect(barX, barY, barW, barH);
          ctx.fillStyle = '#888';
          ctx.fillText('☠', barX + barW / 2 - 4, panY + 26);
        }

        // Cat name tiny
        ctx.font      = '7px monospace';
        ctx.fillStyle = cat.alive ? '#CCC' : '#555';
        ctx.fillText(cat.label, barX, panY + 14);
      });

      // Active team indicator
      if (ti === this.currentTeamIdx) {
        ctx.fillStyle = team.color;
        ctx.fillRect(ti * colW, panY, 3, panH);
      }

      ctx.restore();
    });
  }

  _drawPowerBar(ctx) {
    const bW = 190, bH = 14;
    const bX = this.W / 2 - bW / 2;
    const bY = this.H - 58;

    // Panel bg
    ctx.fillStyle = 'rgba(0,0,0,0.90)';
    ctx.fillRect(bX - 12, bY - 22, bW + 24, bH + 32);

    // Label
    ctx.save();
    ctx.font      = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.charging ? '#FFD700' : '#6A9ACA';
    ctx.fillText(
      this.charging ? '▶ CHARGING...' : 'HOLD LEFT CLICK TO CHARGE & FIRE',
      this.W / 2, bY - 7,
    );

    // Track
    ctx.fillStyle = '#0A1828';
    ctx.fillRect(bX - 1, bY - 1, bW + 2, bH + 2);

    // Fill
    const pct = this.power / 100;
    ctx.fillStyle = pct < 0.35 ? '#44DD66' : pct < 0.70 ? '#FFCC00' : '#FF4444';
    ctx.fillRect(bX, bY, Math.round(bW * pct), bH);

    // Tick marks
    ctx.fillStyle = '#0A1828';
    [0.25, 0.5, 0.75].forEach(t => {
      ctx.fillRect(bX + Math.round(bW * t), bY, 2, bH);
    });

    // Value
    ctx.font      = 'bold 9px monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${Math.floor(this.power)}%`, this.W / 2, bY + 11);
    ctx.restore();
  }

  _drawMessage(ctx) {
    const a   = Util.clamp(this._msgTimer, 0, 1);
    const tw  = this.message.length * 8 + 30;
    const bx  = this.W / 2 - tw / 2;
    const by  = this.H * 0.40;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle   = 'rgba(0,0,0,0.90)';
    ctx.fillRect(bx, by - 2, tw, 26);
    ctx.fillStyle   = '#2A4A7A';
    ctx.fillRect(bx, by - 2, tw, 2);
    ctx.font        = 'bold 10px monospace';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = '#F0F0FF';
    ctx.fillText(this.message, this.W / 2, by + 17);
    ctx.restore();
  }

  /** Dotted aim trajectory preview (drawn in WORLD space before camera.end) */
  static drawAimPreview(ctx, muzzleX, muzzleY, angle, power, wind, terrain) {
    const spd = Math.max(8, power) * 7.2;
    let px = muzzleX, py = muzzleY;
    let pvx = Math.cos(angle) * spd;
    let pvy = Math.sin(angle) * spd;
    const dt = 0.04;

    for (let i = 0; i < 44; i++) {
      pvx += 55 * wind * dt;
      pvy += 300 * dt;
      px  += pvx * dt;
      py  += pvy * dt;
      if (px < 0 || px > terrain.W) break;
      if (py >= terrain.waterY)     break;
      if (py >= terrain.groundAt(px)) break;
      if (i % 3 === 0) {
        ctx.fillStyle = `rgba(255,255,255,${(0.65 - i * 0.013).toFixed(2)})`;
        ctx.fillRect(~~px - 1, ~~py - 1, 2, 2);
      }
    }
  }
}

window.HUD = HUD;
