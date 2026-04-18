/**
 * LobbyScene — Create or Join room.
 * BUG FIX: all click hit-boxes now use IDENTICAL coordinates to draw calls.
 */
class LobbyScene {
  constructor(engine, data) {
    this.engine = engine;
    this.W      = engine.W;   // 1280
    this.H      = engine.H;   // 720
    this.mode   = data.mode;  // 'create' | 'join'

    this.myId      = null;
    this.myName    = '';
    this.codeInput = '';
    this.code      = '';
    this.players   = [];
    this.isHost    = false;
    this.error     = '';
    this._t        = 0;
    this._phase    = 'form'; // form | waiting | room
    this._focused  = 'name'; // name | code
    this._copiedFlash = 0;
    this._subs     = [];

    this._bindNet();
  }

  _bindNet() {
    this._subs.push(
      Net.on('roomCreated', ({ code, playerId }) => {
        this.myId   = playerId;
        this.code   = code;
        this.isHost = true;
        this.players = [{ id: playerId, name: this.myName || 'Cat' }];
        this._phase = 'room';
        this.error  = '';
      }),
      Net.on('roomJoined', ({ code, playerId, players }) => {
        this.myId   = playerId;
        this.code   = code;
        this.isHost = false;
        this.players = players;
        this._phase = 'room';
        this.error  = '';
      }),
      Net.on('playerJoined', ({ id, name }) => {
        if (!this.players.find(p => p.id === id))
          this.players.push({ id, name });
      }),
      Net.on('playerLeft', ({ name }) => {
        this.players = this.players.filter(p => p.name !== name);
      }),
      Net.on('joinError',  msg => { this.error = msg; this._phase = 'form'; }),
      Net.on('gameError',  msg => { this.error = msg; }),
      Net.on('gameStarted', gs => {
        this.engine.switchScene('game', { gs, myId: this.myId });
      }),
    );
  }

  // ── Layout constants (single source of truth) ─────────────────────────
  // Everything draws AND hit-tests from these exact values.
  get _CX() { return this.W / 2; }
  get _CY() { return this.H / 2; }

  _formLayout() {
    const cx = this._CX, cy = this._CY;
    const FW = 420, FH = 52;
    return {
      nameField: { x: cx - FW/2, y: cy - 80,  w: FW, h: FH },
      codeField: { x: cx - FW/2, y: cy - 80,  w: FW, h: FH }, // join only, same pos
      submitBtn: { x: cx - 160,  y: cy + 30,  w: 320, h: 58 },
      backBtn:   { x: 30,        y: 30,        w: 120, h: 40 },
    };
  }

  _roomLayout() {
    const cx = this._CX, cy = this._CY;
    return {
      startBtn:  { x: cx - 180, y: cy + 170, w: 360, h: 62 },
      copyBtn:   { x: cx + 100, y: cy - 80,  w: 130, h: 44 },
      backBtn:   { x: 30,       y: 30,        w: 120, h: 40 },
    };
  }

  // ── Update ─────────────────────────────────────────────────────────────
  update(dt, input) {
    this._t += dt;
    if (this._copiedFlash > 0) this._copiedFlash -= dt;

    if (this._phase === 'form')    this._updateForm(input);
    else if (this._phase === 'room') this._updateRoom(input);
    // 'waiting' = just waiting for server response, no interaction
  }

