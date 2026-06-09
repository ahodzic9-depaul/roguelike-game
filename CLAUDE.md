# Realm of Legends — CLAUDE.md

Project context for AI-assisted development. Read this at the start of every session instead of asking the user to re-explain the spec.

---

## Project overview

Browser-based roguelike built in vanilla JS + HTML5 Canvas. No build step, no framework. Open `index.html` directly (or serve with `python3 -m http.server`). Canvas is 1280×720 (`W`/`H` constants in `constants.js`).

---

## File structure

```
index.html          — page layout: HUD bars + canvas wrapper (see Layout section)
src/
  constants.js      — W, H, STATE enum, COLORS palette
  input.js          — Input singleton (WASD, arrows, mouse, keyboard)
  characters.js     — CHARACTERS array (Kaido, Dio, Levi) — colors inlined here, NOT via COLORS
  powers.js         — POWERS array (6 powers) + pickPowers() + canvas icon fallbacks
  assets.js         — Assets singleton: image loader, drawSprite(), drawPowerIcon()
  screens.js        — All non-gameplay screens + shared helpers (drawBackground, glowText, etc.)
  gameplay.js       — Core gameplay loop: room, player, enemies, attacks, HUD, power mechanics
  main.js           — Game entry point, requestAnimationFrame loop, state machine
assets/             — Image files (JPEGs/PNGs for sprites, PNGs for power icons)
```

Scripts must be loaded in this order in index.html: constants → characters → powers → assets → input → screens → gameplay → main.

---

## Page layout (index.html)

The body is a flex column. The HUD lives in HTML elements outside the canvas, not drawn on it:

```
body (flex-column, 100vh)
├── #hud-top   (40px, display:none → toggled to flex during STATE.PLAYING)
│     left:  HP label + bar track + fill + "200 / 200" text
│     right: character name (colored glow) + power name + cooldown state
├── #canvas-wrap (flex:1, centers canvas)
│     └── #gameCanvas  (1280×720 logical, CSS: max-width/max-height 100%, aspect-ratio 16/9)
└── #hud-bottom (32px, display:none → toggled to flex during STATE.PLAYING)
      center: "FLOOR 1  ·  ROOM 2 / 4" in large spaced caps
```

`_setHUD(visible)` in `main.js` toggles the bars each frame. It checks `currentState === STATE.PLAYING && !(gp && gp.cinematic)` — HUD is hidden during the Gojo death cinematic.

`_updateHUD()` in `gameplay.js` writes values to DOM elements every frame (called from `drawGameplay`). Active power cooldown is shown in `#hud-power-name` as `"Power  (3s)"` or `"Power  [E]"` when ready.

---

## State machine (`STATE` enum in constants.js)

```
CHAR_SELECT → POWER_SELECT → PLAYING
                                ↓ floor 1 boss defeated (ENTER)
                             UPGRADE  (choose stat boost, heal 50%)
                                ↓ confirm
                             PLAYING  (floor 2)
                                ↓ floor 2 boss defeated (ENTER)
                           STAT_BOOST  (choose stat boost, heal 60%)
                                ↓ confirm
                             PLAYING  (floor 3)
                                ↓ Gojo defeated → cinematic → auto-advance
                               WIN  → CHAR_SELECT on ENTER
                                ↕ (game over at any floor → restart floor 1 via ENTER)
DEV_POWERS  (F1 overlay, only accessible from POWER_SELECT; ESC or F1 to dismiss)
```

`DEV_POWERS`: shows all 6 powers in a 3×2 grid. **Clicking a card assigns that power and immediately starts the run**. F1 hint shown only on Power Select.

**Floor transition flow** — Floors 1/2: "BOSS DEFEATED" overlay, ENTER sets `gp.floorComplete = true`, main.js transitions to UPGRADE/STAT_BOOST. Floor 3 (Gojo): cinematic triggers immediately when `b.isDead` is set — no deathTimer countdown, no bossDefeated overlay. Cinematic auto-sets `gp.floorComplete = true` at the end.

**UPGRADE screen** (after floor 1) — 3 cards, click once to select, click again or ENTER to confirm:
- DAMAGE UP: +25% attack damage
- ABILITY CD: ability cooldown −30% (stored as `power.cooldownMult = 0.70`; read in `_activatePower`)
- VITALITY: +20% Max HP; also grants full HP restore instead of 50%

**STAT_BOOST screen** (after floor 2) — same card UI:
- MAX HP +30%: full HP restore on advance
- DAMAGE +30%
- SPEED +25%

All non-HP-boost options grant 50% (upgrade) or 60% (stat boost) of missing HP on floor advance. The MAX HP options restore to the new max.

`initGameplay(char, power, opts)` now accepts an optional third argument `opts = { floor, startHp }` for starting on floor 2/3 with carried-over HP and boosted stats.

---

## Characters (`src/characters.js`)

Colors are **hardcoded inline** in each character object — do NOT change them via `COLORS` in constants.js.

| Character | HP  | Damage | Speed | Role          | Color theme        |
|-----------|-----|--------|-------|---------------|--------------------|
| Kaido     | 200 | 25     | 2.5   | High HP, slow | Deep blue `#60a5fa` |
| Dio       | 80  | 45     | 3.5   | Glass cannon  | Gold `#eab308`      |
| Levi      | 120 | 15     | 5.5   | High speed    | Green `#4ade80`     |

Each color object: `{ main, dark, mid, glow }` where `glow` is an `rgba(r,g,b,` prefix string.

`speed` stat (1–6 scale) drives both movement (`speed * 58` px/s) and attack rate scaling.

---

## Attacks (all implemented in `gameplay.js`)

