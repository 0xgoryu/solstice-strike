/**
 * Network — singleton Socket.io wrapper.
 * All game communication goes through window.Net.
 */
class Network {
  constructor() {
    this.socket   = io();
    this.myId     = null;
    this.roomCode = null;
    this._subs    = new Map(); // event → Set of callbacks

    this.socket.on('connect', () => { this.myId = this.socket.id; });
    this.socket.onAny((event, data) => {
      this._subs.get(event)?.forEach(cb => cb(data));
    });
  }

  send(event, data = {}) { this.socket.emit(event, data); }

  on(event, cb) {
    if (!this._subs.has(event)) this._subs.set(event, new Set());
    this._subs.get(event).add(cb);
    return () => this.off(event, cb);
  }

  off(event, cb) { this._subs.get(event)?.delete(cb); }

  offScene(events) { events.forEach(e => this._subs.delete(e)); }

  once(event, cb) {
    const wrap = d => { this.off(event, wrap); cb(d); };
    this.on(event, wrap);
  }
}
window.Net = new Network();
