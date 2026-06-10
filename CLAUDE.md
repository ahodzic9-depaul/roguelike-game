# Crossover Gauntlet — CLAUDE.md

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
TITLE → CHAR_SELECT → POWER_SELECT → PLAYING
                                        ↓ floor 1 boss defeated (ENTER)
                                     UPGRADE  (power-specific upgrade, full HP heal)
                                        ↓ confirm
                                     PLAYING  (floor 2)
                                        ↓ floor 2 boss defeated (ENTER)
                                   STAT_BOOST  (auto stat boost confirmation, full HP heal)
                                        ↓ confirm
                                     PLAYING  (floor 3)
                                        ↓ Gojo defeated → cinematic → auto-advance
                                     CREDITS → CHAR_SELECT on ENTER
                                        ↕ (game over at any floor → GAME_OVER screen → ENTER → TITLE)
DEV_POWERS  (F1 overlay, only accessible from POWER_SELECT; ESC or F1 to dismiss)
```

**Note**: `STATE.WIN` has been removed from the flow. After the Gojo cinematic the game transitions directly to `STATE.CREDITS`. `drawWinScreen` still exists in screens.js but is unreachable.

`DEV_POWERS`: shows all 6 powers in a 3×2 grid. **Clicking a card assigns that power and immediately starts the run**. F1 hint shown only on Power Select.

**Pause menu** — ESC during `STATE.PLAYING` toggles `_paused` (in `main.js`). While paused: `updateGameplay` is skipped (full freeze — enemies, timers, attacks all stopped); `drawGameplay` still runs; `_drawPauseMenu` overlays on top. Three options: **Resume** (ESC or click), **Restart Run** (`initGameplay(gp.char, gp.power)` — floor 1, same char+power), **Quit to Title** (→ `STATE.CHAR_SELECT`). Keyboard: ↑↓/WS to navigate, Enter to confirm. "Quit to Title" tinted red. Panel and title glow use `gp.char.color.main`. ESC is guarded by `_canPause()` — blocked during cinematic, game-over, boss-defeated, and dev overlays. `_canPause()` also checks `currentState === STATE.PLAYING`.

**Auto-pause** — `visibilitychange` (tab switch) and `window blur` (app focus lost) events in `main.js` call `_autoPause()`, which sets `_paused = true` if `_canPause()` passes. Player resumes normally via ESC or clicking Resume.

**Floor transition flow** — Floors 1/2: "BOSS DEFEATED" overlay shows **"Press ENTER — claim your reward"**, ENTER sets `gp.floorComplete = true`, main.js transitions to UPGRADE/STAT_BOOST. Floor 3 (Gojo): cinematic triggers immediately when `b.isDead` is set — no deathTimer countdown, no bossDefeated overlay. Cinematic auto-sets `gp.floorComplete = true` at the end.

**UPGRADE screen** (after floor 1) — Single confirmation screen, no choice. Shows the power-specific upgrade for whatever power the player selected, with full HP heal always. One click or ENTER confirms and starts floor 2.

Power upgrade flags set by `_initUpgradeState` (via `opt.apply`):

| Power | Flag set on `pow` | Upgrade effect (fully implemented) |
|---|---|---|
| haki | `hakiReflect = true` | Reflects 75% of incoming damage back at attacker. Blocked by Gojo's Infinity. |
| timestop | `timestopUpgraded = true` | Cooldown reduced 10s → 6s; deals 10 DPS to frozen enemies/bosses (not Gojo) |
| ally_summon | `allyUpgraded = true` | Summons 2 allies instead of 1 |
| spin | `spinUpgraded = true` | Dio knives pierce 1 extra enemy (tracked via `hitEnemies` Set); after piercing, knife re-acquires nearest unhit enemy as new lock target. Levi sweep radius 130 → 162px; homing turn rate 480 → 920 |
| king_crimson | `kcUpgraded = true` | Afterimages deal damage (65% of char damage each) to enemies/boss they overlap |
| awakening | `awakeningUpgraded = true` | Floor 3 stat boost is doubled (Kaido +60% HP, Dio +60% DMG, Levi +50% SPD) |

All flags also set `pw.upgraded = true`. `_initUpgradeState` uses a power-id lookup map in `main.js`.

**STAT_BOOST screen** (after floor 2) — Single confirmation screen (not a choice). Boost is **character-specific and automatically assigned**:
- Kaido → **MAX HP +30%** (or +60% if Awakening upgraded) — full HP restore
- Dio → **DAMAGE +30%** (or +60% if Awakening upgraded) — full HP restore
- Levi → **SPEED +25%** (or +50% if Awakening upgraded) — full HP restore

All characters receive **full HP restore** after floor 2 (regardless of boost type). Stat boost screen styled using character color, shows "STAT BOOSTED" label and confirms with ENTER or click. `_initStatBoostState` in `main.js` reads `gp.char.id` and `gp.power.awakeningUpgraded` to select the option.

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
- Arrow key tap → semi-circle hitbox (radius 130, span ±0.58π); **162px radius when Spin is upgraded**
- **Hitbox matches visual**: damage zone is `arcInner` (r×0.22) to `arcOuter` (r×0.94), expanded by target half-size
- `arcInner`/`arcOuter` are local variables in `_handleAttack` — they are **not stored on the sweep object**. `_gojoRedHitByPlayer` derives them from `sw.r` directly.
- Cooldown: `0.42s / speed_factor`
- With **Spin** power: sweep auto-aims toward nearest enemy **or boss**

---

## Powers (`src/powers.js` + `gameplay.js`)

All 6 powers are implemented with upgrades. `gp.powerState` holds runtime state.

| ID            | Type    | Color   | Effect (implemented)                                                |
|---------------|---------|---------|---------------------------------------------------------------------|
| haki          | passive | amber   | 35% damage reduction on every hit (`dmg * 0.65`, ceiled); spiky 16-point amber polygon aura behind player; HP bar gets gold gradient + amber glow. **Upgraded**: reflects 75% of original damage back at attacker; blocked against Gojo (Infinity). |
| timestop      | active  | violet  | Freeze all enemies **and bosses** 3s; 3 expanding ripple shockwaves; faint violet screen vignette. **Cooldown: 10s base, 6s when upgraded**. **Upgraded**: deals 10 DPS to frozen enemies and non-Gojo bosses. |
| ally_summon   | active  | green   | Spawns allied fighter(s) near player (80HP, speed 115, damage = char.damage×0.65, 8s life); 14s cooldown. Allies **shoot projectile bullets** (320px/s, r=5, 1.4s life, 0.7s fire cooldown) from 145px standoff range instead of contact damage. **Spread targeting**: each ally claims a different nearest enemy. When no enemies, drifts toward room center. **Upgraded**: spawns 2 allies. **Against Gojo**: ally bullets only reach Gojo when `b.stunTimer > 0` (barrier down). |
| spin          | passive | orange  | **Not offered to Kaido**. Dio knives: lock-on homing (turn rate 480, upgraded 920). Levi sweeps: auto-aims toward nearest enemy or boss. **During Gojo fight**: red ball takes priority. **Upgraded**: Dio knives pierce 1 extra enemy (`hitEnemies` Set prevents re-hitting); after pierce, knife re-acquires nearest unhit enemy as lock target; Levi sweep radius 130→162px. |
| king_crimson  | active  | rose    | Dash 200px in `moveDir`; 5 afterimages along dash path; glow ring + TV scanline distortion; 5s cooldown. **Upgraded**: afterimages each deal 65% of char damage to enemies/boss they overlap (each afterimage hits each target once via `hitEnemies` Set + `hitBoss` flag). |
| awakening     | passive | purple  | 20% crit chance via `_critDamage(base, x, y)` — crits deal 2× damage and push a `{ x, y, timer }` entry to `gp.critEffects` for a yellow starburst "CRIT!" flash at hit position (0.38s, 8-spike radiating lines + floating text). Spiky 14-point purple polygon aura; 6 orbiting particles. **Upgraded**: floor 3 stat boost multipliers doubled. |

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
- `timestop`:     `{ cooldown, cooldownMax: 10 (or 6 if upgraded), frozen:bool, frozenTimer:float, duration:3.0, ripples:[] }`
- `ally_summon`:  `{ cooldown, cooldownMax:14, allies:[] }` — each ally has `bullets: []`
- `king_crimson`: `{ cooldown, cooldownMax:5, afterimages:[], glowTimer:float, staticTimer:float }`
- passives (haki, spin, awakening): `{ cooldown:0, cooldownMax:0 }`

### `_critDamage(base, x, y)`
Awakening's crit helper. When `gp.power.id === 'awakening'` and `Math.random() < 0.20`, returns `base * 2` and pushes `{ x, y, timer: 0.38, maxTimer: 0.38 }` to `gp.critEffects` (if coords provided). All 9 call sites pass enemy/boss center coords. `gp.critEffects` is ticked down in `_updatePowerState` and drawn in `_drawPowerEffects`.

### `_hakiReflect(origDmg, enemyRef)`
Called at every player damage site. If `hakiReflect` flag is set: reflect = `ceil(origDmg * 0.75)`. If `enemyRef` is non-null, subtracts from that enemy's HP directly. If null (boss attack), calls `_damageBoss(reflectDmg)` — **skipped entirely when `gp.boss.type === 'gojo'`** (Infinity blocks the reflect).

---

## Floor/room generation (`_generateRooms()` in gameplay.js)

| Floor | Room sequence                              |
|-------|--------------------------------------------|
| 1     | tutorial → combat → combat → combat → boss |
| 2     | tutorial → combat → combat → combat → boss |
| 3     | tutorial → combat → boss                   |

Tutorial room: empty, controls shown on floor, door always open.
Combat room: scripted enemy composition (see below); door locked until all cleared.
Boss room: boss fight.

### Room compositions (scripted, not random)

`_spawnEnemies()` uses `gp.roomIndex` (1-based within each floor) to select a composition:

| Floor | Room | Composition |
|-------|------|-------------|
| 1 | 1 | 3–4 basic enemies |
| 1 | 2 | 2–3 basic + 1 ranged |
| 1 | 3 | ~50/50 basic and ranged (4 total, shuffled) |
| 2 | 1 | 1 basic + 3 ranged |
| 2 | 2 | 2 ranged + 1 tank |
| 2 | 3 | 2 tanks |
| 3 | 1 | 2 basic + 2 ranged + 2 tank |

---

## Room layout and 2.5D visual style

```
ROOM = { x: 80, y: 60, w: 1120, h: 600 }
PW=56, PH=72       // player sprite (hitbox)
EW=46, EH=46       // basic enemy size
RW=40, RH=40       // ranged enemy size
TW=58, TH=60       // tank/brute enemy size
BW=68, BH=80       // boss hitbox (Kira, Enel, Gojo)
DOOR_H=84          // right-wall door height, vertically centered
BOMB_MIN_SEP=88    // minimum px between active bomb centers
```

All enemies store their own `w` and `h` fields. All collision, targeting, and damage code uses `e.w`/`e.h` — never hardcoded `EW`/`EH` for non-basic enemies.

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
_drawPowerEffects         ← allies + ally bullets, afterimages, frozen ripples/overlay, KC glow, Awakening particles + crit flashes
_drawCombatHint           ← floating speech bubble hints near player (one-time, Gojo fight)
_drawVoidTell             ← Gojo Domain Expansion tell (2s warning before Void); only when b.voidTellTimer > 0
_drawInfiniteVoid         ← Gojo Infinite Void overlay (dark screen + shadow hands); only when b.voidTimer > 0
_drawBossHUD              ← canvas boss HP bar at top of screen
_drawBossIntro            ← 2.8s name overlay when entering boss room
[overlays: BOSS DEFEATED, ROOM CLEARED, devBossSelect]
_updateHUD                ← DOM update, not canvas
```

