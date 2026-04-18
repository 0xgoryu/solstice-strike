/**
 * GameScene — the main gameplay scene.
 *
 * ┌─────────────────── PHASE / STATE ──────────────────────┐
 * │  waiting   → server hasn't sent turnStart yet          │
 * │  moving    → my turn: can move, aim, charge+fire       │
 * │  watching  → opponent's turn: show their actions       │
 * │  fired     → projectile in flight (blocking)           │
 * │  gameover  → victory/defeat screen                     │
 * └────────────────────────────────────────────────────────┘
 *
 * Rendering layers (back → front):
 *   1. Sky / background image
 *   2. Terrain (world space, inside camera transform)
 *   3. Cats (world space)
 *   4. Aim preview dots (world space, my turn only)
 *   5. Projectile (world space)
 *   6. Effects / particles (world space)
 *   7. ---- camera.end() ----
 *   8. HUD (screen space — timer, wind, HP bars, power bar)
 *   9. Message overlays
 */
class GameScene {
  constructor(engine, data) {
    this.engine   = engine;
    this.W        = engine.W;
    this.H        = engine.H;
    this.myId     = data.myId;

    // ── Parse server game state ─────────────────────────────────────────
    const gs = data.gs;
    this.worldW   = gs.W;
    this.worldH   = gs.H;
    this.waterY   = gs.waterY;

    // Terrain
    this.terrain  = new Terrain(gs.terrain, gs.W, gs.H, gs.waterY);

    // Camera
    this.camera   = new Camera(this.W, this.H, gs.W, gs.H);

    // Build Cat entities
    this.teams    = gs.teams.map(t => ({
      ...t,
      cats: t.cats.map(cd => new Cat(
        cd,
        { color: t.color, teamIdx: t.teamIdx, playerId: t.playerId },
        t.playerId === this.myId,
      )),
    }));

    // Effects
    this.effects  = new Effects();

    // HUD
    this.hud      = new HUD(this.W, this.H);
    this.hud.teams = this.teams;

    // Projectile (null when not active)
    this.projectile = null;

    // Solstice logo for projectile
    this._solImg = new Image();
    this._solImg.src = '/assets/solstice.png';

    // Background image
    this._bgImg = new Image();
    this._bgImg.src = '/assets/map/background.png';
    this._bgLoaded = false;
    this._bgImg.onload  = () => { this._bgLoaded = true; };
    this._bgImg.onerror = () => {};

    // Turn state
    this.phase            = 'waiting';
    this.currentTeamIdx   = 0;
    this.isMyTurn         = false;
    this.wind             = 0;
    this.turnTimeLeft     = 30;
    this._turnInterval    = null;
    this._activeCatId     = null;

    // Aim & charge (my turn only)
    this.aimAngle  = -Math.PI * 0.3;
    this.power     = 50;
    this.charging  = false;
    this.chargeDir = 1;
    this._mouseDown = false;

    // Game over
    this._winner   = null;
    this._gameoverT = 0;

    // Network move throttle
    this._lastMoveSent = 0;

    this._bindNet();

    // Snap camera to first cat
    const firstCat = this.teams[0]?.cats[0];
    if (firstCat) this.camera.snap(firstCat.x, firstCat.y);
  }

