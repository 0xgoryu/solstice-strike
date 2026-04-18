/**
 * LobbyScene — Create or Join room, then wait for host to Start.
 */
class LobbyScene {
  constructor(engine, data) {
    this.engine  = engine;
    this.W       = engine.W;
    this.H       = engine.H;
    this.mode    = data.mode;   // 'create' | 'join'

    this.myId    = null;
    this.myName  = 'Player';
    this.code    = '';
    this.codeInput = '';
    this.players   = [];
    this.isHost    = false;
    this.error     = '';
    this.phase     = 'enterName'; // enterName | waitRoom | inRoom

    this._nameField = true;  // which field is focused
    this._t         = 0;
    this._subs      = [];

    this._bindNet();
  }

  _bindNet() {
    this._subs.push(
      Net.on('roomCreated', ({ code, playerId }) => {
        this.myId   = playerId;
        this.code   = code;
        this.isHost = true;
        this.players = [{ id: playerId, name: this.myName }];
        this.phase  = 'inRoom';
      }),
      Net.on('roomJoined', ({ code, playerId, players }) => {
        this.myId   = playerId;
        this.code   = code;
        this.isHost = false;
        this.players = players;
        this.phase  = 'inRoom';
      }),
      Net.on('playerJoined', ({ id, name }) => {
        if (!this.players.find(p => p.id === id))
          this.players.push({ id, name });
      }),
      Net.on('playerLeft', () => {
        this.players = this.players.filter(p => p.id !== this.myId);
      }),
      Net.on('joinError', msg  => { this.error = msg; }),
      Net.on('gameError', msg  => { this.error = msg; }),
      Net.on('gameStarted', gs => {
        this.engine.switchScene('game', { gs, myId: this.myId });
      }),
    );
  }

  update(dt, input) {
    this._t += dt;
    this.engine.input; // keep ref

    if (this.phase === 'enterName') this._updateName(input);
    else if (this.phase === 'inRoom') this._updateRoom(input);
  }

  _updateName(input) {
    // Type name / code via keyboard
    for (const code of Object.keys(input.pressed)) {
      if (code === 'Backspace') {
        if (this._nameField) this.myName = this.myName.slice(0, -1);
        else                 this.codeInput = this.codeInput.slice(0, -1);
        continue;
      }
      if (code === 'Tab') { this._nameField = !this._nameField; continue; }

      const char = this._codeToChar(code);
      if (!char) continue;
      if (this._nameField) {
        if (this.myName.length < 14) this.myName += char;
      } else {
        if (this.codeInput.length < 4) this.codeInput += char.toUpperCase();
      }
    }

    if (input.wasPressed('Enter') || input.wasPressed('NumpadEnter')) {
      this._submit();
    }

    // Click on go button
    if (input.mouse.clicked) {
      const bx = this.W / 2 - 100, by = this.H / 2 + 60, bw = 200, bh = 40;
      if (input.mouse.x >= bx && input.mouse.x <= bx + bw &&
          input.mouse.y >= by && input.mouse.y <= by + bh) {
        this._submit();
      }
      // Click back
      if (input.mouse.y < 60) this.engine.switchScene('menu', {});
    }
  }

  _submit() {
    const name = this.myName.trim() || 'Cat';
    this.myName = name;
    this.error  = '';
    if (this.mode === 'create') {
      Net.send('createRoom', { name });
      this.phase = 'waitRoom';
    } else {
      const code = this.codeInput.trim().toUpperCase();
      if (code.length < 4) { this.error = 'Enter a 4-letter room code'; return; }
      Net.send('joinRoom', { code, name });
      this.phase = 'waitRoom';
    }
  }

  _updateRoom(input) {
    if (input.mouse.clicked) {
      // Start button (host only)
      if (this.isHost && this.players.length >= 2) {
        const bx = this.W / 2 - 110, by = this.H / 2 + 80, bw = 220, bh = 44;
        if (input.mouse.x >= bx && input.mouse.x <= bx + bw &&
            input.mouse.y >= by && input.mouse.y <= by + bh) {
          Net.send('startGame');
        }
      }
      // Copy code button
      if (this.code) {
        const cx = this.W / 2 + 70, cy = this.H / 2 - 20, cw = 70, ch = 28;
        if (input.mouse.x >= cx && input.mouse.x <= cx + cw &&
            input.mouse.y >= cy && input.mouse.y <= cy + ch) {
          navigator.clipboard?.writeText(this.code);
        }
      }
      // Back
      if (input.mouse.y < 60) { this._leave(); }
    }
  }

  _leave() {
    this._subs.forEach(u => u());
    this.engine.switchScene('menu', {});
  }

  _codeToChar(code) {
    if (code.startsWith('Key'))    return code[3].toLowerCase();
    if (code.startsWith('Digit'))  return code[5];
    if (code === 'Space')          return ' ';
    return null;
  }

  // ── Render ─────────────────────────────────────────────────────────────
  render(ctx) {
    this._drawBg(ctx);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px monospace';
    Util.shadowText(ctx, 'SOLSTICE STRIKE', this.W / 2, 38, '#FFD700', '#000C', 14);
    ctx.restore();

    if (this.phase === 'waitRoom') {
      this._drawWaiting(ctx);
    } else if (this.phase === 'inRoom') {
      this._drawRoom(ctx);
    } else {
      this._drawNameEntry(ctx);
    }

    // Back hint
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(120,140,180,0.7)';
    ctx.fillText('← BACK', 14, 20);
    ctx.restore();
  }