**Note**: Game Over is no longer drawn as an overlay inside `drawGameplay`. When `gp.gameOver` is set, `main.js` transitions immediately to `STATE.GAME_OVER`, which draws the frozen gameplay scene underneath the death screen overlay.

If `gp.cinematic` is set, `drawGameplay` calls `_drawGojoCinematic(ctx, t)` and returns immediately — nothing else draws.

---

## Enemy system

Three enemy types, all stored in `gp.enemies[]`. Every enemy object has `type`, `w`, `h`, `hp`, `maxHp`, `speed`, `damage`, `vx`, `vy`, `knockbackTimer`. Knocked back on hit (`knockbackTimer = 0.14s`). HP bar drawn above. Player gets 1.2s iFrames after any damage. All enemies frozen during Timestop (no movement, no damage, no bullet firing/ticking).

Factory: `_makeEnemy(type, x, y)` in `gameplay.js`.

### Basic enemy
- `type: 'basic'` | 46×46 | red square with yellow eyes
- HP: 60, Speed: 90 px/s, Damage: 12
- Chases player directly.
- Kill source: `'enemy'`

### Ranged enemy (Archer)
- `type: 'ranged'` | 40×40 | teal square with squinting eyes + bow/arrow drawn pointing toward player
- HP: 45, Speed: 75 px/s, Damage: 22 (projectile)
- **Kiting AI**: maintains ~260px preferred distance. Backs away if closer than 155px; closes in if farther than 340px; strafes perpendicularly in range (strafe direction flips every 1.2–2.4s).
- **Wind-up**: when `fireCooldown <= 0` and in range, sets `windupActive = true`, freezes movement. After `RANGED_WINDUP_DUR = 0.9s`, fires one teal orb bullet (r=7, 320px/s, 2.0s life, damage 22) into `gp.enemyBullets[]`. Resets `fireCooldown = 2.8s`.
- **Wind-up telegraph**: center of sprite brightens with growing teal glow proportional to windup progress.
- Kill source: `'ranged_enemy'`

### Tank / Brute (Skull)
- `type: 'tank'` | 58×60 | dark-red skull with eye sockets, jaw, and teeth
- HP: 180, Speed: 50 px/s (walk), Damage: 35
- **Normal state**: slow walk toward player. Countdown timer `chargeTimer` (3.5–6s) until next charge.
- **Wind-up** (`chargeState: 'windup'`, `TANK_WINDUP_DUR = 0.65s`): stops; eye sockets slowly glow red (brightness = `windupTimer / TANK_WINDUP_DUR`). On completion, locks `chargeDir` toward player's current position.
- **Charge** (`chargeState: 'charging'`): flies at 900px/s in locked direction until hitting a room wall. Motion trail (3 ghost images). Eye sockets fully lit red. **No time limit** — only a wall stops it.
- **Stagger/recovery** (`chargeState: 'recovery'`, `TANK_RECOVERY_DUR = 0.8s`): brief dazed pause after wall impact; eyes dark, teeth gray.
- Kill source: `'tank_enemy'`