  _updateForm(input) {
    const L = this._formLayout();

    // Keyboard input
    for (const code of Object.keys(input.pressed)) {
      if (code === 'Backspace') {
        if (this._focused === 'name') this.myName    = this.myName.slice(0, -1);
        else                          this.codeInput = this.codeInput.slice(0, -1);
        continue;
      }
      if (code === 'Tab') {
        this._focused = (this.mode === 'join')
          ? (this._focused === 'name' ? 'code' : 'name')
          : 'name';
        continue;
      }
      if (code === 'Enter' || code === 'NumpadEnter') { this._submit(); continue; }
      const ch = this._keyToChar(code);
      if (!ch) continue;
      if (this._focused === 'name' && this.myName.length < 14) this.myName += ch;
      else if (this._focused === 'code' && this.codeInput.length < 4) this.codeInput += ch.toUpperCase();
    }

    if (!input.mouse.clicked) return;
    const mx = input.mouse.x, my = input.mouse.y;

    // Field focus click
    if (this._hit(L.nameField, mx, my)) this._focused = 'name';
    if (this.mode === 'join' && this._hit(L.codeField, mx, my)) this._focused = 'code';

    // Submit
    if (this._hit(L.submitBtn, mx, my)) this._submit();

    // Back
    if (this._hit(L.backBtn, mx, my)) this.engine.switchScene('menu');
  }

  _updateRoom(input) {
    const L = this._roomLayout();
    if (!input.mouse.clicked) return;
    const mx = input.mouse.x, my = input.mouse.y;

    // Copy button
    if (this._hit(L.copyBtn, mx, my)) {
      navigator.clipboard?.writeText(this.code).catch(() => {});
      this._copiedFlash = 1.5;
    }

    // Start game (host only, 2+ players)
    if (this.isHost && this.players.length >= 2 && this._hit(L.startBtn, mx, my)) {
      Net.send('startGame');
    }

    // Back
    if (this._hit(L.backBtn, mx, my)) {
      this._subs.forEach(u => u());
      this.engine.switchScene('menu');
    }
  }

  _submit() {
    const name = this.myName.trim() || 'Cat';
    this.myName = name;
    this.error  = '';
    if (this.mode === 'create') {
      Net.send('createRoom', { name });
      this._phase = 'waiting';
    } else {
      const code = this.codeInput.trim().toUpperCase();
      if (code.length < 4) { this.error = 'Enter a 4-letter code'; return; }
      Net.send('joinRoom', { code, name });
      this._phase = 'waiting';
    }
  }

  _hit(r, mx, my) {
    return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
  }

  _keyToChar(code) {
    if (code.startsWith('Key'))   return code[3].toLowerCase();
    if (code.startsWith('Digit')) return code[5];
    if (code === 'Space')         return ' ';
    return null;
  }

  // ── Render ─────────────────────────────────────────────────────────────
  render(ctx) {
    this._drawBg(ctx);

    // Title
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '18px "Press Start 2P", monospace';
    Util.shadowText(ctx, 'SOLSTICE STRIKE', this.W/2, 52, '#FFD700', '#000D', 18, '"Press Start 2P", monospace');
    ctx.restore();

    if (this._phase === 'room')    this._renderRoom(ctx);
    else if (this._phase === 'waiting') this._renderWaiting(ctx);
    else                           this._renderForm(ctx);

    this._drawBackBtn(ctx);
  }

