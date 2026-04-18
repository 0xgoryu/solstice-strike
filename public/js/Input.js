/**
 * Input — unified keyboard + mouse state.
 * Scenes poll this each frame; no event-driven spaghetti.
 */
class Input {
  constructor(canvas) {
    this.canvas = canvas;

    // Keyboard
    this.keys    = {};    // code → true/false
    this.pressed = {};    // code → true for ONE frame
    this.released= {};

    // Mouse
    this.mouse = { x: 0, y: 0, down: false, clicked: false, released: false };

    this._bindKeyboard();
    this._bindMouse();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', e => {
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      if (['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this.keys[e.code]    = false;
      this.released[e.code] = true;
    });
  }

  _bindMouse() {
    const c = this.canvas;
    const toLocal = e => {
      const r   = c.getBoundingClientRect();
      const scX = c.width  / r.width;
      const scY = c.height / r.height;
      this.mouse.x = (e.clientX - r.left) * scX;
      this.mouse.y = (e.clientY - r.top)  * scY;
    };
    c.addEventListener('mousemove',  e => toLocal(e));
    c.addEventListener('mousedown',  e => { toLocal(e); this.mouse.down = true;  this.mouse.clicked  = true; });
    c.addEventListener('mouseup',    e => { toLocal(e); this.mouse.down = false; this.mouse.released = true; });
    // Touch (basic)
    c.addEventListener('touchstart', e => {
      const t = e.touches[0];
      const r = c.getBoundingClientRect();
      this.mouse.x = (t.clientX - r.left) * (c.width  / r.width);
      this.mouse.y = (t.clientY - r.top)  * (c.height / r.height);
      this.mouse.down = true; this.mouse.clicked = true;
      e.preventDefault();
    }, { passive: false });
    c.addEventListener('touchend', e => {
      this.mouse.down = false; this.mouse.released = true;
      e.preventDefault();
    }, { passive: false });
  }

  /** Call at END of each frame to flush one-shot states */
  flush() {
    this.pressed  = {};
    this.released = {};
    this.mouse.clicked  = false;
    this.mouse.released = false;
  }

  isDown(code)     { return !!this.keys[code]; }
  wasPressed(code) { return !!this.pressed[code]; }
}

window.Input = Input;