  // ════════════════════════════════════════════════════════════════
  //  NETWORK
  // ════════════════════════════════════════════════════════════════
  _bindNet() {
    const unsubs = [];

    unsubs.push(Net.on('turnStart', ({ teamIdx, playerId, wind, timeLeft }) => {
      this.currentTeamIdx = teamIdx;
      this.isMyTurn       = playerId === this.myId;
      this.wind           = wind;
      this.turnTimeLeft   = timeLeft;
      this.phase          = this.isMyTurn ? 'moving' : 'watching';
      this.charging       = false;
      this.power          = 50;
      this._mouseDown     = false;

      const team = this.teams[teamIdx];
      const cat  = team?.cats.find(c => c.alive);
      this._activeCatId = cat?.id ?? null;

      if (cat) {
        // Aim: point toward centre of map from cat's side
        this.aimAngle = (team.teamIdx % 2 === 0)
          ? -Math.PI * 0.28
          : -Math.PI * 0.72;
        cat.setState('aim');
        cat.facing = (team.teamIdx % 2 === 0) ? 1 : -1;
      }

      this.hud.wind         = wind;
      this.hud.timeLeft     = timeLeft;
      this.hud.currentTeamIdx = teamIdx;
      this.hud.myTurn       = this.isMyTurn;
      this.hud.phase        = this.phase;
      this.hud.showMessage(
        this.isMyTurn ? '🎯 YOUR TURN' : `${team?.name?.toUpperCase() ?? '?'} TURN`,
        1.8,
      );

      // Client-side countdown
      clearInterval(this._turnInterval);
      this._turnInterval = setInterval(() => {
        this.turnTimeLeft    = Math.max(0, this.turnTimeLeft - 1);
        this.hud.timeLeft    = this.turnTimeLeft;
        if (this.turnTimeLeft === 0) {
          clearInterval(this._turnInterval);
          if (this.isMyTurn && this.phase === 'moving') this._doFire();
        }
      }, 1000);

      // Camera: follow the active cat
      if (cat) this.camera.follow(cat.x, cat.y, 0.1);
    }));

    // Server broadcasts the weapon-fired event to ALL clients (including firer)
    unsubs.push(Net.on('weaponFired', ({ teamIdx, angle, power, wind }) => {
      const team = this.teams[teamIdx];
      const cat  = this._activeCatId
        ? team?.cats.find(c => c.id === this._activeCatId && c.alive)
        : team?.cats.find(c => c.alive);
      if (!cat) return;

      cat.setState('aim');
      cat.aimAngle = angle;

      const muzzle = cat.getMuzzle();
      const isMyShot = team.playerId === this.myId;

      this.projectile = new Projectile(
        muzzle.x, muzzle.y,
        angle, power, wind,
        cat.id, isMyShot,
        this._solImg,
      );
      this.phase      = 'fired';
      this.hud.phase  = 'fired';
    }));

    // Opponent cat movement relay
    unsubs.push(Net.on('catMoved', ({ teamIdx, x, y, dir }) => {
      const team = this.teams[teamIdx];
      const cat  = team?.cats.find(c => c.alive);
      if (cat) { cat.x = x; cat.y = y; cat.facing = dir; cat.setState('walk'); }
    }));

    // Server-validated explosion result (applied on ALL clients)
    unsubs.push(Net.on('explosionResult', ({ x, y, damages }) => {
      // Deform terrain
      this.terrain.deform(x, y, 52);
      this.effects.explosion(x, y, 52);

      // Apply damage
      (damages ?? []).forEach(({ catId, damage }) => {
        const result = this._findCat(catId);
        if (!result) return;
        const { cat } = result;
        const prev = cat.hp;
        cat.hurt(damage);
        this.effects.floatText(`-${damage}`, cat.x, cat.y - 56, '#FF4444');
        if (!cat.alive) {
          this.effects.floatText('☠ KO', cat.x, cat.y - 72, '#FF2222');
        }
      });

      // Re-snap all cats to updated terrain
      setTimeout(() => this._snapAllCats(), 280);

      this.phase     = 'waiting';
      this.hud.phase = 'waiting';
      this.projectile = null;
    }));

    unsubs.push(Net.on('catKilled', ({ catId }) => {
      const result = this._findCat(catId);
      if (result) {
        result.cat.hp    = 0;
        result.cat.alive = false;
        result.cat.setState('dead');
        this.effects.floatText('☠ FELL', result.cat.x, result.cat.y - 60, '#FF2222');
      }
    }));

    unsubs.push(Net.on('gameOver', ({ winner }) => {
      this.phase      = 'gameover';
      this._winner    = winner;
      this._gameoverT = 0;
      clearInterval(this._turnInterval);
    }));

    unsubs.push(Net.on('playerLeft', ({ name }) => {
      this.hud.showMessage(`${name} disconnected`, 3);
    }));

    this._unsubs = unsubs;
  }