### Kaido — Fire Breath (Brimstone-style)
- Hold an arrow key to charge (must hold full `KB_CHARGE_MAX = 1.0s`)
- Release to fire a cone beam for `KB_FIRE_DUR = 1.0s`; internal state is `'firing'` (not `'fire'`)
- Beam is narrow at origin (`nearThick=18`), wide at tip (`farThick=90`), length 380
- Damage ticks every **0.04s** at `damage * 0.05` per tick — same total DPS as 0.12s/0.15 but 3× the visual ticks so HP chips away gradually
- Cooldown: `KB_COOLDOWN = 1.6s / speed_factor`
- Pressing attack again while firing cancels and starts charging immediately
- **Sprite**: idle during cooldown/idle, `charge` pose while charging, `attack` pose while firing; rotated for up/down directions

### Dio — Knife Barrage (Isaac-style tears)
- Arrow key held → fires a knife every `0.9s / speed_factor`
- **No gravity** — knives fly perfectly straight; no arc or drop
- Hitbox: `w:20, h:14`; visual knife has blade, crossguard, wrapped brown grip, metal pommel
- Knife lifetime 2.0s, despawns on hitting enemy or wall
- Diagonal shooting supported
- With **Spin** power: Isaac-style lock-on homing — see Spin section

### Levi — Blade Sweep
- Arrow key tap → semi-circle hitbox (radius 130, span ±0.58π)
- **Hitbox matches visual**: damage zone is `arcInner` (r×0.22) to `arcOuter` (r×0.94), expanded by target half-size
- `arcInner`/`arcOuter` are local variables in `_handleAttack` — they are **not stored on the sweep object**. `_gojoRedHitByPlayer` derives them from `sw.r` directly.
- Cooldown: `0.42s / speed_factor`
- With **Spin** power: sweep auto-aims toward nearest enemy **or boss**

---

## Powers (`src/powers.js` + `gameplay.js`)

All 6 powers are implemented. `gp.powerState` holds runtime state.

| ID            | Type    | Color   | Effect (implemented)                                                |
|---------------|---------|---------|---------------------------------------------------------------------|
| haki          | passive | amber   | 35% damage reduction on every hit (`dmg * 0.65`, ceiled); spiky 16-point amber polygon aura behind player; HP bar gets gold gradient + amber glow |
| timestop      | active  | violet  | Freeze all enemies **and bosses** 3s; 3 expanding ripple shockwaves; faint violet screen vignette; 10s cooldown |
| ally_summon   | active  | green   | Spawn allied fighter near player (80HP, speed 115, damage = char.damage×0.39, 8s life); 14s cooldown. **Against Gojo: ally only pursues Gojo when `b.stunTimer > 0` (barrier down). When barrier is up, ally wanders after normal enemies only.** |
| spin          | passive | orange  | **Not offered to Kaido**. Dio knives: lock-on homing. Levi sweeps: auto-aims toward nearest enemy or boss. **During Gojo fight**: red ball takes priority over enemies/boss for both knife lock-on and Levi sweep angle. |
| king_crimson  | active  | rose    | Dash 200px in `moveDir`; 5 afterimages along dash path; glow ring + TV scanline distortion; 5s cooldown |
| awakening     | passive | purple  | 20% crit chance via `_critDamage(base)`; spiky 14-point purple polygon aura; 6 orbiting particles |

### Spin — Gojo fight priority
When `gp.power.id === 'spin'` and a `red_ball` attack is active with `dir === 'toward_player'`:
- **Dio knives**: red ball is found first at fire time (`gp.bossAttacks.find(...)`) and stored as `lockTarget` with `lockType = 'red_ball'`. Homing aims at `t.cx / t.cy`; alive check uses `!t.done`.
- **Levi sweep**: red ball angle overrides the normal nearest-enemy/boss sweep angle.
- This only applies while `dir === 'toward_player'`. Once returned, normal targeting resumes.

### Active power UX
- E key triggers active powers (`Input.justPressed('KeyE')` in `_updatePlayer`)
- Cooldown recharge arc drawn below player shadow (power color, 9px radius ring)
- HUD shows `"Power  [E]"` when ready, `"Power  (Xs)"` while on cooldown

### `gp.powerState` shapes
- `timestop`:     `{ cooldown, cooldownMax:10, frozen:bool, frozenTimer:float, duration:3.0, ripples:[] }`
- `ally_summon`:  `{ cooldown, cooldownMax:14, allies:[] }`
- `king_crimson`: `{ cooldown, cooldownMax:5, afterimages:[], glowTimer:float, staticTimer:float }`
- passives (haki, spin, awakening): `{ cooldown:0, cooldownMax:0 }`

---

## Floor/room generation (`_generateRooms()` in gameplay.js)

| Floor | Room sequence                               |
|-------|---------------------------------------------|
| 1     | tutorial → 2–3 combat → boss               |
| 2     | tutorial → 3–4 combat → boss               |
| 3     | tutorial → 0–1 combat → boss (Gojo, fixed) |

Tutorial room: empty, controls shown on floor, door always open.
Combat room: 3–4 enemies; door locked until all cleared.
Boss room: boss fight.

---

## Room layout and 2.5D visual style

```
ROOM = { x: 80, y: 60, w: 1120, h: 600 }
PW=56, PH=72       // player sprite (hitbox)
EW=46, EH=46       // basic enemy sprite
BW=68, BH=80       // boss hitbox (Kira, Enel, Gojo)
DOOR_H=84          // right-wall door height, vertically centered
BOMB_MIN_SEP=88    // minimum px between active bomb centers
```

Player is drawn at 1.7× visual scale (`VS=1.7`) centered on the hitbox; hitbox is unchanged.

### Drawing order in `drawGameplay`