  _drawBg(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, '#030810');
    g.addColorStop(1, '#0D1E38');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
    // Grid
    ctx.strokeStyle = 'rgba(30,60,110,0.22)';
    ctx.lineWidth = 1;
    for (let x = 0; x < this.W; x += 64) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,this.H); ctx.stroke(); }
    for (let y = 0; y < this.H; y += 64) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(this.W,y); ctx.stroke(); }
  }

  _drawBackBtn(ctx) {
    const L = this._roomLayout(); // same position for both phases
    const { x, y, w, h } = this._formLayout().backBtn;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeStyle = 'rgba(60,100,180,0.5)';
    ctx.lineWidth = 1;
    Util.fillRoundRect(ctx, x, y, w, h, 4, 'rgba(0,0,0,0.7)');
    ctx.beginPath(); ctx.roundRect(x+.5,y+.5,w,h,4); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = '#8899BB';
    ctx.fillText('← BACK', x + w/2, y + h/2 + 4);
    ctx.restore();
  }

  _renderForm(ctx) {
    const cx = this._CX, cy = this._CY;
    const L  = this._formLayout();
    const title = this.mode === 'create' ? 'CREATE ROOM' : 'JOIN ROOM';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '16px "Press Start 2P", monospace';
    Util.shadowText(ctx, title, cx, cy - 140, '#E87820', '#000D', 16, '"Press Start 2P", monospace');

    if (this.mode === 'create') {
      // Only name field
      this._drawField(ctx, L.nameField, 'YOUR NAME', this.myName, this._focused === 'name');
    } else {
      // Name field on top, code field below
      const nameF = { ...L.nameField, y: cy - 130 };
      const codeF = { ...L.codeField, y: cy - 60  };
      this._drawField(ctx, nameF, 'YOUR NAME', this.myName,    this._focused === 'name');
      this._drawField(ctx, codeF, 'ROOM CODE', this.codeInput, this._focused === 'code');
      ctx.font      = '9px monospace';
      ctx.fillStyle = 'rgba(140,170,210,0.65)';
      ctx.fillText('TAB to switch field', cx, cy + 12);
    }

    if (this.error) {
      ctx.font      = '10px "Press Start 2P", monospace';
      ctx.fillStyle = '#FF5555';
      ctx.fillText(this.error, cx, cy + 18 + (this.mode === 'join' ? 20 : 0));
    }

    // Submit button
    const sb = L.submitBtn;
    // Adjust y if join mode (fields are higher)
    const adjSB = this.mode === 'join'
      ? { ...sb, y: cy + 60 }
      : sb;
    this._drawBigBtn(ctx, adjSB, this.mode === 'create' ? 'CREATE' : 'JOIN', '#E87820');

    ctx.font      = '9px monospace';
    ctx.fillStyle = 'rgba(130,160,200,0.65)';
    ctx.fillText('Press ENTER to confirm', cx, adjSB.y + adjSB.h + 22);
    ctx.restore();
  }

  _drawField(ctx, r, label, value, focused) {
    ctx.save();
    Util.fillRoundRect(ctx, r.x, r.y, r.w, r.h, 4, 'rgba(0,0,0,0.75)');
    ctx.strokeStyle = focused ? '#E87820' : 'rgba(50,80,140,0.7)';
    ctx.lineWidth   = focused ? 2.5 : 1;
    ctx.beginPath(); ctx.roundRect(r.x+.5, r.y+.5, r.w, r.h, 4); ctx.stroke();

    // Label
    ctx.font      = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = focused ? '#E87820' : 'rgba(140,170,210,0.75)';
    ctx.fillText(label, r.x + 12, r.y - 7);

    // Value + cursor
    ctx.font      = 'bold 20px monospace';
    ctx.fillStyle = focused ? '#FFD700' : '#CCDDEE';
    const display = value + (focused && Math.floor(this._t * 2) % 2 === 0 ? '|' : '');
    ctx.fillText(display || (focused ? '' : '—'), r.x + 14, r.y + r.h - 14);
    ctx.restore();
  }

  _drawBigBtn(ctx, r, label, color) {
    ctx.save();
    // Shadow
    Util.fillRoundRect(ctx, r.x + 4, r.y + 4, r.w, r.h, 6, 'rgba(0,0,0,0.6)');

    // Gradient fill
    const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    g.addColorStop(0, color + 'EE');
    g.addColorStop(1, color + '99');
    Util.fillRoundRect(ctx, r.x, r.y, r.w, r.h, 6, '#00000000');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 6); ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h * 0.45, 6); ctx.fill();

    ctx.textAlign = 'center';
    ctx.font      = '14px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(label, r.x + r.w/2 + 2, r.y + r.h/2 + 6 + 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, r.x + r.w/2, r.y + r.h/2 + 6);
    ctx.restore();
  }

  _renderWaiting(ctx) {
    const cx = this._CX, cy = this._CY;
    const dots = '.'.repeat(~~(this._t * 2) % 4);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '14px "Press Start 2P", monospace';
    Util.shadowText(ctx, `Connecting${dots}`, cx, cy, '#AACCEE', '#000D', 14, '"Press Start 2P", monospace');
    ctx.restore();
  }

  _renderRoom(ctx) {
    const cx = this._CX, cy = this._CY;
    const L  = this._roomLayout();
    const COLORS = ['#E87820','#3870B0','#3A8830','#B89010'];

    // ── Code display ─────────────────────────────────────────────────────
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = '11px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(140,170,210,0.75)';
    ctx.fillText('ROOM CODE', cx, cy - 116);

    // Big code
    ctx.font      = '56px "Orbitron", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(this.code, cx + 3, cy - 63 + 3);
    const codeGrad = ctx.createLinearGradient(cx - 100, cy - 120, cx + 100, cy - 60);
    codeGrad.addColorStop(0, '#FFE080'); codeGrad.addColorStop(1, '#FFD700');
    ctx.fillStyle = codeGrad;
    ctx.fillText(this.code, cx, cy - 63);

    ctx.font      = '10px monospace';
    ctx.fillStyle = 'rgba(120,150,200,0.65)';
    ctx.fillText('share this code with your friends', cx, cy - 36);
    ctx.restore();

    // ── Copy button ───────────────────────────────────────────────────────
    const cp = L.copyBtn;
    const copied = this._copiedFlash > 0;
    this._drawBigBtn(ctx, cp, copied ? '✓ COPIED' : 'COPY', copied ? '#3A8830' : '#2A5090');

    // ── Divider ───────────────────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(60,100,160,0.4)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(cx - 300, cy + 30); ctx.lineTo(cx + 300, cy + 30); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font      = '9px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(100,130,180,0.6)';
    ctx.fillText('PLAYERS', cx, cy + 27);
    ctx.restore();

    // ── Player list ───────────────────────────────────────────────────────
    ctx.save();
    this.players.forEach((p, i) => {
      const itemY = cy + 52 + i * 36;
      const itemX = cx - 200;

      // Row bg
      Util.fillRoundRect(ctx, itemX, itemY - 16, 400, 30, 4,
        p.id === this.myId ? 'rgba(232,120,32,0.12)' : 'rgba(255,255,255,0.04)');

      // Colour dot
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.beginPath(); ctx.arc(itemX + 18, itemY, 8, 0, Math.PI*2); ctx.fill();

      // Name
      ctx.font      = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#DDEEFF';
      ctx.fillText(p.name, itemX + 36, itemY + 5);

      // Badges
      if (i === 0) {
        ctx.font      = '9px "Press Start 2P", monospace';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('HOST', itemX + 36 + p.name.length * 9 + 8, itemY + 5);
      }
      if (p.id === this.myId) {
        ctx.font      = '9px "Press Start 2P", monospace';
        ctx.fillStyle = '#88BBFF';
        ctx.fillText('YOU', itemX + 360, itemY + 5);
      }
    });
    ctx.restore();

    // ── Start button ──────────────────────────────────────────────────────
    if (this.isHost) {
      const canStart = this.players.length >= 2;
      const sb = L.startBtn;
      this._drawBigBtn(ctx, sb,
        canStart ? '▶  START GAME' : 'WAITING FOR PLAYERS...',
        canStart ? '#2A7A2A' : '#334455',
      );
      if (!canStart) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font      = '9px monospace';
        ctx.fillStyle = 'rgba(140,170,210,0.6)';
        ctx.fillText('Need at least 2 players', cx, sb.y + sb.h + 22);
        ctx.restore();
      }
    } else {
      const dots = '.'.repeat(~~(this._t * 2) % 4);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font      = '11px "Press Start 2P", monospace';
      ctx.fillStyle = 'rgba(150,180,220,0.7)';
      ctx.fillText(`Waiting for host${dots}`, cx, L.startBtn.y + L.startBtn.h/2 + 6);
      ctx.restore();
    }

    if (this.error) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillStyle = '#FF5555';
      ctx.fillText(this.error, cx, this.H - 40);
      ctx.restore();
    }
  }

  destroy() { this._subs.forEach(u => u()); }
}

window.LobbyScene = LobbyScene;
