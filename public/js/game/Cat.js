/**
 * Cat — game entity.
 *
 * State machine:  idle → walk → aim → hit → dead
 * Rendering:      tries repo sprite sheets; falls back to pixel-art drawing.
 *
 * Coordinate system:
 *   (x, y) = foot position (bottom-centre of sprite, on the ground).
 *
 * Facing:
 *   facing = +1  →  right (default for team 0, 2)
 *   facing = -1  →  left  (default for team 1, 3)
 *   Sprite is drawn with ctx.scale(facing, 1).
 *   NEVER manually flip x-position; only use scale.
 *
 * Weapon / muzzle:
 *   The bazooka tube is drawn relative to the cat's body.
 *   getMuzzle() returns the world-space tip of the barrel — the
 *   projectile MUST start from that point.
 */

// ── Pixel-art fallback sprite (side-view, 8×12 grid, each cell = P px) ──
const CAT_PX = {
  SPRITE: [
    //01234567
    '###.....',  // 0 ear
    '###.....',  // 1 ear
    '########',  // 2 head top
    '########',  // 3 head
    '#b#####e',  // 4 belly + eye (col 7, near snout on right)
    '########',  // 5 cheek
    '.######.',  // 6 jaw
    '..####..',  // 7 snout
    '.#######',  // 8 neck + body
    '########',  // 9 body
    '########',  // 10 body lower
    '.##..##.',  // 11 feet
  ],
  PALETTES: [
    { '#': '#C86020', b: '#F0A060', e: '#1A0600' }, // orange
    { '#': '#3870B0', b: '#80B0E0', e: '#0A1828' }, // blue
    { '#': '#3A8830', b: '#7EC870', e: '#0A1E08' }, // green
    { '#': '#B89010', b: '#E8D060', e: '#221800' }, // gold
  ],
};
const PX_P   = 4;    // pixels per sprite cell
const PX_W   = CAT_PX.SPRITE[0].length * PX_P;   // 32
const PX_H   = CAT_PX.SPRITE.length    * PX_P;   // 48

// Asset paths — edit to match your repo's actual filenames
// Pattern: /assets/cats/cat{n}/{state}.png
const CAT_ASSET = (n, state) => `/assets/cats/cat${n + 1}/${state}.png`;
const FRAME_CFG = { fw: 48, fh: 48, idle: 4, walk: 6, aim: 2, hit: 4 };

class Cat {
  /**
   * @param {object} data      server data: { id, label, x, y, hp, alive }
   * @param {object} teamData  { color, teamIdx, playerId }
   * @param {boolean} isMine
   */
  constructor(data, teamData, isMine) {
    this.id       = data.id;
    this.label    = data.label;
    this.x        = data.x;
    this.y        = data.y;          // foot Y
    this.hp       = data.hp;
    this.alive    = data.alive;

    this.teamIdx  = teamData.teamIdx;
    this.color    = teamData.color;
    this.isMine   = isMine;

    // Facing: teams 0,2 start on left → face right (+1)
    //         teams 1,3 start on right → face left (-1)
    this.facing   = (teamData.teamIdx % 2 === 0) ? 1 : -1;

    // State machine
    this.state    = 'idle';
    this._prevState = null;

    // Aim angle (radians, relative to RIGHT horizon)
    this.aimAngle = (this.facing > 0) ? -Math.PI * 0.28 : -Math.PI * 0.72;

    // Physics
    this.vx = 0;
    this.vy = 0;
    this._onGround = true;

    // Hurt flash
    this._hurtTimer = 0;

    // Animations (try loading real sprites; fallback to pixel art)
    const n = teamData.teamIdx % 4;
    this._sprites = {};
    for (const [anim, frames] of Object.entries({ idle: FRAME_CFG.idle, walk: FRAME_CFG.walk, aim: FRAME_CFG.aim, hit: FRAME_CFG.hit })) {
      this._sprites[anim] = new SpriteSheet(
        CAT_ASSET(n, anim),
        FRAME_CFG.fw, FRAME_CFG.fh,
        frames,
        anim === 'walk' ? 10 : 8,
      );
    }

    // Palette for pixel-art fallback
    this._pal = CAT_PX.PALETTES[teamData.teamIdx % CAT_PX.PALETTES.length];
  }

  // ── Update ─────────────────────────────────────────────────────────────
  update(dt, terrain) {
    if (!this.alive) return;

    // Update sprite animation
    const sp = this._sprites[this.state] ?? this._sprites.idle;
    sp?.update(dt);

    // Hurt flash timer
    if (this._hurtTimer > 0) this._hurtTimer -= dt;

    // Gravity (only if somehow airborne — e.g., terrain deformed beneath)
    if (!this._onGround) {
      this.vy += 400 * dt;
      this.y  += this.vy * dt;
      this.x  += this.vx * dt;
    }

    // Snap to ground
    const gy = terrain.groundAt(this.x);
    if (this.y >= gy) {
      this.y         = gy;
      this.vy        = 0;
      this.vx        = 0;
      this._onGround = true;
    } else {
      this._onGround = false;
    }

    // Fall off map
    if (this.y > terrain.waterY + 20 || this.x < -60 || this.x > terrain.W + 60) {
      this.alive = false;
      this.state = 'dead';
    }
  }