```
_drawRoom                 ← room + boss door (red if next room is boss) + left dev door
_drawTutorialFloor        ← tutorial controls panel (floor layer, under player)
_drawActiveAttacks
_drawProjectiles(ctx, t)  ← spin trail drawn here, before knife blade
_drawBossAttacks          ← bombs + SHA + lightning + Gojo attacks (floor level, under characters)
_drawEnemies
_drawBoss                 ← Kira / Enel / Gojo sprite
_drawPowerAura            ← Haki + Awakening spiky auras, BEHIND player sprite
_drawPlayer
_drawKaidoBreathCharge    (Kaido only)
_drawPowerEffects         ← allies, afterimages, frozen ripples/overlay, KC glow, Awakening particles
_drawCombatHint           ← floating speech bubble hints near player (one-time, Gojo fight)
_drawVoidTell             ← Gojo Domain Expansion tell (2s warning before Void); only when b.voidTellTimer > 0
_drawInfiniteVoid         ← Gojo Infinite Void overlay (dark screen + shadow hands); only when b.voidTimer > 0
_drawBossHUD              ← canvas boss HP bar at top of screen
_drawBossIntro            ← 2.8s name overlay when entering boss room
[overlays: BOSS DEFEATED, ROOM CLEARED, GAME OVER, devBossSelect]
_updateHUD                ← DOM update, not canvas
```

If `gp.cinematic` is set, `drawGameplay` calls `_drawGojoCinematic(ctx, t)` and returns immediately — nothing else draws.

---

## Enemy system

Basic enemy only (red square with yellow eyes):
- HP: 60, Speed: 90 px/s, Damage: 12 per hit
- Chases player directly; knocked back on hit (`knockbackTimer = 0.14s`)
- HP bar drawn above enemy
- Player gets 1.2s of iFrames after taking damage
- Enemies are frozen (no movement, no damage) during Timestop

---

## HUD (DOM-based, not canvas)