  // ════════════════════════════════════════════════════════════════
  //  UPDATE
  // ════════════════════════════════════════════════════════════════
  update(dt, input) {
    if (this.phase === 'gameover') {
      this._gameoverT += dt;
      if (input.mouse.clicked && this._gameoverT > 1.5)
        this.engine.switchScene('menu', {});
      return;
    }

    this._updateCats(dt);
    this._updateProjectile(dt, input);

    if (this.isMyTurn && this.phase === 'moving')
      this._updateMyTurn(dt, input);

    this.effects.update(dt);
    this.hud.update(dt);

    // Camera follow active cat
    const active = this._getActiveCat();
    if (active) this.camera.follow(active.x, active.y, dt);
  }

  _updateCats(dt) {
    for (const team of this.teams) {
      for (const cat of team.cats) {
        const wasAlive = cat.alive;
        cat.update(dt, this.terrain);
        if (wasAlive && !cat.alive) {
          // Fell off map — report to server
          if (team.playerId === this.myId) {
            Net.send('catKilled', { catId: cat.id });
          }
          this.effects.floatText('☠ FELL', cat.x, cat.y - 50, '#FF4444');
        }
      }
    }
  }

  _updateMyTurn(dt, input) {
    const cat = this._getActiveCat();
    if (!cat || !cat.alive) return;

    const SPEED = 80;
    let moved = false;

    // Left / Right movement — LEFT arrow = negative X (always correct side-view)
    if (input.isDown('ArrowLeft') || input.isDown('KeyA')) {
      cat.x = Math.max(18, cat.x - SPEED * dt);
      cat.facing = -1;
      cat.setState('walk');
      moved = true;
    } else if (input.isDown('ArrowRight') || input.isDown('KeyD')) {
      cat.x = Math.min(this.worldW - 18, cat.x + SPEED * dt);
      cat.facing = 1;
      cat.setState('walk');
      moved = true;
    } else {
      if (cat.state === 'walk') cat.setState('aim');
    }

    // Snap foot to terrain
    cat.y = this.terrain.groundAt(cat.x);

    // Jump
    if (input.wasPressed('Space')) cat.jump();

    // Relay movement to server (throttled to ~20/s)
    if (moved) {
      const now = Date.now();
      if (now - this._lastMoveSent > 50) {
        this._lastMoveSent = now;
        Net.send('catMoved', { x: cat.x, y: cat.y, dir: cat.facing });
      }
    }

    // Aim: mouse angle relative to muzzle shoulder
    const wx  = this.camera.screenToWorld(input.mouse.x, input.mouse.y);
    const muz = cat.getMuzzle();
    const raw = Math.atan2(wx.y - muz.shoulderY, wx.x - muz.shoulderX);

    // Constrain to upper hemisphere: can't aim straight down or backward
    // Facing +1 (right): angle clamped to [-π+0.1, -0.1]   (upper right arc)
    // Facing -1 (left):  same range but applied to the flipped cat
    this.aimAngle = Util.clamp(raw, -Math.PI + 0.08, -0.08);
    cat.aimAngle  = this.aimAngle;

    // Charge on mouse hold
    if (input.mouse.down && !this._mouseDown) {
      this._mouseDown = true;
      this.charging   = true;
      this.power      = 0;
      this.chargeDir  = 1;
      cat.setState('aim');
    }
    if (!input.mouse.down && this._mouseDown) {
      this._mouseDown = false;
      if (this.charging) {
        this.charging = false;
        this._doFire();
      }
    }

    if (this.charging) {
      this.power += this.chargeDir * 88 * dt;
      if (this.power >= 100) { this.power = 100; this.chargeDir = -1; }
      if (this.power <=   0) { this.power =   0; this.chargeDir =  1; }
    }

    this.hud.power    = this.power;
    this.hud.charging = this.charging;
  }

