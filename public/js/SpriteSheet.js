/**
 * SpriteSheet — loads a horizontal strip image and steps frames.
 * If the image fails to load, `this.failed = true` so callers can
 * fall back to pixel-art drawing.
 */
class SpriteSheet {
  /**
   * @param {string} src        URL of the spritesheet
   * @param {number} frameW     Width of one frame in px
   * @param {number} frameH     Height of one frame in px
   * @param {number} frameCount Total frames in the strip
   * @param {number} fps        Playback speed
   */
  constructor(src, frameW, frameH, frameCount, fps = 8) {
    this.frameW      = frameW;
    this.frameH      = frameH;
    this.frameCount  = frameCount;
    this.fps         = fps;
    this.frame       = 0;
    this.elapsed     = 0;
    this.failed      = false;
    this.loaded      = false;

    this.img         = new Image();
    this.img.onload  = () => { this.loaded = true; };
    this.img.onerror = () => { this.failed = true;  };
    this.img.src     = src;
  }

  update(dt) {
    this.elapsed += dt;
    if (this.elapsed >= 1 / this.fps) {
      this.elapsed = 0;
      this.frame   = (this.frame + 1) % this.frameCount;
    }
  }

  /**
   * Draw current frame centred at (cx, cy).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx   Centre X
   * @param {number} cy   Foot Y (image drawn above this)
   * @param {number} scaleX  +1 = right, -1 = left (horizontal flip)
   */
  draw(ctx, cx, cy, scaleX = 1) {
    if (!this.loaded || this.failed) return false;
    const sx = this.frame * this.frameW;
    const dw = this.frameW;
    const dh = this.frameH;
    const dx = -dw / 2;
    const dy = -dh;      // feet at cy

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scaleX, 1);
    ctx.drawImage(this.img, sx, 0, this.frameW, this.frameH, dx, dy, dw, dh);
    ctx.restore();
    return true;
  }
}

/** Load a spritesheet and gracefully fallback to null if src is missing */
function loadSprite(src, fw, fh, count, fps) {
  return new SpriteSheet(src, fw, fh, count, fps);
}

window.SpriteSheet = SpriteSheet;
window.loadSprite  = loadSprite;