  // ── Setters for state ──────────────────────────────────────────────────
  setState(s) {
    if (this.state !== s) {
      this._prevState = this.state;
      this.state = s;
      const sp = this._sprites[s];
      if (sp) { sp.frame = 0; sp.elapsed = 0; }
    }
  }

  hurt(dmg) {
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp <= 0) {
      this.alive = false;
      this.setState('dead');
    } else {
      this._hurtTimer = 0.5;
      this.setState('hit');
    }
  }

  jump() {
    if (!this._onGround) return;
    this.vy = -340;
    this._onGround = false;
  }

  // ── Weapon / muzzle ───────────────────────────────────────────────────
  /**
   * Returns muzzle tip in world coords.
   * The weapon shoulder is offset from body centre.
   * Tube length = 22px.
   */
  getMuzzle() {
    const TUBE  = 24;
    const shX   = this.x + this.facing * 10;
    const shY   = this.y - 26;            // shoulder height
    return {
      x: shX + Math.cos(this.aimAngle) * TUBE,
      y: shY + Math.sin(this.aimAngle) * TUBE,
      shoulderX: shX,
      shoulderY: shY,
    };
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  draw(ctx, isActive, showWeapon) {
    if (!this.alive) return;

    const x = Math.round(this.x);
    const y = Math.round(this.y);

    // Active glow
    if (isActive) {
      ctx.save();
      ctx.globalAlpha = 0.20 + Math.sin(Date.now() * 0.005) * 0.10;
      ctx.fillStyle   = this.color;
      ctx.fillRect(x - 20, y - PX_H - 6, 40, PX_H + 6);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Try drawing real sprite
    const sp      = this._sprites[this.state] ?? this._sprites.idle;
    const hurt    = this._hurtTimer > 0 && Math.floor(this._hurtTimer * 12) % 2 === 0;

    if (hurt) { ctx.save(); ctx.globalAlpha = 0.35; }

    const drew = sp?.draw(ctx, x, y, this.facing);

    if (hurt) ctx.restore();

    // Pixel-art fallback if sprite not loaded
    if (!drew) this._drawPixelArt(ctx, x, y, hurt);

    // Weapon tube (only for active cat during aiming/my-turn)
    if (showWeapon) this._drawWeapon(ctx, x, y);

    // Name + HP above sprite
    this._drawLabel(ctx, x, y, isActive);
  }

  _drawPixelArt(ctx, cx, cy, hurt) {
    const P   = PX_P;
    const pal = this._pal;
    const ox  = cx - Math.floor(PX_W / 2);
    const oy  = cy - PX_H;

    ctx.save();
    if (this.facing < 0) {
      ctx.translate(cx * 2, 0);
      ctx.scale(-1, 1);
    }

    for (let r = 0; r < CAT_PX.SPRITE.length; r++) {
      for (let c = 0; c < CAT_PX.SPRITE[r].length; c++) {
        let ch = CAT_PX.SPRITE[r][c];
        if (ch === '.') continue;
        if (this.state === 'dead' && ch === 'e') ch = 'x';
        let color = hurt ? '#FFF' : (pal[ch] ?? pal['#']);
        if (ch === 'x') color = '#FF2222';
        ctx.fillStyle = color;
        ctx.fillRect(ox + c * P, oy + r * P, P, P);
      }
    }
    ctx.restore();
  }

  _drawWeapon(ctx, cx, cy) {
    const TUBE  = 24;
    const shX   = cx + this.facing * 10;
    const shY   = cy - 26;

    ctx.save();
    ctx.translate(shX, shY);
    ctx.rotate(this.aimAngle);

    // Tube body
    ctx.fillStyle = '#3A3A3A';
    ctx.fillRect(0, -3, TUBE,     6);
    // Highlight
    ctx.fillStyle = '#555555';
    ctx.fillRect(0, -3, TUBE,     2);
    // Muzzle cap
    ctx.fillStyle = '#222';
    ctx.fillRect(TUBE - 4, -4,   5, 8);
    // Grip
    ctx.fillStyle = '#6A2E08';
    ctx.fillRect(6, 2,   8, 7);

    ctx.restore();
  }

  _drawLabel(ctx, cx, cy, isActive) {
    const lx = cx;
    const ly = cy - PX_H - 10;

    // Floating pulsing arrow on active cat
    if (isActive) {
      const pulse  = 0.7 + 0.3 * Math.sin(Date.now() * 0.007);
      const arrowY = ly - 8 + Math.sin(Date.now() * 0.006) * 3;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle   = '#FFD700';
      ctx.beginPath();
      ctx.moveTo(lx - 6, arrowY - 8);
      ctx.lineTo(lx + 6, arrowY - 8);
      ctx.lineTo(lx,     arrowY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Name
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = 'bold 9px monospace';
    ctx.fillStyle = '#0009';
    ctx.fillText(this.label, lx + 1, ly + 1);
    ctx.fillStyle = isActive ? '#FFD700' : this.color;
    ctx.fillText(this.label, lx, ly);

    // HP
    ctx.font      = 'bold 9px monospace';
    ctx.fillStyle = '#0009';
    ctx.fillText(this.hp,  lx + 1, ly + 12);
    ctx.fillStyle = this.hp > 50 ? '#88FF88' : this.hp > 25 ? '#FFCC44' : '#FF5555';
    ctx.fillText(this.hp,  lx, ly + 11);
    ctx.restore();
  }
}

window.Cat = Cat;
