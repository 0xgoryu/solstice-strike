/**
 * MenuScene — pixel-art start screen.
 * Buttons: CREATE ROOM | JOIN ROOM | HOW TO PLAY
 */
class MenuScene {
  constructor(engine) {
    this.engine  = engine;
    this.W       = engine.W;
    this.H       = engine.H;
    this._screen = 'main';  // main | howto
    this._t      = 0;
    this._btns   = [];
    this._makeButtons();

    // Try loading background image from assets
    this._bg = new Image();
    this._bg.src = '/assets/map/background.png';
    this._bgLoaded = false;
    this._bg.onload  = () => { this._bgLoaded = true; };
    this._bg.onerror = () => {};

    // Logo image
    this._logo = new Image();
    this._logo.src = '/assets/solstice.png';
  }

  _makeButtons() {
    const cx = this.W / 2;
    const y0 = 240;
    const gap = 52;
    this._btns = [
      { id: 'create', label: 'CREATE ROOM', y: y0,       col: '#E87820' },
      { id: 'join',   label: 'JOIN ROOM',   y: y0 + gap, col: '#3870B0' },
      { id: 'howto',  label: 'HOW TO PLAY', y: y0 + gap * 2, col: '#3A8830' },
    ];
  }

  update(dt, input) {
    this._t += dt;

    if (this._screen === 'howto') {
      if (input.wasPressed('Space') || input.wasPressed('Escape') || input.mouse.clicked)
        this._screen = 'main';
      return;
    }

    if (!input.mouse.clicked) return;
    const mx = input.mouse.x, my = input.mouse.y;
    for (const btn of this._btns) {
      if (this._hitBtn(btn, mx, my)) {
        if (btn.id === 'create')  this.engine.switchScene('lobby', { mode: 'create' });
        else if (btn.id === 'join')    this.engine.switchScene('lobby', { mode: 'join' });
        else if (btn.id === 'howto')   this._screen = 'howto';
      }
    }
  }

  _hitBtn(btn, mx, my) {
    const bw = 220, bh = 38;
    const bx = this.W / 2 - bw / 2;
    return mx >= bx && mx <= bx + bw && my >= btn.y - bh / 2 && my <= btn.y + bh / 2;
  }

  render(ctx) {
    if (this._screen === 'howto') { this._renderHowTo(ctx); return; }

    // Background
    if (this._bgLoaded) {
      ctx.drawImage(this._bg, 0, 0, this.W, this.H);
      ctx.fillStyle = 'rgba(4,8,18,0.62)';
      ctx.fillRect(0, 0, this.W, this.H);
    } else {
      this._drawProceduralBg(ctx);
    }

    // Title card
    this._drawTitle(ctx);

    // Buttons
    for (let i = 0; i < this._btns.length; i++) {
      this._drawBtn(ctx, this._btns[i], i);
    }

    // Footer
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = '8px monospace';
    ctx.fillStyle = 'rgba(120,140,180,0.7)';
    ctx.fillText('Made with ☀️  |  2 – 4 players  |  Browser only', this.W / 2, this.H - 12);
    ctx.restore();
  }

  _drawProceduralBg(ctx) {
    // Pixel-art night sky bands
    const bands = [
      [0.0, 0.18, '#07111E'], [0.18, 0.38, '#0D1E38'],
      [0.38, 0.60, '#142C50'], [0.60, 0.80, '#1A4070'],
      [0.80, 1.00, '#286898'],
    ];
    for (const [s, e, c] of bands) {
      ctx.fillStyle = c;
      ctx.fillRect(0, ~~(this.H * s), this.W, ~~(this.H * (e - s)) + 1);
    }
    // Stars
    ctx.fillStyle = '#FFF';
    for (let i = 0; i < 80; i++) {
      const sx = ((2654435761 * (i + 1)) >>> 0) % this.W;
      const sy = ((1013904223 * (i + 1)) >>> 0) % ~~(this.H * 0.6);
      ctx.fillRect(sx, sy, i % 6 === 0 ? 2 : 1, i % 6 === 0 ? 2 : 1);
    }
    // Ground silhouette
    ctx.fillStyle = '#1A0E08';
    ctx.fillRect(0, this.H * 0.76, this.W, this.H * 0.24);
    // Tree silhouettes
    const trees = [60, 130, 200, 320, 500, 640, 750];
    ctx.fillStyle = '#120A04';
    trees.forEach(tx => {
      const th = 30 + ((tx * 13) % 28);
      ctx.fillRect(tx - 2, this.H * 0.76 - th, 4, th);
      ctx.fillRect(tx - 8, this.H * 0.76 - th + 6, 16, th * 0.6);
    });
  }

