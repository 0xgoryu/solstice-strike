/**
 * GameScene — full gameplay scene for 1280×720.
 *
 * Phase machine:
 *   waiting  → no active turn yet
 *   moving   → my turn: move / aim / charge+fire
 *   watching → opponent's turn
 *   fired    → projectile in flight
 *   gameover → show winner screen
 *
 * Rendering order (back → front):
 *   1. Sky / parallax background
 *   2. Terrain (world space, inside camera)
 *   3. Cats (world space)
 *   4. Aim dots (world space, my turn moving)
 *   5. Projectile (world space)
 *   6. Effects / particles (world space)
 *   — camera.end() —
 *   7. HUD (screen space, no shake)
 *   8. Game-over overlay
 */
class GameScene {
  constructor(engine, data) {
    this.engine   = engine;
    this.W        = engine.W;   // 1280
    this.H        = engine.H;   // 720
    this.myId     = data.myId;

    const gs = data.gs;
    this.worldW = gs.W;
    this.worldH = gs.H;

    // Systems
    this.terrain    = new Terrain(gs.terrain, gs.W, gs.H, gs.waterY);
    this.camera     = new Camera(this.W, this.H, gs.W, gs.H);
    this.effects    = new Effects();
    this.hud        = new HUD(this.W, this.H);
    this.projectile = null;

    // Solstice logo
    this._solImg      = new Image();
    this._solImg.src  = '/assets/solstice.png';

    // Background
    this._bgImg    = new Image();
    this._bgImg.src = '/assets/map/background.png';
    this._bgOk     = false;
    this._bgImg.onload = () => { this._bgOk = true; };

    // Build team/cat entities
    this.teams = gs.teams.map(t => ({
      ...t,
      cats: t.cats.map(cd => new Cat(
        cd,
        { color: t.color, teamIdx: t.teamIdx, playerId: t.playerId },
        t.playerId === this.myId,
      )),
    }));
    this.hud.teams = this.teams;

    // Turn state
    this.phase          = 'waiting';
    this.currentTeamIdx = 0;
    this.isMyTurn       = false;
    this.wind           = 0;
    this.turnTimeLeft   = 30;
    this._turnInterval  = null;
    this._activeCatId   = null;

    // Aim + charge (my turn)
    this.aimAngle   = -Math.PI * 0.3;
    this.power      = 50;
    this.charging   = false;
    this.chargeDir  = 1;
    this._mouseHeld = false;

    // Game over
    this._winner    = null;
    this._goTimer   = 0;

    // Move throttle
    this._lastMoveSent = 0;

    this._bindNet();
    this._snapAllCats();

    // Initial camera position on our first cat
    const myCat = this.teams.find(t => t.playerId === this.myId)?.cats[0];
    if (myCat) this.camera.snap(myCat.x, myCat.y);
  }