### `gp.enemyBullets[]`
Separate top-level array (like `gp.bossAttacks[]`) for ranged enemy projectiles. Cleared on room transition and in `_launchDevBossFight`. Ticked in `_tickEnemyBullets(p, dt)` — skipped entirely when Timestop is active. Bullet fields: `x, y, vx, vy, r, damage, life`.

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
- `drawUpgradeScreen(ctx, state, t)` / `updateUpgradeScreen` — floor 1 single-confirmation upgrade screen (power-specific, always full heal)
- `drawStatBoostScreen(ctx, state, t)` / `updateStatBoostScreen` — floor 2 **single-confirmation** screen (character-specific auto boost, always full heal, styled with `state.char.color`). Uses `state.option` and `state.fullHeal`. **Not a card picker** — any click or ENTER confirms.
- `drawWinScreen(ctx, t)` — unused victory screen (unreachable; `STATE.WIN` was removed from the flow)
- `drawTitleScreen(ctx, t)` — initial title card: dark starfield, centered "CROSSOVER GAUNTLET" with multi-layer glow, "A ROGUELIKE ADVENTURE" subtitle, blinking PRESS ENTER TO START
- `drawGameOverScreen(ctx, t, char, killSource, startT)` — Isaac-style death screen; fades in over 700ms from `startT`. Player portrait (idle_down PNG via `Assets.drawSprite`, contain fit) on left; kill-source-specific PNG on right (see table below); canvas `_drawKillerIcon` fallback if PNG unavailable. Arrow + "this killed you" label between panels. Kill-source-specific death message + accent color. ENTER → STATE.TITLE.
- `drawCreditsScreen(ctx, t, startT)` — auto-scrolling credits at 75 px/s. Embeds 244×272px portrait rows for all 6 characters (players + bosses). Ends with bare starfield, "Thanks for Playing!" fades in 0.5s after last content exits, "Press ENTER to play again" fades in 1s later. ENTER → STATE.CHAR_SELECT at any point.

### Death screen kill sources and styling (`_DEATH_DATA`)
| Kill source | Background | Accent | Label | Death message |
|---|---|---|---|---|
| `enemy` | `#0d0404` | `#7f1d1d` | Basic Enemy | "You were killed by a basic enemy. No comment." |
| `ranged_enemy` | `#021014` | `#0891b2` | Ranged Enemy | "Didn't you hear? It's hunting season! Shouldda kept your head low..." |
| `tank_enemy` | `#140600` | `#ea580c` | Tank/Brute | "He smashed you like a bug. Next time get out of his way." |
| `bomb` | `#080416` | `#7c3aed` | Kira's Bomb | "Killer Queen has already touched that spot..." |
| `sha` | `#080416` | `#7c3aed` | Sheer Heart Attack | "Sheer Heart Attack... has no weakness." |
| `kira_contact` | `#080416` | `#7c3aed` | Kira | "Bites the Dust has reset time... back to the title screen!" |
| `beam` | `#040d16` | `#7dd3fc` | Lightning Beam | "You stood still for a split second too long. Enel noticed." |
| `grid` | `#040d16` | `#7dd3fc` | Lightning Grid | "The sky itself became your enemy. Enel sends his regards." |
| `enel_contact` | `#040d16` | `#7dd3fc` | Enel | "He sure does have a SHOCKING personality." |
| `blue_orb` | `#050812` | `#2563eb` | Blue Orb | "Gravity doesn't care about your feelings." |
| `hollow_purple` | `#0a0414` | `#7c3aed` | Hollow Purple | "You like donuts? Well you're one now!" |
| `barrier_purple` | `#0a0414` | `#7c3aed` | Infinity Punishment | "The Anti-Cheese System has logged your behavior. Do the fight correctly next time." |
| `red_ball` | `#130304` | `#dc2626` | Red Volleyball | "You didn't read the text the first time? HIT THE RED BALL!!!" |
| `void` | `#040010` | `#a78bfa` | Infinite Void | "You were shown the entirety of the universe, but your feeble mind couldn't handle it." |
| `gojo_contact` | `#040010` | `#a78bfa` | Gojo | "He killed you without even laying a finger on you." |

Kira deaths are **purple** (`#7c3aed`). Enel deaths are **light blue** (`#7dd3fc`).

**Killer PNG mapping** — each kill source tries its own specific PNG first, falls back to the boss PNG, then to `_drawKillerIcon` canvas drawing:
- `bomb` → `bomb.png` → `kira.png`
- `sha` → `sheer_heart_attack.png` → `kira.png`
- `kira_contact` → `kira.png`
- `beam` → `lightning.png` → `enel.png`
- `grid` → `enel.png`
- `enel_contact` → `enel.png`
- `blue_orb` → `blue_orb.png` → `gojo.png`
- `hollow_purple` / `barrier_purple` → `purple_ball.png` → `gojo.png`
- `red_ball` → `red_ball.png` → `gojo.png`
- `void` / `gojo_contact` → `gojo.png`
- `enemy` / `ranged_enemy` / `tank_enemy` → canvas fallback only (no PNG)

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
Left-side purple door on the **first tutorial room only** (`gp.floor === 1 && gp.roomIndex === 0`) → `gp.devBossSelect = true` → full-screen boss picker. The dev door does **not** appear on floors 2 or 3. Clicking a boss calls `_launchDevBossFight(type)`.

**`_launchDevBossFight(bossType)`** sets `gp.floor` correctly: kira → 1, enel → 2, gojo → 3. Also **silently applies upgrades** matching what the player would have by that floor:
- **Kira**: no upgrades (fresh stats)
- **Enel**: calls `_applyDevPowerUpgrade()` — sets the power's upgrade flag and re-inits `gp.powerState` (so e.g. Timestop gets `cooldownMax: 6` immediately)
- **Gojo**: calls `_applyDevPowerUpgrade()` + `_applyDevStatBoost()` — applies character-specific stat boost (Kaido +30% HP, Dio +30% DMG, Levi +25% SPD, all with full HP restore; doubled if Awakening is upgraded)

This ensures all floor-dependent logic (cinematic, post-boss messages, floorComplete path) works during dev testing.

**Dev boss select lineup**: Kira (Floor 1), Enel (Floor 2), Gojo (Floor 3).

**Ending Animation button** — A **"▶ Ending Animation"** button appears below the Gojo card in `_drawDevBossSelect`. Clicking it sets `gp.devCinematicPicker = true` and opens a character sub-picker (Kaido / Dio / Levi). Clicking a character calls `_launchDevCinematic(charId)`, which sets `gp.char`, spawns a dead Gojo boss, and calls `_startGojoCinematic()` directly — no fight required. `_CIN_CHARS` is the array driving the sub-picker.

**Death Screens button** — A **"☠ Death Screens"** button appears in a paired row below all boss cards (see Credits button below). Clicking it sets `gp.devDeathScreen = true` and opens the death screen browser:
- 4 columns: **Kira Deaths** (bomb, sha, kira_contact), **Enel Deaths** (beam, grid, enel_contact), **Gojo Deaths** (hollow_purple, blue_orb, red_ball, void, barrier_purple, gojo_contact), **Common Deaths** (enemy, ranged_enemy, tank_enemy)
- Clicking any source sets `gp.devDeathPreview = { source, startT: t - 1000 }` (startT offset so it renders fully opaque immediately)
- While `gp.devDeathPreview` is set: `_drawDevBossSelect` renders `drawGameOverScreen` over everything using `gp.char` as the character. ESC dismisses back to the browser.
- ESC from browser → back to main boss select. ESC from boss select also clears `devDeathScreen` and `devDeathPreview`.

**Credits button** — A **"✦ Credits"** button is paired with the Death Screens button in the same row, centered below all boss cards. Clicking it sets `gp.devLaunchCredits = true` and `gp.devBossSelect = false`. `main.js` detects `gp.devLaunchCredits` in the PLAYING loop, sets `_creditsStartT = t`, and transitions to `STATE.CREDITS`.