  _drawBg(ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0, '#07111E');
    grad.addColorStop(1, '#0D1E38');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);
    // Subtle grid
    ctx.strokeStyle = 'rgba(30,60,100,0.3)';
    ctx.lineWidth   = 1;
    for (let x = 0; x < this.W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.H); ctx.stroke(); }
    for (let y = 0; y < this.H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke(); }
  }

  _drawNameEntry(ctx) {
    const cx = this.W / 2, cy = this.H / 2;
    const title = this.mode === 'create' ? 'CREATE ROOM' : 'JOIN ROOM';
    Util.shadowText(ctx, title, cx, cy - 90, '#E87820', '#000C', 13);

    // Name field
    this._drawField(ctx, cx, cy - 50, 260, 36, 'YOUR NAME', this.myName, this._nameField);

    // Code field (join only)
    if (this.mode === 'join') {
      this._drawField(ctx, cx, cy, 260, 36, 'ROOM CODE', this.codeInput, !this._nameField);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font      = '8px monospace';
      ctx.fillStyle = 'rgba(150,170,210,0.7)';
      ctx.fillText('TAB to switch field', cx, cy + 32);
      ctx.restore();
    }

    // Error
    if (this.error) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '8px monospace';
      ctx.fillStyle = '#FF5555';
      ctx.fillText(this.error, cx, cy + 52);
      ctx.restore();
    }

    // Submit button
    const bx = cx - 100, by = cy + 62;
    this._drawBigBtn(ctx, bx, by, 200, 40, this.mode === 'create' ? 'CREATE' : 'JOIN', '#E87820');

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(140,160,200,0.7)';
    ctx.fillText('Press ENTER to confirm', cx, by + 54);
    ctx.restore();
  }

  _drawField(ctx, cx, cy, w, h, label, value, focused) {
    const x = cx - w / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x, cy, w, h);
    ctx.strokeStyle = focused ? '#E87820' : 'rgba(60,90,140,0.8)';
    ctx.lineWidth   = focused ? 2 : 1;
    ctx.strokeRect(x + 0.5, cy + 0.5, w, h);

    ctx.font      = '7px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(150,170,210,0.75)';
    ctx.fillText(label, x + 8, cy - 3);

    ctx.font      = 'bold 14px monospace';
    ctx.fillStyle = focused ? '#FFD700' : '#CCDDEE';
    const display = value + (focused && Math.floor(this._t * 2) % 2 === 0 ? '|' : '');
    ctx.fillText(display || '...', x + 10, cy + h - 10);
    ctx.restore();
  }

  _drawBigBtn(ctx, x, y, w, h, label, col) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x + 3, y + 3, w, h);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x, y, w, h * 0.4);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = 'bold 12px monospace';
    Util.shadowText(ctx, label, x + w / 2, y + h / 2 + 5, '#FFF', '#0009', 12);
    ctx.restore();
  }

  _drawWaiting(ctx) {
    const cx = this.W / 2;
    const dots = '.'.repeat((Math.floor(this._t * 2) % 4));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px monospace';
    Util.shadowText(ctx, `Connecting${dots}`, cx, this.H / 2, '#AACCEE', '#000C', 13);
    ctx.restore();
  }

  _drawRoom(ctx) {
    const cx = this.W / 2, cy = this.H / 2;

    // Room code display
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(140,160,200,0.8)';
    ctx.fillText('ROOM CODE', cx, cy - 70);

    ctx.font = 'bold 36px monospace';
    Util.shadowText(ctx, this.code, cx, cy - 35, '#FFD700', '#000C', 36);

    // Copy hint
    ctx.font      = '8px monospace';
    ctx.fillStyle = 'rgba(120,150,200,0.7)';
    ctx.fillText('share this code with friends', cx, cy - 8);
    ctx.restore();

    // Copy button
    this._drawBigBtn(ctx, cx + 70, cy - 38, 80, 24, 'COPY', '#3A6090');

    // Player list
    ctx.save();
    ctx.textAlign = 'left';
    const COLORS = ['#E87820','#3870B0','#3A8830','#B89010'];
    this.players.forEach((p, i) => {
      const py  = cy + 18 + i * 28;
      const lx  = cx - 120;
      // Dot
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.beginPath(); ctx.arc(lx, py, 6, 0, Math.PI * 2); ctx.fill();
      // Name
      ctx.font      = 'bold 10px monospace';
      ctx.fillStyle = '#DDEEFF';
      ctx.fillText(`${p.name}${p.id === this.myId ? ' (you)' : ''}`, lx + 14, py + 4);
      // Host badge
      if (i === 0) {
        ctx.font      = '7px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('HOST', lx + 14 + (p.name.length + 6) * 7, py + 4);
      }
    });
    ctx.restore();

    // Waiting message
    if (!this.isHost) {
      const dots = '.'.repeat((~~(this._t * 2) % 4));
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(150,180,220,0.8)';
      ctx.fillText(`Waiting for host to start${dots}`, cx, cy + 140);
      ctx.restore();
    }

    // Start button (host only)
    if (this.isHost) {
      const canStart = this.players.length >= 2;
      const bx = cx - 110, by = cy + 130;
      this._drawBigBtn(ctx, bx, by, 220, 44,
        canStart ? '▶ START GAME' : 'WAITING FOR PLAYERS...',
        canStart ? '#44AA44' : '#334455',
      );
      if (!canStart) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(150,170,210,0.7)';
        ctx.fillText('Need at least 2 players', cx, by + 56);
        ctx.restore();
      }
    }

    if (this.error) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '8px monospace';
      ctx.fillStyle = '#FF5555';
      ctx.fillText(this.error, cx, this.H - 50);
      ctx.restore();
    }
  }

  destroy() {
    this._subs.forEach(u => u());
  }
}

window.LobbyScene = LobbyScene;