  // ══════════════════════════════════════════════════════════════════
  //  NETWORK
  // ══════════════════════════════════════════════════════════════════
  _bindNet() {
    const S = [];

    S.push(Net.on('turnStart', ({ teamIdx, playerId, wind, timeLeft }) => {
      this.currentTeamIdx = teamIdx;
      this.isMyTurn       = playerId === this.myId;
      this.wind           = wind;
      this.turnTimeLeft   = timeLeft;
      this.phase          = this.isMyTurn ? 'moving' : 'watching';
      this.charging       = false;
      this.power          = 50;
      this._mouseHeld     = false;

      const team = this.teams[teamIdx];
      const cat  = team?.cats.find(c => c.alive);
      this._activeCatId = cat?.id ?? null;

      if (cat && team) {
        // Set initial aim direction: toward opponent side
        this.aimAngle = team.teamIdx % 2 === 0 ? -Math.PI*0.28 : -Math.PI*0.72;
        cat.aimAngle  = this.aimAngle;
        cat.facing    = team.teamIdx % 2 === 0 ? 1 : -1;
        cat.setState(this.isMyTurn ? 'aim' : 'idle');
        // Smooth camera follow
        this.camera.follow(cat.x, cat.y, 0.08);
      }

      // Update HUD
      this.hud.wind           = wind;
      this.hud.timeLeft       = timeLeft;
      this.hud.currentTeamIdx = teamIdx;
      this.hud.myTurn         = this.isMyTurn;
      this.hud.phase          = this.phase;

      this.hud.showMessage(
        this.isMyTurn ? '★ YOUR TURN' : `${(team?.name ?? '?').toUpperCase()} TURN`,
        1.8,
      );

      clearInterval(this._turnInterval);
      this._turnInterval = setInterval(() => {
        this.turnTimeLeft = Math.max(0, this.turnTimeLeft - 1);
        this.hud.timeLeft = this.turnTimeLeft;
        if (this.turnTimeLeft === 0) {
          clearInterval(this._turnInterval);
          if (this.isMyTurn && this.phase === 'moving') this._doFire();
        }
      }, 1000);
    }));

    // Weapon fired — broadcast to ALL clients (including firer)
    S.push(Net.on('weaponFired', ({ teamIdx, angle, power, wind }) => {
      const team = this.teams[teamIdx];
      const cat  = this._activeCatId
        ? team?.cats.find(c => c.id === this._activeCatId && c.alive)
        : team?.cats.find(c => c.alive);
      if (!cat) return;

      cat.aimAngle = angle;
      cat.setState('aim');

      const m = cat.getMuzzle();
      const isMyShot = team.playerId === this.myId;

      this.projectile = new Projectile(
        m.x, m.y, angle, power, wind,
        cat.id, isMyShot, this._solImg,
      );
      this.phase     = 'fired';
      this.hud.phase = 'fired';
    }));

    // Opponent movement relay
    S.push(Net.on('catMoved', ({ teamIdx, x, y, dir }) => {
      const team = this.teams[teamIdx];
      const cat  = team?.cats.find(c => c.alive);
      if (cat) { cat.x = x; cat.y = y; cat.facing = dir; cat.setState('walk'); }
    }));

    // Explosion result — server validates, broadcasts to ALL
    S.push(Net.on('explosionResult', ({ x, y, damages }) => {
      this.terrain.deform(x, y, 52);
      this.effects.explosion(x, y, 52);

      (damages ?? []).forEach(({ catId, damage }) => {
        const res = this._findCat(catId);
        if (!res) return;
        const prev = res.cat.hp;
        res.cat.hurt(damage);
        this.effects.floatText(`-${damage}`, res.cat.x, res.cat.y - 60, '#FF4444');
        if (!res.cat.alive)
          this.effects.floatText('☠ KO!', res.cat.x, res.cat.y - 80, '#FF2222');
      });

      setTimeout(() => this._snapAllCats(), 300);
      this.projectile = null;
      this.phase      = 'waiting';
      this.hud.phase  = 'waiting';
    }));

    S.push(Net.on('catKilled', ({ catId }) => {
      const res = this._findCat(catId);
      if (res) {
        res.cat.hp    = 0;
        res.cat.alive = false;
        res.cat.setState('dead');
        this.effects.floatText('☠ FELL', res.cat.x, res.cat.y - 60, '#FF3333');
      }
    }));

    S.push(Net.on('gameOver', ({ winner }) => {
      this.phase    = 'gameover';
      this._winner  = winner;
      this._goTimer = 0;
      clearInterval(this._turnInterval);
    }));

    S.push(Net.on('playerLeft', ({ name }) => {
      this.hud.showMessage(`${name} disconnected`, 3);
    }));

    this._subs = S;
  }

  // ══════════════════════════════════════════════════════════════════
  //  UPDATE
  // ══════════════════════════════════════════════════════════════════
  update(dt, input) {
    if (this.phase === 'gameover') {
      this._goTimer += dt;
      if (input.mouse.clicked && this._goTimer > 1.8)
        this.engine.switchScene('menu');
      return;
    }

    this._updateCats(dt);
    this._updateProjectile(dt);

    if (this.isMyTurn && this.phase === 'moving')
      this._updateMyTurn(dt, input);

    this.effects.update(dt);
    this.hud.update(dt);

    const active = this._getActiveCat();
    if (active) this.camera.follow(active.x, active.y, dt);
  }

  _updateCats(dt) {
    for (const team of this.teams) {
      for (const cat of team.cats) {
        const wasAlive = cat.alive;
        cat.update(dt, this.terrain);
        if (wasAlive && !cat.alive) {
          if (team.playerId === this.myId)
            Net.send('catKilled', { catId: cat.id });
          this.effects.floatText('☠ FELL', cat.x, cat.y - 50, '#FF4444');
        }
      }
    }
  }

