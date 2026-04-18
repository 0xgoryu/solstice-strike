/* ── Utility helpers ──────────────────────────────────────────────────── */
const Util = {
  lerp: (a, b, t) => a + (b - a) * t,
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  dist2: (ax, ay, bx, by) => (ax-bx)**2 + (ay-by)**2,
  dist:  (ax, ay, bx, by) => Math.sqrt(Util.dist2(ax, ay, bx, by)),
  angle: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
  randInt: (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1)),
  randFloat: (lo, hi) => lo + Math.random() * (hi - lo),
  /** Draw a pixel-perfect rectangle border */
  strokeRect(ctx, x, y, w, h, color, lw = 1) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.strokeRect(x + .5, y + .5, w, h); ctx.restore();
  },
  /** Rounded rectangle fill */
  fillRoundRect(ctx, x, y, w, h, r, color) {
    ctx.save(); ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.arcTo(x+w, y,   x+w, y+r,   r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x,   y+h, x,   y+h-r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x,   y,   x+r,  y,   r);
    ctx.closePath(); ctx.fill(); ctx.restore();
  },
  /** Shadow text (pixel game style) */
  shadowText(ctx, text, x, y, color = '#FFF', shadow = '#0008', size = 14, font = 'monospace') {
    ctx.save();
    ctx.font      = `bold ${size}px ${font}`;
    ctx.textAlign = ctx.textAlign; // inherit caller's
    ctx.fillStyle = shadow;
    ctx.fillText(text, x + 2, y + 2);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  },
};
window.Util = Util;
