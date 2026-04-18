# ☀️ Solstice Strike

A polished 2D turn-based artillery game — **Worms-style, cat-themed**, built with pure Canvas 2D + Node.js + Socket.io.

---

## 🗂 Project Structure

```
solstice-strike/
├── server.js                    ← Authoritative game server
├── package.json
└── public/
    ├── index.html
    ├── assets/                  ← ⚡ PUT YOUR REPO ASSETS HERE
    │   ├── solstice.png         (projectile logo)
    │   ├── cats/
    │   │   ├── cat1/idle.png walk.png aim.png hit.png
    │   │   ├── cat2/ ...
    │   │   ├── cat3/ ...
    │   │   └── cat4/ ...
    │   └── map/
    │       └── background.png
    └── js/
        ├── Util.js              shared math / draw helpers
        ├── Input.js             keyboard + mouse state
        ├── Network.js           Socket.io wrapper
        ├── SpriteSheet.js       animation frame manager
        ├── Camera.js            scrolling viewport
        ├── Engine.js            game loop + scene manager
        ├── game/
        │   ├── Terrain.js       deformable heightmap
        │   ├── Cat.js           entity + sprite + state machine
        │   ├── Projectile.js    ballistic physics
        │   └── Effects.js       particles + screen shake
        ├── ui/
        │   └── HUD.js           timer, wind bar, HP bars, power bar
        └── scenes/
            ├── MenuScene.js     pixel-art start screen
            ├── LobbyScene.js    create / join room UI
            └── GameScene.js     full gameplay scene
```

---

## 🚀 Running Locally

```bash
# 1. Clone
git clone https://github.com/0xgoryu/solstice-strike.git
cd solstice-strike

# 2. Install server deps
npm install

# 3. Start
npm start
# → http://localhost:3000

# Dev mode (auto-restart):
npm run dev
```

### Playing with 2 players locally
1. Open `http://localhost:3000` in **two browser windows**
2. Window 1 → **CREATE ROOM** → note the 4-letter code
3. Window 2 → **JOIN ROOM** → enter the code
4. Window 1 (host) → **START GAME**

---

## 🎨 Connecting Your Repo Assets

The engine tries to load sprites from these paths automatically:

| Asset | Expected path |
|---|---|
| Cat 1 idle | `/assets/cats/cat1/idle.png` |
| Cat 1 walk | `/assets/cats/cat1/walk.png` |
| Cat 1 aim  | `/assets/cats/cat1/aim.png`  |
| Cat 1 hit  | `/assets/cats/cat1/hit.png`  |
| Cat 2–4    | `/assets/cats/cat2/`, `/cat3/`, `/cat4/` |
| Background | `/assets/map/background.png` |
| Projectile | `/assets/solstice.png` |

If your files are named differently (e.g. `cat1_idle.png`), edit the path template in `Cat.js`:
```js
// Cat.js line ~12
const CAT_ASSET = (n, state) => `/assets/cats/cat${n + 1}/${state}.png`;
```

**Frame dimensions** — edit `FRAME_CFG` in `Cat.js`:
```js
const FRAME_CFG = { fw: 48, fh: 48, idle: 4, walk: 6, aim: 2, hit: 4 };
```

If a sprite fails to load, the engine **automatically falls back to pixel-art cats** so the game is always playable.

---

## 🕹 Controls

| Input | Action |
|---|---|
| `A` / `←` | Move left |
| `D` / `→` | Move right |
| `Space` | Jump |
| Mouse move | Aim (angle follows cursor) |
| Left click hold | Charge power |
| Left click release | Fire! |

---

## ☁️ Deploying Online

### Render.com (free)
1. Push to GitHub
2. New Web Service → connect repo
3. Build: `npm install` · Start: `node server.js`
4. Done — get a public URL to share

### Railway
```bash
npm i -g @railway/cli && railway login && railway init && railway up
```

---

## 🔧 Expanding the Game

### Add weapons
In `GameScene._doFire()` pass a `weaponType` param. In `server.js` rebroadcast it. In `GameScene` choose which `Projectile` subclass to instantiate — e.g. a `GrenadeProjectile` that bounces before exploding.

### Better animations
`SpriteSheet` already handles multi-frame strips. Just update `FRAME_CFG.count` and the fps. Add a `death` animation by adding a `dead` entry and calling `setState('dead')` on kill.

### More rooms / matchmaking
Add a lobby browser endpoint in `server.js`:
```js
app.get('/api/rooms', (_, res) =>
  res.json([...rooms.values()].filter(r => !r.started).map(r => ({ code: r.code, players: r.players.length })))
);
```

### Maps / biomes
`Terrain.genTerrain()` on the server takes a `seed`. Pass different generation params for "island", "cave", or "moon" maps.

### Sound effects
```js
const snd = new Audio('/assets/sfx/explosion.wav');
snd.play();
```
Trigger in `Effects.explosion()`.

---

*Built with ☀️ — pure Canvas 2D, no heavy frameworks.*