- **Top bar** (`#hud-top`, 40px): HP track + fill (color-shifts green→amber→red) + "200/200" text on left; character name (colored glow) + power name on right
- **Bottom bar** (`#hud-bottom`, 32px): Floor/room counter centered, bold 14px Courier, 3px letter-spacing
- **Hidden** during `gp.cinematic` — `_setHUD` checks `!(gp && gp.cinematic)`
- **Gojo HP bar** — `barY = 42` (pushed down so it's fully visible below the canvas top edge)

---

## Assets system (`src/assets.js`)

`Assets.init()` returns a `Promise.allSettled` — the render loop only starts after all images settle.

### Image loading
- PNG takes priority over JPG for every key (checked first, falls back to JPG on 404)
- JPGs run through `_stripBackground()`: flood-fill from edges removes connected near-black (<30) or near-white (>225) pixels
- PNGs used as-is (already have transparency)

### Character sprite keys
Each character has images: `idle_down`, `idle_up`, `idle_side`, `attack`. Kaido additionally has `charge`.

- **Idle**: `idle_side` flipped for left-facing; `idle_up` for up; `idle_down` for down/default
- **Attack**: direction-specific per character
- **Fit modes**: `'stretch'` (gameplay), `'cover-top'` (portrait on card)
- Walk tilt: `Math.sin(t * 0.008) * 0.14` radians applied when `isMoving`
- Gameplay sprite drawn at 1.7× hitbox size, centered on hitbox

### Boss / attack images
All boss and attack images are PNG-only. Drop into `assets/` and reload.

| File | Getter | Used in | Fallback |
|------|--------|---------|----------|
| `bomb.png` | `Assets.getBombImg()` | `_drawBossAttacks` bomb | Canvas dark sphere with fuse |
| `sheer_heart_attack.png` | `Assets.getSHAImg()` | `_drawBossAttacks` SHA | Canvas skull-face tank |
| `kira.png` | `Assets.getKiraImg()` | `_drawKiraSprite` | Canvas pinstripe suit figure |
| `enel.png` | `Assets.getEnelImg()` | `_drawEnelSprite` | Canvas white robe figure |
| `enel_death.png` | `Assets.getEnelDeathImg()` | Enel death phases A/B/C | Canvas shocked face |
| `gojo.png` | `Assets.getGojoImg()` | `_drawGojoSprite` idle/default | Canvas blindfolded figure |
| `gojo_purple.png` | `Assets.getGojoPurpleImg()` | Hollow Purple charging pose | Falls back to `gojo.png` |
| `gojo_red.png` | `Assets.getGojoRedImg()` | Red ball catch/throw pose (`gojoReturnDelay > 0`) | Falls back to `gojo.png` |
| `gojo_death.png` | `Assets.getGojoDeathImg()` | Gojo death cinematic reveal + death phases | Falls back to `gojo.png` |
| `purple_ball.png` | `Assets.getPurpleBallImg()` | Hollow Purple ball + barrier_purple | Canvas radial gradient purple orb |
| `blue_orb.png` | `Assets.getBlueOrbImg()` | Blue orb (left wall) | Canvas radial gradient blue orb |
| `red_ball.png` | `Assets.getRedBallImg()` | Red volleyball | Canvas radial gradient red orb |

Boss sprites drawn at 1.8× hitbox size (`contain` fit, centered on hitbox center). Flash tint applied as semi-transparent color rect overlay.

---

## Input system (`src/input.js`)

`Input` is an IIFE singleton:
- `Input.moveDir` — `{x, y}` unit vector from WASD (normalized diagonals)
- `Input.shootDir` — `{x, y}` from arrow keys, or `null` when no arrow held
- `Input.clicked` — true for one frame on mouse click
- `Input.justPressed(code)` — true for one frame on keydown
- `Input.key(code)` — held state
- Mouse coordinates auto-correct for CSS scaling via `canvas.getBoundingClientRect()`

---

## Screen helpers (`src/screens.js`)

- `roundRect(ctx, x, y, w, h, r)` — path only, no fill/stroke
- `glowText(ctx, text, x, y, color, blur, font)` — centered glow text
- `wrapTextCenter` / `wrapText` — word-wrap helpers
- `drawBackground(ctx, t)` — animated starfield + vignette
- `drawStatBar(ctx, label, value, x, y, w, color)` — labeled progress bar
- `drawUpgradeScreen` / `updateUpgradeScreen` — floor 1 upgrade card picker
- `drawStatBoostScreen` / `updateStatBoostScreen` — floor 2 stat boost card picker
- `drawWinScreen(ctx, t)` — victory screen; ENTER handled by main.js

---

## Boss system (`gameplay.js`)

All boss logic lives in `gameplay.js`. `gp.boss` holds the active boss object; `gp.bossAttacks[]` holds all in-flight boss attacks.

### Boss object shared fields
`_spawnBoss(type)` builds the boss object. Every boss has:
- `glowColor` — used by `_drawBossIntro` title glow and `_drawBossHUD` name shadow
- `particleA`, `particleB` — death scatter particle colors
- `introTimer: 2.8` — boss stands still and attacks are blocked while > 0

### Boss HP scaling (`_bossHp()`)

| Character | Approx DPS | Boss HP |
|-----------|-----------|---------|
| Kaido | ~15 | 250 |
| Dio | ~50 | 800 |
| Levi | ~56 | 900 |

### Dev skip room
Left-side purple door on the first tutorial room → `gp.devBossSelect = true` → full-screen boss picker. Clicking a boss calls `_launchDevBossFight(type)`.

**`_launchDevBossFight(bossType)`** now sets `gp.floor` correctly: kira → 1, enel → 2, gojo → 3. This ensures all floor-dependent logic (cinematic, post-boss messages, floorComplete path) works during dev testing.

**Dev boss select lineup**: Kira (Floor 1), Enel (Floor 2), Gojo (Floor 3).

### Kira — implemented (Floor 1)

`glowColor: '#7c3aed'`, `particleA: '#7c3aed'`, `particleB: '#dc2626'`

| Stat         | Phase 1                  | Phase 2 (< 50% HP)              |
|--------------|--------------------------|----------------------------------|
| HP           | scaled (see _bossHp)     | —                                |
| Speed        | 105 px/s                 | ~163 px/s (1.55×)                |
| Movement     | Random patrol (0.8–1.35s)| 65% chase player, 35% random     |
| Bomb rate    | 1 bomb / 2.9s            | 2 bombs / 2.1s                   |
| Bomb fuse    | 1.9s                     | 1.5s                             |
| Bomb damage  | 22                       | 28                               |
| SHA rate     | 1 every 8s               | 1 every 4.5s                     |

**Death** — 2.2s: Phase A cartoon explosion, Phase B Team Rocket upward-right launch.

### Enel — implemented (Floor 2)

`glowColor: '#7dd3fc'`, `particleA: '#7dd3fc'`, `particleB: '#bae6fd'`

All Enel visuals are **light blue** (`#7dd3fc` / `#bae6fd`). Never use yellow/amber for anything Enel-related.

| Stat           | Phase 1        | Phase 2 (< 50% HP) |
|----------------|----------------|--------------------|
| HP             | scaled         | —                  |
| Speed          | 115 px/s       | ~173 px/s (1.5×)   |
| Beam rate      | 1 / 5.5s       | 1 / 3.5s           |
| Beam damage    | 30             | 38                 |
| Grid rate      | 1 / 6.5s       | 1 / 4.0s           |
| Grid damage    | 24             | 30                 |

**Lightning Beam** — 3-phase: tracking (aims at player) → locked (frozen aim, player dodges) → fire (jagged bolt). Jagged multi-segment bolt (18 segments, ±22px perpendicular jitter), 3-layer render (glow → core → white center).

**Lightning Grid** — Room-spanning H or V lines; player stands in gaps. Phase 2 fires both H and V simultaneously (checker pattern).

**Death** — 3.2s: Phase A bolt incoming from right + corona buildup, Phase B impact flash + shock burst, Phase C Team Rocket launch LEFT.

### Gojo — implemented (Floor 3)

`glowColor: '#a78bfa'`, `particleA: '#a78bfa'`, `particleB: '#60a5fa'`

All Gojo visuals use purple (`#a78bfa` / `#c4b5fd`) and blue (`#60a5fa`).

**Spatial constants** (module level in `gameplay.js`):
```
GOJO_ANCHOR_X  = ROOM.x + ROOM.w - BW - 70     // fixed right-side X (70px from right wall)
GOJO_BARRIER_X = GOJO_ANCHOR_X - 160            // Infinity wall, 160px left of Gojo
GOJO_Y_LANES   = [top, mid, bottom]             // 3 vertical snap positions
```

**Position** — Gojo is locked to `GOJO_ANCHOR_X` at all times during normal combat. Movement between lanes is **instant teleport** (no smooth drift), triggered by a move timer (P1: 4.0–6.0s, P2: 2.5–4.5s). During stun, Gojo plays a **spin landing** animation (1.4s ease-out cubic lerp to arena center), then stays locked there.

**Immunity (Infinity) + Infinity Barrier** — Immune to all damage while `stunTimer <= 0`. `_damageBoss` pushes a barrier hit visual + ripples and returns. The Infinity Barrier is a proximity-sensitive glass wall drawn at `GOJO_BARRIER_X`: nearly invisible when the player is far, increasingly visible as the player approaches (using `proxFactor = 1 - distToWall / 420` eased). Disappears completely when stunned.

Player movement is hard-blocked at `GOJO_BARRIER_X - PW` while Gojo is alive, not stunned, and not dead.

**HP gate system** — Fixed HP of 1000. Gates at 75% (750), 50% (500), 25% (250). Only successful rallies break gates. Rally completion snaps HP to `b.gateHPs[b.gateIndex]` immediately. During stun, `gateFloor = b.gateHPs[b.gateIndex]` prevents HP from dropping below the current gate value — gates are always exact.
```
b.gateIndex:    0 → 1 → 2 → 3 → 4(dead)
b.gateHPs:      [1000, 750, 500, 250, 0]
b.rallyBounces: [1, 2, 3, 4]  // bounces needed per gate
```
Kill gate (gateIndex 4): `_gojoCompleteRally` sets `hp=0` and `isDead=true` immediately — no stun window. Phase 2 activates at `gateIndex >= 2`.

**Stun system** — Hit-count based, NOT timer-based. After each non-kill rally:
- `b.stunTimer = 999` (indefinite until 3 hits land)
- `b.stunHitsLeft = 3`, `b.stunHitCD = 0`
- Spin landing begins: Gojo lerps to arena center over 1.4s with `spinAngle = tNorm * π * 4` (two rotations); 3 ghost sprites trail behind for motion blur
- Barrier disappears, player movement block lifts
- Each hit in `_damageBoss` decrements `stunHitsLeft` if `stunHitCD <= 0`; then `stunHitCD = 1.2s` (absorbs Kaido beam ticks)
- When `stunHitsLeft <= 0`: `b.stunTimer = 0` → stun ends → Gojo snaps back to `GOJO_ANCHOR_X`
- Five yellow stars orbit Gojo's head while stunned (`stunStarAngle` advances at 3.8 rad/s)

**HP bar** — `barW=620, barH=22`, `barY=42`, purple gradient fill, three diamond dividers at 75%/50%/25%, larger name text. "Rally: N bounces" hint below bar.

| Stat            | Phase 1              | Phase 2 (gateIndex ≥ 2)  |
|-----------------|----------------------|---------------------------|
| HP              | Fixed 1000           | —                         |
| Lane snap timer | 4.0–6.0s             | 2.5–4.5s                  |
| Attack timer    | starts at 2.0s       | —                         |
| Contact dmg     | 16                   | same                      |

---

### Gojo attacks

**Attack scheduling** — `_gojoPickAttack(b, p)` runs when `attackTimer <= 0` and no `activeAttack` is set. Pool: `['hollow_purple', 'blue']`, plus `'red'` if `redCooldown <= 0 && !redActive`. **During Void or tell** (`voidTimer > 0 || voidTellTimer > 0`): phase 1 skips all attacks and resets timer to 1s; phase 2 fires Blue only. All other attacks are suspended until Void ends.

**Hollow Purple** — State machine: `null → 'moving' → 'charging' → 'firing' → null`
1. **No-repeat**: picks from the 2 thirds that were NOT used last time (`lastPurpleThird` tracked on boss). Rotates between top/mid/bottom so the same third is never fired twice in a row.
2. Instantly snaps to that lane's Y (no smooth movement), immediately enters `'charging'` state.
3. Charges **1.6s** — purple orb builds above sprite, dashed danger zone overlay shown over the target third.
4. Fires `purple_ball` at `vx = -1600px/s` (crosses room in ~0.7s). `r = 58`. Damage: **110 (P1) / 130 (P2)**.
5. After `purpleFireTimer = 1.6s`: next attackTimer = **(P1: 1.5–2.3s, P2: 0.8–1.6s)** — much more frequent than before.
- Hitbox: danger zone is the full targeted third of the room height. Damage fires when `a.cx <= p.x + PW + a.r`.
- Sprite pose during charging: `gojo_purple.png` (or `gojo.png` fallback).

**Blue orb** (`type: 'blue_orb'`) — Spawns **pinned to the left wall** (`cx = ROOM.x + 18`). Stays stationary. Applies a constant **rightward push** on the player (`pullStrength = 28 px/s P1 / 40 px/s P2`) for its lifetime (`5.5–7.5s`), then done. Phase 2 spawns 2 orbs at equal vertical intervals. Drawn large: image at `r×6`, fallback gradient `r×4.5`, 4 distortion rings. Wind particles stream rightward. Small contact damage (re-strikeable after 0.8s). Allowed to fire during phase 2 Void.

**Red Volleyball** (`type: 'red_ball'`) — State machine via `a.dir` + `a.gojoReturnDelay`:
- `'toward_player'`: ball moves from Gojo toward player. Player attack returns it → `bounceCount++`.
  - **Cheese punishment**: if player's right edge is within 70px of `GOJO_BARRIER_X` at hit time, spawns a `barrier_purple` (vertical purple sweep at the barrier line) as punishment. Only triggers once per ball (`a.punished`).
  - If `bounceCount >= requiredBounces`: ball switches to `'final_volley'` — flies at 600 px/s directly toward Gojo.
  - Otherwise: `dir = 'toward_gojo'`, tracks Gojo's current position every frame.
- `'toward_gojo'`: continuously re-aims at Gojo's current position each frame. When ball reaches Gojo hitbox: `gojoReturnDelay = 0.38s`.
- **`'final_volley'`**: the killing return shot. Ball tracks Gojo at 600 px/s. On contact: `a.done = true`, triggers spin landing (`b.spinLanding = true`), then calls `_gojoCompleteRally`. Does not damage Gojo during flight.
- After `gojoReturnDelay`: fires back at `speed *= 1.35` (capped 480px/s), `dir = 'toward_player'`.
- Miss (exits left wall or player contact without hitting): `done = true`, `redActive = false`, `redCooldown = 4s`.
- Paused (no movement, no hit checks) during Void/tell in phase 1.
- Player contact damage: 28. Bounces off room top/bottom walls.
- `_gojoRedHitByPlayer` checks: Dio knives (consumed), Levi sweeps (arc+angle via `sw.r`), Kaido breath beam (state `'firing'`).
- Sprite: `gojo_red.png` only while `gojoReturnDelay > 0` (catching/throwing). Returns to idle otherwise.

**Barrier Purple** (`type: 'barrier_purple'`) — Spawned by `_gojoFireBarrierPunishment`. Vertical purple orb that sweeps from top or bottom along the Infinity barrier line (`cx = GOJO_BARRIER_X - 10`). Speed 1200 px/s. Damage 100/120. Same visual as purple_ball with a vertical particle trail. No warning.

**Infinite Void** — Triggered in `_gojoCompleteRally` after each non-kill rally. **Gate-only** — never fires at a random time. Has a **2s tell phase** (`voidTellTimer`) before the darkness activates.

**Void tell** (`_drawVoidTell`): drawn when `b.voidTellTimer > 0`. A dark purple vignette creeps inward from the edges (inner radius shrinks 320→140px as tell progresses). Purple nebula shimmer appears at 15% progress. "Domain Expansion: Infinite Void" dialogue box appears above Gojo at 20% progress (uses `_drawCinDialogue`). When tell expires, void is activated.

**Void active** (`_drawInfiniteVoid`): Duration `5.5–8.0s`. State: `b.voidTimer`, `b.voidMaxTimer`, `b.voidHands[]`.
- Radial gradient darkness overlay with **180px light sphere** around player — no `destination-out` compositing
- Warm lantern glow inside light sphere so player clearly sees themselves
- Gradient loosened: bright center extends to 0.25 stop, darkness at 0.45–1.0
- Faint purple nebula swirls in the darkness
- **6 shadow hands** from randomised angles (each sector offset by `Math.random() * π/3`). Arms are 28px wide, tapered; 5 curved quadratic-bezier claws at tip. `maxReach = 620–770px` — hands span most of the room.
- Damage checks entire arm segment via point-to-segment distance (`< 34px`), not just tip. 18 dmg, 0.6s iFrames, 1.0s hit cooldown per hand.
- Fades in during first 15% of duration, fades out during last 15%.
- Phase 1: all other attacks suspended during Void. Phase 2: Blue only allowed.

### Combat hints (one-time per run)

`gp.hints = { shown: {}, text: null, timer: 0, maxTimer: 0 }` in the gp object.

- **Infinity hit** (`shown.infinity`): first time an attack bounces off the barrier → floating speech bubble near player: *"My attacks just bounce right off... / I need to find another way!"* (4.5s duration)
- **Red ball appears** (`shown.red`): first time `_gojoFireRed` is called → *"Wait... maybe I can send / that right back at him!"* (4.0s duration)

`_drawCombatHint(ctx)` draws a dark bubble with colored border above the player; fade in 0.25s, fade out 0.6s. Both only show once per run.

### Gojo death cinematic

Triggered immediately when `b.isDead = true` — `_updateBoss` calls `_startGojoCinematic()` on the next frame with no deathTimer countdown. `_startGojoCinematic()` sets fixed positions: **player at 18% of room width (left side), Gojo at `GOJO_ANCHOR_X + BW/2` (right side), both at `ROOM.y + ROOM.h/2` (same vertical level, facing each other)**. Clears attacks and sets `gp.cinematic`.

When `gp.cinematic` is set, both `updateGameplay` and `drawGameplay` defer entirely to `_updateGojoCinematic` / `_drawGojoCinematic`.

**Phase sequence** (~13.5s total):

| Phase | Duration | What happens |
|---|---|---|
| `zoom_in` | 1.0s | Camera zooms 1.0→1.15×, letterbox bars fade in |
| `gojo_text` | 2.4s | *"This isn't over..."* bubble above Gojo |
| `player_text1` | 2.2s | *"It already is."* bubble above player |
| `player_attack` | 0.65s | Player switches to attack pose facing right |
| `white_flash` | 0.7s | Screen ramps to full white with ease-in (`prog²`); death pose already set under the flash |
| `reveal` | 2.4s | White fades with cubic ease-out (`1 - prog³`) to reveal slumped Gojo; slow and cinematic |
| `player_text2` | 2.8s | *"That was a good fight."* bubble above player |
| `fade_out` | 1.3s | Fade to black → `gp.floorComplete = true` → WIN screen |

Gojo's standing sprite is flipped horizontally (`scale(-1, 1)`) so he faces left toward the player. Death pose (`showDeath`) activates from `white_flash` onward — the slumped sprite is already in place when the flash fades. Zoom centered on midpoint between player and Gojo. Dialogue boxes: italic 16px, dark bg, colored border (purple for Gojo, character color for player). HUD hidden during cinematic. Auto-advances with no input required.

**`_drawCinDialogue(ctx, sx, sy, text, borderColor, alpha)`** — shared helper for all cinematic speech bubbles and Domain Expansion tell.

### Drawing order in boss room
```
_drawRoom → _drawBossAttacks → _drawEnemies → _drawBoss → _drawPowerAura
→ _drawPlayer → _drawKaidoBreathCharge → _drawPowerEffects → _drawCombatHint
→ _drawVoidTell (Gojo only, when voidTellTimer > 0)
→ _drawInfiniteVoid (Gojo only, when voidTimer > 0)
→ _drawBossHUD → _drawBossIntro (overlay)
→ [BOSS DEFEATED overlay]
```

### Damage routing
- Dio knives: checked in `_updateProjectiles` against boss rect, then SHA rect
- Levi sweep: checked in `_handleAttack` against boss, then SHA. `arcInner`/`arcOuter` are local vars — NOT stored on the sweep object. `_gojoRedHitByPlayer` derives them from `sw.r`.
- Kaido beam: checked per-tick in `_updateKaidoBreath` against boss, then SHA. State during firing is `'firing'` (not `'fire'`).
- `_damageBoss(dmg)`: for Gojo when not stunned → barrier visual + return. For Gojo when stunned → `gateFloor = b.gateHPs[b.gateIndex]` applied, HP reduced, hit counted (non-kill gates only).
- Timestop: freezes all bosses — all boss update functions check `gp.powerState.frozen` and return early

**Boss HP bar** — Kira/Enel: `barW=440, barH=14`, `barY=14`, red/orange fill. Gojo: `barW=620, barH=22`, `barY=42`, purple gradient fill, three diamond dividers, "Rally: N bounces" label.

**Boss intro** — 2.8s overlay: screen darkens, boss name and subtitle fade in. Player movement and attacks locked during intro.

---

## What's not yet built

| Feature | Notes |
|---------|-------|
| No-repeat boss pool | Not a concern with fixed floor→boss mapping |

---

## Design decisions on record

- **No build tools**: pure vanilla JS, all globals. Scripts loaded in dependency order via `<script>` tags.
- **Character colors inlined in characters.js**: `COLORS.kaido` etc. in constants.js exist but are not used. Moved inline to avoid browser caching issues.
- **HUD is DOM, not canvas**: `_updateHUD()` writes to DOM each frame. Hidden during cinematic via `_setHUD` check.
- **dt cap at 0.05s**: prevents physics tunneling on tab-switch or heavy frame spikes.
- **Image fallbacks are silent**: failed loads leave `_imgs[key] = null`; canvas drawing fills in automatically.
- **Power state persists across rooms**: `gp.powerState.cooldown` carries over; transient effects (allies, afterimages, ripples, frozen) cleared on room transition.
- **Auras drawn before player**: `_drawPowerAura` runs between `_drawEnemies` and `_drawPlayer` so spiky polygons are always behind the character sprite.
- **Spin trail in `_drawProjectiles`**: bee-path looping trail drawn per-knife before the blade shape. Trail history (28 pts) stored on `proj.trail[]`. Phase is index-only (no world-time offset) so loops stay spatially fixed.
- **Spin lock-on at fire time**: nearest enemy/boss (or red ball, if active) found once when knife spawns. Never re-acquired — if target dies/done, knife flies straight.
- **Spin red ball priority**: `gp.bossAttacks.find(a => a.type === 'red_ball' && !a.done && a.dir === 'toward_player')` is checked first. Only falls back to enemy/boss if no active incoming red ball.
- **Dio knives fly straight**: `proj.vy += GRAVITY * dt` gated on `proj.type !== 'knife'`.
- **Levi sweep hitbox expanded by target half-size**: enemies (23px), boss (40px), SHA (21px) each use their own half-size value.
- **Levi red ball check uses `sw.r`**: `_gojoRedHitByPlayer` computes `arcInner = swR * 0.22`, `arcOuter = swR * 0.94` from `sw.r` because the sweep object does not store those fields.
- **`pickPowers(charId)`**: excludes Spin from Kaido's pool.
- **King Crimson multiple afterimages**: 5 afterimages along dash vector with random jitter.
- **Boss room not auto-cleared**: `_checkRoomClear` returns early if `gp.boss && !gp.bossDefeated`.
- **`gp.bossAttacks[]` separate from `gp.enemies[]`**: boss attacks bypass Timestop enemy freeze; Timestop freezes bosses via early return in their update functions.
- **Boss door skull icon**: `_drawSkullIcon` is a standalone helper used by `_drawRoom`.
- **Each boss has `glowColor`**: Kira = `#7c3aed`, Enel = `#7dd3fc`, Gojo = `#a78bfa`. Required for `_drawBossIntro` and `_drawBossHUD`.
- **Enel color scheme is light blue**: never use yellow/amber for Enel visuals.
- **Enel attacks ticked in `_updateEnelBoss`**: each boss owns its attack tick loop.
- **Enel attack scaling by character**: `b.attackScale = Math.max(1, 3.5 / char.stats.speed)`. Kaido gets 1.4× slower cadence.
- **Ally Summon targets bosses**: ally loop considers `gp.boss` after all enemies. Uses `BW/BH` for boss hitbox. Calls `_damageBoss` on contact. **For Gojo: only targets when `b.stunTimer > 0`** (barrier is down). Wanders idly when barrier is up.
- **Boss death timers differ**: Kira `deathTimer = 2.2`, Enel `deathTimer = 3.2`. Gojo has **no deathTimer** — cinematic fires immediately on `isDead`.
- **Kira death is 2-phase** (2.2s): explosion then Team Rocket upward-right.
- **Enel death is 3-phase** (3.2s): bolt incoming → impact flash → Team Rocket launch LEFT.
- **Gojo HP is fixed at 1000**: not DPS-scaled. `_spawnBoss('gojo')` overrides `hp`/`maxHp`.
- **`_damageBoss` branches for Gojo**: not stunned → barrier visual, return. Stunned → `gateFloor = b.gateHPs[b.gateIndex]` applied, HP floored at current gate value, hit counted (non-kill gates only).
- **Gate floor equals current gate**: `gateFloor = b.gateHPs[b.gateIndex]` (NOT `+1`). After rally, HP is snapped to `gateHPs[gateIndex]` by `_gojoCompleteRally`, and the stun floor equals that same value — guaranteeing HP stays exactly at 75%/50%/25% throughout the stun window.
- **Kill gate (gateIndex=4)**: `_gojoCompleteRally` sets `hp=0` and `isDead=true` immediately; no stun, no Void. `_updateBoss` detects `isDead` and calls `_startGojoCinematic`.
- **Stun is hit-count-based**: `stunTimer = 999` (indefinite), `stunHitsLeft = 3`, `stunHitCD = 1.2s` between counted hits. `stunHitCD` prevents Kaido beam ticks from each counting separately. Stun ends when `stunHitsLeft <= 0` sets `stunTimer = 0`.
- **Spin landing after each rally**: `b.spinLanding = true` at the moment the final-volley ball contacts Gojo. Ease-out cubic lerp from launch X/Y to arena center over 1.4s. `spinAngle = tNorm * π * 4` (two full rotations). Three ghost sprites at progressively smaller angles for motion blur (alpha 0.3/0.2/0.1).
- **Gojo stun position = arena center**: Both set during spin landing (lerped) and enforced every frame once `spinLanding = false`. Returns to `GOJO_ANCHOR_X` when stun ends.
- **Gojo movement is instant snap**: no smooth drift. `b.y = newY` is applied immediately when the move timer fires.
- **Hollow Purple no-repeat**: `lastPurpleThird` on boss tracks which third was last targeted. Each new Purple picks from the other 2 thirds (`[0,1,2].filter(i => i !== b.lastPurpleThird)`). Cannot fire from the same lane twice in a row.
- **Hollow Purple snap-then-charge**: the `'moving'` state lasts one frame — Gojo immediately snaps to the target lane and starts charging. No visible travel.
- **Blue orb pull reduced**: P1 = 28 px/s, P2 = 40 px/s (was 70/100). Two phase-2 orbs stack to 80 px/s combined — a nuisance but not immobilizing for any character.
- **Blue orb drawn large**: image at `r×6`, fallback gradient radius `r×4.5`, 4 distortion rings at `r×(3.0 + i×1.5)`. Physics radius `r=22` unchanged.
- **Red ball final volley**: on the last required bounce, `a.dir = 'final_volley'` is set instead of calling `_gojoCompleteRally` immediately. Ball tracks Gojo at 600 px/s. On contact: starts spin landing, then calls `_gojoCompleteRally`. Makes the kill feel impactful.
- **Barrier punishment**: `_gojoFireBarrierPunishment(b)` spawns a `barrier_purple` when player hits red while within 70px of the barrier. Fires once per ball (`a.punished` flag). Discourages standing at the barrier during rallies.
- **Red ball paused during Void (phase 1)**: `_gojoTickBossAttacks` skips movement and hit-checking for `red_ball` while `b.voidTimer > 0 || b.voidTellTimer > 0` and `b.phase < 2`.
- **Infinite Void is gate-only**: only triggered by `_gojoCompleteRally` after non-kill gates. Never fires at a random time. Always preceded by a 2s tell.
- **Void tell then activate**: `_gojoCompleteRally` sets `voidTellTimer = 2.0` and `pendingVoidDur`. When tell expires, `_updateGojoBoss` creates hands and starts `voidTimer`. The tell draws a creeping edge vignette + "Domain Expansion: Infinite Void" dialogue.
- **Void light radius = 180px**: `lightR = 180` in `_drawInfiniteVoid`. Uses a pure radial gradient (no `destination-out`) so darkness layers correctly over the scene. Gradient starts transparent at `lightR × 0.35` from center and reaches near-opaque at `lightR × 3.5`.
- **Void hands fully random per activation**: angles offset by `Math.random() * (π/3)` per sector — different spawn positions each time.
- **Void hand damage uses full arm**: point-to-segment distance from player to the arm segment (edge→tip), threshold 34px. The entire limb deals damage, not just the claw tip.
- **Void attack isolation**: `inVoid = b.voidTimer > 0 || b.voidTellTimer > 0`. Phase 1 `_gojoPickAttack` returns early (retry in 1s). Phase 2 only fires Blue.
- **Kaido beam state is `'firing'`**: the internal `kaidoBreath.state` string during beam fire is `'firing'` (not `'fire'`). `_gojoRedHitByPlayer` must check `=== 'firing'`.
- **Kaido beam ticks at 0.04s**: tick every 0.04s at `damage × 0.05` per tick. Identical DPS to old 0.12s/0.15 but 3× the visual frequency — HP chips away gradually.
- **Gojo cinematic positions are fixed**: player placed at `ROOM.x + ROOM.w*0.18 + PW/2` (left), Gojo at `GOJO_ANCHOR_X + BW/2` (right), both at `ROOM.y + ROOM.h/2`. No longer uses actual positions at time of death.
- **Gojo faces left in cinematic**: standing sprite drawn with `ctx.scale(-1, 1)` so he faces the player.
- **White flash timing**: `white_flash` = 0.7s with ease-in (builds slowly, hits full white at end). `reveal` = 2.4s with cubic ease-out (slow at start, clears fully by end). Death pose set from `white_flash` onward so reveal shows slumped Gojo seamlessly.
- **Gojo cinematic triggers immediately**: `_updateBoss` calls `_startGojoCinematic()` as soon as `b.isDead` is true — no deathTimer countdown, no death animation.
- **Proximity barrier visibility**: `proxFactor = 1 - distToWall / 420` (player X to GOJO_BARRIER_X), eased as `proxFactor²`. Far away: faint glass shimmer only. Close: hex grid, energy column, and edge highlights at full opacity.
- **Red volleyball cooldown**: 4s after miss or rally completion. `redCooldownMax = 4`.
- **Bomb non-overlap via `_placeBomb`**: enforces `BOMB_MIN_SEP = 88px` between active bomb centers.
- **SHA does not rotate**: slides directly toward player with no spin transform.
- **SHA destroyed vs. player-killed explosion**: `playerKill = false` when player attack kills SHA (visual only); `true` when SHA reaches player (40-damage large explosion).