  _updateMyTurn(dt, input) {
    const cat = this._getActiveCat();
    if (!cat || !cat.alive) return;

    const SPEED = 90;
    let moved = false;

    // ── Left / Right movement ─────────────────────────────────────────
    // ArrowLeft ALWAYS moves cat.x in negative direction (side view rule)
    if (input.isDown('ArrowLeft') || input.isDown('KeyA')) {
      cat.x      = Math.max(20, cat.x - SPEED * dt);
      cat.facing = -1;
      cat.setState('walk');
      moved = true;
    } else if (input.isDown('ArrowRight') || input.isDown('KeyD')) {
      cat.x      = Math.min(this.worldW - 20, cat.x + SPEED * dt);
      cat.facing = 1;
      cat.setState('walk');
      moved = true;
    } else if (cat.state === 'walk') {
      cat.setState('aim');
    }

    // Snap foot to terrain
    cat.y = this.terrain.groundAt(cat.x);

    // ── Jump ───────────────────────────────────────────────────────────
    if (input.wasPressed('Space')) cat.jump();

    // ── Aim angle from mouse ───────────────────────────────────────────
    // Convert mouse screen coords → world coords
    const wx  = this.camera.screenToWorld(input.mouse.x, input.mouse.y);
    const m   = cat.getMuzzle();
    // Raw angle from shoulder to mouse
    const raw = Math.atan2(wx.y - m.shoulderY, wx.x - m.shoulderX);
    // Clamp to upper hemisphere (can't aim below horizontal)
    this.aimAngle = Util.clamp(raw, -Math.PI + 0.06, -0.06);
    cat.aimAngle  = this.aimAngle;

    // Relay position
    if (moved) {
      const now = Date.now();
      if (now - this._lastMoveSent > 48) {
        this._lastMoveSent = now;
        Net.send('catMoved', { teamIdx: this.currentTeamIdx, x: cat.x, y: cat.y, dir: cat.facing });
      }
    }

    // ── Charge on mouse hold ───────────────────────────────────────────
    if (input.mouse.down && !this._mouseHeld) {
      this._mouseHeld = true;
      this.charging   = true;
      this.power      = 0;
      this.chargeDir  = 1;
      cat.setState('aim');
    }
    if (!input.mouse.down && this._mouseHeld) {
      this._mouseHeld = false;
      if (this.charging) {
        this.charging = false;
        this._doFire();
      }
    }
    if (this.charging) {
      this.power += this.chargeDir * 92 * dt;
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
    this.phase     = 'fired';
    this.hud.phase = 'fired';
    Net.send('fireWeapon', { angle: this.aimAngle, power: Math.max(5, this.power) });
  }

  _updateProjectile(dt) {
    const proj = this.projectile;
    if (!proj?.active) return;

    // Cat direct hit check
    const allCats = this.teams.flatMap(t => t.cats);
    const hitCat  = proj.checkCatHit(allCats);
    if (hitCat) {
      if (proj.isMyShot) this._reportExplosion(hitCat.x, hitCat.y - 20);
      proj.active = false;
      return;
    }

    const result = proj.update(dt, this.terrain);

    // Water
    if (proj.active && proj.y >= this.terrain.waterY) {
      this.effects.splash(proj.x, this.terrain.waterY);
      if (proj.isMyShot) Net.send('reportExplosion', { x: proj.x, y: this.terrain.waterY, damages: [] });
      proj.active    = false;
      this.projectile = null;
      this.phase     = 'waiting';
      this.hud.phase = 'waiting';
      return;
    }

    if (!result) return;

    if (result.miss) {
      if (proj.isMyShot) Net.send('reportExplosion', { x: proj.x, y: proj.y, damages: [] });
      proj.active    = false;
      this.projectile = null;
      this.phase     = 'waiting';
      this.hud.phase = 'waiting';
    } else if (result.hit) {
      if (proj.isMyShot) this._reportExplosion(result.x, result.y);
      proj.active = false;
    }
  }

  _reportExplosion(ix, iy) {
    const EXP_R = 52;
    const damages = [];
    for (const t of this.teams) {
      for (const c of t.cats) {
        if (!c.alive) continue;
        const dist = Util.dist(ix, iy, c.x, c.y - 22);
        if (dist < EXP_R + 18) {
          const dmg = Math.round(55 * (1 - dist / (EXP_R + 18)));
          if (dmg > 0) damages.push({ catId: c.id, damage: dmg });
        }
      }
    }
    Net.send('reportExplosion', { x: ix, y: iy, damages });
  }

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════
  render(ctx) {
    if (this.phase === 'gameover') {
      this._renderGameover(ctx);
      return;
    }

    const { x: sx, y: sy } = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(sx, sy);

    // ── World space ─────────────────────────────────────────────────────
    this.camera.begin(ctx);

    this._drawSky(ctx);
    this.terrain.draw(ctx);
    this._drawAllCats(ctx);
    this._drawAimPreview(ctx);
    this.projectile?.draw(ctx);
    this.effects.draw(ctx);

    this.camera.end(ctx);
    ctx.restore();

    // ── Screen space (HUD) — no camera, no shake ────────────────────────
    this.hud.draw(ctx);
  }

  _drawSky(ctx) {
    if (this._bgOk) {
      ctx.save();
      // Parallax: bg moves at 25% of camera scroll
      ctx.translate(this.camera.x * 0.25, this.camera.y * 0.12);
      ctx.drawImage(this._bgImg, 0, 0, this.worldW, this.worldH);
      ctx.restore();
      return;
    }

    // Procedural sky (fallback)
    const g = ctx.createLinearGradient(0, 0, 0, this.worldH);
    g.addColorStop(0,   '#030810');
    g.addColorStop(0.35,'#0A1E3A');
    g.addColorStop(0.65,'#163060');
    g.addColorStop(1,   '#1E4880');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.worldW, this.worldH);

    // Stars
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 200; i++) {
      const sx = ((2654435761 * (i+1)) >>> 0) % this.worldW;
      const sy = ((1013904223 * (i+1)) >>> 0) % Math.floor(this.worldH * 0.55);
      const big = i % 7 === 0;
      ctx.globalAlpha = big ? 1 : 0.45 + (i % 3) * 0.18;
      ctx.fillRect(sx, sy, big ? 3 : 1, big ? 3 : 1);
    }
    ctx.globalAlpha = 1;