  _drawTitle(ctx) {
    const cx  = this.W / 2;
    const t   = this._t;

    // Outer glowing panel
    const pw = 440, ph = 120, px = cx - pw / 2, py = 55;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(px, py, pw, ph);

    // Animated top accent bar
    const grad = ctx.createLinearGradient(px, py, px + pw, py);
    grad.addColorStop(0,   '#E87820');
    grad.addColorStop(0.5, '#FFD700');
    grad.addColorStop(1,   '#E87820');
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, pw, 3);

    // Solstice logo in title area
    if (this._logo.complete && this._logo.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx - 155, py + 60, 30, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(this._logo, cx - 185, py + 30, 60, 60);
      ctx.restore();
    }

    // Title text — pixel-style with shadow
    ctx.font = 'bold 38px monospace';
    // Main title shadow
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText('SOLSTICE', cx + 2, py + 52);
    ctx.fillText('STRIKE',   cx + 2, py + 94);
    // Gold gradient on text
    const tg = ctx.createLinearGradient(cx - 120, py + 20, cx + 120, py + 100);
    tg.addColorStop(0, '#FFE080');
    tg.addColorStop(0.5, '#FFFFFF');
    tg.addColorStop(1, '#E87820');
    ctx.fillStyle = tg;
    ctx.fillText('SOLSTICE', cx, py + 50);
    ctx.fillText('STRIKE',   cx, py + 92);

    // Tagline
    ctx.font      = '9px monospace';
    ctx.fillStyle = 'rgba(180,200,255,0.80)';
    ctx.fillText('TURN-BASED CAT ARTILLERY  ·  WORMS STYLE', cx, py + 113);

    ctx.restore();
  }

  _drawBtn(ctx, btn, idx) {
    const bw = 220, bh = 38;
    const bx = this.W / 2 - bw / 2;
    const by = btn.y - bh / 2;
    const mx = this.engine.input.mouse.x;
    const my = this.engine.input.mouse.y;
    const hover = mx >= bx && mx <= bx + bw && my >= by && my <= by + bh;

    // Button shadow
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx + 3, by + 3, bw, bh);

    // Button bg
    ctx.fillStyle = hover ? btn.col : 'rgba(10,16,28,0.90)';
    ctx.fillRect(bx, by, bw, bh);

    // Left colour accent
    ctx.fillStyle = btn.col;
    ctx.fillRect(bx, by, 4, bh);

    // Border
    ctx.strokeStyle = hover ? btn.col : 'rgba(80,100,140,0.6)';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);

    // Label
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = `bold 11px monospace`;
    ctx.fillStyle = hover ? '#FFF' : '#BBCCEE';
    Util.shadowText(ctx, btn.label, this.W / 2, btn.y + 4, hover ? '#FFF' : '#BBCCEE', '#0009', 11);
    ctx.restore();

    // Hover arrow
    if (hover) {
      ctx.save();
      ctx.fillStyle = '#FFD700';
      ctx.font      = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('▶', bx + 10, btn.y + 4);
      ctx.restore();
    }
  }

  _renderHowTo(ctx) {
    ctx.fillStyle = '#06090F';
    ctx.fillRect(0, 0, this.W, this.H);

    const cx = this.W / 2;
    ctx.save();
    ctx.textAlign = 'center';

    ctx.font = 'bold 16px monospace';
    Util.shadowText(ctx, 'HOW TO PLAY', cx, 60, '#FFD700', '#000C', 16);

    const lines = [
      ['CONTROLS', '#E87820'],
      ['Left/Right   Move cat', '#CCC'],
      ['Left Click   Aim & Fire (hold to charge power)', '#CCC'],
      ['Space        Jump', '#CCC'],
      ['', ''],
      ['RULES', '#E87820'],
      ['Take turns firing at opponents', '#CCC'],
      ['Cats eliminated at 0 HP or off-map are DEAD permanently', '#CCC'],
      ['Last cat team standing wins', '#CCC'],
      ['', ''],
      ['MULTIPLAYER', '#E87820'],
      ['One player creates a room → share the 4-letter code', '#CCC'],
      ['Others join with the code  → host presses Start', '#CCC'],
    ];

    let y = 100;
    for (const [text, col] of lines) {
      if (!text) { y += 8; continue; }
      ctx.font      = text === text.toUpperCase() && text.length < 20
        ? 'bold 10px monospace' : '9px monospace';
      ctx.fillStyle = col;
      ctx.fillText(text, cx, y);
      y += text === text.toUpperCase() && text.length < 20 ? 18 : 14;
    }

    ctx.font      = '9px monospace';
    ctx.fillStyle = 'rgba(150,180,220,0.8)';
    ctx.fillText('[ PRESS SPACE OR CLICK TO RETURN ]', cx, this.H - 30);
    ctx.restore();
  }

  destroy() {}
}

window.MenuScene = MenuScene;
