/**
 * HUD — fixed screen-space overlay for 1280×720.
 * Never mixed with world objects. Drawn after camera.end().
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ [Timer+Team] top-left              [Wind bar] top-right      │
 *   │                                                              │
 *   │                      GAME WORLD                              │
 *   │                                                              │
 *   │         [Power bar bottom-centre, my turn only]              │
 *   │ [Team HP panel] bottom                                       │
 *   └──────────────────────────────────────────────────────────────┘
 */
class HUD {
  constructor(W, H) {
    this.W = W;  // 1280
    this.H = H;  // 720

    this.timeLeft       = 30;
    this.wind           = 0;
    this.power          = 50;
    this.charging       = false;
    this.myTurn         = false;
    this.teams          = [];
    this.currentTeamIdx = 0;
    this.phase          = 'waiting';
    this._msg           = null;
    this._msgT          = 0;
  }

  showMessage(text, dur = 2.2) { this._msg = text; this._msgT = dur; }

  update(dt) { if (this._msgT > 0) this._msgT -= dt; }

  draw(ctx) {
    this._drawTimer(ctx);
    this._drawWind(ctx);
    this._drawTeamPanel(ctx);
    if (this.myTurn && this.phase === 'moving') this._drawPowerBar(ctx);
    if (this._msgT > 0 && this._msg) this._drawMessage(ctx);
  }

