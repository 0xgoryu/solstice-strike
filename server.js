/**
 * Solstice Strike — Authoritative Server
 * Owns: room management, turn order, damage validation, win detection.
 * Clients send inputs; server computes outcomes and broadcasts to all.
 */
'use strict';

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const crypto     = require('crypto');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

// ─── Room store ───────────────────────────────────────────────────────────
/** @type {Map<string, Room>} */
const rooms = new Map();

function uid() { return crypto.randomBytes(2).toString('hex').toUpperCase(); }

// ─── Seeded LCG terrain generator ────────────────────────────────────────
function genTerrain(seed, W = 1600, H = 600) {
  let s = (seed >>> 0) || 1;
  const rng = () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0xFFFFFFFF; };

  const base   = H * 0.55;
  const phases = Array.from({ length: 7 }, () => rng() * Math.PI * 2);
  const h      = new Float32Array(W);

  for (let x = 0; x < W; x++) {
    let y = base;
    y += Math.sin(x * 0.0032 + phases[0]) * 95;
    y += Math.sin(x * 0.0080 + phases[1]) * 52;
    y += Math.sin(x * 0.0220 + phases[2]) * 26;
    y += Math.sin(x * 0.0600 + phases[3]) * 14;
    y += Math.sin(x * 0.1400 + phases[4]) *  7;
    y += Math.sin(x * 0.3200 + phases[5]) *  4;
    y += rng() * 4 - 2;
    h[x] = Math.max(H * 0.26, Math.min(H * 0.84, y));
  }

  // Smooth passes
  for (let p = 0; p < 4; p++)
    for (let x = 1; x < W - 1; x++)
      h[x] = (h[x - 1] + h[x] * 2 + h[x + 1]) / 4;

  return Array.from(h); // plain array for JSON
}

