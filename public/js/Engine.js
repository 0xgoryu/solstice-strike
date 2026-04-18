/**
 * Engine — game loop, scene manager, canvas scaling.
 *
 * Logical resolution: 800 × 450 (16:9).
 * Canvas is CSS-scaled to fill the window while keeping aspect ratio.
 * All game coordinates are in logical pixels.
 */
class Engine {
  constructor() {
    this.W   = 800;
    this.H   = 450;

    this.canvas  = document.getElementById('c');
    this.ctx     = this.canvas.getContext('2d');
    this.canvas.width  = this.W;
    this.canvas.height = this.H;
    this.ctx.imageSmoothingEnabled = false;

    this.input   = new Input(this.canvas);

    this._scene      = null;
    this._lastTime   = performance.now();

    this._resize();
    window.addEventListener('resize', () => this._resize());

    requestAnimationFrame(this._loop.bind(this));
  }

  // ── Scene Management ──────────────────────────────────────────────────
  switchScene(name, data = {}) {
    this._scene?.destroy?.();
    switch (name) {
      case 'menu':  this._scene = new MenuScene(this);        break;
      case 'lobby': this._scene = new LobbyScene(this, data); break;
      case 'game':  this._scene = new GameScene(this, data);  break;
    }
  }

  // ── Main Loop ─────────────────────────────────────────────────────────
  _loop(ts) {
    const dt = Math.min((ts - this._lastTime) / 1000, 0.05);
    this._lastTime = ts;

    // Clear
    this.ctx.fillStyle = '#06090F';
    this.ctx.fillRect(0, 0, this.W, this.H);

    // Update + Render
    this._scene?.update(dt, this.input);
    this._scene?.render(this.ctx);

    // Flush one-shot input states AFTER scene has processed them
    this.input.flush();

    requestAnimationFrame(this._loop.bind(this));
  }

  // ── Responsive Canvas ─────────────────────────────────────────────────
  _resize() {
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const scaleX = ww / this.W;
    const scaleY = wh / this.H;
    const scale  = Math.min(scaleX, scaleY);
    this.canvas.style.width  = `${Math.floor(this.W * scale)}px`;
    this.canvas.style.height = `${Math.floor(this.H * scale)}px`;
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const engine = new Engine();
  engine.switchScene('menu', {});
});