  // ── Turn timer (top-left) ─────────────────────────────────────────────
  _drawTimer(ctx) {
    const BX = 16, BY = 16, BW = 210, BH = 88;
    const team = this.teams[this.currentTeamIdx];
    const col  = team?.color ?? '#888888';

    ctx.save();
    // Panel shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    Util.fillRoundRect(ctx, BX+3, BY+3, BW, BH, 6, 'rgba(0,0,0,0.4)');
    // Panel bg
    Util.fillRoundRect(ctx, BX, BY, BW, BH, 6, 'rgba(5,10,22,0.90)');
    // Left colour stripe
    ctx.fillStyle = col;
    ctx.fillRect(BX, BY, 5, BH);
    ctx.beginPath();
    ctx.arc(BX + 5, BY + BH/2, 2.5, Math.PI/2*3, Math.PI/2);
    ctx.fill();
    // Top glow line
    ctx.strokeStyle = col + '88';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(BX+5, BY+1); ctx.lineTo(BX+BW, BY+1); ctx.stroke();

    // Team name
    ctx.font      = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = col;
    ctx.fillText((team?.name ?? '???').toUpperCase().slice(0,9), BX + 18, BY + 22);

    // YOUR TURN badge
    if (this.myTurn) {
      ctx.font      = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#FFD700';
      ctx.fillText('YOUR TURN', BX + 18, BY + 38);
    }

    // Seconds (large)
    const urgent = this.timeLeft <= 8;
    if (urgent) {
      ctx.shadowColor = '#FF3333';
      ctx.shadowBlur  = 16;
    }
    ctx.font      = `bold ${urgent ? 50 : 44}px "Orbitron", monospace`;
    ctx.fillStyle = urgent ? '#FF4444' : '#FFFFFF';
    ctx.fillText(String(this.timeLeft).padStart(2, '0'), BX + 18, BY + BH - 10);

    ctx.font      = '9px monospace';
    ctx.fillStyle = '#5577AA';
    ctx.fillText('sec', BX + (urgent ? 88 : 78), BY + BH - 10);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // ── Wind bar (top-right) ─────────────────────────────────────────────
  _drawWind(ctx) {
    const BW = 220, BH = 60;
    const BX = this.W - BW - 16, BY = 16;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    Util.fillRoundRect(ctx, BX+3, BY+3, BW, BH, 6, 'rgba(0,0,0,0.4)');
    Util.fillRoundRect(ctx, BX, BY, BW, BH, 6, 'rgba(5,10,22,0.90)');

    ctx.font      = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5577AA';
    ctx.fillText('WIND', BX + 12, BY + 20);

    // Direction icon
    const dir = this.wind === 0 ? '↔' : this.wind > 0 ? '→' : '←';
    ctx.font      = '14px monospace';
    ctx.fillStyle = Math.abs(this.wind) > 1.5 ? '#FF8844' : '#AACCEE';
    ctx.fillText(dir, BX + 64, BY + 22);

    // Bar track
    const BkX = BX + 12, BkY = BY + 32, BkW = BW - 24, BkH = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    Util.fillRoundRect(ctx, BkX, BkY, BkW, BkH, 3, 'rgba(0,0,0,0.6)');

    const mid = BkX + BkW / 2;
    if (this.wind !== 0) {
      const wFill = Math.min(Math.abs(this.wind) / 3 * BkW/2, BkW/2);
      const wCol  = this.wind < 0 ? '#4488FF' : '#FF8844';
      const fillX = this.wind < 0 ? mid - wFill : mid;
      ctx.fillStyle = wCol;
      Util.fillRoundRect(ctx, fillX, BkY, wFill, BkH, 2, wCol);
    }

    // Centre needle
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(mid - 1, BkY - 3, 2, BkH + 6);

    // Value text
    ctx.font      = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#CCDDEE';
    ctx.fillText(`${Math.abs(this.wind).toFixed(1)} m/s`, BX + BW - 10, BY + BH - 10);
    ctx.restore();
  }

  // ── Team HP panel (bottom) ────────────────────────────────────────────
  _drawTeamPanel(ctx) {
    const PH = 52;
    const PY = this.H - PH - 4;

    ctx.save();
    // Panel bg
    ctx.fillStyle = 'rgba(3,6,14,0.92)';
    ctx.fillRect(0, PY, this.W, PH + 4);
    // Top border line
    ctx.strokeStyle = 'rgba(40,70,130,0.6)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, PY); ctx.lineTo(this.W, PY); ctx.stroke();

    const cols = this.teams.length;
    const colW = Math.floor(this.W / cols);

    this.teams.forEach((team, ti) => {
      const tx   = ti * colW;
      const isActive = ti === this.currentTeamIdx;

      // Active team highlight
      if (isActive) {
        ctx.fillStyle = team.color + '1A';
        ctx.fillRect(tx, PY, colW, PH + 4);
        ctx.fillStyle = team.color;
        ctx.fillRect(tx, PY, colW, 2);
      }

      // Divider between teams
      if (ti > 0) {
        ctx.strokeStyle = 'rgba(40,70,130,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tx, PY+4); ctx.lineTo(tx, PY+PH); ctx.stroke();
      }

      // Team name
      ctx.font      = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = isActive ? team.color : 'rgba(180,200,230,0.6)';
      ctx.fillText(team.name.toUpperCase().slice(0, 8), tx + 12, PY + 16);

      // Per-cat HP bars
      team.cats.forEach((cat, ci) => {
        const barX = tx + 12 + ci * Math.floor((colW - 28) / 2);
        const barW = Math.floor((colW - 36) / 2);
        const barY = PY + 24;
        const barH = 10;

        // Cat name tiny
        ctx.font      = '7px monospace';
        ctx.fillStyle = cat.alive ? '#99AACC' : '#445566';
        ctx.fillText(cat.label, barX, barY - 1);

        // Track
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        Util.fillRoundRect(ctx, barX, barY, barW, barH, 2, 'rgba(0,0,0,0.7)');

        if (cat.alive) {
          const pct = cat.hp / 100;
          const barCol = pct > 0.55 ? '#44DD66' : pct > 0.28 ? '#FFCC00' : '#FF4444';
          // Glow on low HP
          if (pct < 0.28) { ctx.shadowColor = '#FF4444'; ctx.shadowBlur = 6; }
          ctx.fillStyle = barCol;
          Util.fillRoundRect(ctx, barX, barY, Math.round(barW * pct), barH, 2, barCol);
          ctx.shadowBlur = 0;

          // HP number inside bar
          ctx.font      = '8px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#FFF';
          ctx.fillText(cat.hp, barX + barW/2, barY + barH - 1);
        } else {
          // Dead
          ctx.font      = '9px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#445566';
          ctx.fillText('☠', barX + barW/2, barY + barH);
        }
        ctx.textAlign = 'left';
      });
    });

    ctx.restore();
  }

  // ── Power bar (bottom-centre, my turn only) ───────────────────────────
  _drawPowerBar(ctx) {
    const BW = 360, BH = 22;
    const BX = this.W/2 - BW/2;
    const BY = this.H - 100;

    ctx.save();

    // Panel
    const pBW = BW + 40, pBH = BH + 48;
    const pBX = this.W/2 - pBW/2, pBY = BY - 26;
    Util.fillRoundRect(ctx, pBX+3, pBY+3, pBW, pBH, 8, 'rgba(0,0,0,0.4)');
    Util.fillRoundRect(ctx, pBX, pBY, pBW, pBH, 8, 'rgba(3,7,18,0.94)');
    ctx.strokeStyle = 'rgba(40,70,130,0.5)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.roundRect(pBX+.5,pBY+.5,pBW,pBH,8); ctx.stroke();

    // Label
    ctx.font      = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.charging ? '#FFD700' : 'rgba(100,140,200,0.75)';
    ctx.fillText(
      this.charging ? '▶  CHARGING...' : 'HOLD LEFT CLICK TO CHARGE',
      this.W/2, BY - 8,
    );

    // Track
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    Util.fillRoundRect(ctx, BX-1, BY-1, BW+2, BH+2, 4, 'rgba(0,0,0,0.7)');

    // Fill gradient
    const pct = this.power / 100;
    const fCol = pct < 0.35 ? '#44DD66' : pct < 0.70 ? '#FFCC00' : '#FF4444';
    const fg = ctx.createLinearGradient(BX, BY, BX + BW, BY);
    fg.addColorStop(0, fCol + 'CC');
    fg.addColorStop(1, fCol);
    if (pct > 0) {
      Util.fillRoundRect(ctx, BX, BY, Math.round(BW * pct), BH, 3, '#00000000');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.roundRect(BX, BY, Math.round(BW*pct), BH, 3); ctx.fill();
    }

    // Shimmer highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    if (pct > 0) {
      ctx.beginPath(); ctx.roundRect(BX, BY, Math.round(BW*pct), BH*0.45, 3); ctx.fill();
    }

    // Tick marks at 25/50/75
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    [0.25, 0.5, 0.75].forEach(t => {
      ctx.fillRect(BX + Math.round(BW*t) - 1, BY, 2, BH);
    });

    // Value
    ctx.font      = 'bold 13px "Orbitron", monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${Math.floor(this.power)}%`, this.W/2, BY + BH - 4);

    ctx.restore();
  }