    // Moon
    const moonX = this.worldW * 0.82, moonY = 80;
    const moonG = ctx.createRadialGradient(moonX-8, moonY-8, 4, moonX, moonY, 40);
    moonG.addColorStop(0, '#FFF8E0');
    moonG.addColorStop(1, '#C8C090');
    ctx.fillStyle = moonG;
    ctx.beginPath(); ctx.arc(moonX, moonY, 40, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#D4C888';
    [[8,6,7],[18,-10,4],[-12,8,5],[2,18,3]].forEach(([dx,dy,r]) => {
      ctx.beginPath(); ctx.arc(moonX+dx, moonY+dy, r, 0, Math.PI*2); ctx.fill();
    });

    // Distant mountain silhouette
    ctx.fillStyle = '#060D1E';
    ctx.beginPath();
    ctx.moveTo(0, this.worldH);
    const mPts = [[0,0.78],[0.06,0.55],[0.14,0.65],[0.22,0.48],[0.32,0.60],[0.42,0.42],[0.52,0.58],[0.62,0.46],[0.72,0.64],[0.82,0.50],[0.90,0.62],[1,0.72],[1,1]];
    mPts.forEach(([x,y]) => ctx.lineTo(x*this.worldW, y*this.worldH));
    ctx.closePath(); ctx.fill();
  }

  _drawAllCats(ctx) {
    for (const team of this.teams) {
      for (const cat of team.cats) {
        if (!cat.alive) continue;
        const isActive   = cat.id === this._activeCatId;
        const showWeapon = isActive && this.isMyTurn && this.phase === 'moving';
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

  // ── Game over overlay ─────────────────────────────────────────────────
  _renderGameover(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, this.W, this.H);

    const cx    = this.W/2, cy = this.H/2;
    const mine  = this._winner?.playerId === this.myId;
    const alpha = Util.clamp(this._goTimer / 0.9, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Card
    const BW = 500, BH = 240;
    Util.fillRoundRect(ctx, cx-BW/2, cy-BH/2, BW, BH, 10, 'rgba(3,6,16,0.96)');
    const borderCol = mine ? '#FFD700' : '#FF5555';
    ctx.strokeStyle = borderCol;
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.roundRect(cx-BW/2+1,cy-BH/2+1,BW-2,BH-2,10); ctx.stroke();
    // Top glow
    ctx.fillStyle = borderCol + '33';
    ctx.fillRect(cx-BW/2+2, cy-BH/2+2, BW-4, 3);

    // Emoji
    ctx.font      = '52px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(mine ? '🏆' : '💀', cx, cy - 52);

    // Title
    ctx.shadowColor = mine ? '#FFD700' : '#FF5555';
    ctx.shadowBlur  = 20;
    ctx.font        = '30px "Orbitron", monospace';
    ctx.fillStyle   = mine ? '#FFD700' : '#FF8888';
    ctx.fillText(
      mine ? 'VICTORY!' : (this._winner ? `${this._winner.name.toUpperCase()} WINS` : 'DRAW'),
      cx, cy,
    );
    ctx.shadowBlur = 0;

    ctx.font      = '12px monospace';
    ctx.fillStyle = 'rgba(160,190,230,0.75)';
    ctx.fillText(mine ? 'You eliminated all opponents!' : 'Better luck next time.', cx, cy + 36);

    if (this._goTimer > 1.8) {
      ctx.font      = '10px "Press Start 2P", monospace';
      ctx.fillStyle = 'rgba(160,190,230,0.6)';
      ctx.fillText('[ CLICK TO RETURN TO MENU ]', cx, cy + 80);
    }

    ctx.restore();
  }

  // ── Helpers ───────────────────────────────────────────────────────────
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
    this._subs?.forEach(u => u());
  }
}

window.GameScene = GameScene;