  _doFire() {
    if (this.phase !== 'moving') return;
    const cat = this._getActiveCat();
    if (!cat || !cat.alive) return;
    clearInterval(this._turnInterval);
    this.phase    = 'fired';
    this.hud.phase = 'fired';
    Net.send('fireWeapon', { angle: this.aimAngle, power: Math.max(6, this.power) });
  }

  _updateProjectile(dt) {
    if (!this.projectile?.active) return;

    // Check terrain / OOB
    const result = this.projectile.update(dt, this.terrain);

    // Check cat hits (any alive cat)
    const allCats = this.teams.flatMap(t => t.cats);
    const hitCat  = this.projectile.checkCatHit(allCats);

    if (hitCat) {
      // Report impact at cat position
      if (this.projectile.isMyShot)
        this._reportExplosion(hitCat.x, hitCat.y - 20);
      this.projectile.active = false;
      return;
    }

    if (result) {
      if (result.miss) {
        // Flew off screen — end turn quietly
        if (this.projectile.isMyShot)
          Net.send('reportExplosion', { x: result.x ?? this.projectile.x, y: this.projectile.y, damages: [] });
        this.projectile.active = false;
        this.phase     = 'waiting';
        this.hud.phase = 'waiting';
      } else if (result.hit) {
        if (this.projectile.isMyShot)
          this._reportExplosion(result.x, result.y);
        this.projectile.active = false;
      }
    }

    // Water splash
    if (this.projectile.active && this.projectile.y >= this.waterY) {
      this.effects.splash(this.projectile.x, this.waterY);
      this.projectile.active = false;
      if (this.projectile.isMyShot)
        Net.send('reportExplosion', { x: this.projectile.x, y: this.waterY, damages: [] });
    }
  }

  _reportExplosion(ix, iy) {
    const EXP_R = 52;
    const damages = [];
    for (const team of this.teams) {
      for (const cat of team.cats) {
        if (!cat.alive) continue;
        const dist = Util.dist(ix, iy, cat.x, cat.y - 20);
        if (dist < EXP_R + 16) {
          const dmg = Math.round(54 * (1 - dist / (EXP_R + 16)));
          if (dmg > 0) damages.push({ catId: cat.id, damage: dmg });
        }
      }
    }
    Net.send('reportExplosion', { x: ix, y: iy, damages });
  }

  // ════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════
  render(ctx) {
    if (this.phase === 'gameover') { this._renderGameover(ctx); return; }

    // Screen shake
    const { x: sx, y: sy } = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(sx, sy);

    // ── World space (inside camera) ──────────────────────────────────────
    this.camera.begin(ctx);

    this._drawSky(ctx);
    this.terrain.draw(ctx);
    this._drawCats(ctx);
    this._drawAimPreview(ctx);
    this.projectile?.draw(ctx);
    this.effects.draw(ctx);

    this.camera.end(ctx);
    ctx.restore();

    // ── Screen space (HUD — NO camera transform, NO shake) ──────────────
    this.hud.draw(ctx);
  }

  _drawSky(ctx) {
    if (this._bgLoaded) {
      // Parallax: move bg at 30% of camera
      ctx.save();
      ctx.translate(this.camera.x * 0.3, this.camera.y * 0.15);
      ctx.drawImage(this._bgImg, 0, 0, this.worldW, this.worldH);
      ctx.restore();
      return;
    }

    // Procedural sky fallback
    const bands = [
      [0.0, 0.20, '#07111E'],[0.20, 0.40, '#0D1E38'],
      [0.40, 0.62, '#142C50'],[0.62, 0.82, '#1A4070'],
      [0.82, 1.00, '#286898'],
    ];
    for (const [s, e, c] of bands) {
      ctx.fillStyle = c;
      ctx.fillRect(0, ~~(this.worldH * s), this.worldW, ~~(this.worldH * (e - s)) + 1);
    }
    ctx.fillStyle = '#FFF';
    for (let i = 0; i < 110; i++) {
      const sx = ((2654435761 * (i+1)) >>> 0) % this.worldW;
      const sy = ((1013904223 * (i+1)) >>> 0) % ~~(this.worldH * 0.5);
      ctx.fillRect(sx, sy, i % 6 === 0 ? 2 : 1, i % 6 === 0 ? 2 : 1);
    }
  }