  // ── Centre message ─────────────────────────────────────────────────────
  _drawMessage(ctx) {
    const a   = Util.clamp(this._msgT, 0, 1);
    const msg = this._msg;
    const tw  = msg.length * 11 + 40;
    const BX  = this.W/2 - tw/2;
    const BY  = this.H * 0.38;
    ctx.save();
    ctx.globalAlpha = a;
    Util.fillRoundRect(ctx, BX, BY, tw, 36, 6, 'rgba(0,0,0,0.92)');
    ctx.strokeStyle = 'rgba(232,120,32,0.6)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath(); ctx.roundRect(BX+.5,BY+.5,tw,36,6); ctx.stroke();
    ctx.font        = '11px "Press Start 2P", monospace';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = '#F0F0FF';
    ctx.fillText(msg, this.W/2, BY + 23);
    ctx.restore();
  }

  // ── Aim trajectory dots (world space — called before camera.end) ───────
  static drawAimPreview(ctx, muzzleX, muzzleY, angle, power, wind, terrain) {
    const spd = Math.max(8, power) * 7.2;
    let px = muzzleX, py = muzzleY;
    let pvx = Math.cos(angle) * spd, pvy = Math.sin(angle) * spd;
    const dt = 0.04;

    for (let i = 0; i < 50; i++) {
      pvx += 55 * wind * dt;
      pvy += 300 * dt;
      px  += pvx * dt;
      py  += pvy * dt;
      if (px < 0 || px > terrain.W) break;
      if (py >= terrain.waterY)      break;
      if (py >= terrain.groundAt(px)) break;
      if (i % 3 === 0) {
        const a = Math.max(0, 0.7 - i * 0.012);
        const r = Math.max(1, Math.round(3 - i * 0.04));
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
        ctx.fillRect(~~px - r, ~~py - r, r*2, r*2);
      }
    }
  }
}

window.HUD = HUD;
