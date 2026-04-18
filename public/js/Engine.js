/**
 * Engine — 1280×720 HD game loop + scene manager.
 * Canvas scales to fill window while preserving 16:9 aspect ratio.
 */
class Engine {
  constructor() {
    this.W = 1280;
    this.H = 720;

    this.canvas = document.getElementById('c');
    this.ctx    = this.canvas.getContext('2d');
    this.canvas.width  = this.W;
    this.canvas.height = this.H;
    this.ctx.imageSmoothingEnabled = false;

    this.input = new Input(this.canvas);

    this._scene    = null;
    this._lastTime = performance.now();

    this._resize();
    window.addEventListener('resize', () => this._resize());
    requestAnimationFrame(this._loop.bind(this));
  }

  switchScene(name, data = {}) {
    this._scene?.destroy?.();
    this._scene = null;
    switch (name) {
      case 'menu':  this._scene = new MenuScene(this);        break;
      case 'lobby': this._scene = new LobbyScene(this, data); break;
      case 'game':  this._scene = new GameScene(this, data);  break;
    }
  }

  _loop(ts) {
    const dt = Math.min((ts - this._lastTime) / 1000, 0.05);
    this._lastTime = ts;

    this.ctx.fillStyle = '#03060E';
    this.ctx.fillRect(0, 0, this.W, this.H);

    this._scene?.update(dt, this.input);
    this._scene?.render(this.ctx);
    this.input.flush();

    requestAnimationFrame(this._loop.bind(this));
  }

  _resize() {
    const scale = Math.min(window.innerWidth / this.W, window.innerHeight / this.H);
    this.canvas.style.width  = `${Math.floor(this.W * scale)}px`;
    this.canvas.style.height = `${Math.floor(this.H * scale)}px`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const engine = new Engine();
  engine.switchScene('menu');
});