  _drawCats(ctx) {
    const activeCat = this._getActiveCat();
    for (const team of this.teams) {
      for (const cat of team.cats) {
        if (!cat.alive) continue;
        const isActive   = cat.id === this._activeCatId;
        const showWeapon = isActive && (this.isMyTurn && this.phase === 'moving');
        cat.draw(ctx, isActive, showWeapon);
      }
    }
  }

  _drawAimPreview(ctx) {
    if (!this.isMyTurn || this.phase !== 'moving') return;
    const cat = this._getActiveCat();
    if (!cat || !cat.alive) return;
    const m = cat.getMuzzle();
    HUD.drawAimPreview(ctx, m.x, m.y, this.aimAngle, this.power, this.wind, this.terrain);
  }

  _renderGameover(ctx) {
    // Dim the last rendered frame
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, this.W, this.H);

    const cx   = this.W / 2, cy = this.H / 2;
    const mine = this._winner?.playerId === this.myId;
    const t    = Math.min(1, this._gameoverT / 0.8); // fade-in

    ctx.save();
    ctx.globalAlpha = t;

    // Box
    const bw = 340, bh = 180;
    Util.fillRoundRect(ctx, cx - bw/2, cy - bh/2, bw, bh, 10, 'rgba(0,0,0,0.90)');
    ctx.strokeStyle = mine ? '#FFD700' : '#FF4444';
    ctx.lineWidth   = 2;
    ctx.strokeRect(cx - bw/2 + 1, cy - bh/2 + 1, bw - 2, bh - 2);

    // Result
    const emoji = mine ? '🏆' : '💀';
    const title = mine ? 'VICTORY!' : (this._winner ? `${this._winner.name.toUpperCase()} WINS` : 'DRAW');
    ctx.textAlign = 'center';
    ctx.font      = '36px monospace';
    ctx.fillText(emoji, cx, cy - 48);

    Util.shadowText(ctx, title, cx, cy - 6,
      mine ? '#FFD700' : '#FF8888', '#000C', 22, 'monospace');

    ctx.font      = '9px monospace';
    ctx.fillStyle = 'rgba(150,180,220,0.8)';
    ctx.fillText(mine ? 'You defeated all opponents!' : 'Better luck next time.',
      cx, cy + 26);

    if (this._gameoverT > 1.5) {
      ctx.font      = '8px monospace';
      ctx.fillStyle = 'rgba(180,200,240,0.7)';
      ctx.fillText('[ CLICK TO RETURN TO MENU ]', cx, cy + 54);
    }

    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════════
  //  HELPERS
  // ════════════════════════════════════════════════════════════════
  _getActiveCat() {
    const team = this.teams[this.currentTeamIdx];
    if (!team) return null;
    if (this._activeCatId) {
      const f = team.cats.find(c => c.id === this._activeCatId && c.alive);
      if (f) return f;
    }
    return team.cats.find(c => c.alive) ?? null;
  }

  _findCat(id) {
    for (const team of this.teams) {
      const cat = team.cats.find(c => c.id === id);
      if (cat) return { cat, team };
    }
    return null;
  }

  _snapAllCats() {
    for (const team of this.teams) {
      for (const cat of team.cats) {
        if (cat.alive) cat.y = this.terrain.groundAt(cat.x);
      }
    }
  }

  destroy() {
    clearInterval(this._turnInterval);
    this._unsubs?.forEach(u => u());
  }
}

window.GameScene = GameScene;