`gp` fields: `devDeathScreen: false`, `devDeathPreview: null` (`{ source, startT }` shape), `devLaunchCredits: false`.

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

**Immunity (Infinity) + Infinity Barrier** — Immune to all damage while `stunTimer <= 0` and `!returnLanding`. `_damageBoss` pushes a barrier hit visual + ripples and returns. The Infinity Barrier is a proximity-sensitive glass wall drawn at `GOJO_BARRIER_X`: nearly invisible when the player is far, increasingly visible as the player approaches (using `proxFactor = 1 - distToWall / 420` eased). Disappears completely when stunned or during `returnLanding`.

Player movement is hard-blocked at `GOJO_BARRIER_X - PW` while Gojo is alive, not stunned, not in `returnLanding`, and not dead. The one-time hint **"I can't get close... none of my attacks will ever reach him. There has to be another way!"** fires the first time the player walks into the barrier or any attack hits it (5s duration, uses character color).

**Player attacks vs. Infinity:**
- **Dio knives**: ricochet off the barrier (`vx = 0, vy = 320+`), then fall with backspin (`spinRate ≈ −14–22 rad/s`, gravity enabled via `proj.bounced`). Never reach Gojo's hitbox.
- **Kaido beam**: visually clipped at `GOJO_BARRIER_X` when Gojo is up (draw length capped). Also clipped at all room walls in all directions. Beam still triggers barrier ripple + hint via `_damageBoss` (Gojo's hitbox is still within beam range).
- **Levi sweep**: physically can't reach Gojo due to the player movement block (sweep radius 130–162px, Gojo ~222px away). Hint fires on walk-into instead.

**HP gate system (BTD6 style)** — HP scaled per character so each 10s stun window is equally challenging:

| Character | Max HP | Per-window target |
|-----------|--------|-------------------|
| Kaido     | 500    | 125 HP (10s × ~15 DPS × 83%) |
| Dio       | 1400   | 350 HP (10s × ~50 DPS × 70%) |
| Levi      | 1600   | 400 HP (10s × ~56 DPS × 71%) |

```
b.gateIndex:    0 → 1 → 2 → 3  (→ kill when floor reaches 0)
b.gateHPs:      [max, max×0.75, max×0.50, max×0.25, 0]
b.rallyBounces: [1, 2, 3, 4]   // bounces needed to trigger each rally
```

- Gate 0 (100%): fight starts fully immune. Rally #1 (1 bounce) opens the 10s window.
- During stun window: `gateFloor = b.gateHPs[b.gateIndex + 1]`. HP floors there — player must deal enough damage to reach it.
- **Gate clears** (`_damageBoss`) when `b.hp <= gateFloor`: `gateIndex++`, stun ends, Instant Transmission return begins.
- **Kill window** (`gateIndex = 3`, floor = 0): HP can go to 0 → `isDead = true`.
- **Stun expires** (10s timer) without clearing: `returnLanding` starts, `gateIndex` unchanged — same bounce count required next rally. HP stays wherever the player left it (progress accumulates across attempts).

Phase 2 activates at `gateIndex >= 2`.

**Stun system** — Timer-based (10s), NOT hit-count-based. After rally:
- `b.stunTimer = b.stunDuration` (10s), counts DOWN each frame
- Spin landing begins: 1.4s ease-out cubic lerp to arena center, `spinAngle = tNorm * π * 4`; 3 ghost sprites for motion blur
- Barrier disappears + player movement block lifts
- When `stunTimer <= 0`: either gate was already cleared (stun ended early by `_damageBoss`), or timer expired → `returnLanding` begins
- Five yellow stars orbit Gojo's head while stunned (`stunStarAngle` advances at 3.8 rad/s)
- **All in-flight attacks cleared** on rally start (`_gojoCompleteRally` filters `bossAttacks`, resets `activeAttack`, `purpleState`, timers)

**Stun + spin overlay drawn AFTER player sprite** — `_drawGojoStunOverlay(ctx, t, b)` is a separate function called from `drawGameplay` after `_drawPlayer`, so stars and spin-landing ghosts always render on top of the character PNG.

**Return animation (Instant Transmission)** — `b.returnLanding` = true after stun ends. Total 0.58s:
- **Departure phase** (0–0.28s): 4 expanding white/purple rings + central flash at current position; Gojo's sprite alpha fades 1→0
- **Snap** at 0.28s: `b.x = GOJO_ANCHOR_X` instantly
- **Arrival phase** (0.28–0.58s): burst rings + flash at anchor; sprite alpha fades 0→1
- `_drawGojoIT(ctx, b)` handles the ring visuals (called from `drawGameplay` between `_drawBoss` and `_drawPowerAura`)
- Barrier stays down during `returnLanding` (movement block, knife bounce, beam clip all check `!b.returnLanding`)

**HP bar** — `barW=620, barH=22`, `barY=42`, purple gradient fill, three diamond dividers at 75%/50%/25%, larger name text. No bounce-count label.

| Stat            | Phase 1              | Phase 2 (gateIndex ≥ 2)  |
|-----------------|----------------------|---------------------------|
| HP              | Character-scaled     | —                         |
| Lane snap timer | 4.0–6.0s             | 2.5–4.5s                  |
| Attack timer    | starts at 2.0s       | —                         |
| Contact dmg     | 16                   | same                      |

---

### Gojo attacks

**Attack scheduling** — `_gojoPickAttack(b, p)` runs when `attackTimer <= 0` and no `activeAttack` is set. Pool: `['hollow_purple', 'blue']`, plus `'red'` if `redCooldown <= 0 && !redActive`. **During Void or tell** (`voidTimer > 0 || voidTellTimer > 0`): phase 1 skips all attacks and resets timer to 1s; phase 2 fires Blue only. All other attacks are suspended until Void ends.

**Hollow Purple** — State machine: `null → 'moving' → 'charging' → 'firing' → null`
1. **No-repeat**: picks from the 2 thirds that were NOT used last time (`lastPurpleThird` tracked on boss). Rotates between top/mid/bottom so the same third is never fired twice in a row.
2. Instantly snaps to that lane's Y (no smooth movement), immediately enters `'charging'` state.
3. Charges **1.3s (P1) / 1.0s (P2)** — purple orb builds above sprite, dashed danger zone overlay shown over the target third.
4. Fires `purple_ball` at `vx = -1900px/s (P1) / -2200px/s (P2)`. `r = 58`. Damage: **110 (P1) / 130 (P2)**.
5. After fire-hold of **1.1s (P1) / 0.8s (P2)**: next attackTimer = **(P1: 0.9–1.5s, P2: 0.3–0.8s)**.
- Hitbox: danger zone is the full targeted third of the room height. Damage fires when `a.cx <= p.x + PW + a.r`.
- Sprite pose during charging: `gojo_purple.png` (or `gojo.png` fallback).

**Blue orb** (`type: 'blue_orb'`) — Spawns **pinned to the left wall** (`cx = ROOM.x + 18`). Has a **0.55s spawn animation** — scales up from zero using smoothstep, pull/damage/particles suppressed during spawn, two expanding ripple rings fire at the end. After spawning, applies a **constant baseline pull** every frame (`pullVX * dt`) for its lifetime (**6.0–8.0s**). On top of the baseline, a **periodic pulse spike** adds 30% extra pull for 0.18s every 1.5–2.0s (first pulse fires 1.0–1.5s after spawn), giving a brief nudge that can cause the player to slip. Visual warning: rings brighten/thicken 0.6s before a pulse; an expanding ring radiates outward during the active pulse. **Positions**: Phase 1 = 1 orb at vertical center (`pull = 34`). Phase 2 = 2 orbs at top-left (18% height) and bottom-left (82% height), each pulling right + toward vertical center (`pull = 44`). Drawn large: image at `r×6`, fallback gradient `r×4.5`, 4 distortion rings. Flake particles burst outward radially (2–3 per frame, only after spawn completes). Small contact damage. Allowed to fire during phase 2 Void. Fields: `spawnTimer`, `spawnDuration: 0.55`, `pulseTimer`, `pulseActive`, `pulseActiveTimer`, `pulseActiveDur: 0.18`, `pulseInterval: 1.5–2.0s`.

**Red Volleyball** (`type: 'red_ball'`) — State machine via `a.dir` + `a.gojoReturnDelay`:
- `'toward_player'`: ball moves from Gojo toward player. `a.crossedBarrier` must be `true` before `_gojoRedHitByPlayer` registers a hit (ball must fully cross `GOJO_BARRIER_X` first; resets each Gojo return). Player attack returns it → `bounceCount++`.
  - **Cheese punishment**: if player's right edge is within 70px of `GOJO_BARRIER_X` at hit time, spawns a `barrier_purple`. Only once per ball (`a.punished`).
  - If `bounceCount >= requiredBounces`: ball switches to `'final_volley'` — flies at 600 px/s directly toward Gojo.
  - Otherwise: `dir = 'toward_gojo'`, tracks Gojo's current position every frame.
- `'toward_gojo'`: continuously re-aims at Gojo each frame. When ball reaches Gojo hitbox: `gojoReturnDelay = 0.38s`, `crossedBarrier` reset to `false`.
- **`'final_volley'`**: Ball tracks Gojo at 600 px/s. On contact: triggers spin landing, calls `_gojoCompleteRally`. Does not damage Gojo during flight.
- After `gojoReturnDelay`: fires back at `speed *= 1.35` (capped 480px/s), `dir = 'toward_player'`.
- Miss: `done = true`, `redActive = false`, `redCooldown = 3s`.
- Paused during Void/tell in phase 1.
- Player contact damage: 28. Bounces off room top/bottom walls.
- `_gojoRedHitByPlayer` checks: Dio knives (consumed), Levi sweeps (arc+angle via `sw.r`), Kaido breath beam (state `'firing'`).
- Sprite: `gojo_red.png` only while `gojoReturnDelay > 0`. Returns to idle otherwise.

**Barrier Purple** (`type: 'barrier_purple'`) — Spawned by `_gojoFireBarrierPunishment`. Vertical purple orb sweeping along the barrier line. Speed 1200 px/s. Damage 100/120. No warning.

**Infinite Void** — **Phase 2 only** (`gateIndex >= 2`). Added to `_gojoPickAttack`'s attack pool when `b.phase === 2 && b.voidCooldown <= 0`. When picked: sets `voidTellTimer = 2.0`, `pendingVoidDur`, `voidCooldown = 25–30s`, and `attackTimer = 999` (suppresses scheduling during tell+void). When void ends (`voidTimer` reaches 0): `attackTimer` resets to 1–2s; `voidCooldown` ticks down normally. Always preceded by a 2s tell.

**Void tell** (`_drawVoidTell`): creeping edge vignette + "Domain Expansion: Infinite Void" dialogue above Gojo. When tell expires, void activates.

**Void active** (`_drawInfiniteVoid`): Duration `5.5–8.0s`. State: `b.voidTimer`, `b.voidMaxTimer`, `b.voidHands[]`.
- Radial gradient darkness overlay with **180px light sphere** around player
- Warm lantern glow inside light sphere
- Faint purple nebula swirls in the darkness
- **Gojo and all his active attacks glow through the void** — after the darkness overlay, a `'lighter'` composite pass draws radial halos: Gojo (purple, r=130), blue_orb (cyan, r×6), purple_ball (purple, r×3.5), red_ball (red, r×3.5), barrier_purple (purple, r=60). Shadow hands still render on top.
- **6 shadow hands** from randomised angles. Arms 28px wide; 5 curved claws at tip. `maxReach = 620–770px`.
- Damage via point-to-segment distance (`< 34px`). 18 dmg, 0.6s iFrames, 1.0s hit cooldown per hand.
- Fades in first 15%, fades out last 15%.
- Phase 1: all attacks suspended. Phase 2: Blue only allowed.

### Combat hints (one-time per run)

`gp.hints = { shown: {}, text: null, timer: 0, maxTimer: 0 }` in the gp object.

- **Infinity hit** (`shown.infinity`): first time any attack hits the barrier OR player walks into it → *"I can't get close... / none of my attacks will ever reach him. / There has to be another way!"* (5s). Triggers from knife ricochet, Kaido beam `_damageBoss` call, or movement wall contact.
- **Red ball appears** (`shown.red`): first time `_gojoFireRed` is called → *"Wait... maybe I can send / that right back at him!"* (4.0s).

`_drawCombatHint(ctx)` draws a bubble using **`gp.char.color.main`** for border, shadow, and text glow (character-colored, not purple). Fade in 0.25s, fade out 0.6s. Both only show once per run.

### Gojo death cinematic

Triggered immediately when `b.isDead = true` — `_updateBoss` calls `_startGojoCinematic()` on the next frame with no deathTimer countdown. Player placed at 18% of room width (left side); Gojo starts at `GOJO_ANCHOR_X + BW/2` (right anchor). Clears attacks and sets `gp.cinematic`. Cinematic object fields: `phase`, `timer`, `playerX`, `playerY`, `gojoX` (authoritative for death pose), `gojoY`, `gojoStartX`, `gojoCenterX` (50% of room width), `leviPostX`.

When `gp.cinematic` is set, both `updateGameplay` and `drawGameplay` defer entirely to `_updateGojoCinematic` / `_drawGojoCinematic`.

**Phase sequence** (~14.5s total):

| Phase | Duration | What happens |
|---|---|---|
| `zoom_in` | 1.0s | Camera zooms 1.0→1.15×, letterbox bars fade in |
| `gojo_text` | 2.4s | *"This isn't over..."* bubble above Gojo; **Levi only**: Gojo begins walking left toward center |
| `player_text1` | 2.2s | *"It already is."* bubble above player; **Levi only**: Gojo continues walking, decelerating to a stop at center |
| `player_attack` | 1.2s | Character-specific finishing attack, slows at midpoint via `_cinAttackEase` |
| `white_flash` | 0.7s | Attack stays visible frozen at final position; screen ramps to full white (ease-in `prog²`) covering the sprite swap |
| `reveal` | 2.4s | White fades with cubic ease-out (`1 - prog³`) to reveal slumped Gojo |
| `player_text2` | 2.8s | Character-specific final line |
| `fade_out` | 1.3s | Fade to black → `gp.floorComplete = true` → CREDITS screen (no WIN screen) |

**`_cinAttackEase(prog)`** — Easing for the finishing attack: fast in first 40% of time (covers 70% of distance), linear slow in remaining 60%. Creates a visible "it suddenly got slower" moment at prog=0.4.

**Attack freeze during `white_flash`**: `showAttack = phase === 'player_attack' || phase === 'white_flash'`. During `white_flash`, `attackEase = 1.0` (frozen at final position). The flash grows from 0→1 over 0.7s, so the attack is clearly visible at the start and disappears smoothly under the white. No abrupt cut.

**Character-specific `player_attack` visuals:**
- **Dio**: knife flies from player toward Gojo, frozen mid-air just before contact during `white_flash`
- **Kaido**: fire beam extends from player to Gojo, frozen at full length during `white_flash`
- **Levi**: sprite dashes from left toward `effectiveGojoX` (center, where Gojo walked to). Speed lines trail behind. Frozen at `leviDashEndX = effectiveGojoX + BW/2 + 60` during `white_flash`. After flash, `_updateGojoCinematic` sets `c.playerX = c.leviPostX` (center + BW/2 + 90) and `c.gojoX = c.gojoCenterX` — Gojo's death pose renders exactly where he was standing, no snap required.

**Levi `effectiveGojoX` walk**: Gojo's drawn position animates from `gojoStartX` to `gojoCenterX` over the combined 4.6s of `gojo_text + player_text1` using ease-out cubic (`1 - (1-wp)³`). The camera focus and Gojo's speech bubble both track `effectiveGojoX`. By `player_attack`, Gojo has fully stopped at center.

**Character-specific final lines (`player_text2`):**
- Dio: *"That was it? How pathetic."*
- Kaido: *"Yet another soul fell to my strength."*
- Levi: *"What a waste of a final project..."*

Gojo's standing sprite is flipped horizontally (`scale(-1, 1)`) so he faces left toward the player. Death pose (`showDeath`) activates from `reveal` onward only. Zoom centered on midpoint between player and `effectiveGojoX`. Dialogue boxes: italic 16px, dark bg, colored border (purple for Gojo, character color for player). HUD hidden during cinematic. Auto-advances with no input required.

**`_drawCinDialogue(ctx, sx, sy, text, borderColor, alpha)`** — shared helper for all cinematic speech bubbles and Domain Expansion tell.

### Drawing order in boss room
```
_drawRoom → _drawBossAttacks → _drawEnemies → _drawBoss → _drawGojoIT (Gojo only)
→ _drawPowerAura → _drawPlayer → _drawKaidoBreathCharge
→ _drawGojoStunOverlay (Gojo only — stars + spin-landing ghosts, drawn AFTER player)
→ _drawPowerEffects → _drawCombatHint
→ _drawVoidTell (Gojo only, when voidTellTimer > 0)
→ _drawInfiniteVoid (Gojo only, when voidTimer > 0)
→ _drawBossHUD → _drawBossIntro (overlay)
→ [BOSS DEFEATED overlay]
```

`_drawGojoIT` renders the Instant Transmission departure/arrival rings. `_drawGojoStunOverlay` renders the stun stars and spin-landing ghost trail. Both must be after `_drawBoss` and `_drawGojoIT` before player, stun overlay after player.

### Damage routing
- Dio knives: bounce off `GOJO_BARRIER_X` when Gojo is up and not stunned (`proj.bounced = true`, `vx = 0`, `vy = 320+`, backspin enabled). Only reach boss hitbox when Gojo is stunned.
- Levi sweep: physically can't reach Gojo (player blocked 222px away, sweep radius 130–162px). Barrier hint fires from walk-into instead.
- Kaido beam: `_damageBoss` fires per tick (Gojo in beam range when player at barrier). Barrier visual + hint triggered. Draw clips at `GOJO_BARRIER_X` and all room walls.
- `_damageBoss(dmg)`: for Gojo when not stunned → barrier visual + return. For Gojo when stunned → `gateFloor = b.gateHPs[b.gateIndex + 1]`; HP floors there. Gate clears when `b.hp <= gateFloor` → `gateIndex++`, `stunTimer = 0`, `returnLanding` starts.
- Timestop: freezes all bosses — all boss update functions check `gp.powerState.frozen` and return early

**Boss HP bar** — Kira/Enel: `barW=440, barH=14`, `barY=14`, red/orange fill. Gojo: `barW=620, barH=22`, `barY=42`, purple gradient fill, three diamond dividers at 75%/50%/25%. No bounce-count label.

**Boss intro** — 2.8s overlay: screen darkens, boss name and subtitle fade in. Player movement and attacks locked during intro.

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
- **Spin pierce uses `hitEnemies` Set**: piercing knives (`piercesLeft > 0`) track already-hit enemies in `proj.hitEnemies` to prevent re-hitting the same enemy on consecutive frames as the knife passes through. After each pierce, the knife immediately re-acquires the nearest enemy not in `hitEnemies` as its new `lockTarget` (only when `lockType === 'enemy'`). If no unhit enemy exists, `lockTarget` is nulled and the knife flies straight.
- **Dio knives fly straight normally**: `proj.vy += GRAVITY * dt` gated on `proj.type !== 'knife' || proj.bounced`. Bounced knives (barrier hit) enable gravity and get a fast negative `spinRate` for visual backspin.
- **Levi sweep hitbox expanded by target half-size**: enemies (23px), boss (40px), SHA (21px) each use their own half-size value.
- **Levi red ball check uses `sw.r`**: `_gojoRedHitByPlayer` computes `arcInner = swR * 0.22`, `arcOuter = swR * 0.94` from `sw.r` because the sweep object does not store those fields. This also works when `sw.r = 162` (upgraded Spin).
- **`pickPowers(charId)`**: excludes Spin from Kaido's pool.
- **King Crimson multiple afterimages**: 5 afterimages along dash vector with random jitter. Upgraded: each afterimage has `damage` (65% char damage), `hitEnemies` Set, and `hitBoss` flag to deal damage once per target.
- **Awakening crits record position**: `_critDamage(base, x, y)` takes optional enemy/boss center coords and pushes `{ x, y, timer: 0.38, maxTimer: 0.38 }` to `gp.critEffects`. Ticked in `_updatePowerState`, drawn in `_drawPowerEffects` as an 8-spike yellow starburst with "CRIT!" text that rises and fades.
- **Haki reflect blocks Gojo**: `_hakiReflect` skips the `_damageBoss` call entirely when `gp.boss.type === 'gojo'`. Reflects 75% of original (pre-reduction) damage.
- **Timestop upgrade is cooldown reduction**: `_initPowerState` reads `power.timestopUpgraded` and sets `cooldownMax: 6` (vs 10). Duration stays 3s. Upgraded also adds 10 DPS freeze tick to enemies and non-Gojo bosses.
- **Ally behavior is projectile-based**: allies shoot green orb bullets (320px/s, r=5, 1.4s life, 0.7s fire cooldown) from ~145px standoff range. No contact damage. Damage = char.damage × 0.65. Spread targeting assigns each ally a different nearest unclaimed enemy. Allies with no target drift slowly toward room center.
- **Boss room not auto-cleared**: `_checkRoomClear` returns early if `gp.boss && !gp.bossDefeated`.
- **`gp.bossAttacks[]` separate from `gp.enemies[]`**: boss attacks bypass Timestop enemy freeze; Timestop freezes bosses via early return in their update functions.
- **Boss door skull icon**: `_drawSkullIcon` is a standalone helper used by `_drawRoom`.
- **Each boss has `glowColor`**: Kira = `#7c3aed`, Enel = `#7dd3fc`, Gojo = `#a78bfa`. Required for `_drawBossIntro` and `_drawBossHUD`.
- **Enel color scheme is light blue**: never use yellow/amber for Enel visuals.
- **Enel attacks ticked in `_updateEnelBoss`**: each boss owns its attack tick loop.
- **Enel attack scaling by character**: `b.attackScale = Math.max(1, 3.5 / char.stats.speed)`. Kaido gets 1.4× slower cadence.
- **Dev door is floor 1 room 0 only**: both `_drawRoom` and `canEnterDevRoom` in `_updatePlayer` gate on `gp.floor === 1 && gp.roomIndex === 0`. `gp.roomIndex` resets to 0 on each `initGameplay` call so floor 2/3 would show the door without the floor check.
- **Floor transition message is "claim your reward"**: `continueMsg` in `drawGameplay` BOSS DEFEATED overlay says `'Press ENTER — claim your reward'` for floors 1 and 2 (not "choose"). Floor 3 says "Press ENTER to play again".
- **Both floor transitions give full HP**: UPGRADE state uses `startHp: boostedChar.stats.hp`; STAT_BOOST state always uses `floorHp = boostedChar.stats.hp` (no partial 60% heal).
- **STAT_BOOST is auto-assigned, not a choice**: `_initStatBoostState` in `main.js` reads `gp.char.id` and `gp.power.awakeningUpgraded` to pick one option. `drawStatBoostScreen` / `updateStatBoostScreen` show a single confirmation panel.
- **Boss death timers differ**: Kira `deathTimer = 2.2`, Enel `deathTimer = 3.2`. Gojo has **no deathTimer** — cinematic fires immediately on `isDead`.
- **Kira death is 2-phase** (2.2s): explosion then Team Rocket upward-right.
- **Enel death is 3-phase** (3.2s): bolt incoming → impact flash → Team Rocket launch LEFT.
- **Gojo HP is character-scaled**: Kaido 500, Dio 1400, Levi 1600. Computed via IIFE in `_spawnBoss('gojo')`. `gateHPs` are derived as fractions of `maxHp`.
- **`_damageBoss` branches for Gojo**: not stunned → barrier visual, return. Stunned → `gateFloor = b.gateHPs[b.gateIndex + 1]`; HP floors there. Gate clears when HP reaches floor: `gateIndex++`, `stunTimer = 0`, `returnLanding` starts. No Void trigger here — Void is now a timed recurring attack in phase 2.
- **Kill window**: `gateIndex = 3`, `gateHPs[4] = 0`. HP can reach 0 → `isDead = true`. No extra stun after kill.
- **Stun is timer-based (10s)**: `stunTimer = stunDuration` counts DOWN. Gate only advances if `_damageBoss` floors HP during the window. If timer expires without clearing: `returnLanding` starts, `gateIndex` unchanged.
- **`_gojoCompleteRally` no longer advances gateIndex**: it only starts the stun timer, clears attacks, resets state. Gate advancement happens in `_damageBoss`.
- **Spin landing after each rally**: `b.spinLanding = true` at the moment the final-volley ball contacts Gojo. Ease-out cubic lerp from launch X/Y to arena center over 1.4s. `spinAngle = tNorm * π * 4` (two full rotations). Three ghost sprites for motion blur. Drawn by `_drawGojoStunOverlay` (after player).
- **Gojo stun position = arena center**: enforced every frame once `spinLanding = false` and `stunTimer > 0`. After stun, `returnLanding` (IT animation) flies him back to anchor.
- **Infinite Void is phase 2 only**: picked from `_gojoPickAttack` when `b.phase === 2 && b.voidCooldown <= 0`. Never in phase 1.
- **Gojo movement is instant snap**: no smooth drift. `b.y = newY` is applied immediately when the move timer fires.
- **Hollow Purple no-repeat**: `lastPurpleThird` on boss tracks which third was last targeted. Each new Purple picks from the other 2 thirds (`[0,1,2].filter(i => i !== b.lastPurpleThird)`). Cannot fire from the same lane twice in a row.
- **Hollow Purple snap-then-charge**: the `'moving'` state lasts one frame — Gojo immediately snaps to the target lane and starts charging. No visible travel.
- **Blue orb positions**: Phase 1 = 1 orb at vertical center of left wall, pulls purely rightward (`pull = 34`). Phase 2 = 2 orbs at top-left (18% height) and bottom-left (82% height), each pulling right + toward vertical center (`pullVX = pull * 0.85, pullVY = ±pull * 0.5`, `pull = 44`).
- **Blue orb flake particles**: burst outward radially from orb center (2–3 per frame, random angle + speed 80–200 px/s). Not directional.
- **Blue orb drawn large**: image at `r×6`, fallback gradient radius `r×4.5`, 4 distortion rings. Physics radius `r=22` unchanged.
- **Blue orb spawn animation**: 0.55s smoothstep scale-up from zero. Pull, damage, and particles suppressed during spawn (player gets a warning window). Two expanding ripple rings fire over the last 45% of spawn with a 0.18s stagger. Distortion rings scale with `spawnProg`. Fields: `spawnTimer`, `spawnDuration: 0.55`.
- **Blue orb pull model**: constant baseline pull (`pullVX * dt`) always active after spawn. Periodic pulse spike adds 30% extra for 0.18s every 1.5–2.0s. Pulse rings brighten/thicken 0.6s before firing as a visual warning. Each orb's pulse timer is independently randomised so phase 2 dual orbs don't synchronise.
- **Gojo cinematic — attack freeze**: `showAttack` is true for both `player_attack` and `white_flash`. During `white_flash`, `attackEase` is locked at 1.0 so Dio's knife, Kaido's beam, and Levi's sprite all stay at their final position while the flash builds over them. No abrupt disappearance before the cut.
- **Gojo cinematic — Levi walk**: `effectiveGojoX` is computed each frame via ease-out cubic over the combined 4.6s of `gojo_text + player_text1`. Gojo moves from `gojoStartX` (right anchor) to `gojoCenterX` (50% width). Camera focus and speech bubble track `effectiveGojoX`. By `player_attack` Gojo is fully stopped at center; Levi dashes toward that position. After `white_flash`, `c.gojoX` is set to `gojoCenterX` so the death pose renders exactly where Gojo was standing — no position snap.
- **Gojo aggression tuning** (current values): initial `attackTimer = 1.2s`; `redCooldownMax = 3s`; move timer P1 3.0–4.5s / P2 1.5–2.8s; Purple charge P1 1.3s / P2 1.0s; Purple fire-hold P1 1.1s / P2 0.8s; Purple ball speed P1 −1900 / P2 −2200; post-Purple gap P1 0.9–1.5s / P2 0.3–0.8s; post-Blue gap P1 1.8–2.6s / P2 0.8–1.4s; post-Red gap P1 2.2–3.0s / P2 1.4–2.2s; Blue pull P1 34 / P2 44; Blue lifetime 6.0–8.0s; Void P2 blue retry 2.0–3.5s.
- **Red ball final volley**: on the last required bounce, `a.dir = 'final_volley'`. Ball tracks Gojo at 600 px/s. On contact: starts spin landing, calls `_gojoCompleteRally` (which starts the timed stun — gate advancement happens later in `_damageBoss`).
- **Red ball crossedBarrier**: `a.crossedBarrier` flag must be true before hits register. Set when ball's leading edge crosses `GOJO_BARRIER_X`; reset when Gojo fires it back. Prevents spiking the ball immediately at Gojo's side.
- **Barrier punishment**: `_gojoFireBarrierPunishment(b)` spawns a `barrier_purple` when player hits red while within 70px of the barrier. Fires once per ball (`a.punished` flag). Discourages standing at the barrier during rallies.
- **Red ball paused during Void (phase 1)**: `_gojoTickBossAttacks` skips movement and hit-checking for `red_ball` while `b.voidTimer > 0 || b.voidTellTimer > 0` and `b.phase < 2`.
- **Infinite Void is phase 2 only, recurring**: added to attack pool when `b.phase === 2 && b.voidCooldown <= 0`. 25–30s cooldown after each use. Never in phase 1. Always preceded by a 2s tell.
- **Void tell then activate**: `_damageBoss` sets `voidTellTimer = 2.0` and `pendingVoidDur`. When tell expires, `_updateGojoBoss` creates hands and starts `voidTimer`. The tell draws a creeping edge vignette + "Domain Expansion: Infinite Void" dialogue.
- **Void light radius = 180px**: `lightR = 180` in `_drawInfiniteVoid`. Uses a pure radial gradient (no `destination-out`) so darkness layers correctly over the scene. Gradient starts transparent at `lightR × 0.35` from center and reaches near-opaque at `lightR × 3.5`.
- **Void hands fully random per activation**: angles offset by `Math.random() * (π/3)` per sector — different spawn positions each time.
- **Void hand damage uses full arm**: point-to-segment distance from player to the arm segment (edge→tip), threshold 34px. The entire limb deals damage, not just the claw tip.
- **Void attack isolation**: `inVoid = b.voidTimer > 0 || b.voidTellTimer > 0`. Phase 1 `_gojoPickAttack` returns early (retry in 1s). Phase 2 only fires Blue.
- **Kaido beam state is `'firing'`**: the internal `kaidoBreath.state` string during beam fire is `'firing'` (not `'fire'`). `_gojoRedHitByPlayer` must check `=== 'firing'`.
- **Kaido beam ticks at 0.04s**: tick every 0.04s at `damage × 0.05` per tick. Identical DPS to old 0.12s/0.15 but 3× the visual frequency — HP chips away gradually.
- **Gojo cinematic start positions**: player at `ROOM.x + ROOM.w*0.18 + PW/2` (left), Gojo initially at `gojoStartX = GOJO_ANCHOR_X + BW/2` (right anchor), both at `ROOM.y + ROOM.h/2`. For Levi, Gojo walks to `gojoCenterX = ROOM.x + ROOM.w*0.50` by the time `player_attack` begins.
- **Gojo faces left in cinematic**: standing sprite drawn with `ctx.scale(-1, 1)` so he faces the player.
- **White flash timing**: `white_flash` = 0.7s with ease-in (builds slowly, hits full white at end). `reveal` = 2.4s with cubic ease-out (slow at start, clears fully by end). Death pose (`showDeath`) set from `reveal` onward only — the flash fully covers the sprite swap, so it's never visible mid-transition.
- **Gojo cinematic triggers immediately**: `_updateBoss` calls `_startGojoCinematic()` as soon as `b.isDead` is true — no deathTimer countdown, no death animation.
- **Proximity barrier visibility**: `proxFactor = 1 - distToWall / 420` (player X to GOJO_BARRIER_X), eased as `proxFactor²`. Far away: faint glass shimmer only. Close: hex grid, energy column, and edge highlights at full opacity.
- **Red volleyball cooldown**: 3s after miss or rally completion. `redCooldownMax = 3`.
- **Bomb non-overlap via `_placeBomb`**: enforces `BOMB_MIN_SEP = 88px` between active bomb centers.
- **SHA does not rotate**: slides directly toward player with no spin transform.
- **SHA destroyed vs. player-killed explosion**: `playerKill = false` when player attack kills SHA (visual only); `true` when SHA reaches player (40-damage large explosion).
- **Kill source tracking**: `gp.killSource` (string) is set alongside every `gp.gameOver = true` assignment. Values: `'enemy'`, `'ranged_enemy'`, `'tank_enemy'`, `'bomb'`, `'sha'`, `'kira_contact'`, `'beam'`, `'grid'`, `'enel_contact'`, `'void'`, `'gojo_contact'`, `'hollow_purple'`, `'blue_orb'`, `'red_ball'`, `'barrier_purple'`. Kill source for enemy contact uses `e.type` to dispatch. Read by `main.js` when transitioning to `STATE.GAME_OVER`.
- **Game over is a dedicated state**: `gp.gameOver = true` causes `main.js` (PLAYING case) to immediately save `gp.char` + `gp.killSource`, then transition to `STATE.GAME_OVER`. `drawGameplay` is still called from STATE.GAME_OVER to render the frozen scene; `drawGameOverScreen` overlays on top with a 700ms fade-in.
- **Death screen portrait uses `Assets.drawSprite`**: player portrait calls `Assets.drawSprite(ctx, char, 'idle', 'down', ..., 'contain')` — uses the idle_down PNG, falls back to the canvas portrait functions via `_drawSpriteFallback` automatically.
- **Death screen killer uses attack-specific PNG**: each kill source tries its own PNG first (e.g., `bomb.png`, `sheer_heart_attack.png`, `lightning.png`, `blue_orb.png`, `purple_ball.png`, `red_ball.png`), falls back to the boss PNG, then to `_drawKillerIcon` canvas drawing for enemy.
- **Credits screen is scrolling, not static**: `drawCreditsScreen(ctx, t, startT)` takes a `startT` timestamp set by `main.js` when entering `STATE.CREDITS`. Portraits of all 6 characters scroll inline as `portrait_row` items (244×272px, three across). Ending sequence: bare starfield + "Thanks for Playing!" fades in 0.5s after scroll ends, "Press ENTER" fades in 1s later.
- **UPGRADE screen is a single confirmation, not a 3-card choice**: shows the power's own `upgrade` description text. Always grants full HP heal. Sets power-specific flags for future gameplay use.
- **Auto-pause on focus loss**: `document.addEventListener('visibilitychange', ...)` and `window.addEventListener('blur', ...)` both call `_autoPause()` in `main.js`, which calls `_paused = true` if `_canPause()` returns true. `_canPause()` checks `currentState === STATE.PLAYING` in addition to the game state guards.
- **All enemies have `w`/`h` fields**: set by `_makeEnemy`. All collision, targeting, and knockback code uses `e.w`/`e.h`. Never use hardcoded `EW`/`EH` when iterating over `gp.enemies` — different types have different sizes.
- **`gp.enemyBullets[]` is a flat separate array**: ranged enemy bullets live here, not on the enemy object. This matches the pattern of `gp.bossAttacks[]` and survives the dead-enemy filter. Cleared on room transition and in `_launchDevBossFight`.
- **Ranged enemy kite logic**: preferred distance 260px. Backs away (<155px), strafes in range (155–340px), closes in (>340px). Strafe direction flips on a 1.2–2.4s timer. Movement stops entirely during the 0.9s wind-up. Fire cooldown resets to 2.8s after each shot.
- **Tank charge is wall-terminated, not time-terminated**: `TANK_CHARGE_SPD = 900px/s` and no `chargeDur` tracking. The charge continues until `e.x`/`e.y` is clamped by the room boundary. On wall contact, transitions to `'recovery'` (stagger, 0.8s). `chargeTimer` resets to 3.5–6s after recovery.
- **Tank charge direction is locked at windup end**: `chargeDir` is computed from player position when `windupTimer >= TANK_WINDUP_DUR`. Player position changes during the charge do not affect the trajectory.
- **Floor room layout is now fixed**: `_generateRooms` returns deterministic room arrays — always 3 combat rooms for floors 1/2, always 1 for floor 3. `_spawnEnemies` uses `gp.roomIndex` to select a scripted composition rather than a random count.
- **Dev boss auto-upgrades**: `_applyDevPowerUpgrade()` and `_applyDevStatBoost()` are standalone helpers in `gameplay.js` that mirror the `_initUpgradeState`/`_initStatBoostState` logic from `main.js`. Called from `_launchDevBossFight` based on the target floor.
- **Ranged enemy bow rendering**: bow is drawn in a saved ctx rotated to `angle` (toward player), translated `e.w * 0.65` outward from enemy center so it clears the body. `bowR = e.w * 0.48`. Arc opens in local +X (toward player), arrowhead tip at local +X; string at x=0 faces back toward the archer. `_drawKillerIcon` fallback for `ranged_enemy` mirrors the same bow geometry at icon scale.