// ─── Build initial game state ─────────────────────────────────────────────
function buildGameState(players, seed) {
  const W      = 1600;
  const H      = 600;
  const waterY = H - 38;

  const terrain = genTerrain(seed, W, H);
  const COLORS  = ['#E87820', '#3870B0', '#3A8830', '#B89010'];
  const CNAMES  = [['Mochi', 'Ember'], ['Neko', 'Storm'], ['Pixel', 'Leaf'], ['Nyaa', 'Gold']];

  const teams = players.map((p, ti) => {
    const secW = W / players.length;
    return {
      playerId: p.id,
      name:     p.name,
      color:    COLORS[ti % COLORS.length],
      teamIdx:  ti,
      cats: Array.from({ length: 2 }, (_, ci) => {
        const rawX  = Math.floor(secW * ti + secW * (0.25 + ci * 0.50));
        const cx    = Math.max(40, Math.min(W - 40, rawX));
        return {
          id:    `${p.id}:${ci}`,
          label: CNAMES[ti % CNAMES.length][ci],
          x:     cx,
          y:     terrain[cx] ?? H * 0.55,
          hp:    100,
          alive: true,
        };
      }),
    };
  });

  return { teams, terrain, W, H, waterY, currentTeamIdx: 0, turnCount: 0 };
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function aliveTeams(gs) { return gs.teams.filter(t => t.cats.some(c => c.alive)); }

function advanceTurn(code) {
  const room = rooms.get(code);
  if (!room?.gs) return;
  clearTimeout(room.timer);

  const gs    = room.gs;
  gs.turnCount++;
  const count = gs.teams.length;
  let   next  = (gs.currentTeamIdx + 1) % count;
  let   guard = 0;
  while (!gs.teams[next].cats.some(c => c.alive) && guard++ < count)
    next = (next + 1) % count;

  gs.currentTeamIdx = next;
  startTurn(code);
}

function startTurn(code) {
  const room = rooms.get(code);
  if (!room?.gs) return;

  room.wind = parseFloat(((Math.random() - 0.5) * 3.0).toFixed(2));
  const team = room.gs.teams[room.gs.currentTeamIdx];

  io.to(code).emit('turnStart', {
    teamIdx:  room.gs.currentTeamIdx,
    playerId: team.playerId,
    wind:     room.wind,
    timeLeft: 30,
  });

  // Auto-advance if turn timer expires
  room.timer = setTimeout(() => advanceTurn(code), 32_000);
}

function checkWin(code) {
  const room = rooms.get(code);
  if (!room?.gs) return false;
  const alive = aliveTeams(room.gs);
  if (alive.length <= 1) {
    io.to(code).emit('gameOver', { winner: alive[0] ?? null });
    clearTimeout(room.timer);
    rooms.delete(code);
    return true;
  }
  return false;
}

// ─── Socket handlers ──────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[+] ${socket.id}`);

  /* CREATE ROOM */
  socket.on('createRoom', ({ name }) => {
    let code; do { code = uid(); } while (rooms.has(code));
    const room = {
      code, host: socket.id, wind: 0, timer: null, gs: null,
      players: [{ id: socket.id, name }], started: false,
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data = { code, name };
    socket.emit('roomCreated', { code, playerId: socket.id });
  });

  /* JOIN ROOM */
  socket.on('joinRoom', ({ code, name }) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room)               return socket.emit('joinError', 'Room not found');
    if (room.started)        return socket.emit('joinError', 'Game already started');
    if (room.players.length >= 4) return socket.emit('joinError', 'Room is full');

    room.players.push({ id: socket.id, name });
    socket.join(code);
    socket.data = { code, name };
    socket.emit('roomJoined',  { code, playerId: socket.id, players: room.players });
    socket.to(code).emit('playerJoined', { id: socket.id, name });
  });

  /* START GAME (host only) */
  socket.on('startGame', () => {
    const room = rooms.get(socket.data?.code);
    if (!room || room.host !== socket.id) return;
    if (room.players.length < 2) return socket.emit('gameError', 'Need at least 2 players');
    const seed = (Math.random() * 1e8) | 0;
    room.gs      = buildGameState(room.players, seed);
    room.started = true;
    io.to(room.code).emit('gameStarted', room.gs);
    setTimeout(() => startTurn(room.code), 1400);
  });

  /* FIRE WEAPON — shooter sends aim params, server rebroadcasts */
  socket.on('fireWeapon', ({ angle, power }) => {
    const room = rooms.get(socket.data?.code);
    if (!room?.gs) return;
    if (room.gs.teams[room.gs.currentTeamIdx].playerId !== socket.id) return;
    clearTimeout(room.timer);
    io.to(room.code).emit('weaponFired', {
      teamIdx: room.gs.currentTeamIdx,
      angle:   +angle,
      power:   Math.max(5, Math.min(100, +power)),
      wind:    room.wind,
    });
  });

  /* MOVE RELAY — send cat movement to other players for visual sync */
  socket.on('catMoved', data => {
    const room = rooms.get(socket.data?.code);
    if (!room?.gs) return;
    if (room.gs.teams[room.gs.currentTeamIdx].playerId !== socket.id) return;
    socket.to(room.code).emit('catMoved', data);
  });

  /* EXPLOSION — shooter reports hit list; server validates + broadcasts */
  socket.on('reportExplosion', ({ x, y, damages }) => {
    const room = rooms.get(socket.data?.code);
    if (!room?.gs) return;
    if (room.gs.teams[room.gs.currentTeamIdx].playerId !== socket.id) return;

    // Apply damage to authoritative state
    (damages ?? []).forEach(({ catId, damage }) => {
      for (const t of room.gs.teams) {
        const cat = t.cats.find(c => c.id === catId);
        if (cat && cat.alive) {
          cat.hp    = Math.max(0, cat.hp - Math.max(0, Math.min(999, +damage)));
          cat.alive = cat.hp > 0;
        }
      }
    });

    io.to(room.code).emit('explosionResult', { x: +x, y: +y, damages });

    if (!checkWin(room.code))
      setTimeout(() => advanceTurn(room.code), 2600);
  });

  /* CAT DIED (fell off map / drowned) */
  socket.on('catKilled', ({ catId }) => {
    const room = rooms.get(socket.data?.code);
    if (!room?.gs) return;
    for (const t of room.gs.teams) {
      const c = t.cats.find(c => c.id === catId);
      if (c) { c.hp = 0; c.alive = false; }
    }
    io.to(room.code).emit('catKilled', { catId });
    checkWin(room.code);
  });

  /* DISCONNECT */
  socket.on('disconnect', () => {
    const code = socket.data?.code;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.to(code).emit('playerLeft', { name: socket.data.name });
    if (room.players.length === 0) { clearTimeout(room.timer); rooms.delete(code); }
    console.log(`[-] ${socket.data.name} left ${code}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`\n☀️  Solstice Strike  →  http://localhost:${PORT}\n`));
