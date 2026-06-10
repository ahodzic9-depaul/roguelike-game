// ─── Core gameplay loop ───────────────────────────────────────────────────────

const ROOM = { x: 80, y: 60, w: 1120, h: 600 };
const PW = 56, PH = 72;   // player sprite size
const EW = 46, EH = 46;   // basic enemy size
const RW = 40, RH = 40;   // ranged enemy size
const TW = 58, TH = 60;   // tank enemy size

// Ranged enemy AI constants
const RANGED_PREFER_DIST  = 260;
const RANGED_FLEE_DIST    = 155;
const RANGED_CHASE_DIST   = 340;
const RANGED_WINDUP_DUR   = 0.9;
const RANGED_FIRE_CD      = 2.8;
const RANGED_BULLET_SPD   = 320;

// Tank enemy AI constants
const TANK_WINDUP_DUR     = 0.65;
const TANK_CHARGE_SPD     = 900;
const TANK_RECOVERY_DUR   = 0.8;

// Door is always on the right wall, vertically centered
const DOOR_H = 84;
const DOOR_Y = ROOM.y + ROOM.h / 2 - DOOR_H / 2;
const DOOR_X = ROOM.x + ROOM.w;

// Left dev door (first tutorial room only — shortcut to boss select)
const LEFT_DOOR_H = 84;
const LEFT_DOOR_Y = ROOM.y + ROOM.h / 2 - LEFT_DOOR_H / 2;

// Boss hitbox dimensions
const BW = 68, BH = 80;

// Gojo spatial constants
const GOJO_ANCHOR_X  = ROOM.x + ROOM.w - BW - 70;          // fixed right-side X
const GOJO_BARRIER_X = GOJO_ANCHOR_X - 160;                 // gives Gojo breathing room from the wall
const GOJO_Y_LANES   = [                                      // 3 vertical snap positions
  ROOM.y + Math.floor(ROOM.h / 6) - Math.floor(BH / 2),
  ROOM.y + Math.floor(ROOM.h / 2) - Math.floor(BH / 2),
  ROOM.y + Math.floor(ROOM.h * 5 / 6) - Math.floor(BH / 2),
];

// Kaido breath constants
const KB_CHARGE_MAX = 1.0;   // seconds to fully charge (must reach this to fire)
const KB_CHARGE_MIN = 1.0;   // must hold for the full charge — no partial releases
const KB_FIRE_DUR   = 1.0;   // beam fires for 1 second after release
const KB_COOLDOWN   = 1.6;   // recharge delay after beam ends

let gp = null;

function _generateRooms(floor) {
  if (floor === 1) return ['tutorial', 'combat', 'combat', 'combat', 'boss'];
  if (floor === 2) return ['tutorial', 'combat', 'combat', 'combat', 'boss'];
  return ['tutorial', 'combat', 'boss'];
}

// opts: { floor, startHp }
function initGameplay(char, power, opts) {
  const floor      = (opts && opts.floor)   || 1;
  const startHp    = (opts && opts.startHp) || char.stats.hp;
  const rooms      = _generateRooms(floor);
  const isTutorial = rooms[0] === 'tutorial';
  gp = {
    char,
    power,
    floor,
    roomIndex:     0,
    rooms,
    floorComplete: false,
    player: {
      x:            ROOM.x + ROOM.w / 2 - PW / 2,
      y:            ROOM.y + ROOM.h / 2 - PH / 2,
      hp:           Math.min(char.stats.hp, Math.max(1, startHp)),
      maxHp:        char.stats.hp,
      speed:        char.stats.speed * 58,
      dir:          'down',
      isMoving:     false,
      tilt:         0,
      iFrames:      0,
      fireCooldown: 0,
    },
    enemies:       [],
    enemyBullets:  [],
    projectiles:   [],
    activeAttacks: [],
    roomCleared:   isTutorial,
    gameOver:      false,
    killSource:    null,
    kaidoBreath:   { state: 'idle', chargeTimer: 0, fireTimer: 0, cooldownTimer: 0, dir: 'right', tickTimer: 0 },
    powerState:    null,
    boss:          null,
    bossAttacks:   [],
    bossDefeated:  false,
    devBossSelect:      false,
    devCinematicPicker: false,
    devDeathScreen:     false,
    devDeathPreview:    null,
    devLaunchCredits:   false,
    hints:              { shown: {}, text: null, timer: 0, maxTimer: 0 },
    cinematic:     null,
    critEffects:   [],
  };
  gp.powerState = _initPowerState(power, char);
  if (!isTutorial) _spawnEnemies();
}

function _nextRoom() {
  gp.roomIndex++;
  const roomType = gp.rooms[gp.roomIndex];
  const isTutorial = roomType === 'tutorial';
  const isBoss     = roomType === 'boss';

  gp.enemies       = [];
  gp.enemyBullets  = [];
  gp.projectiles   = [];
  gp.activeAttacks = [];
  gp.bossAttacks   = [];
  gp.boss          = null;
  gp.bossDefeated  = false;
  gp.roomCleared   = isTutorial;
  gp.kaidoBreath   = { state: 'idle', chargeTimer: 0, fireTimer: 0, cooldownTimer: 0, dir: 'right', tickTimer: 0 };
  // Preserve cooldown across rooms; clear transient effects
  const prevCooldown   = gp.powerState ? gp.powerState.cooldown : 0;
  gp.powerState        = _initPowerState(gp.power, gp.char);
  gp.powerState.cooldown = prevCooldown;
  gp.player.x      = ROOM.x + 24;
  gp.player.y      = ROOM.y + ROOM.h / 2 - PH / 2;
  gp.player.fireCooldown = 0;

  if (roomType === 'combat') _spawnEnemies();
  if (roomType === 'boss')   _spawnBoss();
}

function updateGameplay(dt, t) {
  if (!gp) return;

  if (gp.cinematic) {
    _updateGojoCinematic(dt);
    return;
  }

  if (gp.devCinematicPicker) {
    _updateDevCinematicPicker();
    return;
  }

  if (gp.devBossSelect) {
    _updateDevBossSelect(t);
    return;
  }

  if (gp.bossDefeated) {
    if (Input.justPressed('Enter')) {
      if (gp.floor >= 3) {
        initGameplay(gp.char, gp.power);  // restart from floor 1 after win
      } else {
        gp.floorComplete = true;           // signal main.js to advance floor
      }
    }
    return;
  }

  if (gp.gameOver) return;

  if (gp.hints.timer > 0) gp.hints.timer -= dt;

  // Always update player so they can walk through the door after clearing
  _updatePlayer(dt, t);
  _updatePowerState(dt);

  // Always drain in-flight projectiles/attacks so nothing freezes mid-air
  _updateActiveAttacks(dt);
  _updateProjectiles(dt);

  if (!gp.roomCleared && !gp.bossDefeated) {
    if (gp.boss) {
      _updateBoss(dt, t);
    } else {
      _updateEnemies(dt);
    }
    _checkRoomClear();
  }
}

function drawGameplay(ctx, t) {
  if (!gp) return;
  if (gp.cinematic) { _drawGojoCinematic(ctx, t); return; }
  const currentRoomType = gp.rooms[gp.roomIndex];
  const isFinalRoom     = gp.roomIndex >= gp.rooms.length - 1;

  _drawRoom(ctx);

  // Tutorial controls live on the floor layer so player/attacks render on top
  if (currentRoomType === 'tutorial') _drawTutorialFloor(ctx, t);

  _drawActiveAttacks(ctx, t);
  _drawProjectiles(ctx, t);
  _drawBossAttacks(ctx, t);
  _drawEnemies(ctx);
  _drawBoss(ctx, t);
  if (gp.boss && gp.boss.type === 'gojo') _drawGojoIT(ctx, gp.boss);
  _drawPowerAura(ctx, t);   // aura behind the player sprite
  _drawPlayer(ctx, t);
  if (gp.char.id === 'kaido') _drawKaidoBreathCharge(ctx, t);
  if (gp.boss && gp.boss.type === 'gojo') _drawGojoStunOverlay(ctx, t, gp.boss);
  _drawPowerEffects(ctx, t);
  _drawCombatHint(ctx);
  if (gp.boss && gp.boss.type === 'gojo' && gp.boss.voidTellTimer > 0) _drawVoidTell(ctx, t, gp.boss);
  if (gp.boss && gp.boss.type === 'gojo' && gp.boss.voidTimer > 0) _drawInfiniteVoid(ctx, t, gp.boss);
  _drawBossHUD(ctx, t);

  // Boss intro overlay (drawn above game, below final overlays)
  if (gp.boss && gp.boss.introTimer > 0) _drawBossIntro(ctx, t, gp.boss);

  // ── Overlays (above everything) ──────────────────────────────────────────
  if (gp.bossDefeated) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);
    glowText(ctx, 'BOSS DEFEATED', W / 2, H / 2 - 24, '#22c55e', 28,
      'bold 58px "Segoe UI Black", "Arial Black", sans-serif');
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font      = '18px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const continueMsg = gp.floor >= 3 ? 'Press ENTER to play again'
                      : 'Press ENTER — claim your reward';
    ctx.fillText(continueMsg, W / 2, H / 2 + 28);
  } else if (gp.roomCleared && currentRoomType !== 'tutorial') {
    if (!isFinalRoom) {
      glowText(ctx, 'ROOM CLEARED', W / 2, ROOM.y + 44, '#22c55e', 20,
        'bold 30px "Segoe UI Black", "Arial Black", sans-serif');
      _drawDoorArrow(ctx, t);
    }
  }

  if (gp.devBossSelect) _drawDevBossSelect(ctx, t);
  if (gp.devCinematicPicker) _drawDevCinematicPicker(ctx, t);

  _updateHUD();
}

// ─── Room ─────────────────────────────────────────────────────────────────────

// 2.5D wall face dimensions
const WALL_FACE_H = 36;   // visible top-wall front face, drawn in ceiling margin
const BLOCK_W     = 80;   // stone block width
const BLOCK_ROWS  = 2;
const BLOCK_H     = Math.floor(WALL_FACE_H / BLOCK_ROWS);

function _drawRoom(ctx) {
  const isFinalRoom = gp && gp.roomIndex >= gp.rooms.length - 1;
  const nextIsBoss  = gp && !isFinalRoom && gp.rooms[gp.roomIndex + 1] === 'boss';

  // ── Background ─────────────────────────────────────────────────────────
  ctx.fillStyle = '#06060d';
  ctx.fillRect(0, 0, W, H);

  // ── Floor (perspective gradient: darker far-back, lighter near-camera) ─
  const floorG = ctx.createLinearGradient(ROOM.x, ROOM.y, ROOM.x, ROOM.y + ROOM.h);
  floorG.addColorStop(0,   '#0f0f22');
  floorG.addColorStop(0.5, '#131328');
  floorG.addColorStop(1,   '#1a1a34');
  ctx.fillStyle = floorG;
  ctx.fillRect(ROOM.x, ROOM.y, ROOM.w, ROOM.h);

  // ── Floor tile grid (horizontal lines are fainter near the far wall) ───
  const ts = 80;
  ctx.lineWidth = 1;
  for (let x = ROOM.x; x <= ROOM.x + ROOM.w; x += ts) {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath(); ctx.moveTo(x, ROOM.y); ctx.lineTo(x, ROOM.y + ROOM.h); ctx.stroke();
  }
  for (let y = ROOM.y + ts; y <= ROOM.y + ROOM.h; y += ts) {
    const frac = (y - ROOM.y) / ROOM.h;
    ctx.strokeStyle = `rgba(255,255,255,${0.02 + frac * 0.032})`;
    ctx.beginPath(); ctx.moveTo(ROOM.x, y); ctx.lineTo(ROOM.x + ROOM.w, y); ctx.stroke();
  }

  // ── Outer wall fills (ceiling band, side strips, bottom strip) ─────────
  ctx.fillStyle = '#06060d';
  ctx.fillRect(0, 0, W, ROOM.y - WALL_FACE_H);   // ceiling above wall face
  ctx.fillRect(0, 0, ROOM.x, H);                  // left margin
  ctx.fillRect(ROOM.x + ROOM.w, 0, W - ROOM.x - ROOM.w, H); // right margin
  ctx.fillRect(0, ROOM.y + ROOM.h, W, H - ROOM.y - ROOM.h); // bottom strip

  // ── Top wall face (stone masonry — this is the key 2.5D element) ───────
  const faceY = ROOM.y - WALL_FACE_H;
  const faceG = ctx.createLinearGradient(0, faceY, 0, ROOM.y);
  faceG.addColorStop(0,    '#1e1e3c');  // top of face — receives ambient light
  faceG.addColorStop(0.55, '#191934');
  faceG.addColorStop(1,    '#0d0d26'); // bottom — in shadow where wall meets floor
  ctx.fillStyle = faceG;
  ctx.fillRect(ROOM.x, faceY, ROOM.w, WALL_FACE_H);

  // Stone blocks on top wall face
  for (let row = 0; row < BLOCK_ROWS; row++) {
    const by     = faceY + row * BLOCK_H;
    const offset = row % 2 === 1 ? BLOCK_W / 2 : 0;
    for (let bx = ROOM.x - offset; bx < ROOM.x + ROOM.w; bx += BLOCK_W) {
      const x1 = Math.max(ROOM.x, bx);
      const x2 = Math.min(ROOM.x + ROOM.w, bx + BLOCK_W);
      if (x2 <= x1) continue;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(x1 + 0.5, by + 0.5, x2 - x1 - 1, BLOCK_H - 1);
      // Ambient top-edge highlight on each stone
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.moveTo(x1 + 2, by + 2);
      ctx.lineTo(x2 - 2, by + 2);
      ctx.stroke();
    }
  }

  // ── Wall shadows cast onto floor (creates the sense of wall height) ────
  // Top-wall shadow — strongest (farthest-reaching), reads as a tall wall
  const tShad = ctx.createLinearGradient(0, ROOM.y, 0, ROOM.y + 56);
  tShad.addColorStop(0, 'rgba(0,0,0,0.62)');
  tShad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tShad;
  ctx.fillRect(ROOM.x, ROOM.y, ROOM.w, 56);

  // Left-wall shadow
  const lShad = ctx.createLinearGradient(ROOM.x, 0, ROOM.x + 44, 0);
  lShad.addColorStop(0, 'rgba(0,0,0,0.42)');
  lShad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lShad;
  ctx.fillRect(ROOM.x, ROOM.y, 44, ROOM.h);

  // Right-wall shadow
  const rShad = ctx.createLinearGradient(ROOM.x + ROOM.w, 0, ROOM.x + ROOM.w - 44, 0);
  rShad.addColorStop(0, 'rgba(0,0,0,0.42)');
  rShad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rShad;
  ctx.fillRect(ROOM.x + ROOM.w - 44, ROOM.y, 44, ROOM.h);

  // Bottom-wall shadow (lighter — closest to camera, less height)
  const bShad = ctx.createLinearGradient(0, ROOM.y + ROOM.h, 0, ROOM.y + ROOM.h - 22);
  bShad.addColorStop(0, 'rgba(0,0,0,0.28)');
  bShad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bShad;
  ctx.fillRect(ROOM.x, ROOM.y + ROOM.h - 22, ROOM.w, 22);

  // ── Room border glow ───────────────────────────────────────────────────
  ctx.shadowColor = 'rgba(80,80,180,0.35)';
  ctx.shadowBlur  = 14;
  ctx.strokeStyle = 'rgba(65,65,145,0.45)';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(ROOM.x, ROOM.y);          ctx.lineTo(ROOM.x + ROOM.w, ROOM.y);
  ctx.moveTo(ROOM.x, ROOM.y);          ctx.lineTo(ROOM.x, ROOM.y + ROOM.h);
  ctx.moveTo(ROOM.x, ROOM.y + ROOM.h); ctx.lineTo(ROOM.x + ROOM.w, ROOM.y + ROOM.h);
  if (isFinalRoom) {
    ctx.moveTo(ROOM.x + ROOM.w, ROOM.y); ctx.lineTo(ROOM.x + ROOM.w, ROOM.y + ROOM.h);
  } else {
    ctx.moveTo(ROOM.x + ROOM.w, ROOM.y);          ctx.lineTo(ROOM.x + ROOM.w, DOOR_Y);
    ctx.moveTo(ROOM.x + ROOM.w, DOOR_Y + DOOR_H); ctx.lineTo(ROOM.x + ROOM.w, ROOM.y + ROOM.h);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // ── Door ───────────────────────────────────────────────────────────────
  if (!isFinalRoom) {
    const doorOpen   = gp && gp.roomCleared;
    const openColor  = nextIsBoss ? '#ef4444' : '#4ade80';
    const openShadow = nextIsBoss ? '#ef4444' : '#22c55e';
    const openFill   = nextIsBoss ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)';
    if (doorOpen) {
      ctx.shadowColor = openShadow;
      ctx.shadowBlur  = 18;
      ctx.strokeStyle = openColor;
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.moveTo(ROOM.x + ROOM.w, DOOR_Y);
      ctx.lineTo(ROOM.x + ROOM.w + 16, DOOR_Y);
      ctx.lineTo(ROOM.x + ROOM.w + 16, DOOR_Y + DOOR_H);
      ctx.lineTo(ROOM.x + ROOM.w, DOOR_Y + DOOR_H);
      ctx.stroke();
      ctx.fillStyle = openFill;
      ctx.fillRect(ROOM.x + ROOM.w, DOOR_Y, 16, DOOR_H);
      ctx.shadowBlur = 0;
      if (nextIsBoss) {
        _drawSkullIcon(ctx, ROOM.x + ROOM.w + 8, DOOR_Y - 22, 18);
      }
    } else {
      ctx.fillStyle = '#1e1e3a';
      ctx.fillRect(ROOM.x + ROOM.w - 2, DOOR_Y, 18, DOOR_H);
      ctx.strokeStyle = nextIsBoss ? 'rgba(180,40,40,0.6)' : 'rgba(60,60,120,0.6)';
      ctx.lineWidth   = 2;
      ctx.strokeRect(ROOM.x + ROOM.w - 2, DOOR_Y, 18, DOOR_H);
      if (nextIsBoss) {
        _drawSkullIcon(ctx, ROOM.x + ROOM.w + 7, DOOR_Y + DOOR_H / 2, 16);
      } else {
        ctx.strokeStyle = 'rgba(100,100,160,0.5)';
        ctx.lineWidth   = 2;
        const lx = ROOM.x + ROOM.w + 5, ly = DOOR_Y + DOOR_H / 2;
        ctx.beginPath();
        ctx.moveTo(lx - 5, ly - 5); ctx.lineTo(lx + 5, ly + 5);
        ctx.moveTo(lx + 5, ly - 5); ctx.lineTo(lx - 5, ly + 5);
        ctx.stroke();
      }
    }
  }

  // ── Left dev door (first tutorial room only) ───────────────────────────
  if (gp && gp.floor === 1 && gp.roomIndex === 0) {
    ctx.save();
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur  = 14;
    ctx.strokeStyle = 'rgba(168,85,247,0.7)';
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.moveTo(ROOM.x, LEFT_DOOR_Y);
    ctx.lineTo(ROOM.x - 14, LEFT_DOOR_Y);
    ctx.lineTo(ROOM.x - 14, LEFT_DOOR_Y + LEFT_DOOR_H);
    ctx.lineTo(ROOM.x, LEFT_DOOR_Y + LEFT_DOOR_H);
    ctx.stroke();
    ctx.fillStyle = 'rgba(88,28,135,0.15)';
    ctx.fillRect(ROOM.x - 14, LEFT_DOOR_Y, 14, LEFT_DOOR_H);
    ctx.shadowBlur = 0;
    // "DEV" label
    ctx.font      = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(192,132,252,0.75)';
    ctx.fillText('DEV', ROOM.x - 7, LEFT_DOOR_Y - 8);
    ctx.restore();
  }

  // ── Corner accents ─────────────────────────────────────────────────────
  const cs = 26;
  ctx.strokeStyle = 'rgba(100,100,180,0.35)';
  ctx.lineWidth   = 2;
  [
    [ROOM.x,          ROOM.y,           1,  1],
    [ROOM.x + ROOM.w, ROOM.y,          -1,  1],
    [ROOM.x,          ROOM.y + ROOM.h,  1, -1],
    [ROOM.x + ROOM.w, ROOM.y + ROOM.h, -1, -1],
  ].forEach(([cx, cy, sx, sy]) => {
    ctx.beginPath();
    ctx.moveTo(cx + sx * cs, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * cs);
    ctx.stroke();
  });
}

// ─── Enemies ──────────────────────────────────────────────────────────────────

function _makeEnemy(type, x, y) {
  const base = { x, y, vx: 0, vy: 0, knockbackTimer: 0 };
  if (type === 'ranged') {
    return { ...base, type: 'ranged', w: RW, h: RH, hp: 45, maxHp: 45, speed: 75, damage: 22,
             fireCooldown: 1.5 + Math.random() * 1.0, windupActive: false, windupTimer: 0,
             strafeDir: Math.random() < 0.5 ? 1 : -1, strafeTimer: 1.0 + Math.random() };
  }
  if (type === 'tank') {
    return { ...base, type: 'tank', w: TW, h: TH, hp: 180, maxHp: 180, speed: 50, damage: 35,
             chargeState: null, chargeTimer: 3.5 + Math.random() * 2.5,
             chargeDir: { x: 0, y: 0 }, windupTimer: 0, recoveryTimer: 0 };
  }
  return { ...base, type: 'basic', w: EW, h: EH, hp: 60, maxHp: 60, speed: 90, damage: 12 };
}

function _spawnEnemies() {
  // Room compositions keyed by [floor][combatRoomIndex (1-based)]
  let composition;
  const ci = gp.roomIndex; // 1 = first combat room, 2 = second, 3 = third
  if (gp.floor === 1) {
    if      (ci === 1) { const n = 3 + (Math.random() < 0.5 ? 1 : 0); composition = Array(n).fill('basic'); }
    else if (ci === 2) { const n = 2 + (Math.random() < 0.5 ? 1 : 0); composition = [...Array(n).fill('basic'), 'ranged']; }
    else               { composition = ['basic', 'ranged', 'basic', 'ranged'].sort(() => Math.random() - 0.5); }
  } else if (gp.floor === 2) {
    if      (ci === 1) { composition = ['basic', 'ranged', 'ranged', 'ranged']; }
    else if (ci === 2) { composition = ['ranged', 'ranged', 'tank']; }
    else               { composition = ['tank', 'tank']; }
  } else {
    composition = ['basic', 'basic', 'ranged', 'ranged', 'tank', 'tank'];
  }

  const margin = 40, safeRadius = 220;
  const spawnPX = ROOM.x + 24 + PW / 2, spawnPY = ROOM.y + ROOM.h / 2;

  for (const type of composition) {
    const ew = type === 'tank' ? TW : (type === 'ranged' ? RW : EW);
    const eh = type === 'tank' ? TH : (type === 'ranged' ? RH : EH);
    let x, y, attempts = 0;
    do {
      x = ROOM.x + margin + Math.random() * (ROOM.w - ew - margin * 2);
      y = ROOM.y + margin + Math.random() * (ROOM.h - eh - margin * 2);
      const dx = x + ew / 2 - spawnPX, dy = y + eh / 2 - spawnPY;
      if (dx * dx + dy * dy >= safeRadius * safeRadius) break;
    } while (++attempts < 30);
    gp.enemies.push(_makeEnemy(type, x, y));
  }
}

function _updateRangedEnemy(e, pcx, pcy, dt) {
  const dx = pcx - (e.x + e.w/2), dy = pcy - (e.y + e.h/2);
  const dist = Math.sqrt(dx*dx + dy*dy) || 1;
  const nx = dx/dist, ny = dy/dist;

  if (e.windupActive) {
    e.windupTimer += dt;
    if (e.windupTimer >= RANGED_WINDUP_DUR) {
      gp.enemyBullets.push({ x: e.x+e.w/2, y: e.y+e.h/2,
        vx: nx*RANGED_BULLET_SPD, vy: ny*RANGED_BULLET_SPD,
        r: 7, damage: e.damage, life: 2.0 });
      e.windupActive = false; e.windupTimer = 0;
      e.fireCooldown = RANGED_FIRE_CD;
    }
    return; // frozen in place during windup
  }

  let moveX = 0, moveY = 0;
  if (dist < RANGED_FLEE_DIST) {
    moveX = -nx; moveY = -ny;
  } else if (dist > RANGED_CHASE_DIST) {
    moveX = nx * 0.7; moveY = ny * 0.7;
  } else {
    e.strafeTimer -= dt;
    if (e.strafeTimer <= 0) { e.strafeDir = -e.strafeDir; e.strafeTimer = 1.2 + Math.random() * 1.2; }
    moveX = -ny * e.strafeDir + nx * ((dist - RANGED_PREFER_DIST) / RANGED_PREFER_DIST) * 0.4;
    moveY =  nx * e.strafeDir + ny * ((dist - RANGED_PREFER_DIST) / RANGED_PREFER_DIST) * 0.4;
    const ml = Math.sqrt(moveX*moveX + moveY*moveY) || 1;
    moveX /= ml; moveY /= ml;
  }
  e.x += moveX * e.speed * dt;
  e.y += moveY * e.speed * dt;

  e.fireCooldown -= dt;
  if (e.fireCooldown <= 0 && dist <= RANGED_CHASE_DIST) {
    e.windupActive = true; e.windupTimer = 0;
  }
}

function _updateTankEnemy(e, pcx, pcy, dt) {
  if (e.chargeState === null) {
    const dx = pcx-(e.x+e.w/2), dy = pcy-(e.y+e.h/2);
    const dist = Math.sqrt(dx*dx+dy*dy) || 1;
    if (dist > 2) { e.x += (dx/dist)*e.speed*dt; e.y += (dy/dist)*e.speed*dt; }
    e.chargeTimer -= dt;
    if (e.chargeTimer <= 0) { e.chargeState = 'windup'; e.windupTimer = 0; }
  } else if (e.chargeState === 'windup') {
    e.windupTimer += dt;
    if (e.windupTimer >= TANK_WINDUP_DUR) {
      const dx = pcx-(e.x+e.w/2), dy = pcy-(e.y+e.h/2);
      const dist = Math.sqrt(dx*dx+dy*dy) || 1;
      e.chargeDir = { x: dx/dist, y: dy/dist };
      e.chargeState = 'charging';
    }
  } else if (e.chargeState === 'charging') {
    e.x += e.chargeDir.x * TANK_CHARGE_SPD * dt;
    e.y += e.chargeDir.y * TANK_CHARGE_SPD * dt;
  } else if (e.chargeState === 'recovery') {
    e.recoveryTimer += dt;
    if (e.recoveryTimer >= TANK_RECOVERY_DUR) {
      e.chargeState = null; e.chargeTimer = 3.5 + Math.random() * 2.5;
    }
  }

  // Wall clamp — wall hit ends the charge (stagger)
  const px = e.x, py = e.y;
  e.x = Math.max(ROOM.x, Math.min(ROOM.x + ROOM.w - e.w, e.x));
  e.y = Math.max(ROOM.y, Math.min(ROOM.y + ROOM.h - e.h, e.y));
  if (e.chargeState === 'charging' && (e.x !== px || e.y !== py)) {
    e.chargeState = 'recovery'; e.recoveryTimer = 0;
  }
}

function _tickEnemyBullets(p, dt) {
  const frozen = gp.power.id === 'timestop' && gp.powerState.frozen;
  if (frozen) return;
  gp.enemyBullets = gp.enemyBullets.filter(b => {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < ROOM.x || b.x > ROOM.x+ROOM.w ||
        b.y < ROOM.y || b.y > ROOM.y+ROOM.h) return false;
    if (p.iFrames <= 0 && Math.abs(b.x - (p.x+PW/2)) < b.r+PW/2 &&
        Math.abs(b.y - (p.y+PH/2)) < b.r+PH/2) {
      let dmg = b.damage;
      if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
      p.hp -= dmg;
      p.iFrames = 1.2;
      _hakiReflect(b.damage, null);
      if (p.hp <= 0) { p.hp = 0; gp.gameOver = true; gp.killSource = 'ranged_enemy'; }
      return false;
    }
    return true;
  });
}

function _updateEnemies(dt) {
  const p = gp.player;
  const pcx = p.x + PW / 2, pcy = p.y + PH / 2;
  const frozen = gp.power.id === 'timestop' && gp.powerState.frozen;

  _tickEnemyBullets(p, dt);

  gp.enemies = gp.enemies.filter(e => e.hp > 0);

  for (const e of gp.enemies) {
    if (!frozen) {
      if (e.knockbackTimer > 0) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.knockbackTimer -= dt;
        const drag = Math.pow(0.04, dt);
        e.vx *= drag; e.vy *= drag;
      } else if (e.type === 'ranged') {
        _updateRangedEnemy(e, pcx, pcy, dt);
      } else if (e.type === 'tank') {
        _updateTankEnemy(e, pcx, pcy, dt);
      } else {
        const dx = pcx - (e.x + e.w/2), dy = pcy - (e.y + e.h/2);
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        if (dist > 2) { e.x += (dx/dist)*e.speed*dt; e.y += (dy/dist)*e.speed*dt; }
      }

      if (e.type !== 'tank') {
        e.x = Math.max(ROOM.x, Math.min(ROOM.x + ROOM.w - e.w, e.x));
        e.y = Math.max(ROOM.y, Math.min(ROOM.y + ROOM.h - e.h, e.y));
      }

      if (p.iFrames <= 0 &&
          _rectsOverlap({ x: p.x, y: p.y, w: PW, h: PH }, { x: e.x, y: e.y, w: e.w, h: e.h })) {
        let dmg = e.damage;
        if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
        p.hp -= dmg;
        p.iFrames = 1.2;
        _hakiReflect(e.damage, e);
        const ks = e.type === 'tank' ? 'tank_enemy' : e.type === 'ranged' ? 'ranged_enemy' : 'enemy';
        if (p.hp <= 0) { p.hp = 0; gp.gameOver = true; gp.killSource = ks; }
      }
    }
  }
}

function _drawBasicEnemy(ctx, e) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(e.x+e.w/2, e.y+e.h+4, e.w*0.42, 6, 0, 0, Math.PI*2);
  ctx.fill();

  ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10;
  ctx.fillStyle   = '#7f1d1d'; ctx.fillRect(e.x, e.y, e.w, e.h);
  ctx.fillStyle   = '#b91c1c'; ctx.fillRect(e.x+3, e.y+3, e.w-6, e.h-6);
  ctx.shadowBlur  = 0;

  ctx.fillStyle = '#fde68a'; ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 6;
  ctx.fillRect(e.x+7, e.y+11, 10, 10); ctx.fillRect(e.x+e.w-17, e.y+11, 10, 10);
  ctx.fillStyle = '#000'; ctx.shadowBlur = 0;
  ctx.fillRect(e.x+9, e.y+13, 6, 6); ctx.fillRect(e.x+e.w-15, e.y+13, 6, 6);

  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(e.x, e.y-10, e.w, 5);
  ctx.fillStyle = '#ef4444'; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 4;
  ctx.fillRect(e.x, e.y-10, e.w * Math.max(0, e.hp/e.maxHp), 5);
  ctx.shadowBlur = 0;
}

function _drawRangedEnemy(ctx, e, p) {
  const cx = e.x+e.w/2, cy = e.y+e.h/2;

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, e.y+e.h+4, e.w*0.42, 6, 0, 0, Math.PI*2);
  ctx.fill();

  // Windup glow
  if (e.windupActive) {
    const prog = Math.min(1, e.windupTimer / RANGED_WINDUP_DUR);
    ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 8 + prog * 28;
  }

  // Square body — teal, same structure as basic
  ctx.fillStyle = '#164e63'; ctx.fillRect(e.x, e.y, e.w, e.h);
  ctx.fillStyle = '#0891b2'; ctx.fillRect(e.x+3, e.y+3, e.w-6, e.h-6);
  ctx.fillStyle = '#0e7490'; ctx.fillRect(e.x+8, e.y+8, e.w-16, e.h-16);
  ctx.shadowBlur = 0;

  // Eyes — narrow squinting slits (archer look)
  ctx.fillStyle = '#ecfeff'; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 3;
  ctx.fillRect(e.x+7, e.y+11, 10, 4);
  ctx.fillRect(e.x+e.w-17, e.y+11, 10, 4);
  ctx.shadowBlur = 0;

  // Bow pointing toward player (drawn in local rotated space)
  const angle = Math.atan2((p.y+PH/2)-cy, (p.x+PW/2)-cx);
  const bowR = e.w * 0.48;
  const bowOffset = e.w * 0.65;
  ctx.save();
  ctx.translate(cx + Math.cos(angle) * bowOffset, cy + Math.sin(angle) * bowOffset);
  ctx.rotate(angle);
  ctx.strokeStyle = '#a5f3fc'; ctx.lineWidth = 2;
  ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 5;
  ctx.lineCap = 'round';
  // Bow arc
  ctx.beginPath(); ctx.arc(0, 0, bowR, -Math.PI*0.6, Math.PI*0.6); ctx.stroke();
  // Bowstring
  const sy = Math.sin(Math.PI*0.6) * bowR;
  ctx.beginPath(); ctx.moveTo(0, -sy); ctx.lineTo(0, sy); ctx.stroke();
  // Arrow shaft (along aim direction, i.e. horizontal in local space)
  ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 1.5; ctx.shadowColor = '#fde68a';
  ctx.beginPath(); ctx.moveTo(-bowR*1.1, 0); ctx.lineTo(bowR*0.35, 0); ctx.stroke();
  // Arrowhead
  ctx.fillStyle = '#fde68a'; ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.moveTo(bowR*0.5, 0); ctx.lineTo(bowR*0.15, -bowR*0.32); ctx.lineTo(bowR*0.15, bowR*0.32);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // HP bar
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(e.x, e.y-10, e.w, 5);
  ctx.fillStyle = '#06b6d4'; ctx.shadowColor = '#06b6d4'; ctx.shadowBlur = 4;
  ctx.fillRect(e.x, e.y-10, e.w * Math.max(0, e.hp/e.maxHp), 5);
  ctx.shadowBlur = 0;
}

function _drawTankEnemy(ctx, e) {
  const cx = e.x+e.w/2, cy = e.y+e.h/2;
  const isCharging  = e.chargeState === 'charging';
  const isWindup    = e.chargeState === 'windup';
  const isRecovery  = e.chargeState === 'recovery';
  const windupProg  = isWindup ? Math.min(1, e.windupTimer / TANK_WINDUP_DUR) : 0;

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(cx, e.y+e.h+5, e.w*0.46, 7, 0, 0, Math.PI*2);
  ctx.fill();

  // Motion trail during charge
  if (isCharging && e.chargeDir) {
    for (let i = 3; i >= 1; i--) {
      ctx.save();
      ctx.globalAlpha = 0.12 * (4 - i);
      ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10;
      const tx = e.x - e.chargeDir.x * e.w * i * 0.55;
      const ty = e.y - e.chargeDir.y * e.h * i * 0.55;
      ctx.fillStyle = '#b91c1c';
      ctx.beginPath(); ctx.roundRect(tx, ty, e.w, e.h, 8); ctx.fill();
      ctx.restore();
    }
  }

  // Outer glow
  if (isWindup) {
    ctx.shadowColor = '#dc2626'; ctx.shadowBlur = 6 + windupProg * 30;
  } else if (isCharging) {
    ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 22;
  }

  // Skull cranium
  ctx.fillStyle = '#7c2d12';
  ctx.beginPath(); ctx.roundRect(e.x+2, e.y+1, e.w-4, e.h*0.70, [9,9,3,3]); ctx.fill();
  ctx.fillStyle = isRecovery ? '#7f1d1d' : (isCharging ? '#b91c1c' : '#991b1b');
  ctx.beginPath(); ctx.roundRect(e.x+5, e.y+4, e.w-10, e.h*0.62, [7,7,2,2]); ctx.fill();
  ctx.shadowBlur = 0;

  // Jaw
  const jawY = e.y + e.h * 0.64;
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(e.x+4, jawY, e.w-8, e.h*0.30);
  ctx.fillStyle = '#6b1f0e';
  ctx.fillRect(e.x+7, jawY+3, e.w-14, e.h*0.22);

  // Teeth (3 across jaw)
  ctx.fillStyle = isRecovery ? '#a8a29e' : '#f5f5f4';
  const toothW = Math.floor((e.w - 20) / 3);
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(e.x + 9 + i * (toothW + 1), jawY + 2, toothW - 1, 9);
  }

  // Nasal cavity (upside-down V)
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.beginPath();
  ctx.moveTo(cx-5, e.y+33); ctx.lineTo(cx, e.y+26); ctx.lineTo(cx+5, e.y+33);
  ctx.closePath(); ctx.fill();

  // Eye sockets
  const eyeSocketColor = '#1c0a06';
  ctx.fillStyle = eyeSocketColor;
  ctx.beginPath(); ctx.roundRect(cx-18, e.y+9, 15, 16, 3); ctx.fill();
  ctx.beginPath(); ctx.roundRect(cx+3,  e.y+9, 15, 16, 3); ctx.fill();

  // Eye glow — builds during windup, fully lit when charging
  if (isWindup || isCharging) {
    const glowAlpha = isCharging ? 1.0 : windupProg;
    const glowColor = `rgba(239,68,68,${glowAlpha})`;
    ctx.fillStyle = glowColor;
    ctx.shadowColor = '#ef4444'; ctx.shadowBlur = isCharging ? 20 : windupProg * 16;
    ctx.beginPath(); ctx.roundRect(cx-17, e.y+10, 13, 14, 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx+4,  e.y+10, 13, 14, 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // HP bar
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(e.x, e.y-10, e.w, 5);
  ctx.fillStyle = isCharging ? '#ef4444' : '#f97316';
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 4;
  ctx.fillRect(e.x, e.y-10, e.w * Math.max(0, e.hp/e.maxHp), 5);
  ctx.shadowBlur = 0;
}

function _drawEnemies(ctx) {
  const p = gp.player;
  for (const e of gp.enemies) {
    if      (e.type === 'ranged') _drawRangedEnemy(ctx, e, p);
    else if (e.type === 'tank')   _drawTankEnemy(ctx, e);
    else                          _drawBasicEnemy(ctx, e);
  }

  // Enemy (ranged) bullets
  for (const b of gp.enemyBullets) {
    ctx.save();
    ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 12;
    ctx.fillStyle   = '#06b6d4';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ecfeff';
    ctx.beginPath(); ctx.arc(b.x - b.r*0.28, b.y - b.r*0.28, b.r*0.35, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ─── Player ───────────────────────────────────────────────────────────────────

function _updatePlayer(dt, t) {
  if (gp.boss && gp.boss.introTimer > 0) return;

  const p    = gp.player;
  const move = Input.moveDir;

  p.x += move.x * p.speed * dt;
  p.y += move.y * p.speed * dt;

  // Allow passing through open door on right wall
  const isFinalRoom = gp.roomIndex >= gp.rooms.length - 1;
  const inDoorLane  = p.y + PH / 2 > DOOR_Y && p.y + PH / 2 < DOOR_Y + DOOR_H;
  const canExit     = gp.roomCleared && !isFinalRoom && inDoorLane;
  let   rightBound  = canExit ? DOOR_X + PW + 40 : ROOM.x + ROOM.w - PW;

  const inLeftDoorLane  = p.y + PH / 2 > LEFT_DOOR_Y && p.y + PH / 2 < LEFT_DOOR_Y + LEFT_DOOR_H;
  const canEnterDevRoom = gp.floor === 1 && gp.roomIndex === 0 && inLeftDoorLane;
  const leftBound       = canEnterDevRoom ? ROOM.x - PW - 40 : ROOM.x;

  // Gojo Infinity barrier — blocks player from crossing while Gojo is not stunned
  if (gp.boss && gp.boss.type === 'gojo' && !gp.boss.isDead &&
      gp.boss.stunTimer <= 0 && !gp.boss.returnLanding && gp.boss.introTimer <= 0) {
    rightBound = Math.min(rightBound, GOJO_BARRIER_X - PW);
  }

  p.x = Math.max(leftBound, Math.min(rightBound, p.x));
  p.y = Math.max(ROOM.y, Math.min(ROOM.y + ROOM.h - PH, p.y));

  // One-time hint when player walks into the Infinity barrier
  if (move.x > 0 && gp.boss && gp.boss.type === 'gojo' && !gp.boss.isDead &&
      gp.boss.stunTimer <= 0 && !gp.boss.returnLanding && gp.boss.introTimer <= 0 &&
      p.x >= GOJO_BARRIER_X - PW - 2 && !gp.hints.shown.infinity) {
    gp.hints.shown.infinity = true;
    gp.hints.text     = "I can't get close...\nnone of my attacks will ever reach him.\nThere has to be another way!";
    gp.hints.timer    = 5.0;
    gp.hints.maxTimer = 5.0;
  }

  if (canExit && p.x > DOOR_X + 10) {
    _nextRoom();
    return;
  }

  if (canEnterDevRoom && p.x < ROOM.x - 10) {
    gp.devBossSelect = true;
    p.x = ROOM.x + 24;
    p.y = ROOM.y + ROOM.h / 2 - PH / 2;
    return;
  }

  p.isMoving = move.x !== 0 || move.y !== 0;
  if      (move.x < 0) p.dir = 'left';
  else if (move.x > 0) p.dir = 'right';
  else if (move.y < 0) p.dir = 'up';
  else if (move.y > 0) p.dir = 'down';

  p.tilt = p.isMoving ? Math.sin(t * 0.008) * 0.14 : 0;

  if (p.iFrames      > 0) p.iFrames      -= dt;
  if (p.fireCooldown > 0) p.fireCooldown -= dt;

  if (Input.justPressed('KeyE') && gp.power.type === 'active') _activatePower();

  const shoot = Input.shootDir;
  if (gp.char.id === 'kaido') {
    _updateKaidoBreath(dt, t, shoot);
  } else if (shoot) {
    _handleAttack(dt, t, shoot);
  } else {
    // Remove beam only; sweeps have their own lifetime and drain via _updateActiveAttacks
    gp.activeAttacks = gp.activeAttacks.filter(a => a.type !== 'beam');
  }
}

function _handleAttack(dt, t, shoot) {
  const p    = gp.player;
  const char = gp.char;
  const dir  = _vecToDir(shoot);
  const pcx  = p.x + PW / 2;
  const pcy  = p.y + PH / 2;

  if (char.id === 'dio') {
    if (p.fireCooldown <= 0) {
      p.fireCooldown = 0.9 / (char.stats.speed / 3.5);
      const spd = 480;
      // Spin: lock onto the nearest enemy/boss at fire time; red ball takes priority
      let lockTarget = null, lockType = null;
      if (gp.power.id === 'spin') {
        // Red ball priority: intercept it before targeting anything else
        const redBall = gp.bossAttacks.find(a => a.type === 'red_ball' && !a.done && a.dir === 'toward_player');
        if (redBall) {
          lockTarget = redBall; lockType = 'red_ball';
        } else {
          let bestSq = Infinity;
          for (const e of gp.enemies) {
            const dx = e.x + e.w/2 - pcx, dy = e.y + e.h/2 - pcy;
            const sq = dx*dx + dy*dy;
            if (sq < bestSq) { bestSq = sq; lockTarget = e; lockType = 'enemy'; }
          }
          if (gp.boss && !gp.boss.isDead && gp.boss.introTimer <= 0) {
            const dx = gp.boss.x + gp.boss.w/2 - pcx, dy = gp.boss.y + gp.boss.h/2 - pcy;
            const sq = dx*dx + dy*dy;
            if (sq < bestSq) { lockTarget = gp.boss; lockType = 'boss'; }
          }
        }
      }
      gp.projectiles.push({
        type: 'knife',
        x: pcx - 10, y: pcy - 7, w: 20, h: 14,
        vx: shoot.x * spd,
        vy: shoot.y * spd,
        damage: char.stats.damage,
        life: 2.0,
        trail: [],
        lockTarget, lockType,
        homingDelay: 0.18,
        piercesLeft: (gp.power.id === 'spin' && gp.power.spinUpgraded) ? 1 : 0,
        hitEnemies:  (gp.power.id === 'spin' && gp.power.spinUpgraded) ? new Set() : null,
      });
    }

  } else if (char.id === 'levi') {
    if (p.fireCooldown <= 0) {
      p.fireCooldown = 0.42 / (char.stats.speed / 3.5);
      let sweepAngle = _dirToAngle(dir);
      // Spin passive: auto-aim sweep; red ball takes priority over enemies/boss
      if (gp.power.id === 'spin') {
        const redBall = gp.bossAttacks.find(a => a.type === 'red_ball' && !a.done && a.dir === 'toward_player');
        if (redBall) {
          sweepAngle = Math.atan2(redBall.cy - pcy, redBall.cx - pcx);
        } else {
          let nearestX = null, nearestY = null, bestSq = Infinity;
          for (const e of gp.enemies) {
            const dx = e.x + e.w/2 - pcx, dy = e.y + e.h/2 - pcy;
            const sq = dx*dx + dy*dy;
            if (sq < bestSq) { bestSq = sq; nearestX = e.x + e.w/2; nearestY = e.y + e.h/2; }
          }
          if (gp.boss && !gp.boss.isDead && gp.boss.introTimer <= 0) {
            const dx = gp.boss.x + gp.boss.w/2 - pcx, dy = gp.boss.y + gp.boss.h/2 - pcy;
            const sq = dx*dx + dy*dy;
            if (sq < bestSq) { nearestX = gp.boss.x + gp.boss.w/2; nearestY = gp.boss.y + gp.boss.h/2; }
          }
          if (nearestX !== null) sweepAngle = Math.atan2(nearestY - pcy, nearestX - pcx);
        }
      }
      const sweepR     = (gp.power.id === 'spin' && gp.power.spinUpgraded) ? 162 : 130;
      const arcInner   = sweepR * 0.22;  // visual innerR
      const arcOuter   = sweepR * 0.94;  // visual outerR
      const sweepSpan  = Math.PI * 0.58;
      for (const e of gp.enemies) {
        const dx   = e.x + e.w / 2 - pcx;
        const dy   = e.y + e.h / 2 - pcy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const half = (e.w + e.h) / 4;
        if (dist >= arcInner - half && dist <= arcOuter + half &&
            Math.abs(_angleDiff(Math.atan2(dy, dx), sweepAngle)) < sweepSpan) {
          _damageEnemy(e, _critDamage(char.stats.damage, e.x + e.w/2, e.y + e.h/2), 230);
        }
      }
      const bos = gp.boss;
      if (bos && !bos.isDead && bos.introTimer <= 0) {
        const bdx  = bos.x + bos.w / 2 - pcx;
        const bdy  = bos.y + bos.h / 2 - pcy;
        const bd   = Math.sqrt(bdx*bdx + bdy*bdy);
        const half = Math.max(bos.w, bos.h) / 2;
        if (bd >= arcInner - half && bd <= arcOuter + half &&
            Math.abs(_angleDiff(Math.atan2(bdy, bdx), sweepAngle)) < sweepSpan) {
          _damageBoss(_critDamage(char.stats.damage, bos.x + bos.w/2, bos.y + bos.h/2));
        }
      }
      for (const a of gp.bossAttacks) {
        if (a.type !== 'sha' || a.exploding) continue;
        const sdx  = a.x + a.w/2 - pcx, sdy = a.y + a.h/2 - pcy;
        const sd   = Math.sqrt(sdx*sdx + sdy*sdy);
        const half = a.w / 2;
        if (sd >= arcInner - half && sd <= arcOuter + half &&
            Math.abs(_angleDiff(Math.atan2(sdy, sdx), sweepAngle)) < sweepSpan) {
          _damageSHA(a, _critDamage(char.stats.damage, a.x + a.w/2, a.y + a.h/2));
        }
      }
      gp.activeAttacks.push({
        type: 'sweep', cx: pcx, cy: pcy, angle: sweepAngle,
        r: sweepR, life: 0.42, maxLife: 0.42, dir,
      });
    }
  }
}

// ─── Kaido breath (Brimstone-style charge → fire → cooldown) ──────────────────

function _updateKaidoBreath(dt, t, shoot) {
  const kb  = gp.kaidoBreath;
  const p   = gp.player;
  const pcx = p.x + PW / 2;
  const pcy = p.y + PH / 2;

  if (kb.state === 'idle') {
    gp.activeAttacks = gp.activeAttacks.filter(a => a.type !== 'beam');
    if (shoot) {
      kb.state = 'charging';
      kb.dir   = _vecToDir(shoot);
      kb.chargeTimer = 0;
    }

  } else if (kb.state === 'charging') {
    gp.activeAttacks = gp.activeAttacks.filter(a => a.type !== 'beam');
    if (shoot) {
      kb.dir = _vecToDir(shoot);
      kb.chargeTimer = Math.min(kb.chargeTimer + dt, KB_CHARGE_MAX);
      p.dir = kb.dir;
    } else {
      // Key released — fire only if held long enough
      if (kb.chargeTimer >= KB_CHARGE_MIN) {
        kb.state     = 'firing';
        kb.fireTimer = KB_FIRE_DUR;
        kb.tickTimer = 0;
      } else {
        kb.state = 'idle';
      }
      kb.chargeTimer = 0;
    }

  } else if (kb.state === 'firing') {
    if (shoot) {
      // Cancel beam, start charging the next shot immediately
      gp.activeAttacks = gp.activeAttacks.filter(a => a.type !== 'beam');
      kb.state = 'charging';
      kb.dir   = _vecToDir(shoot);
      kb.chargeTimer = 0;
      return;
    }
    kb.fireTimer -= dt;
    if (kb.fireTimer <= 0) {
      kb.state = 'cooldown';
      kb.cooldownTimer = KB_COOLDOWN / (gp.char.stats.speed / 3.5);
      gp.activeAttacks = gp.activeAttacks.filter(a => a.type !== 'beam');
    } else {
      let beam = gp.activeAttacks.find(a => a.type === 'beam');
      if (!beam) {
        beam = { type: 'beam', dir: kb.dir, ox: pcx, oy: pcy, len: 380, nearThick: 18, farThick: 90, tickTimer: 0 };
        gp.activeAttacks.push(beam);
      }
      beam.dir = kb.dir;
      beam.ox  = pcx;
      beam.oy  = pcy;
      kb.tickTimer -= dt;
      if (kb.tickTimer <= 0) {
        kb.tickTimer = 0.04;
        for (const e of gp.enemies) {
          if (_enemyInBeam(beam, e, e.w, e.h)) _damageEnemy(e, _critDamage(gp.char.stats.damage * 0.05, e.x + e.w/2, e.y + e.h/2));
        }
        const bos = gp.boss;
        if (bos && !bos.isDead && bos.introTimer <= 0 && _enemyInBeam(beam, bos, bos.w, bos.h)) {
          _damageBoss(_critDamage(gp.char.stats.damage * 0.05, bos.x + bos.w/2, bos.y + bos.h/2));
        }
        for (const a of gp.bossAttacks) {
          if (a.type === 'sha' && !a.exploding && _enemyInBeam(beam, a, a.w, a.h)) {
            _damageSHA(a, _critDamage(gp.char.stats.damage * 0.05, a.x + a.w/2, a.y + a.h/2));
          }
        }
      }
    }

  } else if (kb.state === 'cooldown') {
    gp.activeAttacks = gp.activeAttacks.filter(a => a.type !== 'beam');
    if (shoot) {
      // Cancel cooldown, start charging immediately
      kb.state = 'charging';
      kb.dir   = _vecToDir(shoot);
      kb.chargeTimer = 0;
      return;
    }
    kb.cooldownTimer -= dt;
    if (kb.cooldownTimer <= 0) kb.state = 'idle';
  }
}

function _drawKaidoBreathCharge(ctx, t) {
  const kb = gp.kaidoBreath;
  if (kb.state !== 'charging') return;
  const prog = kb.chargeTimer / KB_CHARGE_MAX;
  const p    = gp.player;
  const pcx  = p.x + PW / 2;
  const pcy  = p.y + PH / 2;

  const offset = 26 + prog * 20;
  let ox = pcx, oy = pcy;
  if (kb.dir === 'right') ox += offset;
  else if (kb.dir === 'left')  ox -= offset;
  else if (kb.dir === 'down')  oy += offset;
  else                         oy -= offset;

  const flicker = Math.sin(t * 0.031) * 0.12 + Math.sin(t * 0.053) * 0.07;
  const baseR   = (7 + prog * 24) * (1 + flicker);

  ctx.save();
  ctx.shadowColor = '#ff3300';
  ctx.shadowBlur  = 36 * prog;

  // Outer ember halo
  const halo = ctx.createRadialGradient(ox, oy, baseR * 0.5, ox, oy, baseR * 2.0);
  halo.addColorStop(0,   `rgba(255,80,0,${0.28 * prog})`);
  halo.addColorStop(0.6, `rgba(180,20,0,${0.12 * prog})`);
  halo.addColorStop(1,   'rgba(100,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(ox, oy, baseR * 2.0, 0, Math.PI * 2);
  ctx.fill();

  // Main fire body (outer red-orange)
  const fireOuter = ctx.createRadialGradient(ox, oy, 0, ox, oy, baseR);
  fireOuter.addColorStop(0,   `rgba(255,200,40,${0.9 * prog})`);
  fireOuter.addColorStop(0.35,`rgba(255,100,0,${0.85 * prog})`);
  fireOuter.addColorStop(0.75,`rgba(200,30,0,${0.6 * prog})`);
  fireOuter.addColorStop(1,   'rgba(120,0,0,0)');
  ctx.fillStyle = fireOuter;
  ctx.beginPath();
  ctx.arc(ox, oy, baseR, 0, Math.PI * 2);
  ctx.fill();

  // Hot white-yellow core
  const coreR    = baseR * 0.38;
  const fireCore = ctx.createRadialGradient(ox, oy, 0, ox, oy, coreR);
  fireCore.addColorStop(0,   `rgba(255,255,200,${prog})`);
  fireCore.addColorStop(0.5, `rgba(255,220,80,${0.85 * prog})`);
  fireCore.addColorStop(1,   'rgba(255,120,0,0)');
  ctx.fillStyle = fireCore;
  ctx.beginPath();
  ctx.arc(ox, oy, coreR, 0, Math.PI * 2);
  ctx.fill();

  // Flame wisps orbiting the ball
  if (prog > 0.2) {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + t * 0.005 + i * 0.7;
      const dist  = baseR * (0.85 + Math.sin(t * 0.022 + i * 1.4) * 0.22);
      const wx    = ox + Math.cos(angle) * dist;
      const wy    = oy + Math.sin(angle) * dist;
      const wr    = baseR * 0.28 * prog;
      const wg    = ctx.createRadialGradient(wx, wy, 0, wx, wy, wr);
      wg.addColorStop(0, `rgba(255,${160 + i * 10},0,${0.55 * prog})`);
      wg.addColorStop(1, 'rgba(200,40,0,0)');
      ctx.fillStyle = wg;
      ctx.beginPath();
      ctx.arc(wx, wy, wr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // "Ready" ring flash when fully charged
  if (prog >= 0.98) {
    const ringPulse = 0.5 + Math.sin(t * 0.06) * 0.5;
    ctx.strokeStyle = `rgba(255,220,80,${ringPulse * 0.9})`;
    ctx.lineWidth   = 3;
    ctx.shadowColor = '#ffdd00';
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.arc(ox, oy, baseR * 1.35, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

function _drawPlayer(ctx, t) {
  const p = gp.player;
  if (p.iFrames > 0 && Math.floor(p.iFrames * 8) % 2 === 0) return;

  let pose, displayDir;
  if (gp.char.id === 'kaido') {
    const kb = gp.kaidoBreath;
    if (kb.state === 'charging') {
      pose       = 'charge';
      displayDir = _vecToDir(Input.shootDir) || kb.dir;
    } else if (kb.state === 'firing') {
      pose       = 'attack';
      displayDir = kb.dir;
    } else {
      pose       = Input.shootDir ? 'attack' : 'idle';
      displayDir = Input.shootDir ? _vecToDir(Input.shootDir) : p.dir;
    }
  } else if (gp.char.id === 'levi') {
    const activeSweep = gp.activeAttacks.find(a => a.type === 'sweep');
    if (activeSweep) {
      pose       = 'attack';
      displayDir = activeSweep.dir;
    } else {
      const shoot = Input.shootDir;
      pose       = shoot ? 'attack' : 'idle';
      displayDir = shoot ? _vecToDir(shoot) : p.dir;
    }
  } else {
    const shoot = Input.shootDir;
    pose       = shoot ? 'attack' : 'idle';
    displayDir = shoot ? _vecToDir(shoot) : p.dir;
  }

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(p.x + PW / 2, p.y + PH + 6, PW * 0.38, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw sprite larger than the hitbox so the character is more visible.
  // Hitbox (PW×PH) is unchanged — only the visual size grows.
  const VS = 1.7;
  const vw = PW * VS, vh = PH * VS;
  const vx = p.x + PW / 2 - vw / 2;
  const vy = p.y + PH / 2 - vh / 2;
  Assets.drawSprite(ctx, gp.char, pose, displayDir, vx, vy, vw, vh, p.tilt);
}

// ─── Projectiles ──────────────────────────────────────────────────────────────

function _updateProjectiles(dt) {
  const GRAVITY = 190;
  const spin    = gp.power.id === 'spin';
  gp.projectiles = gp.projectiles.filter(proj => {
    // Record trail point BEFORE moving so the oldest point is furthest behind
    if (spin && proj.trail) {
      proj.trail.push({ x: proj.x + proj.w / 2, y: proj.y + proj.h / 2 });
      if (proj.trail.length > 28) proj.trail.shift();
    }

    if (proj.type !== 'knife' || proj.bounced) proj.vy += GRAVITY * dt;
    if (proj.bounced && proj.spinAngle !== undefined) proj.spinAngle += proj.spinRate * dt;
    proj.x   += proj.vx * dt;
    proj.y   += proj.vy * dt;
    proj.life -= dt;

    // Spin passive: lock-on homing — steer toward the target locked at fire time
    if (spin && proj.lockTarget) {
      if (proj.homingDelay > 0) {
        proj.homingDelay -= dt;
      } else {
        const t     = proj.lockTarget;
        const alive = proj.lockType === 'red_ball' ? !t.done
          : proj.lockType === 'boss' ? (t === gp.boss && !t.isDead)
          : t.hp > 0;
        if (alive) {
          const tx  = proj.lockType === 'red_ball' ? t.cx
                    : proj.lockType === 'boss'      ? t.x + t.w/2 : t.x + t.w/2;
          const ty  = proj.lockType === 'red_ball' ? t.cy
                    : proj.lockType === 'boss'      ? t.y + t.h/2 : t.y + t.h/2;
          const cx  = proj.x + proj.w/2, cy = proj.y + proj.h/2;
          const spd = Math.sqrt(proj.vx*proj.vx + proj.vy*proj.vy) || 1;
          const curAng  = Math.atan2(proj.vy, proj.vx);
          const wantAng = Math.atan2(ty - cy, tx - cx);
          const maxTurn = (1.5 / spd) * (gp.power.spinUpgraded ? 920 : 480) * dt;
          let delta = wantAng - curAng;
          while (delta >  Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          const newAng = curAng + Math.max(-maxTurn, Math.min(maxTurn, delta));
          proj.vx = Math.cos(newAng) * spd;
          proj.vy = Math.sin(newAng) * spd;
        }
      }
    }

    if (proj.x < ROOM.x || proj.x > ROOM.x + ROOM.w ||
        proj.y < ROOM.y || proj.y > ROOM.y + ROOM.h || proj.life <= 0) return false;
    for (const e of gp.enemies) {
      if (_rectsOverlap({ x: proj.x, y: proj.y, w: proj.w, h: proj.h },
                         { x: e.x, y: e.y, w: e.w, h: e.h })) {
        if (proj.hitEnemies && proj.hitEnemies.has(e)) continue;
        _damageEnemy(e, _critDamage(proj.damage, e.x + e.w/2, e.y + e.h/2));
        if (proj.piercesLeft > 0) {
          proj.piercesLeft--;
          if (proj.hitEnemies) proj.hitEnemies.add(e);
          // Re-acquire nearest unhit enemy as the new homing target
          if (proj.lockType === 'enemy') {
            const pcx2 = proj.x + proj.w/2, pcy2 = proj.y + proj.h/2;
            let newTarget = null, bestSq2 = Infinity;
            for (const en of gp.enemies) {
              if (proj.hitEnemies && proj.hitEnemies.has(en)) continue;
              const dx2 = en.x + en.w/2 - pcx2, dy2 = en.y + en.h/2 - pcy2;
              const sq2 = dx2*dx2 + dy2*dy2;
              if (sq2 < bestSq2) { bestSq2 = sq2; newTarget = en; }
            }
            proj.lockTarget = newTarget;
            if (!newTarget) proj.lockType = null;
          }
          break;
        }
        return false;
      }
    }
    const bos = gp.boss;
    // Infinity barrier: Dio knives ricochet off the barrier when Gojo is not stunned
    if (proj.type === 'knife' && bos && bos.type === 'gojo' && !bos.isDead &&
        bos.stunTimer <= 0 && !bos.returnLanding && bos.introTimer <= 0 &&
        proj.x + proj.w >= GOJO_BARRIER_X) {
      proj.x         = GOJO_BARRIER_X - proj.w;
      proj.vx        = -(60 + Math.random() * 80);
      proj.vy        = 320 + Math.random() * 180;
      proj.bounced   = true;
      proj.spinAngle = Math.atan2(proj.vy, proj.vx);   // start at current heading
      proj.spinRate  = -(14 + Math.random() * 8);      // fast reverse spin (backspin)
      proj.lockTarget = null;
      bos.infinityTimer = 0.4;
      bos.flashTimer    = 0.08;
      bos.barrierHits.push({ y: proj.y + proj.h / 2, r: 0, alpha: 1.0, timer: 0.75 });
      bos.infinityRipples.push({ r: 10, alpha: 0.9 });
      bos.infinityRipples.push({ r: 10, alpha: 0.55 });
      if (!gp.hints.shown.infinity) {
        gp.hints.shown.infinity = true;
        gp.hints.text     = "I can't get close...\nnone of my attacks will ever reach him.\nThere has to be another way!";
        gp.hints.timer    = 5.0;
        gp.hints.maxTimer = 5.0;
      }
      return true;
    }
    if (bos && !bos.isDead && bos.introTimer <= 0 &&
        _rectsOverlap({ x: proj.x, y: proj.y, w: proj.w, h: proj.h },
                      { x: bos.x, y: bos.y, w: bos.w, h: bos.h })) {
      _damageBoss(_critDamage(proj.damage, bos.x + bos.w/2, bos.y + bos.h/2));
      return false;
    }
    for (const a of gp.bossAttacks) {
      if (a.type === 'sha' && !a.exploding &&
          _rectsOverlap({ x: proj.x, y: proj.y, w: proj.w, h: proj.h },
                        { x: a.x, y: a.y, w: a.w, h: a.h })) {
        _damageSHA(a, _critDamage(proj.damage, a.x + a.w/2, a.y + a.h/2));
        return false;
      }
    }
    return true;
  });
}

function _drawProjectiles(ctx, t) {
  const spinActive = gp.power.id === 'spin';

  for (const proj of gp.projectiles) {
    if (proj.type !== 'knife') continue;

    // ── Bee-path looping trail ────────────────────────────────────────────────
    // Offsets each trail point along BOTH the tangent AND normal axes, tracing
    // a small circle in local frame. When the loop radius exceeds half the
    // spacing × points-per-loop, the path crosses itself → visible loops.
    if (spinActive && proj.trail && proj.trail.length >= 3) {
      const n             = proj.trail.length;
      const loopPhaseStep = (Math.PI * 2) / 5; // one full loop every 5 trail points

      const sPts = [];
      for (let i = 0; i < n; i++) {
        const prevI = Math.max(0, i - 1);
        const nextI = Math.min(n - 1, i + 1);
        const tdx  = proj.trail[nextI].x - proj.trail[prevI].x;
        const tdy  = proj.trail[nextI].y - proj.trail[prevI].y;
        const tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
        const tanX =  tdx / tlen;
        const tanY =  tdy / tlen;
        const norX = -tdy / tlen;
        const norY =  tdx / tlen;

        const frac  = i / (n - 1);   // 0 = tail, 1 = knife
        const r     = frac * 7;       // loop radius: 0 at tail → 7px at knife
        const phase = i * loopPhaseStep;

        sPts.push({
          x:     proj.trail[i].x + tanX * Math.cos(phase) * r + norX * Math.sin(phase) * r,
          y:     proj.trail[i].y + tanY * Math.cos(phase) * r + norY * Math.sin(phase) * r,
          alpha: Math.pow(frac, 0.5) * 0.92,
          lw:    0.6 + frac * 2.2,
        });
      }

      ctx.save();
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.shadowColor = '#ffe000';
      ctx.shadowBlur  = 12;
      for (let i = 1; i < sPts.length; i++) {
        const a = sPts[i - 1];
        const b = sPts[i];
        ctx.strokeStyle = `rgba(255,215,0,${b.alpha})`;
        ctx.lineWidth   = b.lw;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // ── Knife blade ──────────────────────────────────────────────────────────
    ctx.save();
    ctx.translate(proj.x + proj.w / 2, proj.y + proj.h / 2);
    ctx.rotate(proj.bounced ? proj.spinAngle : Math.atan2(proj.vy, proj.vx));

    // Blade
    ctx.shadowColor = '#c084fc';
    ctx.shadowBlur  = 12;
    ctx.fillStyle   = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(5, -5.5);
    ctx.lineTo(3, -4);
    ctx.lineTo(3, 4);
    ctx.lineTo(5, 5.5);
    ctx.closePath();
    ctx.fill();

    // Blade edge highlight
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(5, -5.5);
    ctx.stroke();

    // Crossguard
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(1, -8, 4, 16);

    // Handle
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.moveTo(3, -4);
    ctx.lineTo(-13, -3.5);
    ctx.lineTo(-13, 3.5);
    ctx.lineTo(3, 4);
    ctx.closePath();
    ctx.fill();

    // Grip wrap lines
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth   = 1.2;
    for (let hx = -11; hx <= -2; hx += 3.5) {
      ctx.beginPath();
      ctx.moveTo(hx, -3.5);
      ctx.lineTo(hx + 0.5, 3.5);
      ctx.stroke();
    }

    // Pommel
    ctx.shadowColor = '#94a3b8';
    ctx.shadowBlur  = 5;
    ctx.fillStyle   = '#94a3b8';
    ctx.beginPath();
    ctx.arc(-14.5, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}

// ─── Active attacks ───────────────────────────────────────────────────────────

function _updateActiveAttacks(dt) {
  gp.activeAttacks = gp.activeAttacks.filter(a => {
    if (a.type === 'sweep') {
      a.life -= dt;
      // Keep anchored to player so the visual doesn't lag behind movement
      a.cx = gp.player.x + PW / 2;
      a.cy = gp.player.y + PH / 2;
      return a.life > 0;
    }
    return true; // beam is removed in _updatePlayer when no shoot input
  });
}

function _drawActiveAttacks(ctx, t) {
  for (const a of gp.activeAttacks) {

    if (a.type === 'beam') {
      ctx.save();

      const nearH = a.nearThick / 2;
      const farH  = a.farThick  / 2;
      const ox = a.ox, oy = a.oy;
      // Clip beam at room walls (and Gojo's Infinity barrier for rightward fire)
      let len = a.len;
      if (a.dir === 'right') {
        len = Math.min(len, ROOM.x + ROOM.w - ox);
        const bos = gp.boss;
        if (bos && bos.type === 'gojo' && !bos.isDead && bos.stunTimer <= 0 && !bos.returnLanding && bos.introTimer <= 0) {
          len = Math.min(len, GOJO_BARRIER_X - ox);
        }
      } else if (a.dir === 'left') {
        len = Math.min(len, ox - ROOM.x);
      } else if (a.dir === 'down') {
        len = Math.min(len, ROOM.y + ROOM.h - oy);
      } else {
        len = Math.min(len, oy - ROOM.y);
      }
      len = Math.max(0, len);
      const horiz = a.dir === 'right' || a.dir === 'left';

      // Build trapezoid corners (wide at mouth, narrow at tip)
      let p0, p1, p2, p3;
      if      (a.dir === 'right') { p0={x:ox,y:oy-nearH}; p1={x:ox+len,y:oy-farH}; p2={x:ox+len,y:oy+farH}; p3={x:ox,y:oy+nearH}; }
      else if (a.dir === 'left')  { p0={x:ox,y:oy-nearH}; p1={x:ox-len,y:oy-farH}; p2={x:ox-len,y:oy+farH}; p3={x:ox,y:oy+nearH}; }
      else if (a.dir === 'down')  { p0={x:ox-nearH,y:oy}; p1={x:ox-farH,y:oy+len}; p2={x:ox+farH,y:oy+len}; p3={x:ox+nearH,y:oy}; }
      else                        { p0={x:ox-nearH,y:oy}; p1={x:ox-farH,y:oy-len}; p2={x:ox+farH,y:oy-len}; p3={x:ox+nearH,y:oy}; }

      // Clip to the tapered shape — nothing can render outside
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.clip();

      // Gradient direction: origin → tip
      let gx0, gy0, gx1, gy1;
      if      (a.dir === 'right') { gx0=ox; gy0=oy; gx1=ox+len; gy1=oy; }
      else if (a.dir === 'left')  { gx0=ox; gy0=oy; gx1=ox-len; gy1=oy; }
      else if (a.dir === 'down')  { gx0=ox; gy0=oy; gx1=ox;     gy1=oy+len; }
      else                        { gx0=ox; gy0=oy; gx1=ox;     gy1=oy-len; }

      // Bounding rect for fill calls (clip handles the shape)
      const minX = Math.min(p0.x,p1.x,p2.x,p3.x), maxX = Math.max(p0.x,p1.x,p2.x,p3.x);
      const minY = Math.min(p0.y,p1.y,p2.y,p3.y), maxY = Math.max(p0.y,p1.y,p2.y,p3.y);
      const bw = maxX - minX, bh = maxY - minY;

      const flk  = 0.75 + Math.sin(t * 0.018) * 0.12 + Math.sin(t * 0.031) * 0.08;
      const flk2 = 0.65 + Math.sin(t * 0.025 + 1.2) * 0.18;

      // Layer 1 — fire body (orange-red, fades toward tip)
      const g1 = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      g1.addColorStop(0,    `rgba(255,120,0,${flk})`);
      g1.addColorStop(0.5,  `rgba(220,55,0,${flk * 0.82})`);
      g1.addColorStop(1,    'rgba(150,8,0,0)');
      ctx.fillStyle   = g1;
      ctx.shadowColor = '#ff4400';
      ctx.shadowBlur  = 6;
      ctx.fillRect(minX, minY, bw, bh);

      // Layer 2 — cylindrical shading: dark edges, bright centre
      const crossG = horiz
        ? ctx.createLinearGradient(ox, oy - farH, ox, oy + farH)
        : ctx.createLinearGradient(ox - farH, oy, ox + farH, oy);
      crossG.addColorStop(0,    'rgba(0,0,0,0.5)');
      crossG.addColorStop(0.18, 'rgba(0,0,0,0.1)');
      crossG.addColorStop(0.5,  'rgba(0,0,0,0)');
      crossG.addColorStop(0.82, 'rgba(0,0,0,0.1)');
      crossG.addColorStop(1,    'rgba(0,0,0,0.5)');
      ctx.fillStyle  = crossG;
      ctx.shadowBlur = 0;
      ctx.fillRect(minX, minY, bw, bh);

      // Layer 3 — hot yellow-white core along centre axis
      const coreW = (nearH + farH) / 2 * 0.28;
      const g3 = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      g3.addColorStop(0,    `rgba(255,248,160,${flk2})`);
      g3.addColorStop(0.38, `rgba(255,175,35,${flk2 * 0.85})`);
      g3.addColorStop(1,    'rgba(255,70,0,0)');
      ctx.fillStyle   = g3;
      ctx.shadowColor = '#ffdd55';
      ctx.shadowBlur  = 5;
      if (horiz) ctx.fillRect(minX, oy - coreW, bw, coreW * 2);
      else       ctx.fillRect(ox - coreW, minY, coreW * 2, bh);

      // Ember sparks — cross-position scaled to tapered width at each point
      for (let i = 0; i < 9; i++) {
        const frac   = (i / 9 + (t * 0.0008 % 1)) % 1;
        const along  = frac * len * 0.88;
        const halfW  = nearH + (farH - nearH) * frac;   // tapered half-width here
        const cross  = Math.sin(t * 0.022 + i * 2.3) * halfW * 0.65;
        let sx, sy;
        if      (a.dir === 'right') { sx = ox + along; sy = oy + cross; }
        else if (a.dir === 'left')  { sx = ox - along; sy = oy + cross; }
        else if (a.dir === 'down')  { sx = ox + cross; sy = oy + along; }
        else                        { sx = ox + cross; sy = oy - along; }
        ctx.fillStyle  = `rgba(255,${168 + i * 9},0,${0.62 * (1 - frac)})`;
        ctx.shadowBlur = 3;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.8 + Math.sin(t * 0.04 + i) * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.restore();

    } else if (a.type === 'sweep') {
      const progress = 1 - a.life / a.maxLife;
      // Full brightness while sweeping; fade only in the final 25% after arc completes
      const fadeOut  = progress < 0.75 ? 1.0 : Math.max(0, (1 - progress) / 0.25);
      const span       = Math.PI * 1.16;
      const startAngle = a.angle - Math.PI * 0.58;
      const bladeAngle = startAngle + progress * span;

      const innerR = a.r * 0.22;   // blade guard distance from player
      const outerR = a.r * 0.94;   // blade tip distance

      // Convenience: polar point relative to sweep centre
      const P = (ang, r) => ({ x: a.cx + Math.cos(ang) * r, y: a.cy + Math.sin(ang) * r });

      ctx.save();

      // ── Faint hitbox arc (subtle reference for the hit zone) ──
      ctx.strokeStyle = `rgba(100,180,255,${0.18 * fadeOut})`;
      ctx.lineWidth   = 1.5;
      ctx.shadowBlur  = 0;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(a.cx, a.cy, a.r, a.angle - Math.PI * 0.58, a.angle + Math.PI * 0.58);
      ctx.stroke();
      ctx.setLineDash([]);

      // ── Soft whoosh fill (swept area so far) ──────────────────
      const trailTo = bladeAngle - 0.06;
      if (trailTo > startAngle) {
        // Very faint filled sector
        const iStart = P(startAngle, innerR);
        ctx.fillStyle = `rgba(210,228,255,${0.045 * fadeOut})`;
        ctx.beginPath();
        ctx.moveTo(iStart.x, iStart.y);
        ctx.arc(a.cx, a.cy, innerR, startAngle, trailTo);
        ctx.arc(a.cx, a.cy, outerR, trailTo, startAngle, true);
        ctx.closePath();
        ctx.fill();

        // Three subtle soft arc strokes — different radii, very low alpha
        const softArcs = [[outerR * 0.44, 0.07, 2.2], [outerR * 0.7, 0.05, 1.4], [outerR * 0.91, 0.03, 0.9]];
        for (const [r, alpha, lw] of softArcs) {
          ctx.strokeStyle = `rgba(200,220,255,${alpha * fadeOut})`;
          ctx.lineWidth   = lw;
          ctx.shadowBlur  = 0;
          ctx.beginPath();
          ctx.arc(a.cx, a.cy, r, startAngle, trailTo);
          ctx.stroke();
        }

        // Spin passive: subtle yellow trail overlay on the swept sector
        if (gp.power.id === 'spin') {
          ctx.fillStyle = `rgba(255,220,0,${0.07 * fadeOut})`;
          ctx.beginPath();
          ctx.moveTo(iStart.x, iStart.y);
          ctx.arc(a.cx, a.cy, innerR, startAngle, trailTo);
          ctx.arc(a.cx, a.cy, outerR, trailTo, startAngle, true);
          ctx.closePath();
          ctx.fill();
          // Yellow arc at blade tip
          ctx.strokeStyle = `rgba(255,210,0,${0.45 * fadeOut})`;
          ctx.lineWidth   = 2;
          ctx.shadowColor = '#ffee00';
          ctx.shadowBlur  = 9;
          ctx.beginPath();
          ctx.arc(a.cx, a.cy, outerR * 0.90, startAngle, trailTo);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      // ── Sword blade polygon ────────────────────────────────────
      if (fadeOut > 0) {
        // Cutting edge leads (bladeAngle + small offset), spine trails behind
        const edgeA  = bladeAngle + 0.03;
        const spineA = bladeAngle - 0.18;
        const midR   = outerR * 0.62;

        const vGuardSpine = P(spineA,        innerR * 1.1);
        const vGuardEdge  = P(edgeA,         innerR * 1.1);
        const vMidEdge    = P(edgeA - 0.02,  midR);
        const vMidSpine   = P(spineA + 0.04, midR);
        const vTip        = P(bladeAngle - 0.01, outerR);

        // Metallic gradient from dark spine → bright cutting edge
        const bladeGrad = ctx.createLinearGradient(
          vGuardSpine.x, vGuardSpine.y, vGuardEdge.x, vGuardEdge.y
        );
        bladeGrad.addColorStop(0,    `rgba(70,90,120,${0.6 * fadeOut})`);
        bladeGrad.addColorStop(0.3,  `rgba(150,175,205,${0.78 * fadeOut})`);
        bladeGrad.addColorStop(0.65, `rgba(215,232,252,${0.9 * fadeOut})`);
        bladeGrad.addColorStop(1,    `rgba(242,250,255,${0.88 * fadeOut})`);

        ctx.fillStyle   = bladeGrad;
        ctx.shadowColor = '#aaccee';
        ctx.shadowBlur  = 10 * fadeOut;
        ctx.beginPath();
        ctx.moveTo(vGuardSpine.x, vGuardSpine.y);
        ctx.lineTo(vGuardEdge.x,  vGuardEdge.y);
        ctx.lineTo(vMidEdge.x,    vMidEdge.y);
        ctx.lineTo(vTip.x,        vTip.y);
        ctx.lineTo(vMidSpine.x,   vMidSpine.y);
        ctx.closePath();
        ctx.fill();

        // Bright cutting-edge highlight stroke
        ctx.strokeStyle = `rgba(255,255,255,${0.82 * fadeOut})`;
        ctx.lineWidth   = 1.5;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur  = 5 * fadeOut;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(vGuardEdge.x, vGuardEdge.y);
        ctx.lineTo(vMidEdge.x,   vMidEdge.y);
        ctx.lineTo(vTip.x,       vTip.y);
        ctx.stroke();

        // Tip gleam
        const tg = ctx.createRadialGradient(vTip.x, vTip.y, 0, vTip.x, vTip.y, 7);
        tg.addColorStop(0,   `rgba(255,255,255,${0.85 * fadeOut})`);
        tg.addColorStop(0.5, `rgba(180,215,255,${0.3 * fadeOut})`);
        tg.addColorStop(1,   'rgba(130,190,255,0)');
        ctx.fillStyle  = tg;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(vTip.x, vTip.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
}

// ─── HUD (DOM) ────────────────────────────────────────────────────────────────

function _updateHUD() {
  if (!gp) return;
  const p      = gp.player;
  const hpFrac = Math.max(0, p.hp / p.maxHp);
  const hpColor = hpFrac > 0.5 ? '#22c55e' : hpFrac > 0.25 ? '#f59e0b' : '#ef4444';

  const fill    = document.getElementById('hud-hp-fill');
  const text    = document.getElementById('hud-hp-text');
  const charEl  = document.getElementById('hud-char-name');
  const powerEl = document.getElementById('hud-power-name');
  const roomEl  = document.getElementById('hud-room-label');
  if (!fill) return;

  fill.style.width      = (hpFrac * 100) + '%';
  if (gp.power.id === 'haki') {
    fill.style.background = `linear-gradient(90deg, ${hpColor} 60%, #f59e0b)`;
    fill.style.boxShadow  = `0 0 14px #f59e0b, 0 0 6px ${hpColor}`;
  } else {
    fill.style.background = hpColor;
    fill.style.boxShadow  = `0 0 8px ${hpColor}`;
  }
  text.textContent      = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  charEl.textContent    = gp.char.name.toUpperCase();
  charEl.style.color    = gp.char.color.main;
  charEl.style.textShadow = `0 0 10px ${gp.char.color.main}`;
  const ps = gp.powerState;
  if (gp.power.type === 'active' && ps && ps.cooldown > 0) {
    powerEl.textContent = `${gp.power.name}  (${Math.ceil(ps.cooldown)}s)`;
  } else if (gp.power.type === 'active') {
    powerEl.textContent = `${gp.power.name}  [E]`;
  } else {
    powerEl.textContent = gp.power.name;
  }
  powerEl.style.color   = gp.power.color.main;
  roomEl.textContent    = `Floor ${gp.floor}  ·  Room ${gp.roomIndex + 1} / ${gp.rooms.length}`;
}

// ─── Tutorial floor layer ─────────────────────────────────────────────────────

// Controls panel drawn before characters so player renders on top.
function _drawTutorialFloor(ctx, t) {
  const entries = [
    ['WASD',       'Move'],
    ['Arrow Keys', 'Attack'],
    ['E',          'Ability'],
  ];
  const lineH  = 30;
  const padX   = 22, padY = 16;
  const panelW = 280;
  const panelH = entries.length * lineH + padY * 2;
  const panelX = W / 2 - panelW / 2;
  const panelY = ROOM.y + 24;   // top of the room with a small gap

  // Panel background
  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  roundRect(ctx, panelX, panelY, panelW, panelH, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,80,180,0.30)';
  ctx.lineWidth   = 1;
  roundRect(ctx, panelX, panelY, panelW, panelH, 10);
  ctx.stroke();

  // Entries: key left (bright), action right (dim)
  ctx.font = 'bold 15px "Courier New", monospace';
  entries.forEach(([key, action], i) => {
    const y = panelY + padY + 16 + i * lineH;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(203,213,225,0.92)';
    ctx.fillText(key, panelX + padX, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(148,163,184,0.60)';
    ctx.fillText(action, panelX + panelW - padX, y);
  });

  _drawDoorArrow(ctx, t);
}

// Green arrow pointing toward the door (used in tutorial + room-cleared).
function _drawDoorArrow(ctx, t) {
  const bob  = Math.sin(t * 0.003) * 9;
  const ax   = ROOM.x + ROOM.w - 82 + bob;  // center x of arrow
  const ay   = DOOR_Y + DOOR_H / 2;          // align with door vertical center
  const aw   = 52, ah = 26;
  const jx   = ax + aw * 0.12;               // body/head junction
  const pulse = 0.70 + Math.sin(t * 0.004) * 0.30;

  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.shadowColor = '#22c55e';
  ctx.shadowBlur  = 18;
  ctx.fillStyle   = '#4ade80';
  ctx.beginPath();
  ctx.moveTo(ax - aw / 2, ay - ah * 0.25);  // body top-left
  ctx.lineTo(jx,          ay - ah * 0.25);  // body top-right
  ctx.lineTo(jx,          ay - ah * 0.50);  // head notch top
  ctx.lineTo(ax + aw / 2, ay);              // tip
  ctx.lineTo(jx,          ay + ah * 0.50);  // head notch bottom
  ctx.lineTo(jx,          ay + ah * 0.25);  // body bottom-right
  ctx.lineTo(ax - aw / 2, ay + ah * 0.25);  // body bottom-left
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _checkRoomClear() {
  if (gp.roomCleared) return;
  if (gp.boss && !gp.bossDefeated) return; // boss room — cleared only when boss dies
  if (gp.enemies.length === 0) {
    gp.roomCleared   = true;
    gp.projectiles   = [];
    gp.activeAttacks = [];
  }
}

function _rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function _enemyInBeam(beam, e, ew = EW, eh = EH) {
  const ecx    = e.x + ew / 2;
  const ecy    = e.y + eh / 2;
  const nearH  = beam.nearThick / 2;
  const farH   = beam.farThick  / 2;
  let along, cross;
  if      (beam.dir === 'right') { along = (ecx - beam.ox) / beam.len; cross = Math.abs(ecy - beam.oy); }
  else if (beam.dir === 'left')  { along = (beam.ox - ecx) / beam.len; cross = Math.abs(ecy - beam.oy); }
  else if (beam.dir === 'down')  { along = (ecy - beam.oy) / beam.len; cross = Math.abs(ecx - beam.ox); }
  else                           { along = (beam.oy - ecy) / beam.len; cross = Math.abs(ecx - beam.ox); }
  if (along < 0 || along > 1) return false;
  return cross <= nearH + (farH - nearH) * along + ew * 0.3;
}

function _vecToDir(v) {
  if (Math.abs(v.x) >= Math.abs(v.y)) return v.x < 0 ? 'left' : 'right';
  return v.y < 0 ? 'up' : 'down';
}

function _dirToAngle(dir) {
  return { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] ?? 0;
}

function _angleDiff(a, b) {
  let d = ((a - b) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  return d;
}

function _damageEnemy(e, dmg, knockSpeed = 160) {
  e.hp -= dmg;
  const p  = gp.player;
  const dx = e.x + e.w / 2 - (p.x + PW / 2);
  const dy = e.y + e.h / 2 - (p.y + PH / 2);
  const d  = Math.sqrt(dx * dx + dy * dy) || 1;
  e.vx = (dx / d) * knockSpeed;
  e.vy = (dy / d) * knockSpeed;
  e.knockbackTimer = 0.14;
}

function _hakiReflect(origDmg, enemyRef) {
  if (!gp.power.hakiReflect) return;
  const reflectDmg = Math.ceil(origDmg * 0.75);
  if (enemyRef) {
    enemyRef.hp -= reflectDmg;
  } else if (gp.boss && !gp.boss.isDead && gp.boss.type !== 'gojo') {
    _damageBoss(reflectDmg);
  }
}

// ─── Powers ───────────────────────────────────────────────────────────────────

function _critDamage(base, x, y) {
  if (gp.power.id === 'awakening' && Math.random() < 0.20) {
    if (x !== undefined) gp.critEffects.push({ x, y, timer: 0.38, maxTimer: 0.38 });
    return base * 2;
  }
  return base;
}

function _initPowerState(power) {
  switch (power.id) {
    case 'timestop':     return { cooldown: 0, cooldownMax: power.timestopUpgraded ? 6 : 10, frozen: false, frozenTimer: 0, duration: 3.0, ripples: [] };
    case 'ally_summon':  return { cooldown: 0, cooldownMax: 14, allies: [] };
    case 'king_crimson': return { cooldown: 0, cooldownMax: 5,  afterimages: [], glowTimer: 0, staticTimer: 0 };
    default:             return { cooldown: 0, cooldownMax: 0 };
  }
}

function _activatePower() {
  const ps = gp.powerState;
  if (ps.cooldown > 0) return;
  const p = gp.player;

  switch (gp.power.id) {
    case 'timestop': {
      ps.frozen      = true;
      ps.frozenTimer = ps.duration;
      ps.cooldown    = ps.cooldownMax * (gp.power.cooldownMult || 1);
      const ox = p.x + PW / 2, oy = p.y + PH / 2;
      ps.ripples.push({ x: ox, y: oy, r: 10, alpha: 0.9, speed: 650 });
      ps.ripples.push({ x: ox, y: oy, r: 10, alpha: 0.65, speed: 440 });
      ps.ripples.push({ x: ox, y: oy, r: 10, alpha: 0.40, speed: 280 });
      break;
    }
    case 'ally_summon': {
      const count = gp.power.allyUpgraded ? 2 : 1;
      for (let ai = 0; ai < count; ai++) {
        const aw = 34, ah = 34;
        const ax = Math.max(ROOM.x, Math.min(ROOM.x + ROOM.w - aw,
          p.x + PW / 2 - aw / 2 + (Math.random() * 80 - 40)));
        const ay = Math.max(ROOM.y, Math.min(ROOM.y + ROOM.h - ah,
          p.y + PH / 2 - ah / 2 + (Math.random() * 80 - 40)));
        ps.allies.push({
          x: ax, y: ay, w: aw, h: ah,
          hp: 80, maxHp: 80, speed: 115,
          damage: gp.char.stats.damage * 0.65,
          timer: 8.0, attackCooldown: 0,
          bullets: [],
        });
      }
      ps.cooldown = ps.cooldownMax * (gp.power.cooldownMult || 1);
      break;
    }
    case 'king_crimson': {
      const move = Input.moveDir;
      const dx   = (move.x !== 0 || move.y !== 0) ? move.x
                   : p.dir === 'left' ? -1 : p.dir === 'right' ? 1 : 0;
      const dy   = (move.x !== 0 || move.y !== 0) ? move.y
                   : p.dir === 'up'   ? -1 : p.dir === 'down'  ? 1 : 0;
      // Multiple afterimages along the dash path for a rapid-movement look
      const imgDamage = gp.power.kcUpgraded ? Math.round(gp.char.stats.damage * 0.65) : 0;
      for (let i = 0; i < 5; i++) {
        const frac   = i / 4;
        const jitter = (Math.random() - 0.5) * 8;
        ps.afterimages.push({
          x:        p.x + dx * 200 * frac + jitter,
          y:        p.y + dy * 200 * frac + jitter,
          alpha:    0.72 - frac * 0.25,
          fadeRate: 2.2 + frac * 1.2,
          damage:   imgDamage,
          hitEnemies: imgDamage > 0 ? new Set() : null,
          hitBoss:  false,
        });
      }
      p.x         = Math.max(ROOM.x, Math.min(ROOM.x + ROOM.w - PW, p.x + dx * 200));
      p.y         = Math.max(ROOM.y, Math.min(ROOM.y + ROOM.h - PH, p.y + dy * 200));
      p.iFrames   = Math.max(p.iFrames, 0.4);
      ps.glowTimer   = 0.4;
      ps.staticTimer = 0.28;
      ps.cooldown    = ps.cooldownMax * (gp.power.cooldownMult || 1);
      break;
    }
  }
}

function _updatePowerState(dt) {
  const ps = gp.powerState;
  if (!ps) return;
  if (ps.cooldown > 0) ps.cooldown = Math.max(0, ps.cooldown - dt);

  switch (gp.power.id) {
    case 'timestop': {
      if (ps.frozen) {
        ps.frozenTimer -= dt;
        if (ps.frozenTimer <= 0) { ps.frozen = false; ps.frozenTimer = 0; }
        if (gp.power.timestopUpgraded) {
          const tickDmg = 10 * dt;
          for (const e of gp.enemies) { e.hp -= tickDmg; }
          if (gp.boss && !gp.boss.isDead && gp.boss.type !== 'gojo') _damageBoss(tickDmg);
        }
      }
      ps.ripples = ps.ripples.filter(rp => rp.alpha > 0);
      for (const rp of ps.ripples) {
        rp.r     += rp.speed * dt;
        rp.alpha  = Math.max(0, rp.alpha - dt * 1.8);
      }
      break;
    }
    case 'ally_summon': {
      ps.allies = ps.allies.filter(a => a.timer > 0 && a.hp > 0);

      // Spread targeting: assign each ally the nearest UNCLAIMED enemy
      const claimed = new Set();
      const allyTargets = ps.allies.map(a => {
        let best = null, bestSq = Infinity;
        for (const e of gp.enemies) {
          if (claimed.has(e)) continue;
          const dx = e.x+e.w/2-(a.x+a.w/2), dy = e.y+e.h/2-(a.y+a.h/2);
          const sq = dx*dx+dy*dy;
          if (sq < bestSq) { bestSq = sq; best = e; }
        }
        // Fallback: nearest enemy even if shared
        if (!best) {
          bestSq = Infinity;
          for (const e of gp.enemies) {
            const dx = e.x+e.w/2-(a.x+a.w/2), dy = e.y+e.h/2-(a.y+a.h/2);
            const sq = dx*dx+dy*dy;
            if (sq < bestSq) { bestSq = sq; best = e; }
          }
        }
        if (best) claimed.add(best);
        return best;
      });

      for (let i = 0; i < ps.allies.length; i++) {
        const a = ps.allies[i];
        if (!a.bullets) a.bullets = [];
        a.timer -= dt;
        if (a.attackCooldown > 0) a.attackCooldown -= dt;

        // Tick ally bullets
        a.bullets = a.bullets.filter(b => {
          b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
          if (b.life <= 0 || b.x < ROOM.x || b.x > ROOM.x+ROOM.w ||
              b.y < ROOM.y || b.y > ROOM.y+ROOM.h) return false;
          for (const e of gp.enemies) {
            if (e.x < b.x+b.r && e.x+e.w > b.x-b.r && e.y < b.y+b.r && e.y+e.h > b.y-b.r) {
              _damageEnemy(e, b.damage); return false;
            }
          }
          const bos = gp.boss;
          if (bos && !bos.isDead && bos.x < b.x+b.r && bos.x+bos.w > b.x-b.r &&
              bos.y < b.y+b.r && bos.y+bos.h > b.y-b.r) {
            _damageBoss(b.damage); return false;
          }
          return true;
        });

        // Determine target
        let target = allyTargets[i];
        let targetIsBoss = false;
        if (target && target.hp <= 0) target = null;
        if (!target) {
          const bossTargetable = gp.boss && !gp.boss.isDead &&
            (gp.boss.type !== 'gojo' || gp.boss.stunTimer > 0);
          if (bossTargetable) { target = gp.boss; targetIsBoss = true; }
        }

        const SHOOT_RANGE = 145;
        if (target) {
          const tcx = targetIsBoss ? target.x+BW/2 : target.x+target.w/2;
          const tcy = targetIsBoss ? target.y+BH/2 : target.y+target.h/2;
          const dx = tcx-(a.x+a.w/2), dy = tcy-(a.y+a.h/2);
          const d  = Math.sqrt(dx*dx+dy*dy) || 1;
          if (d > SHOOT_RANGE) {
            a.x += (dx/d) * a.speed * dt;
            a.y += (dy/d) * a.speed * dt;
          }
          if (a.attackCooldown <= 0 && d <= SHOOT_RANGE + 30) {
            const spd = 320;
            a.bullets.push({ x: a.x+a.w/2, y: a.y+a.h/2, vx: (dx/d)*spd, vy: (dy/d)*spd, damage: a.damage, r: 5, life: 1.4 });
            a.attackCooldown = 0.70;
          }
        } else {
          // No target: slowly drift toward room center
          const rcx = ROOM.x+ROOM.w/2, rcy = ROOM.y+ROOM.h/2;
          const ddx = rcx-(a.x+a.w/2), ddy = rcy-(a.y+a.h/2);
          const dd = Math.sqrt(ddx*ddx+ddy*ddy) || 1;
          if (dd > 60) { a.x += (ddx/dd)*a.speed*0.35*dt; a.y += (ddy/dd)*a.speed*0.35*dt; }
        }

        a.x = Math.max(ROOM.x, Math.min(ROOM.x+ROOM.w-a.w, a.x));
        a.y = Math.max(ROOM.y, Math.min(ROOM.y+ROOM.h-a.h, a.y));
      }
      break;
    }
    case 'king_crimson': {
      ps.afterimages = ps.afterimages.filter(img => img.alpha > 0);
      for (const img of ps.afterimages) {
        img.alpha = Math.max(0, img.alpha - img.fadeRate * dt);
        if (img.damage > 0 && img.hitEnemies) {
          const ir = { x: img.x, y: img.y, w: PW, h: PH };
          for (const e of gp.enemies) {
            if (!img.hitEnemies.has(e) && _rectsOverlap(ir, { x: e.x, y: e.y, w: e.w, h: e.h })) {
              img.hitEnemies.add(e);
              _damageEnemy(e, img.damage);
            }
          }
          if (!img.hitBoss && gp.boss && !gp.boss.isDead &&
              _rectsOverlap(ir, { x: gp.boss.x, y: gp.boss.y, w: gp.boss.w, h: gp.boss.h })) {
            img.hitBoss = true;
            _damageBoss(img.damage);
          }
        }
      }
      if (ps.glowTimer   > 0) ps.glowTimer   = Math.max(0, ps.glowTimer   - dt);
      if (ps.staticTimer > 0) ps.staticTimer = Math.max(0, ps.staticTimer - dt);
      break;
    }
  }
  // Tick crit flash effects (Awakening)
  if (gp.critEffects && gp.critEffects.length > 0) {
    gp.critEffects = gp.critEffects.filter(c => { c.timer -= dt; return c.timer > 0; });
  }
}

// Aura effects rendered BEFORE _drawPlayer so the sprite always shows on top.
function _drawPowerAura(ctx, t) {
  if (!gp || !gp.powerState) return;
  const p = gp.player;

  if (gp.power.id === 'haki') {
    const pcx   = p.x + PW / 2;
    const pcy   = p.y + PH / 2;
    const pulse = 0.5 + Math.sin(t * 0.003) * 0.3;
    ctx.save();

    const haloG = ctx.createRadialGradient(pcx, pcy, PH * 0.2, pcx, pcy, PH * 1.25);
    haloG.addColorStop(0,   `rgba(245,158,11,${pulse * 0.22})`);
    haloG.addColorStop(0.6, `rgba(180,100,0,${pulse * 0.09})`);
    haloG.addColorStop(1,   'rgba(120,60,0,0)');
    ctx.fillStyle = haloG;
    ctx.beginPath(); ctx.arc(pcx, pcy, PH * 1.25, 0, Math.PI * 2); ctx.fill();

    const nSpikes = 16;
    const rot     = t * 0.0007;
    const innerR  = PH * 0.45;
    const outerRs = [];
    for (let i = 0; i < nSpikes; i++) {
      const long = i % 4 === 0;
      const base = long ? PH * 1.08 : PH * 0.80;
      outerRs.push(base + Math.sin(t * 0.0035 + i * 0.65) * PH * 0.10);
    }
    const buildHakiSpikes = () => {
      ctx.beginPath();
      for (let k = 0; k < nSpikes * 2; k++) {
        const angle = (k / (nSpikes * 2)) * Math.PI * 2 + rot;
        const r = (k % 2 === 1) ? outerRs[Math.floor(k / 2)] : innerR;
        k === 0
          ? ctx.moveTo(pcx + Math.cos(angle) * r, pcy + Math.sin(angle) * r)
          : ctx.lineTo(pcx + Math.cos(angle) * r, pcy + Math.sin(angle) * r);
      }
      ctx.closePath();
    };
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur  = 24;
    buildHakiSpikes();
    ctx.fillStyle = `rgba(245,158,11,${0.10 + pulse * 0.07})`;
    ctx.fill();
    buildHakiSpikes();
    ctx.strokeStyle = `rgba(245,158,11,${0.58 + pulse * 0.32})`;
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'miter';
    ctx.miterLimit  = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

  } else if (gp.power.id === 'awakening') {
    const awcx  = p.x + PW / 2;
    const awcy  = p.y + PH / 2;
    const pulse = 0.5 + Math.sin(t * 0.004) * 0.3;
    ctx.save();

    const aura = ctx.createRadialGradient(awcx, awcy, PH * 0.2, awcx, awcy, PH * 1.3);
    aura.addColorStop(0,   `rgba(232,121,249,${pulse * 0.45})`);
    aura.addColorStop(0.5, `rgba(168,85,247,${pulse * 0.18})`);
    aura.addColorStop(1,   'rgba(88,28,135,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(awcx, awcy, PH * 1.3, 0, Math.PI * 2); ctx.fill();

    const nSpikes = 14;
    const rot     = t * 0.0012;
    const innerR  = PH * 0.47;
    const outerRs = [];
    for (let i = 0; i < nSpikes; i++) {
      const long = i % 3 === 0;
      const base = long ? PH * 1.12 : PH * 0.82;
      outerRs.push(base + Math.sin(t * 0.005 + i * 0.78) * PH * 0.12);
    }
    const buildAwakeSpikes = () => {
      ctx.beginPath();
      for (let k = 0; k < nSpikes * 2; k++) {
        const angle = (k / (nSpikes * 2)) * Math.PI * 2 + rot;
        const r = (k % 2 === 1) ? outerRs[Math.floor(k / 2)] : innerR;
        k === 0
          ? ctx.moveTo(awcx + Math.cos(angle) * r, awcy + Math.sin(angle) * r)
          : ctx.lineTo(awcx + Math.cos(angle) * r, awcy + Math.sin(angle) * r);
      }
      ctx.closePath();
    };
    ctx.shadowColor = '#e879f9';
    ctx.shadowBlur  = 28;
    buildAwakeSpikes();
    ctx.fillStyle = `rgba(232,121,249,${0.12 + pulse * 0.09})`;
    ctx.fill();
    buildAwakeSpikes();
    ctx.strokeStyle = `rgba(232,121,249,${0.55 + pulse * 0.35})`;
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'miter';
    ctx.miterLimit  = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function _drawPowerEffects(ctx, t) {
  const ps = gp.powerState;
  if (!ps) return;
  const p = gp.player;

  switch (gp.power.id) {
    case 'haki':
      break; // aura drawn in _drawPowerAura (before player)
    case 'timestop': {
      // Expanding ripple shockwaves (shown briefly on activation)
      for (const rp of ps.ripples) {
        ctx.save();
        ctx.strokeStyle = `rgba(160,200,255,${rp.alpha * 0.9})`;
        ctx.lineWidth   = 4 * rp.alpha + 1;
        ctx.shadowColor = '#a5c8ff';
        ctx.shadowBlur  = 18 * rp.alpha;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx.stroke();
        // Inner bright ring
        ctx.strokeStyle = `rgba(220,240,255,${rp.alpha * 0.5})`;
        ctx.lineWidth   = 1.5;
        ctx.shadowBlur  = 6;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r * 0.85, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (ps.frozen) {
        // Frozen indicators: ice shard star on each enemy
        for (const e of gp.enemies) {
          ctx.save();
          ctx.shadowColor = '#93c5fd';
          ctx.shadowBlur  = 12;
          const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
          for (let i = 0; i < 6; i++) {
            const a   = (i / 6) * Math.PI * 2;
            const len = i % 2 === 0 ? 14 : 9;
            ctx.strokeStyle = i % 2 === 0
              ? 'rgba(186,230,253,0.85)'
              : 'rgba(147,197,253,0.55)';
            ctx.lineWidth = i % 2 === 0 ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(ecx, ecy);
            ctx.lineTo(ecx + Math.cos(a) * len, ecy + Math.sin(a) * len);
            ctx.stroke();
          }
          // Center dot
          ctx.fillStyle = 'rgba(224,242,254,0.9)';
          ctx.beginPath();
          ctx.arc(ecx, ecy, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        // Faint violet screen vignette while frozen
        const rim = ctx.createRadialGradient(W/2, H/2, H*0.25, W/2, H/2, H*0.75);
        rim.addColorStop(0, 'rgba(80,40,180,0)');
        rim.addColorStop(1, 'rgba(80,40,180,0.08)');
        ctx.fillStyle = rim;
        ctx.fillRect(0, 0, W, H);
      }
      break;
    }
    case 'ally_summon': {
      const allyImg = Assets.getAllyImg();
      for (const a of ps.allies) {
        const lifeRatio = Math.min(1, a.timer / 8.0);
        ctx.save();
        ctx.globalAlpha = lifeRatio;
        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(a.x + a.w/2, a.y + a.h + 3, a.w*0.38, 5, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowColor = '#34d399';
        ctx.shadowBlur  = 14;
        if (allyImg) {
          // Custom ally sprite (ally.png / ally.jpg in assets/)
          ctx.drawImage(allyImg, a.x - 4, a.y - 6, a.w + 8, a.h + 10);
        } else {
          // Canvas fallback: green humanoid fighter
          ctx.fillStyle = `rgba(52,211,153,0.82)`;
          ctx.fillRect(a.x + 7, a.y + 13, 20, 21);
          ctx.fillStyle = `rgba(110,231,183,0.88)`;
          ctx.beginPath();
          ctx.arc(a.x + a.w/2, a.y + 8, 9, 0, Math.PI*2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        // HP bar
        ctx.globalAlpha = lifeRatio;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(a.x, a.y - 10, a.w, 5);
        ctx.fillStyle   = '#34d399';
        ctx.shadowColor = '#34d399';
        ctx.shadowBlur  = 4;
        ctx.fillRect(a.x, a.y - 10, a.w * Math.max(0, a.hp / a.maxHp), 5);
        ctx.shadowBlur  = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
        // Ally bullets
        for (const b of (a.bullets || [])) {
          ctx.save();
          ctx.shadowColor = '#34d399'; ctx.shadowBlur = 8;
          ctx.fillStyle   = '#34d399';
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.restore();
        }
      }
      break;
    }
    case 'spin': {
      // Knife trails + hilt spirals are drawn in _drawProjectiles (before the blade).
      // Levi sweep yellow trail is applied in _drawActiveAttacks.
      break;
    }
    case 'king_crimson': {
      // TV static distortion in screen corners on activation
      if (ps.staticTimer > 0) {
        const stAlpha = ps.staticTimer / 0.28;
        ctx.save();
        const sz = 130;
        [[0, 0], [W - sz, 0], [0, H - sz], [W - sz, H - sz]].forEach(([cx, cy]) => {
          const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 190);
          cg.addColorStop(0, `rgba(220,20,30,${stAlpha * 0.5})`);
          cg.addColorStop(1, 'rgba(220,20,30,0)');
          ctx.fillStyle = cg;
          ctx.fillRect(0, 0, W, H);
          // Scanlines
          for (let i = 0; i < sz; i += 2) {
            const lAlpha = Math.random() * stAlpha * 0.55;
            const lw     = 20 + Math.random() * (sz - 20);
            ctx.fillStyle = `rgba(255,255,255,${lAlpha})`;
            ctx.fillRect(cx, cy + i, lw, 1);
          }
        });
        ctx.restore();
      }

      // Red afterimage silhouettes along dash path
      const VS = 1.7;
      const vw = PW * VS, vh = PH * VS;
      for (const img of ps.afterimages) {
        ctx.save();
        ctx.globalAlpha = img.alpha;
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur  = 22;
        ctx.fillStyle   = '#f43f5e';
        const ax = img.x + PW/2 - vw/2;
        const ay = img.y + PH/2 - vh/2;
        // Head
        ctx.beginPath();
        ctx.arc(ax + vw/2, ay + vh*0.10, vw*0.17, 0, Math.PI*2);
        ctx.fill();
        // Body
        ctx.fillRect(ax + vw*0.22, ay + vh*0.22, vw*0.56, vh*0.55);
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Red player glow while iFrames active from the dash
      if (ps.glowTimer > 0) {
        const glowA = ps.glowTimer / 0.4;
        const gcx   = p.x + PW / 2, gcy = p.y + PH / 2;
        const grd   = ctx.createRadialGradient(gcx, gcy, PH * 0.25, gcx, gcy, PH * 1.2);
        grd.addColorStop(0, `rgba(244,63,94,${glowA * 0.45})`);
        grd.addColorStop(0.5, `rgba(200,20,50,${glowA * 0.2})`);
        grd.addColorStop(1, 'rgba(180,0,30,0)');
        ctx.save();
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(gcx, gcy, PH * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(244,63,94,${glowA * 0.7})`;
        ctx.lineWidth   = 2.5;
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur  = 20;
        ctx.beginPath();
        ctx.ellipse(gcx, gcy, PW * 0.7, PH * 0.7, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'awakening': {
      // Aura (glow + spiky polygon) drawn behind player in _drawPowerAura.
      // Orbiting particles render in front of the sprite.
      const awcx = p.x + PW / 2;
      const awcy = p.y + PH / 2;
      ctx.save();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + t * 0.0022;
        const r     = 42 + Math.sin(t * 0.004 + i * 1.1) * 7;
        const px2   = awcx + Math.cos(angle) * r;
        const py2   = awcy + Math.sin(angle) * r;
        const alpha = 0.65 + Math.sin(t * 0.005 + i * 0.9) * 0.25;
        ctx.fillStyle   = `rgba(232,121,249,${alpha})`;
        ctx.shadowColor = '#e879f9';
        ctx.shadowBlur  = 14;
        ctx.beginPath();
        ctx.arc(px2, py2, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
      break;
    }
  }

  // Crit flash effects (Awakening — drawn regardless of current case)
  if (gp.critEffects) {
    for (const ce of gp.critEffects) {
      const prog  = 1 - ce.timer / ce.maxTimer;
      const alpha = ce.timer / ce.maxTimer;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2;
      ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 10;
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        const len = 5 + prog * 16;
        ctx.beginPath();
        ctx.moveTo(ce.x + Math.cos(ang) * 3, ce.y + Math.sin(ang) * 3);
        ctx.lineTo(ce.x + Math.cos(ang) * len, ce.y + Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fde68a'; ctx.shadowBlur = 12;
      ctx.fillText('CRIT!', ce.x, ce.y - 12 - prog * 14);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // Cooldown recharge arc below player shadow (active powers only)
  if (gp.power.type === 'active' && ps.cooldown > 0 && ps.cooldownMax > 0) {
    const cx    = p.x + PW / 2;
    const cy    = p.y + PH + 18;
    const r     = 9;
    const ready = 1 - ps.cooldown / ps.cooldownMax;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = gp.power.color.main;
    ctx.shadowColor = gp.power.color.main;
    ctx.shadowBlur  = 6;
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + ready * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ─── Boss System ──────────────────────────────────────────────────────────────

function _bossHp() {
  const char = gp.char;
  const sf   = char.stats.speed / 3.5;
  let dps;
  if (char.id === 'kaido') {
    // optimal cycle: 1s charge + 1s fire, 8 ticks at damage*0.15 each
    dps = Math.floor(KB_FIRE_DUR / 0.04) * char.stats.damage * 0.05 / (KB_CHARGE_MAX + KB_FIRE_DUR);
  } else if (char.id === 'dio') {
    dps = char.stats.damage / (0.9 / sf);
  } else {
    dps = char.stats.damage / (0.42 / sf);
  }
  return Math.round(800 * dps / (45 / 0.9) / 50) * 50;
}

function _spawnBoss(type) {
  if (!type) {
    if (gp.floor === 2) type = 'enel';
    else if (gp.floor >= 3) type = 'gojo';
    else type = 'kira';
  }
  const base = {
    type,
    x: ROOM.x + ROOM.w * 0.65 - BW / 2,
    y: ROOM.y + ROOM.h / 2  - BH / 2,
    w: BW, h: BH,
    hp: _bossHp(), maxHp: _bossHp(),
    phase: 1,
    vx: 0, vy: 0,
    knockbackTimer: 0,
    moveTarget: { x: ROOM.x + ROOM.w / 2, y: ROOM.y + ROOM.h / 2 },
    moveTimer: 0,
    introTimer:  2.8,
    flashTimer:  0,
    deathTimer:  -1,
    isDead:      false,
  };
  if (type === 'kira') {
    gp.boss = Object.assign(base, {
      name: 'YOSHIKAGE KIRA', subtitle: 'Killer Queen',
      glowColor: '#7c3aed', particleA: '#7c3aed', particleB: '#dc2626',
      speed: 105, attackTimer: 2.0, shaTimer: 7.0,
    });
  } else if (type === 'enel') {
    const enelScale = Math.max(1, 3.5 / gp.char.stats.speed);
    gp.boss = Object.assign(base, {
      name: 'ENEL', subtitle: 'God of Lightning',
      glowColor: '#7dd3fc', particleA: '#7dd3fc', particleB: '#bae6fd',
      speed: 115,
      beamTimer: 2.5 * enelScale, gridTimer: 4.5 * enelScale, gridNext: 'h',
      attackScale: enelScale,
    });
  } else if (type === 'gojo') {
    gp.boss = Object.assign(base, {
      name: 'SATORU GOJO', subtitle: 'The Strongest',
      glowColor: '#a78bfa', particleA: '#a78bfa', particleB: '#60a5fa',
      speed: 148,
      // Lock Gojo to the right side
      x: GOJO_ANCHOR_X,
      y: GOJO_Y_LANES[1],
      moveTarget: { x: GOJO_ANCHOR_X, y: GOJO_Y_LANES[1] },
      // HP scaled per character so each 10s stun window is equally challenging
      // Kaido ~15 DPS → 500 HP (125/window), Dio ~50 DPS → 1400 (350/window), Levi ~56 DPS → 1600 (400/window)
      ...(() => {
        const max = gp.char.id === 'kaido' ? 500 : gp.char.id === 'dio' ? 1400 : 1600;
        return {
          hp: max, maxHp: max,
          gateHPs: [max, Math.round(max * 0.75), Math.round(max * 0.50), Math.round(max * 0.25), 0],
        };
      })(),
      // Infinity gate system
      gateIndex:    0,
      rallyBounces: [1, 2, 3, 4],
      immune: true,
      infinityTimer:   0,
      infinityRipples: [],
      barrierHits:     [],
      // Stun: timed 10s window — gate advances only if player deals enough damage
      stunTimer:     0,
      stunDuration:  10,
      stunStarAngle: 0,
      // Return animation (after stun ends)
      returnLanding:  false,
      returnTimer:    0,
      itDeparted:     false,
      itDepartX:      0, itDepartY: 0,
      returnTargetX:  0, returnTargetY: 0,
      // Red Volleyball
      redCooldown:    0,
      redCooldownMax: 3,
      redActive:      false,
      // Attack scheduling
      attackTimer:  1.2,
      activeAttack: null,
      // Hollow Purple state machine
      purpleState:       null,
      purpleThird:       0,
      purpleChargeTimer: 0,
      purpleFireTimer:   0,
      lastPurpleThird:   -1,   // no-repeat: tracks which third was last targeted
      // Infinite Void
      voidTimer:       0,
      voidMaxTimer:    0,
      voidHands:       [],   // [{angle, reach, maxReach, hitCooldown}]
      voidCooldown:    0,    // cooldown after each void ends before it can fire again
      // Void tell
      voidTellTimer:    0,
      voidTellDuration: 2.0,
      pendingVoidDur:   0,
      // Spin landing (final volley animation)
      spinLanding:  false,
      spinTimer:    0,
      spinAngle:    0,
    });
  } else {
    gp.boss = base;
  }
}

function _damageBoss(dmg) {
  const b = gp.boss;
  if (!b || b.isDead || b.introTimer > 0) return;
  // Gojo: Infinity blocks damage unless stunned
  if (b.type === 'gojo') {
    if (b.stunTimer <= 0) {
      // Barrier reflection — dramatic visual
      b.infinityTimer = 0.4;
      b.flashTimer    = 0.08;
      const py = gp.player.y + PH / 2;
      b.barrierHits.push({ y: py, r: 0, alpha: 1.0, timer: 0.75 });
      b.infinityRipples.push({ r: 10, alpha: 0.9 });
      b.infinityRipples.push({ r: 10, alpha: 0.55 });
      if (!gp.hints.shown.infinity) {
        gp.hints.shown.infinity = true;
        gp.hints.text     = "I can't get close...\nnone of my attacks will ever reach him.\nThere has to be another way!";
        gp.hints.timer    = 5.0;
        gp.hints.maxTimer = 5.0;
      }
      return;
    }
    // Stunned — deal damage floored at the NEXT gate threshold.
    // Gate clears when HP reaches that floor; kill when floor is 0.
    const nextIndex = b.gateIndex + 1;
    const gateFloor = b.gateHPs[nextIndex] ?? 0;
    b.hp = Math.max(gateFloor, b.hp - dmg);
    b.flashTimer = 0.14;
    if (b.hp <= gateFloor) {
      if (gateFloor === 0) {
        // Kill window reached — death
        b.hp = 0;
        b.isDead = true;
        b.stunTimer = 0;
      } else {
        // Gate cleared — advance and start return animation
        b.gateIndex = nextIndex;
        b.stunTimer = 0;
        b.returnLanding = true;
        b.returnTimer   = 0;
        b.itDeparted    = false;
        b.itDepartX     = b.x + b.w / 2;
        b.itDepartY     = b.y + b.h / 2;
        b.returnTargetX = GOJO_ANCHOR_X;
        b.returnTargetY = GOJO_Y_LANES[1];
      }
    }
    return;
  }
  b.hp = Math.max(0, b.hp - dmg);
  b.flashTimer = 0.12;
  const dx = b.x + b.w / 2 - (gp.player.x + PW / 2);
  const dy = b.y + b.h / 2 - (gp.player.y + PH / 2);
  const d  = Math.sqrt(dx * dx + dy * dy) || 1;
  b.vx = (dx / d) * 130;
  b.vy = (dy / d) * 130;
  b.knockbackTimer = 0.1;
  if (b.hp <= 0 && !b.isDead) {
    b.isDead = true;
    b.hp     = 0;
    if (b.type === 'kira') {
      b.deathTimer = 2.2;
      b.launchX0   = b.x + b.w / 2;
      b.launchY0   = b.y + b.h / 2;
    } else if (b.type === 'enel') {
      b.deathTimer = 3.2;
      b.launchX0   = b.x + b.w / 2;
      b.launchY0   = b.y + b.h / 2;
    } else {
      b.deathTimer = 2.2;
    }
  }
  if (b.type !== 'gojo' && b.hp <= b.maxHp * 0.5) b.phase = 2;
}

function _damageSHA(a, dmg) {
  if (a.exploding || a.done) return;
  a.hp -= dmg;
  a.flashTimer = 0.1;
  if (a.hp <= 0) {
    a.exploding    = true;
    a.playerKill   = false; // destroyed by player — small explosion, no damage
    a.explodeTimer = a.maxExplode;
  }
}

function _updateBoss(dt, t) {
  const b = gp.boss;
  if (!b) return;

  if (b.introTimer > 0) {
    b.introTimer -= dt;
    return;
  }

  if (b.isDead) {
    if (b.type === 'gojo') {
      // No death animation for Gojo — go straight to cinematic
      _startGojoCinematic();
      return;
    }
    b.deathTimer -= dt;
    if (b.deathTimer <= 0) {
      gp.bossDefeated  = true;
      gp.projectiles   = [];
      gp.activeAttacks = [];
      gp.bossAttacks   = [];
    }
    return;
  }

  if (b.flashTimer > 0) b.flashTimer = Math.max(0, b.flashTimer - dt);
  if (b.type !== 'gojo' && b.hp <= b.maxHp * 0.5 && b.phase === 1) b.phase = 2;

  if      (b.type === 'kira') _updateKiraBoss(dt, t, b);
  else if (b.type === 'enel') _updateEnelBoss(dt, t, b);
  else if (b.type === 'gojo') _updateGojoBoss(dt, t, b);
}

// Min pixel gap between bomb centers to prevent overlap
const BOMB_MIN_SEP = 88;

function _placeBomb(fuseTime, radius, damage) {
  const p   = gp.player;
  const pcx = p.x + PW / 2, pcy = p.y + PH / 2;
  const existing = gp.bossAttacks.filter(a => a.type === 'bomb' && !a.exploding);

  for (let attempt = 0; attempt < 10; attempt++) {
    const spread = 85 + Math.random() * 110;
    const angle  = Math.random() * Math.PI * 2;
    const bx = Math.max(ROOM.x + 20, Math.min(ROOM.x + ROOM.w - 38,
      pcx + Math.cos(angle) * spread));
    const by = Math.max(ROOM.y + 20, Math.min(ROOM.y + ROOM.h - 38,
      pcy + Math.sin(angle) * spread));
    const bcx = bx + 9, bcy = by + 9;

    let ok = true;
    for (const eb of existing) {
      const dx = bcx - (eb.x + 9), dy = bcy - (eb.y + 9);
      if (dx * dx + dy * dy < BOMB_MIN_SEP * BOMB_MIN_SEP) { ok = false; break; }
    }
    if (ok) {
      gp.bossAttacks.push({
        type: 'bomb', x: bx, y: by,
        radius, fuseTimer: fuseTime, maxFuse: fuseTime,
        exploding: false, explodeTimer: 0, maxExplode: 0.55,
        damage, done: false,
      });
      return;
    }
  }
  // No non-overlapping spot found — skip this bomb
}

function _updateKiraBoss(dt, t, b) {
  const p      = gp.player;
  const frozen = gp.power.id === 'timestop' && gp.powerState.frozen;
  if (frozen) return;

  // ── Movement ──
  b.moveTimer -= dt;
  if (b.moveTimer <= 0) {
    const margin = 100;
    if (b.phase === 2 && Math.random() < 0.65) {
      // Phase 2: mostly chase the player
      b.moveTarget = { x: p.x + PW / 2 - b.w / 2, y: p.y + PH / 2 - b.h / 2 };
    } else {
      b.moveTarget = {
        x: ROOM.x + margin + Math.random() * (ROOM.w - margin * 2 - b.w),
        y: ROOM.y + margin + Math.random() * (ROOM.h - margin * 2 - b.h),
      };
    }
    b.moveTimer = b.phase === 2
      ? 0.55 + Math.random() * 0.35
      : 0.80 + Math.random() * 0.55;
  }

  if (b.knockbackTimer > 0) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.knockbackTimer -= dt;
    b.vx *= Math.pow(0.04, dt);
    b.vy *= Math.pow(0.04, dt);
  } else {
    const dx  = b.moveTarget.x - b.x;
    const dy  = b.moveTarget.y - b.y;
    const d   = Math.sqrt(dx * dx + dy * dy) || 1;
    const spd = b.phase === 2 ? b.speed * 1.55 : b.speed;
    if (d > 4) {
      b.x += (dx / d) * spd * dt;
      b.y += (dy / d) * spd * dt;
    }
  }

  b.x = Math.max(ROOM.x + 8, Math.min(ROOM.x + ROOM.w - b.w - 8, b.x));
  b.y = Math.max(ROOM.y + 8, Math.min(ROOM.y + ROOM.h - b.h - 8, b.y));

  // ── Contact damage ──
  if (p.iFrames <= 0 &&
      _rectsOverlap({ x: p.x, y: p.y, w: PW, h: PH }, { x: b.x, y: b.y, w: b.w, h: b.h })) {
    let dmg = 18;
    if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
    p.hp -= dmg;
    p.iFrames = 1.2;
    _hakiReflect(18, null);
    if (p.hp <= 0) { p.hp = 0; gp.gameOver = true; gp.killSource = 'kira_contact'; }
  }

  // ── Bomb placement ──
  b.attackTimer -= dt;
  if (b.attackTimer <= 0) {
    if (b.phase === 2) {
      _placeBomb(1.5, 90, 28);
      _placeBomb(1.5, 90, 28);
    } else {
      _placeBomb(1.9, 78, 22);
    }
    b.attackTimer = b.phase === 2 ? 2.1 : 2.9;
  }

  // ── Sheer Heart Attack ──
  b.shaTimer -= dt;
  if (b.shaTimer <= 0) {
    const spawnX = b.x + b.w / 2 - 21;
    const spawnY = b.y + b.h / 2 - 21;
    gp.bossAttacks.push({
      type: 'sha',
      x: spawnX, y: spawnY, w: 42, h: 42,
      hp: 20, maxHp: 20,
      vx: 0, vy: 0,
      speed:    b.phase === 2 ? 90 : 68,
      maxSpeed: b.phase === 2 ? 210 : 165,
      accel:    b.phase === 2 ? 22  : 15,
      flashTimer: 0,
      exploding: false, explodeTimer: 0, maxExplode: 0.6,
      playerKill: false,
      done: false,
    });
    b.shaTimer = b.phase === 2 ? 4.5 : 8.0;
  }

  // ── Tick all boss attacks ──
  gp.bossAttacks = gp.bossAttacks.filter(a => {
    if (a.done) return false;

    if (a.type === 'bomb') {
      if (!a.exploding) {
        a.fuseTimer -= dt;
        if (a.fuseTimer <= 0) {
          a.exploding    = true;
          a.explodeTimer = a.maxExplode;
          const pcx2 = gp.player.x + PW / 2, pcy2 = gp.player.y + PH / 2;
          const dx   = pcx2 - (a.x + 9), dy = pcy2 - (a.y + 9);
          if (Math.sqrt(dx * dx + dy * dy) < a.radius && gp.player.iFrames <= 0) {
            let dmg = a.damage;
            if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
            gp.player.hp -= dmg;
            gp.player.iFrames = 0.8;
            _hakiReflect(a.damage, null);
            if (gp.player.hp <= 0) { gp.player.hp = 0; gp.gameOver = true; gp.killSource = 'bomb'; }
          }
        }
      } else {
        a.explodeTimer -= dt;
        if (a.explodeTimer <= 0) a.done = true;
      }
      return !a.done;
    }

    if (a.type === 'sha') {
      if (a.flashTimer > 0) a.flashTimer = Math.max(0, a.flashTimer - dt);

      if (a.exploding) {
        a.explodeTimer -= dt;
        if (a.explodeTimer <= 0) a.done = true;
        return !a.done;
      }

      // Accelerate toward player
      a.speed = Math.min(a.maxSpeed, a.speed + a.accel * dt);
      const pcx3 = gp.player.x + PW / 2, pcy3 = gp.player.y + PH / 2;
      const dx   = pcx3 - (a.x + a.w / 2), dy = pcy3 - (a.y + a.h / 2);
      const d    = Math.sqrt(dx * dx + dy * dy) || 1;
      a.x += (dx / d) * a.speed * dt;
      a.y += (dy / d) * a.speed * dt;

      // Bounce off walls
      if (a.x < ROOM.x)                      { a.x = ROOM.x;                     a.vx = Math.abs(a.vx); }
      if (a.x > ROOM.x + ROOM.w - a.w)       { a.x = ROOM.x + ROOM.w - a.w;     }
      if (a.y < ROOM.y)                       { a.y = ROOM.y;                     }
      if (a.y > ROOM.y + ROOM.h - a.h)       { a.y = ROOM.y + ROOM.h - a.h;     }

      // Contact with player
      if (gp.player.iFrames <= 0 &&
          _rectsOverlap({ x: gp.player.x, y: gp.player.y, w: PW, h: PH },
                        { x: a.x, y: a.y, w: a.w, h: a.h })) {
        let dmg = 40;
        if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
        gp.player.hp -= dmg;
        gp.player.iFrames = 1.0;
        _hakiReflect(40, null);
        if (gp.player.hp <= 0) { gp.player.hp = 0; gp.gameOver = true; gp.killSource = 'sha'; }
        a.exploding  = true;
        a.playerKill = true;
        a.explodeTimer = a.maxExplode;
      }
      return true;
    }

    return !a.done;
  });
}

function _updateEnelBoss(dt, t, b) {
  const p      = gp.player;
  const frozen = gp.power.id === 'timestop' && gp.powerState.frozen;
  if (frozen) return;

  // ── Movement ──
  b.moveTimer -= dt;
  if (b.moveTimer <= 0) {
    const margin = 100;
    if (b.phase === 2 && Math.random() < 0.6) {
      b.moveTarget = { x: p.x + PW/2 - b.w/2, y: p.y + PH/2 - b.h/2 };
    } else {
      b.moveTarget = {
        x: ROOM.x + margin + Math.random() * (ROOM.w - margin*2 - b.w),
        y: ROOM.y + margin + Math.random() * (ROOM.h - margin*2 - b.h),
      };
    }
    b.moveTimer = b.phase === 2
      ? 0.5 + Math.random() * 0.3
      : 0.75 + Math.random() * 0.5;
  }

  if (b.knockbackTimer > 0) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.knockbackTimer -= dt;
    b.vx *= Math.pow(0.04, dt);
    b.vy *= Math.pow(0.04, dt);
  } else {
    const dx  = b.moveTarget.x - b.x;
    const dy  = b.moveTarget.y - b.y;
    const d   = Math.sqrt(dx*dx + dy*dy) || 1;
    const spd = b.phase === 2 ? b.speed * 1.5 : b.speed;
    if (d > 4) { b.x += (dx/d)*spd*dt; b.y += (dy/d)*spd*dt; }
  }

  b.x = Math.max(ROOM.x + 8, Math.min(ROOM.x + ROOM.w - b.w - 8, b.x));
  b.y = Math.max(ROOM.y + 8, Math.min(ROOM.y + ROOM.h - b.h - 8, b.y));

  // ── Contact damage ──
  if (p.iFrames <= 0 &&
      _rectsOverlap({ x: p.x, y: p.y, w: PW, h: PH }, { x: b.x, y: b.y, w: b.w, h: b.h })) {
    let dmg = 15;
    if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
    p.hp -= dmg;
    p.iFrames = 1.2;
    _hakiReflect(15, null);
    if (p.hp <= 0) { p.hp = 0; gp.gameOver = true; gp.killSource = 'enel_contact'; }
  }

  // ── Lightning Beam ──
  b.beamTimer -= dt;
  if (b.beamTimer <= 0) {
    // Phase 2: never overlap with an active beam or grid
    if (b.phase === 2 && gp.bossAttacks.some(a => (a.type === 'beam' || a.type === 'grid') && !a.done)) {
      // hold — timer stays at 0 until current attack finishes
    } else {
      const bcx = b.x + b.w/2, bcy = b.y + b.h/2;
      const trackTime = b.phase === 2 ? 0.35 : 0.55;
      const lockTime  = b.phase === 2 ? 0.42 : 0.65;
      gp.bossAttacks.push({
        type: 'beam',
        ox: bcx, oy: bcy,
        angle: Math.atan2((p.y + PH/2) - bcy, (p.x + PW/2) - bcx),
        tracking: true,
        trackTimer: trackTime, maxTrack: trackTime,
        locked: false,
        lockTimer: 0, maxLock: lockTime,
        firing: false,
        fireTimer: 0, maxFire: 0.4,
        halfW: 22,
        length: 1400,
        damage: b.phase === 2 ? 38 : 30,
        struck: false,
        done: false,
      });
      b.beamTimer = (b.phase === 2 ? 3.5 : 5.5) * b.attackScale;
    }
  }

  // ── Lightning Grid ──
  b.gridTimer -= dt;
  if (b.gridTimer <= 0) {
    // Phase 2: never overlap with an active beam or grid
    if (b.phase === 2 && gp.bossAttacks.some(a => (a.type === 'beam' || a.type === 'grid') && !a.done)) {
      // hold — timer stays at 0 until current attack finishes
    } else {
      const telegraphTime = b.phase === 2 ? 0.75 : 1.1;
      // halfW reduced so 4 lines leave slightly wider gaps than naive packing
      const halfW = b.phase === 2 ? 14 : 16;
      let lines;
      if (b.phase === 1) {
        const dir = b.gridNext;
        b.gridNext = dir === 'h' ? 'v' : 'h';
        lines = dir === 'h'
          ? [
              { dir: 'h', pos: ROOM.y + 110 },
              { dir: 'h', pos: ROOM.y + 237 },
              { dir: 'h', pos: ROOM.y + 363 },
              { dir: 'h', pos: ROOM.y + 490 },
            ]
          : [
              { dir: 'v', pos: ROOM.x + 214 },
              { dir: 'v', pos: ROOM.x + 445 },
              { dir: 'v', pos: ROOM.x + 675 },
              { dir: 'v', pos: ROOM.x + 906 },
            ];
      } else {
        lines = [
          { dir: 'h', pos: ROOM.y + 110 },
          { dir: 'h', pos: ROOM.y + 237 },
          { dir: 'h', pos: ROOM.y + 363 },
          { dir: 'h', pos: ROOM.y + 490 },
          { dir: 'v', pos: ROOM.x + 214 },
          { dir: 'v', pos: ROOM.x + 445 },
          { dir: 'v', pos: ROOM.x + 675 },
          { dir: 'v', pos: ROOM.x + 906 },
        ];
      }
      gp.bossAttacks.push({
        type: 'grid',
        lines,
        halfW,
        telegraphTimer: telegraphTime, maxTelegraph: telegraphTime,
        activeTimer: 0, maxActive: 0.55,
        damage: b.phase === 2 ? 30 : 24,
        struck: false,
        done: false,
      });
      b.gridTimer = (b.phase === 2 ? 4.0 : 6.5) * b.attackScale;
    }
  }

  // ── Tick Enel attacks ──
  gp.bossAttacks = gp.bossAttacks.filter(a => {
    if (a.done) return false;
    if (a.type !== 'beam' && a.type !== 'grid') return true;

    if (a.type === 'beam') {
      if (a.tracking) {
        // Track player in real time until lock
        a.ox    = b.x + b.w/2;
        a.oy    = b.y + b.h/2;
        a.angle = Math.atan2((p.y + PH/2) - a.oy, (p.x + PW/2) - a.ox);
        a.trackTimer -= dt;
        if (a.trackTimer <= 0) {
          a.tracking  = false;
          a.locked    = true;
          a.lockTimer = a.maxLock;
          // Freeze origin at Enel's current position
          a.ox = b.x + b.w/2;
          a.oy = b.y + b.h/2;
        }
        return true;
      }
      if (a.locked) {
        // Aim locked — player window to dodge before beam fires
        a.lockTimer -= dt;
        if (a.lockTimer <= 0) {
          a.locked    = false;
          a.firing    = true;
          a.fireTimer = a.maxFire;
          if (!a.struck && p.iFrames <= 0) {
            const dx    = (p.x + PW/2) - a.ox;
            const dy    = (p.y + PH/2) - a.oy;
            const along = dx * Math.cos(a.angle) + dy * Math.sin(a.angle);
            const perp  = Math.abs(-dx * Math.sin(a.angle) + dy * Math.cos(a.angle));
            if (along >= -PW/2 && along <= a.length + PW/2 && perp <= a.halfW + PH/2) {
              a.struck = true;
              let dmg = a.damage;
              if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
              p.hp -= dmg;
              p.iFrames = 0.65;
              _hakiReflect(a.damage, null);
              if (p.hp <= 0) { p.hp = 0; gp.gameOver = true; gp.killSource = 'beam'; }
            }
          }
        }
        return true;
      }
      if (a.firing) {
        a.fireTimer -= dt;
        if (a.fireTimer <= 0) a.done = true;
        return !a.done;
      }
      return false;
    }

    if (a.type === 'grid') {
      if (a.telegraphTimer > 0) {
        a.telegraphTimer -= dt;
        if (a.telegraphTimer <= 0) {
          a.activeTimer = a.maxActive;
          if (!a.struck && p.iFrames <= 0) {
            for (const ln of a.lines) {
              const lineRect = ln.dir === 'h'
                ? { x: ROOM.x, y: ln.pos - a.halfW, w: ROOM.w, h: a.halfW * 2 }
                : { x: ln.pos - a.halfW, y: ROOM.y, w: a.halfW * 2, h: ROOM.h };
              if (_rectsOverlap({ x: p.x, y: p.y, w: PW, h: PH }, lineRect)) {
                a.struck = true;
                let dmg = a.damage;
                if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
                p.hp -= dmg;
                p.iFrames = 0.65;
                _hakiReflect(a.damage, null);
                if (p.hp <= 0) { p.hp = 0; gp.gameOver = true; gp.killSource = 'grid'; }
                break;
              }
            }
          }
        }
        return true;
      }
      a.activeTimer -= dt;
      if (a.activeTimer <= 0) a.done = true;
      return !a.done;
    }

    return true;
  });
}

// ─── Gojo boss ─────────────────────────────────────────────────────────────────

function _updateGojoBoss(dt, t, b) {
  const p = gp.player;
  const frozen = gp.power.id === 'timestop' && gp.powerState.frozen;
  if (frozen) return;

  // Timers
  if (b.infinityTimer > 0) b.infinityTimer -= dt;
  if (b.redCooldown    > 0) b.redCooldown   -= dt;

  // Update Infinity ripples
  b.infinityRipples = b.infinityRipples.filter(rp => rp.alpha > 0);
  for (const rp of b.infinityRipples) {
    rp.r    += 110 * dt;
    rp.alpha = Math.max(0, rp.alpha - dt * 2.5);
  }

  // Tick barrier hit visuals
  for (const h of b.barrierHits) { h.timer -= dt; h.alpha = Math.max(0, h.timer / 0.75); }
  b.barrierHits = b.barrierHits.filter(h => h.timer > 0);

  // Stun window — 10s timed; gate clears only if player deals enough damage
  if (b.stunTimer > 0) {
    b.stunTimer -= dt;
    b.stunStarAngle += dt * 3.8;

    // Spin landing: lerp Gojo from launch position to center with ease-out cubic
    if (b.spinLanding && b.spinTimer !== undefined) {
      b.spinTimer += dt;
      if (b.spinTimer < b.spinDuration) {
        const tNorm = b.spinTimer / b.spinDuration;
        const t3    = 1 - Math.pow(1 - tNorm, 3);
        b.x = b.spinStartX + (b.spinTargetX - b.spinStartX) * t3;
        b.y = b.spinStartY + (b.spinTargetY - b.spinStartY) * t3;
        b.spinAngle = tNorm * Math.PI * 4;
      } else {
        b.x = b.spinTargetX;
        b.y = b.spinTargetY;
        b.spinLanding = false;
      }
    } else {
      b.x = ROOM.x + ROOM.w / 2 - b.w / 2;
      b.y = ROOM.y + ROOM.h / 2 - b.h / 2;
    }

    _gojoTickBossAttacks(dt, b, p);

    // Stun timer just expired without gate being cleared — start IT return
    if (b.stunTimer <= 0 && !b.isDead && !b.returnLanding) {
      b.returnLanding = true;
      b.returnTimer   = 0;
      b.itDeparted    = false;
      b.itDepartX     = b.x + b.w / 2;
      b.itDepartY     = b.y + b.h / 2;
      b.returnTargetX = GOJO_ANCHOR_X;
      b.returnTargetY = GOJO_Y_LANES[1];
    }
    return;
  }

  // Instant Transmission return — departure flash, snap, arrival flash
  if (b.returnLanding) {
    b.returnTimer += dt;
    if (!b.itDeparted && b.returnTimer >= 0.28) {
      // Snap to anchor mid-animation
      b.itDeparted = true;
      b.x = b.returnTargetX;
      b.y = b.returnTargetY;
    }
    if (b.returnTimer >= 0.58) {
      b.returnLanding = false;
      b.itDeparted    = false;
      b.x = b.returnTargetX;
      b.y = b.returnTargetY;
      b.attackTimer = 1.2;
    }
    return;
  }

  // ── Infinite Void: tick timer and shadow-hand damage ──
  if (b.voidTimer > 0) {
    b.voidTimer -= dt;
    const voidProg = 1 - b.voidTimer / b.voidMaxTimer;  // 0→1 over duration
    for (const hand of b.voidHands) {
      if (hand.hitCooldown > 0) hand.hitCooldown -= dt;
      // Hands extend inward then hold at max reach
      const targetReach = voidProg < 0.5
        ? hand.maxReach * (voidProg / 0.5)
        : hand.maxReach;
      hand.reach = Math.min(hand.reach + 180 * dt, targetReach);
      // Arm segment: from room-edge anchor inward to the tip
      const edgeX = ROOM.x + ROOM.w / 2 + Math.cos(hand.angle) * (ROOM.w * 0.65);
      const edgeY = ROOM.y + ROOM.h / 2 + Math.sin(hand.angle) * (ROOM.h * 0.65);
      const tipX  = edgeX - Math.cos(hand.angle) * hand.reach;
      const tipY  = edgeY - Math.sin(hand.angle) * hand.reach;
      const pcx   = p.x + PW / 2, pcy = p.y + PH / 2;
      // Check player against the ENTIRE arm segment (not just tip)
      if (hand.hitCooldown <= 0 && p.iFrames <= 0) {
        const adx = tipX - edgeX, ady = tipY - edgeY;
        const lenSq = adx * adx + ady * ady;
        let armDist;
        if (lenSq < 1) {
          armDist = Math.sqrt((pcx - edgeX) ** 2 + (pcy - edgeY) ** 2);
        } else {
          const tCl = Math.max(0, Math.min(1, ((pcx - edgeX) * adx + (pcy - edgeY) * ady) / lenSq));
          armDist = Math.sqrt((pcx - (edgeX + tCl * adx)) ** 2 + (pcy - (edgeY + tCl * ady)) ** 2);
        }
        if (armDist < 34) {   // arm half-width (28px) + player margin
          let dmg = 18;
          if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
          p.hp -= dmg; p.iFrames = 0.6;
          hand.hitCooldown = 1.0;
          _hakiReflect(18, null);
          if (p.hp <= 0) { p.hp = 0; gp.gameOver = true; gp.killSource = 'void'; }
        }
      }
    }
    if (b.voidTimer <= 0) {
      b.voidHands = [];
      // Resume normal attack scheduling after void (give 1-2s breathing room)
      if (b.attackTimer > 10) b.attackTimer = 1.0 + Math.random() * 1.0;
    }
  }
  if (b.voidCooldown > 0) b.voidCooldown -= dt;

  // Void tell timer — activates void when it expires
  if (b.voidTellTimer > 0) {
    b.voidTellTimer -= dt;
    if (b.voidTellTimer <= 0 && b.voidTimer <= 0) {
      const dur = b.pendingVoidDur || 6.0;
      b.voidMaxTimer = dur;
      b.voidTimer    = dur;
      b.voidHands = Array.from({ length: 6 }, (_, i) => ({
        angle:       (i / 6) * Math.PI * 2 + Math.random() * (Math.PI / 3),
        reach:       0,
        maxReach:    620 + Math.random() * 150,
        hitCooldown: 0,
      }));
      b.pendingVoidDur = 0;
    }
  }

  // Phase
  b.phase = b.gateIndex >= 2 ? 2 : 1;

  // ── Movement: instant snap between fixed lanes — no free roam ──
  if (b.purpleState !== 'moving' && b.purpleState !== 'charging') {
    b.moveTimer -= dt;
    if (b.moveTimer <= 0) {
      const curLane = GOJO_Y_LANES.reduce((best, ly, i) =>
        Math.abs(ly - b.y) < Math.abs(GOJO_Y_LANES[best] - b.y) ? i : best, 0);
      const others = GOJO_Y_LANES.filter((_, i) => i !== curLane);
      const newY = others[Math.floor(Math.random() * others.length)];
      b.y          = newY;   // instant teleport snap
      b.moveTarget = { x: GOJO_ANCHOR_X, y: newY };
      b.moveTimer  = (b.phase === 2 ? 1.5 : 3.0) + Math.random() * (b.phase === 2 ? 1.3 : 1.5);
    }
  }

  if (!b.returnLanding) b.x = GOJO_ANCHOR_X;

  // ── Contact damage ──
  if (p.iFrames <= 0 &&
      _rectsOverlap({ x: p.x, y: p.y, w: PW, h: PH }, { x: b.x, y: b.y, w: b.w, h: b.h })) {
    let dmg = 16;
    if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
    p.hp -= dmg; p.iFrames = 1.2;
    _hakiReflect(16, null);
    if (p.hp <= 0) { p.hp = 0; gp.gameOver = true; gp.killSource = 'gojo_contact'; }
  }

  // ── Attack scheduling ──
  if (!b.activeAttack) {
    b.attackTimer -= dt;
    if (b.attackTimer <= 0) _gojoPickAttack(b, p);
  }
  if (b.activeAttack) _gojoUpdateActiveAttack(dt, b, p);

  _gojoTickBossAttacks(dt, b, p);
}

function _gojoPickAttack(b, p) {
  // During Void (or tell), suppress new attacks except Blue in phase 2
  const inVoid = b.voidTimer > 0 || b.voidTellTimer > 0;
  if (inVoid) {
    if (b.phase === 2) {
      // Only Blue allowed in phase 2 during Void
      _gojoFireBlue(b, p);
      b.attackTimer = 2.0 + Math.random() * 1.5;
    } else {
      b.attackTimer = 1.0;  // check again soon
    }
    return;
  }

  // All attacks available from any lane position
  const available = ['hollow_purple', 'blue'];
  if (b.redCooldown <= 0 && !b.redActive) available.push('red');
  if (b.phase === 2 && b.voidCooldown <= 0) available.push('void');
  const pick = available[Math.floor(Math.random() * available.length)];

  if (pick === 'hollow_purple') {
    b.activeAttack = 'hollow_purple';
    // No-repeat: pick from the 2 thirds that weren't just used
    const otherThirds = [0, 1, 2].filter(i => i !== b.lastPurpleThird);
    b.purpleThird     = otherThirds[Math.floor(Math.random() * otherThirds.length)];
    b.lastPurpleThird = b.purpleThird;
    b.purpleState = 'moving';
    b.moveTarget = {
      x: GOJO_ANCHOR_X,
      y: ROOM.y + (b.purpleThird + 0.5) * ROOM.h / 3 - b.h / 2,
    };
    b.purpleChargeTimer = 0;

  } else if (pick === 'blue') {
    _gojoFireBlue(b, p);
    b.attackTimer = (b.phase === 2 ? 0.8 : 1.8) + Math.random() * (b.phase === 2 ? 0.6 : 0.8);

  } else if (pick === 'void') {
    b.voidTellTimer    = 2.0;
    b.voidTellDuration = 2.0;
    b.pendingVoidDur   = 5.5 + Math.random() * 2.5;
    b.voidCooldown     = 25 + Math.random() * 5;
    b.attackTimer      = 999; // suspend normal scheduling until void ends

  } else {
    _gojoFireRed(b, p);
    b.redActive   = true;
    b.redCooldown = b.redCooldownMax;
    b.attackTimer = (b.phase === 2 ? 1.4 : 2.2) + Math.random() * 0.8;
  }
}

function _gojoUpdateActiveAttack(dt, b, p) {
  if (b.activeAttack !== 'hollow_purple') return;

  if (b.purpleState === 'moving') {
    // Instant snap to target lane, then immediately begin charging
    b.y           = b.moveTarget.y;
    b.purpleState = 'charging';
    b.purpleChargeTimer = b.phase === 2 ? 1.0 : 1.3;

  } else if (b.purpleState === 'charging') {
    b.purpleChargeTimer -= dt;
    if (b.purpleChargeTimer <= 0) {
      b.purpleState = 'firing';
      const fireCY = ROOM.y + (b.purpleThird + 0.5) * ROOM.h / 3;
      gp.bossAttacks.push({
        type: 'purple_ball',
        cx: b.x + b.w / 2, cy: fireCY,
        vx: b.phase === 2 ? -2200 : -1900,
        third: b.purpleThird,
        r: 58,
        damage: b.phase === 2 ? 130 : 110,
        struck: false, done: false,
      });
      b.purpleFireTimer = b.phase === 2 ? 0.8 : 1.1;
    }

  } else if (b.purpleState === 'firing') {
    b.purpleFireTimer -= dt;
    if (b.purpleFireTimer <= 0) {
      b.purpleState  = null;
      b.activeAttack = null;
      b.attackTimer  = (b.phase === 2 ? 0.3 : 0.9) + Math.random() * (b.phase === 2 ? 0.5 : 0.6);
    }
  }
}

function _gojoFireBlue(b, p) {
  // Phase 1: single orb at center of left wall.
  // Phase 2: two orbs at top-left and bottom-left corners.
  const count = b.phase === 2 ? 2 : 1;
  const life  = 6.0 + Math.random() * 2.0;
  const pull  = b.phase === 2 ? 44 : 34;

  const positions = count === 1
    ? [{ cy: ROOM.y + ROOM.h / 2, pvx: pull, pvy: 0 }]
    : [
        { cy: ROOM.y + ROOM.h * 0.18, pvx: pull * 0.85, pvy:  pull * 0.5 },  // top-left → pull right+down
        { cy: ROOM.y + ROOM.h * 0.82, pvx: pull * 0.85, pvy: -pull * 0.5 },  // bottom-left → pull right+up
      ];

  for (const pos of positions) {
    gp.bossAttacks.push({
      type:          'blue_orb',
      cx:            ROOM.x + 18,
      cy:            pos.cy,
      r:             22,
      life,
      maxLife:       life,
      pullStrength:  pull,
      pullVX:        pos.pvx,
      pullVY:        pos.pvy,
      damage:        b.phase === 2 ? 20 : 15,
      struck:        false,
      done:          false,
      windParticles:     [],
      spawnTimer:        0.55,
      spawnDuration:     0.55,
      pulseTimer:        1.0 + Math.random() * 0.5,  // delay before first pulse
      pulseActive:       false,
      pulseActiveTimer:  0,
      pulseActiveDur:    0.18,
      pulseInterval:     1.5 + Math.random() * 0.5,  // 1.5–2.0s between pulses
    });
  }
}

function _gojoFireRed(b, p) {
  if (!gp.hints.shown.red) {
    gp.hints.shown.red   = true;
    gp.hints.text        = 'Wait... maybe I can send\nthat right back at him!';
    gp.hints.timer       = 4.0;
    gp.hints.maxTimer    = 4.0;
  }
  const bcx = b.x + b.w/2, bcy = b.y + b.h/2;
  const dx  = (p.x + PW/2) - bcx, dy = (p.y + PH/2) - bcy;
  const d   = Math.sqrt(dx*dx + dy*dy) || 1;
  const spd = 150;
  gp.bossAttacks.push({
    type: 'red_ball',
    cx: bcx, cy: bcy,
    vx: (dx/d) * spd, vy: (dy/d) * spd,
    r: 22, speed: spd,
    dir: 'toward_player',
    bounceCount: 0,
    requiredBounces: b.rallyBounces[b.gateIndex],
    gojoReturnDelay: 0,
    hitCooldown: 0,
    damage: 28,
    done: false,
    crossedBarrier: false,
  });
}

function _gojoFireBarrierPunishment(b) {
  // Vertical purple column sweeping down (or up) the barrier — punishes hugging the wall
  const fromTop = Math.random() < 0.5;
  gp.bossAttacks.push({
    type:   'barrier_purple',
    cx:     GOJO_BARRIER_X - 10,
    cy:     fromTop ? ROOM.y - 70 : ROOM.y + ROOM.h + 70,
    vy:     fromTop ? 1200 : -1200,
    r:      50,
    damage: b.phase === 2 ? 120 : 100,
    struck: false,
    done:   false,
  });
}

function _gojoRedHitByPlayer(rb) {
  const rbRect = { x: rb.cx - rb.r, y: rb.cy - rb.r, w: rb.r*2, h: rb.r*2 };

  // Dio knives
  for (const proj of gp.projectiles) {
    if (proj.type !== 'knife' || proj.done) continue;
    if (_rectsOverlap(rbRect, { x: proj.x, y: proj.y, w: proj.w || 20, h: proj.h || 14 })) {
      proj.done = true;
      return true;
    }
  }

  // Levi sweeps
  const pcx = gp.player.x + PW/2, pcy = gp.player.y + PH/2;
  for (const sw of gp.activeAttacks) {
    if (sw.type !== 'sweep') continue;
    const swR      = sw.r || 130;
    const arcInner = swR * 0.22;
    const arcOuter = swR * 0.94;
    const dist = Math.sqrt((rb.cx - pcx)**2 + (rb.cy - pcy)**2);
    if (dist >= arcInner && dist <= arcOuter + rb.r) {
      let da = Math.atan2(rb.cy - pcy, rb.cx - pcx) - sw.angle;
      da = ((da % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
      if (da > Math.PI) da -= Math.PI*2;
      if (Math.abs(da) <= 0.58 * Math.PI) return true;
    }
  }

  // Kaido breath beam
  if (gp.char.id === 'kaido' && gp.kaidoBreath.state === 'firing') {
    const beam = gp.activeAttacks.find(a => a.type === 'beam');
    if (beam && _enemyInBeam(beam, { x: rb.cx - rb.r, y: rb.cy - rb.r }, rb.r*2, rb.r*2)) {
      return true;
    }
  }

  return false;
}

function _gojoCompleteRally(b) {
  b.flashTimer = 0.35;
  b.redActive  = false;

  // Start timed stun window — gate index only advances if player deals
  // enough damage to reach the next gate floor within this window.
  b.stunTimer     = b.stunDuration ?? 10;
  b.stunStarAngle = 0;

  // Clear all in-flight attacks so nothing lingers during the stun
  gp.bossAttacks = gp.bossAttacks.filter(a => a.type === 'red_ball' && !a.done);
  b.activeAttack      = null;
  b.purpleState       = null;
  b.purpleChargeTimer = 0;
  b.purpleFireTimer   = 0;
  b.attackTimer       = 0;
}

function _gojoTickBossAttacks(dt, b, p) {
  gp.bossAttacks = gp.bossAttacks.filter(a => !a.done);

  for (const a of gp.bossAttacks) {
    // ── Purple ball ──
    if (a.type === 'purple_ball') {
      a.cx += a.vx * dt;
      // Danger zone check: player must be in a different third
      if (!a.struck && p.iFrames <= 0) {
        const thirdTop = ROOM.y + a.third * ROOM.h / 3;
        const pcy = p.y + PH/2;
        if (pcy >= thirdTop && pcy <= thirdTop + ROOM.h / 3 && a.cx <= p.x + PW + a.r) {
          a.struck = true;
          let dmg = a.damage;
          if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
          p.hp -= dmg; p.iFrames = 0.7;
          _hakiReflect(a.damage, null);
          if (p.hp <= 0) { p.hp = 0; gp.gameOver = true; gp.killSource = 'hollow_purple'; }
        }
      }
      if (a.cx + a.r < ROOM.x) a.done = true;
      continue;
    }

    // ── Blue orb (left-wall gravity distortion — pulls player rightward) ──
    if (a.type === 'blue_orb') {
      // Tick spawn animation first; pull/damage/particles are suppressed until fully materialized
      if (a.spawnTimer > 0) {
        a.spawnTimer -= dt;
        continue;
      }

      a.life -= dt;
      if (a.life <= 0) { a.done = true; continue; }

      // Constant baseline pull — always active at full strength
      p.x += (a.pullVX ?? a.pullStrength) * dt;
      p.y += (a.pullVY ?? 0) * dt;

      // Pulse spike — small extra nudge on top of baseline every ~1.5-2s
      if (a.pulseActive) {
        a.pulseActiveTimer -= dt;
        if (a.pulseActiveTimer <= 0) {
          a.pulseActive = false;
          a.pulseTimer  = a.pulseInterval;
        } else {
          p.x += (a.pullVX ?? a.pullStrength) * 0.30 * dt;
          p.y += (a.pullVY ?? 0) * 0.30 * dt;
        }
      } else {
        a.pulseTimer -= dt;
        if (a.pulseTimer <= 0) {
          a.pulseActive      = true;
          a.pulseActiveTimer = a.pulseActiveDur;
        }
      }

      // Spawn flake particles that burst outward in all directions from the orb center
      if (!a.windParticles) a.windParticles = [];
      const flakeCount = Math.random() < 0.5 ? 3 : 2;
      for (let fi = 0; fi < flakeCount; fi++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 80 + Math.random() * 120;
        a.windParticles.push({ x: a.cx, y: a.cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, alpha: 0.65, life: 0.4 + Math.random() * 0.3 });
      }
      for (const wp of a.windParticles) {
        wp.x += wp.vx * dt;
        wp.y += wp.vy * dt;
        wp.life -= dt; wp.alpha = Math.max(0, wp.life / 0.5 * 0.65);
      }
      a.windParticles = a.windParticles.filter(wp => wp.life > 0);

      // Contact damage with the orb itself
      if (!a.struck && p.iFrames <= 0) {
        const dx = a.cx - (p.x+PW/2), dy = a.cy - (p.y+PH/2);
        if (dx*dx+dy*dy < (a.r + PW/2)**2) {
          a.struck = true;
          let dmg = a.damage;
          if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
          p.hp -= dmg; p.iFrames = 0.7;
          _hakiReflect(a.damage, null);
          if (p.hp <= 0) { p.hp = 0; gp.gameOver = true; gp.killSource = 'blue_orb'; }
        }
      }
      // Allow re-striking after brief cooldown
      if (a.struck) {
        if (!a.strikeCooldown) a.strikeCooldown = 0.8;
        a.strikeCooldown -= dt;
        if (a.strikeCooldown <= 0) { a.struck = false; a.strikeCooldown = 0; }
      }
      continue;
    }

    // ── Red ball ──
    if (a.type === 'red_ball') {
      // During void or tell in phase 1: pause the ball entirely
      if ((b.voidTimer > 0 || b.voidTellTimer > 0) && b.phase < 2) {
        continue;
      }
      if (a.hitCooldown > 0) a.hitCooldown -= dt;

      // Gojo catch phase (ball paused at boss before firing back)
      if (a.gojoReturnDelay > 0) {
        a.cx = b.x + b.w/2; a.cy = b.y + b.h/2;
        a.gojoReturnDelay -= dt;
        if (a.gojoReturnDelay <= 0) {
          // Fire back toward player, now faster
          a.speed = Math.min(480, a.speed * 1.35);
          const dx = (p.x+PW/2) - a.cx, dy = (p.y+PH/2) - a.cy;
          const d  = Math.sqrt(dx*dx+dy*dy) || 1;
          a.vx = (dx/d)*a.speed; a.vy = (dy/d)*a.speed;
          a.dir = 'toward_player';
          a.crossedBarrier = false;
        }
        continue;
      }

      a.cx += a.vx * dt; a.cy += a.vy * dt;
      // Bounce off room top/bottom
      if (a.cy - a.r < ROOM.y)             { a.cy = ROOM.y + a.r;             a.vy =  Math.abs(a.vy); }
      if (a.cy + a.r > ROOM.y + ROOM.h)    { a.cy = ROOM.y + ROOM.h - a.r;    a.vy = -Math.abs(a.vy); }

      if (a.dir === 'toward_player') {
        // Mark once the ball has fully crossed the barrier into the player's zone
        if (!a.crossedBarrier && a.cx + a.r < GOJO_BARRIER_X) a.crossedBarrier = true;
        // Check player attack (returns the ball) — only after it crosses the barrier
        if (a.crossedBarrier && a.hitCooldown <= 0 && _gojoRedHitByPlayer(a)) {
          a.hitCooldown = 0.25;
          a.bounceCount++;
          // Cheese punishment: player hit from too close to the Infinity barrier
          if (!a.punished && (p.x + PW) > GOJO_BARRIER_X - 70) {
            a.punished = true;
            _gojoFireBarrierPunishment(b);
          }
          if (a.bounceCount >= a.requiredBounces) {
            // Final volley: fly ball toward Gojo dramatically, then trigger rally
            a.dir = 'final_volley';
            a.isFinalVolley = true;
            const bcx = b.x + b.w/2, bcy = b.y + b.h/2;
            const fdx = bcx - a.cx, fdy = bcy - a.cy;
            const fd  = Math.sqrt(fdx*fdx + fdy*fdy) || 1;
            const fspd = 600;
            a.vx = (fdx/fd) * fspd; a.vy = (fdy/fd) * fspd;
          } else {
            // Aim back at Gojo
            const bx = b.x+b.w/2, by = b.y+b.h/2;
            const dx = bx-a.cx, dy = by-a.cy;
            const d  = Math.sqrt(dx*dx+dy*dy) || 1;
            a.vx = (dx/d)*a.speed; a.vy = (dy/d)*a.speed;
            a.dir = 'toward_gojo';
          }
          continue;
        }
        // Player contact (missed the ball)
        const dx = a.cx-(p.x+PW/2), dy = a.cy-(p.y+PH/2);
        if (dx*dx+dy*dy < (a.r+22)**2 && p.iFrames <= 0) {
          let dmg = a.damage;
          if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
          p.hp -= dmg; p.iFrames = 0.8;
          _hakiReflect(a.damage, null);
          if (p.hp <= 0) { p.hp = 0; gp.gameOver = true; gp.killSource = 'red_ball'; }
          a.done = true; b.redActive = false;
          continue;
        }
        // Ball exits left side (miss — player didn't hit it in time)
        if (a.cx + a.r < ROOM.x - 20) { a.done = true; b.redActive = false; }

      } else if (a.dir === 'final_volley') {
        // Final hit: track Gojo center every frame at max speed
        const gbxF = b.x + b.w/2, gbyF = b.y + b.h/2;
        const tdxF = gbxF - a.cx, tdyF = gbyF - a.cy;
        const tdF  = Math.sqrt(tdxF*tdxF + tdyF*tdyF) || 1;
        a.vx = (tdxF/tdF) * 600; a.vy = (tdyF/tdF) * 600;
        if (tdF < b.w/2 + a.r) {
          // Ball reached Gojo — spin landing and complete rally
          a.done = true;
          b.spinLanding  = true;
          b.spinTimer    = 0;
          b.spinDuration = 1.4;
          b.spinStartX   = b.x;
          b.spinStartY   = b.y;
          b.spinTargetX  = ROOM.x + ROOM.w / 2 - b.w / 2;
          b.spinTargetY  = ROOM.y + ROOM.h / 2 - b.h / 2;
          _gojoCompleteRally(b);
        }
      } else {
        // toward_gojo — continuously re-aim at Gojo's current position
        const gbx = b.x+b.w/2, gby = b.y+b.h/2;
        const tdx = gbx-a.cx, tdy = gby-a.cy;
        const td  = Math.sqrt(tdx*tdx+tdy*tdy) || 1;
        a.vx = (tdx/td)*a.speed; a.vy = (tdy/td)*a.speed;
        if (td < b.w/2 + a.r) {
          a.vx = 0; a.vy = 0;
          a.gojoReturnDelay = 0.38;
        }
        if (a.cx > ROOM.x + ROOM.w + 40) { a.done = true; b.redActive = false; }
      }
      continue;
    }

    // ── Barrier punishment purple (vertical sweep along Infinity barrier) ──
    if (a.type === 'barrier_purple') {
      a.cy += a.vy * dt;
      if (a.vy > 0 && a.cy - a.r > ROOM.y + ROOM.h) { a.done = true; continue; }
      if (a.vy < 0 && a.cy + a.r < ROOM.y)           { a.done = true; continue; }
      if (!a.struck && p.iFrames <= 0) {
        const dx = a.cx - (p.x + PW / 2), dy = a.cy - (p.y + PH / 2);
        if (dx * dx + dy * dy < (a.r + PW / 2) ** 2) {
          a.struck = true;
          let dmg = a.damage;
          if (gp.power.id === 'haki') dmg = Math.ceil(dmg * 0.65);
          p.hp -= dmg; p.iFrames = 0.7;
          _hakiReflect(a.damage, null);
          if (p.hp <= 0) { p.hp = 0; gp.gameOver = true; gp.killSource = 'barrier_purple'; }
        }
      }
      continue;
    }
  }
}

// ─── Draw boss attacks (bombs, SHA, explosions) ───────────────────────────────

function _drawCartoonExplosion(ctx, cx, cy, radius, prog, bigBlast) {
  // prog 0→1: 0=just started, 1=fading out
  ctx.save();

  // ── White flash (first 25% of animation) ──
  if (prog < 0.28) {
    const fa = 1 - prog / 0.28;
    const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.5);
    fg.addColorStop(0,   `rgba(255,255,255,${fa})`);
    fg.addColorStop(0.4, `rgba(255,240,80,${fa * 0.85})`);
    fg.addColorStop(1,   'rgba(255,80,0,0)');
    ctx.fillStyle   = fg;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur  = 55 * fa;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Orange-red core fill (shrinks and fades) ──
  const fillR = radius * 0.85 * Math.max(0, 1 - prog * 1.2);
  if (fillR > 1) {
    const fa    = Math.max(0, 1 - prog * 1.4);
    const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, fillR);
    inner.addColorStop(0,   `rgba(255,245,120,${fa})`);
    inner.addColorStop(0.35,`rgba(255,130,0,${fa * 0.95})`);
    inner.addColorStop(1,   `rgba(180,20,0,${fa * 0.6})`);
    ctx.fillStyle   = inner;
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur  = 28;
    ctx.beginPath();
    ctx.arc(cx, cy, fillR, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Expanding ring ──
  const ringR = radius * (0.45 + prog * 0.9);
  const ringA = Math.max(0, 1 - prog * 1.15);
  if (ringA > 0) {
    ctx.strokeStyle = `rgba(255,${Math.round(160 - prog * 140)},0,${ringA})`;
    ctx.lineWidth   = 9 * (1 - prog * 0.55);
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur  = 22;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ── Star spikes ──
  const nSpikes = bigBlast ? 10 : 7;
  for (let i = 0; i < nSpikes; i++) {
    const ang      = (i / nSpikes) * Math.PI * 2 + prog * 0.6;
    const spikeLen = radius * (0.55 + prog * 0.65);
    const spikeA   = Math.max(0, 1 - prog * 1.3);
    if (spikeA <= 0) continue;
    ctx.strokeStyle = `rgba(255,${Math.round(200 - prog * 180)},0,${spikeA})`;
    ctx.lineWidth   = 5 * (1 - prog * 0.55);
    ctx.lineCap     = 'round';
    ctx.shadowColor = '#ffbb00';
    ctx.shadowBlur  = 12;
    const innerLen  = fillR * 0.35 + 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * innerLen, cy + Math.sin(ang) * innerLen);
    ctx.lineTo(cx + Math.cos(ang) * spikeLen, cy + Math.sin(ang) * spikeLen);
    ctx.stroke();
  }

  // ── Smoke puffs (appear mid-animation) ──
  if (prog > 0.3) {
    const smokeA = Math.min(0.35, (prog - 0.3) * 0.9) * (1 - prog * 0.7);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + 0.4;
      const sr  = radius * (0.5 + (prog - 0.3) * 0.8);
      const sx  = cx + Math.cos(ang) * sr;
      const sy  = cy + Math.sin(ang) * sr;
      const sg  = ctx.createRadialGradient(sx, sy, 0, sx, sy, 20 + prog * 14);
      sg.addColorStop(0, `rgba(60,40,20,${smokeA})`);
      sg.addColorStop(1, 'rgba(30,20,10,0)');
      ctx.fillStyle = sg;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(sx, sy, 20 + prog * 14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function _drawBossAttacks(ctx, t) {
  // ── Gojo: Hollow Purple danger zone while charging (drawn once, outside loop) ──
  if (gp.boss && gp.boss.type === 'gojo' && gp.boss.purpleState === 'charging') {
    const cp       = 1 - gp.boss.purpleChargeTimer / 1.6;
    const thirdTop = ROOM.y + gp.boss.purpleThird * ROOM.h / 3;
    ctx.save();
    ctx.globalAlpha = 0.08 + cp * 0.14;
    ctx.fillStyle   = '#7c3aed';
    ctx.fillRect(ROOM.x, thirdTop, ROOM.w, ROOM.h / 3);
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = `rgba(167,139,250,${0.3 + cp * 0.5})`;
    ctx.lineWidth   = 2;
    ctx.strokeRect(ROOM.x, thirdTop, ROOM.w, ROOM.h / 3);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  for (const a of gp.bossAttacks) {

    // ── Bomb ──────────────────────────────────────────────────────────────
    if (a.type === 'bomb') {
      const cx = a.x + 9, cy = a.y + 9;

      if (a.exploding) {
        const prog = 1 - a.explodeTimer / a.maxExplode;
        _drawCartoonExplosion(ctx, cx, cy, a.radius, prog, true);
      } else {
        const fp = 1 - a.fuseTimer / a.maxFuse; // 0=just placed, 1=about to blow

        // Warning ring
        ctx.save();
        ctx.setLineDash([8, 6]);
        const ringAlpha = 0.20 + fp * 0.62;
        ctx.strokeStyle = fp > 0.6
          ? `rgba(255,35,35,${ringAlpha})`
          : `rgba(255,120,0,${ringAlpha})`;
        ctx.lineWidth   = 1.5 + fp * 1.5;
        ctx.shadowColor = fp > 0.6 ? '#ef4444' : '#f97316';
        ctx.shadowBlur  = 7 + fp * 14;
        ctx.beginPath();
        ctx.arc(cx, cy, a.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(255,55,0,${0.025 + fp * 0.045})`;
        ctx.beginPath();
        ctx.arc(cx, cy, a.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();

        // Bomb sphere (or custom sprite)
        const bombImg = Assets.getBombImg();
        ctx.save();
        const pulse = 0.55 + Math.sin(t * 0.01 * (4 + fp * 10)) * 0.45;
        ctx.shadowColor = '#6b21a8';
        ctx.shadowBlur  = 16 * pulse * (1 + fp);
        if (bombImg) {
          ctx.drawImage(bombImg, cx - 22, cy - 22, 44, 44);
        } else {
          const bG = ctx.createRadialGradient(cx - 3, cy - 3, 0, cx, cy, 10);
          bG.addColorStop(0,   '#222236');
          bG.addColorStop(0.5, '#101020');
          bG.addColorStop(1,   '#000');
          ctx.fillStyle = bG;
          ctx.beginPath();
          ctx.arc(cx, cy, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(200,170,255,${0.32 * pulse})`;
          ctx.beginPath();
          ctx.arc(cx - 3, cy - 3, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        // Fuse
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = '#8b7355';
        ctx.lineWidth   = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx + 12, cy - 20);
        ctx.quadraticCurveTo(cx + 26, cy - 32, cx + 18, cy - 44);
        ctx.stroke();
        const spark = 0.5 + Math.sin(t * 0.055) * 0.5;
        ctx.fillStyle   = `rgba(255,${Math.round(170 + Math.sin(t * 0.04) * 80)},0,${spark})`;
        ctx.shadowColor = '#ffaa00';
        ctx.shadowBlur  = 14;
        ctx.beginPath();
        ctx.arc(cx + 18, cy - 44, 4 + Math.sin(t * 0.065) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // ── Sheer Heart Attack ────────────────────────────────────────────────
    if (a.type === 'sha') {
      const cx = a.x + a.w / 2, cy = a.y + a.h / 2;

      if (a.exploding) {
        const prog = 1 - a.explodeTimer / a.maxExplode;
        _drawCartoonExplosion(ctx, cx, cy, a.playerKill ? 80 : 40, prog, a.playerKill);
      } else {
        const shaImg   = Assets.getSHAImg();
        const hpFrac   = a.hp / a.maxHp;
        const flashing = a.flashTimer > 0 && Math.floor(a.flashTimer * 22) % 2 === 0;

        ctx.save();
        ctx.shadowColor = '#7c3aed';
        ctx.shadowBlur  = 14 + Math.sin(t * 0.008) * 5;

        if (shaImg) {
          if (flashing) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; }
          ctx.drawImage(shaImg, a.x, a.y, a.w, a.h);
        } else {
          // Canvas fallback: dark tank / bomb-on-wheels shape
          // Body
          ctx.fillStyle = flashing ? '#cc3333' : '#1a0a2e';
          ctx.beginPath();
          ctx.ellipse(cx, cy, 18, 14, 0, 0, Math.PI * 2);
          ctx.fill();
          // Skull face
          ctx.fillStyle = flashing ? '#ff8888' : '#9b59b6';
          ctx.beginPath();
          ctx.ellipse(cx, cy - 1, 12, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#000';
          ctx.fillRect(cx - 7, cy - 5, 5, 5);
          ctx.fillRect(cx + 2,  cy - 5, 5, 5);
          ctx.fillRect(cx - 4, cy + 2,  8, 3);
          // Tracks
          ctx.fillStyle = flashing ? '#cc3333' : '#111';
          ctx.fillRect(a.x,             cy - 7, 7, 14);
          ctx.fillRect(a.x + a.w - 7,   cy - 7, 7, 14);
        }

        ctx.shadowBlur = 0;
        ctx.restore();

        // HP bar above SHA
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(a.x, a.y - 8, a.w, 4);
        ctx.fillStyle   = hpFrac > 0.5 ? '#a855f7' : '#ec4899';
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur  = 4;
        ctx.fillRect(a.x, a.y - 8, a.w * hpFrac, 4);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // ── Lightning Beam ───────────────────────────────────────────────────────
    if (a.type === 'beam') {
      ctx.save();
      const cosA = Math.cos(a.angle), sinA = Math.sin(a.angle);
      const ex = a.ox + cosA * a.length, ey = a.oy + sinA * a.length;

      if (a.tracking) {
        const fp = 1 - a.trackTimer / a.maxTrack;
        // Dashed telegraph line — tracks player in real time
        ctx.setLineDash([14, 9]);
        ctx.strokeStyle = `rgba(125,211,252,${0.20 + fp * 0.45})`;
        ctx.lineWidth   = 2 + fp * 3;
        ctx.shadowColor = '#7dd3fc';
        ctx.shadowBlur  = 10 + fp * 18;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(a.ox, a.oy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        // Charge orb at origin
        const orbR = 4 + fp * 10;
        const og = ctx.createRadialGradient(a.ox, a.oy, 0, a.ox, a.oy, orbR * 1.6);
        og.addColorStop(0,   `rgba(220,245,255,${fp * 0.9})`);
        og.addColorStop(0.5, `rgba(125,211,252,${fp * 0.7})`);
        og.addColorStop(1,   'rgba(30,120,210,0)');
        ctx.fillStyle   = og;
        ctx.shadowColor = '#7dd3fc';
        ctx.shadowBlur  = 20 * fp;
        ctx.beginPath();
        ctx.arc(a.ox, a.oy, orbR * 1.6, 0, Math.PI * 2);
        ctx.fill();

      } else if (a.locked) {
        // Solid flashing aim line — direction locked, player can still dodge
        const blink = Math.floor(a.lockTimer * 14) % 2 === 0;
        ctx.lineCap = 'round';
        ctx.strokeStyle = blink ? 'rgba(186,230,253,0.92)' : 'rgba(56,189,248,0.38)';
        ctx.lineWidth   = blink ? 4 : 2;
        ctx.shadowColor = '#7dd3fc';
        ctx.shadowBlur  = blink ? 28 : 8;
        ctx.beginPath();
        ctx.moveTo(a.ox, a.oy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        // Pulsing orb at origin
        const orbR2 = 8 + (blink ? 5 : 0);
        const og2 = ctx.createRadialGradient(a.ox, a.oy, 0, a.ox, a.oy, orbR2 * 1.8);
        og2.addColorStop(0,   blink ? 'rgba(255,255,255,0.9)'  : 'rgba(186,230,253,0.5)');
        og2.addColorStop(0.5, blink ? 'rgba(125,211,252,0.7)'  : 'rgba(56,189,248,0.25)');
        og2.addColorStop(1,   'rgba(30,120,210,0)');
        ctx.fillStyle  = og2;
        ctx.shadowBlur = blink ? 32 : 10;
        ctx.beginPath();
        ctx.arc(a.ox, a.oy, orbR2 * 1.8, 0, Math.PI * 2);
        ctx.fill();

      } else if (a.firing) {
        const prog  = 1 - a.fireTimer / a.maxFire;
        const alpha = Math.max(0, 1 - prog * 1.2);
        ctx.globalAlpha = alpha;
        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';
        // Build jagged bolt path (perpendicular jitter along beam axis)
        const perpX = -sinA, perpY = cosA;
        const nSegs = 18;
        const bpts  = [{ x: a.ox, y: a.oy }];
        for (let i = 1; i < nSegs; i++) {
          const frac = i / nSegs;
          const mx   = a.ox + cosA * a.length * frac;
          const my   = a.oy + sinA * a.length * frac;
          const j    = (Math.random() - 0.5) * 22;
          bpts.push({ x: mx + perpX * j, y: my + perpY * j });
        }
        bpts.push({ x: ex, y: ey });
        const beamPath = () => {
          ctx.beginPath();
          bpts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
        };
        // Outer glow
        ctx.strokeStyle = 'rgba(100,180,255,0.40)';
        ctx.lineWidth   = a.halfW * 2 + 24;
        ctx.shadowColor = '#60a5fa';
        ctx.shadowBlur  = 44;
        beamPath(); ctx.stroke();
        // Core
        ctx.strokeStyle = 'rgba(190,225,255,0.92)';
        ctx.lineWidth   = a.halfW * 2;
        ctx.shadowColor = '#bfdbfe';
        ctx.shadowBlur  = 26;
        beamPath(); ctx.stroke();
        // White center
        ctx.strokeStyle = 'rgba(255,255,255,0.96)';
        ctx.lineWidth   = 7;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur  = 18;
        beamPath(); ctx.stroke();
      }
      ctx.restore();
    }

    // ── Lightning Grid ───────────────────────────────────────────────────────
    if (a.type === 'grid') {
      ctx.save();

      if (a.telegraphTimer > 0) {
        const fp = 1 - a.telegraphTimer / a.maxTelegraph;
        ctx.setLineDash([12, 8]);
        ctx.strokeStyle = `rgba(100,180,255,${0.18 + fp * 0.52})`;
        ctx.lineWidth   = 1.5 + fp * 2.5;
        ctx.shadowColor = '#60a5fa';
        ctx.shadowBlur  = 6 + fp * 16;
        for (const ln of a.lines) {
          ctx.beginPath();
          if (ln.dir === 'h') {
            ctx.moveTo(ROOM.x, ln.pos);
            ctx.lineTo(ROOM.x + ROOM.w, ln.pos);
          } else {
            ctx.moveTo(ln.pos, ROOM.y);
            ctx.lineTo(ln.pos, ROOM.y + ROOM.h);
          }
          ctx.stroke();
        }
        ctx.setLineDash([]);

      } else if (a.activeTimer > 0) {
        const prog  = 1 - a.activeTimer / a.maxActive;
        const alpha = Math.max(0, 1 - prog * 1.3);
        ctx.globalAlpha = alpha;
        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';

        for (const ln of a.lines) {
          const x1 = ln.dir === 'h' ? ROOM.x          : ln.pos;
          const y1 = ln.dir === 'h' ? ln.pos           : ROOM.y;
          const x2 = ln.dir === 'h' ? ROOM.x + ROOM.w : ln.pos;
          const y2 = ln.dir === 'h' ? ln.pos           : ROOM.y + ROOM.h;
          // Perpendicular jitter axis (H lines jitter in Y, V lines jitter in X)
          const px = ln.dir === 'h' ? 0 : 1;
          const py = ln.dir === 'h' ? 1 : 0;
          const lineLen = ln.dir === 'h' ? ROOM.w : ROOM.h;
          const nSegs   = Math.max(8, Math.round(lineLen / 58));
          const gpts    = [{ x: x1, y: y1 }];
          for (let i = 1; i < nSegs; i++) {
            const frac = i / nSegs;
            const mx   = x1 + (x2 - x1) * frac;
            const my   = y1 + (y2 - y1) * frac;
            const j    = (Math.random() - 0.5) * 18;
            gpts.push({ x: mx + px * j, y: my + py * j });
          }
          gpts.push({ x: x2, y: y2 });
          const gridPath = () => {
            ctx.beginPath();
            gpts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
          };
          // Outer glow
          ctx.strokeStyle = 'rgba(100,180,255,0.38)';
          ctx.lineWidth   = a.halfW * 2 + 18;
          ctx.shadowColor = '#60a5fa';
          ctx.shadowBlur  = 32;
          gridPath(); ctx.stroke();
          // Core
          ctx.strokeStyle = 'rgba(190,225,255,0.92)';
          ctx.lineWidth   = a.halfW * 2;
          ctx.shadowColor = '#bfdbfe';
          ctx.shadowBlur  = 18;
          gridPath(); ctx.stroke();
          // White center
          ctx.strokeStyle = 'rgba(255,255,255,0.95)';
          ctx.lineWidth   = 5;
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur  = 12;
          gridPath(); ctx.stroke();
        }
      }

      ctx.restore();
    }

    // ── Gojo: Purple ball ────────────────────────────────────────────────────────
    if (a.type === 'purple_ball') {
      ctx.save();
      // Purple orb visual (image or canvas fallback) — hitbox is full third, only ball visible
      const pImg = Assets.getPurpleBallImg();
      if (pImg) {
        const sz = a.r * 3;
        ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 50;
        ctx.drawImage(pImg, a.cx - sz/2, a.cy - sz/2, sz, sz);
        ctx.shadowBlur = 0;
      } else {
        const g = ctx.createRadialGradient(a.cx, a.cy, 0, a.cx, a.cy, a.r * 1.8);
        g.addColorStop(0,   'rgba(255,255,255,0.95)');
        g.addColorStop(0.2, 'rgba(216,180,254,0.92)');
        g.addColorStop(0.55,'rgba(147,51,234,0.85)');
        g.addColorStop(1,   'rgba(88,28,135,0)');
        ctx.fillStyle   = g;
        ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 55;
        ctx.beginPath(); ctx.arc(a.cx, a.cy, a.r * 1.8, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
      continue;
    }

    // ── Gojo: Barrier punishment purple (vertical) ───────────────────────────────
    if (a.type === 'barrier_purple') {
      ctx.save();
      const pImg2 = Assets.getPurpleBallImg();
      if (pImg2) {
        const sz = a.r * 3;
        ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 60;
        ctx.drawImage(pImg2, a.cx - sz/2, a.cy - sz/2, sz, sz);
        ctx.shadowBlur = 0;
      } else {
        const g = ctx.createRadialGradient(a.cx, a.cy, 0, a.cx, a.cy, a.r * 1.8);
        g.addColorStop(0,   'rgba(255,255,255,0.97)');
        g.addColorStop(0.2, 'rgba(216,180,254,0.95)');
        g.addColorStop(0.55,'rgba(147,51,234,0.90)');
        g.addColorStop(1,   'rgba(88,28,135,0)');
        ctx.fillStyle   = g;
        ctx.shadowColor = '#c4b5fd'; ctx.shadowBlur = 65;
        ctx.beginPath(); ctx.arc(a.cx, a.cy, a.r * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      // Vertical trail particles above/below
      const trailDir = a.vy > 0 ? -1 : 1;
      for (let i = 1; i <= 4; i++) {
        const ty = a.cy + trailDir * i * a.r * 0.7;
        const ta = 0.4 - i * 0.08;
        const tr = a.r * (1.1 - i * 0.18);
        const tg = ctx.createRadialGradient(a.cx, ty, 0, a.cx, ty, tr);
        tg.addColorStop(0,   `rgba(216,180,254,${ta})`);
        tg.addColorStop(1,   'rgba(88,28,135,0)');
        ctx.fillStyle = tg;
        ctx.beginPath(); ctx.arc(a.cx, ty, tr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      continue;
    }

    // ── Gojo: Blue orb (left-wall pull distortion) ──────────────────────────────
    if (a.type === 'blue_orb') {
      ctx.save();

      // Spawn progress: 0 → 1 over spawnDuration (ease-out cubic)
      const spawnRaw  = a.spawnDuration > 0
        ? Math.min(1, 1 - a.spawnTimer / a.spawnDuration)
        : 1;
      const spawnProg = spawnRaw * spawnRaw * (3 - 2 * spawnRaw); // smoothstep
      const spawning  = spawnProg < 1;

      const fadeAlpha = a.life < 0.8 ? a.life / 0.8 : 1;
      const drawAlpha = spawning ? spawnProg : fadeAlpha;

      // ── Spawn ripple pulses (two expanding rings that fire at the end of spawn) ──
      if (spawning && spawnProg > 0.55) {
        const ripT  = (spawnProg - 0.55) / 0.45; // 0→1 over last 45% of spawn
        for (let ri = 0; ri < 2; ri++) {
          const delay = ri * 0.18;
          const rT    = Math.max(0, ripT - delay) / (1 - delay);
          if (rT <= 0) continue;
          const ringR = a.r * 6 * (1 + rT * 2.2);
          const ringA = (1 - rT) * 0.7;
          ctx.strokeStyle = `rgba(125,211,252,${ringA})`;
          ctx.lineWidth   = 2.5 - rT * 1.5;
          ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 20;
          ctx.beginPath(); ctx.arc(a.cx, a.cy, ringR, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      // Rightward wind particles (only once fully spawned)
      if (!spawning && a.windParticles) {
        for (const wp of a.windParticles) {
          ctx.fillStyle   = `rgba(125,211,252,${wp.alpha * fadeAlpha})`;
          ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 5;
          ctx.beginPath(); ctx.arc(wp.x, wp.y, 2, 0, Math.PI*2); ctx.fill();
        }
      }

      // Pulse state — warn player 0.6s before a pulse fires, brighten during active
      const pulseWarn   = !spawning && !a.pulseActive && a.pulseTimer < 0.6;
      const warnFrac    = pulseWarn ? 1 - (a.pulseTimer / 0.6) : 0;  // 0→1 as pulse approaches
      const pulseIntens = a.pulseActive
        ? (a.pulseActiveTimer / a.pulseActiveDur)   // 1→0 fade-out during pulse
        : warnFrac * 0.45;                          // gentle brightening before pulse

      // Active-pulse expanding ring
      if (a.pulseActive) {
        const pT    = 1 - (a.pulseActiveTimer / a.pulseActiveDur); // 0→1 during pulse
        const ringR = a.r * 6 * (1 + pT * 1.8);
        const ringA = (1 - pT) * 0.85;
        ctx.strokeStyle = `rgba(125,211,252,${ringA * drawAlpha})`;
        ctx.lineWidth   = 3;
        ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.arc(a.cx, a.cy, ringR, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur  = 0;
      }

      // Distortion rings — scale with spawn, wobble normally, brighten on pulse/warn
      const ringScale   = spawning ? spawnProg : 1;
      const ringBright  = 0.30 + pulseIntens * 0.55;
      for (let ri = 0; ri < 4; ri++) {
        const baseR = a.r * (3.0 + ri * 1.5) * ringScale;
        const ringR = baseR + (spawning ? 0 : Math.sin(t * 0.007 + ri * 2.1) * 8);
        ctx.strokeStyle = `rgba(56,189,248,${(ringBright - ri * 0.06) * drawAlpha})`;
        ctx.lineWidth   = (2.5 - ri * 0.4) + pulseIntens * 1.2;
        ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 14 + pulseIntens * 18;
        ctx.beginPath(); ctx.arc(a.cx, a.cy, ringR, 0, Math.PI*2); ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // Core orb — scales up from nothing
      const bImg = Assets.getBlueOrbImg();
      if (bImg) {
        const sz = a.r * 6 * (spawning ? spawnProg : 1);
        ctx.globalAlpha = drawAlpha;
        ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 50;
        ctx.drawImage(bImg, a.cx - sz/2, a.cy - sz/2, sz, sz);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      } else {
        const gr = a.r * 4.5 * (spawning ? spawnProg : 1);
        const g  = ctx.createRadialGradient(a.cx, a.cy, 0, a.cx, a.cy, gr);
        g.addColorStop(0,   `rgba(255,255,255,${0.95 * drawAlpha})`);
        g.addColorStop(0.2, `rgba(186,230,253,${0.92 * drawAlpha})`);
        g.addColorStop(0.4, `rgba(125,211,252,${0.80 * drawAlpha})`);
        g.addColorStop(0.7, `rgba(14,165,233,${0.50 * drawAlpha})`);
        g.addColorStop(1,   'rgba(2,132,199,0)');
        ctx.fillStyle   = g;
        ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 50;
        ctx.beginPath(); ctx.arc(a.cx, a.cy, gr, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.restore();
      continue;
    }

    // ── Gojo: Red ball (volleyball) ─────────────────────────────────────────────
    if (a.type === 'red_ball') {
      ctx.save();
      const rImg  = Assets.getRedBallImg();
      const pulse = 0.9 + Math.sin(t * 0.014) * 0.1;
      if (rImg) {
        const sz = a.r * 3.2 * pulse;
        ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 36;
        ctx.drawImage(rImg, a.cx - sz/2, a.cy - sz/2, sz, sz);
        ctx.shadowBlur = 0;
      } else {
        const g = ctx.createRadialGradient(a.cx, a.cy, 0, a.cx, a.cy, a.r * 2.0 * pulse);
        g.addColorStop(0,   'rgba(255,255,255,0.96)');
        g.addColorStop(0.2, 'rgba(252,165,165,0.92)');
        g.addColorStop(0.5, 'rgba(239,68,68,0.88)');
        g.addColorStop(0.8, 'rgba(185,28,28,0.6)');
        g.addColorStop(1,   'rgba(127,29,29,0)');
        ctx.fillStyle   = g;
        ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 36;
        ctx.beginPath(); ctx.arc(a.cx, a.cy, a.r * 2.0 * pulse, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      // Bounce progress pips below ball (how many of requiredBounces hit so far)
      const pipSpacing = 12, pipR = 4;
      const total = a.requiredBounces;
      for (let i = 0; i < total; i++) {
        const px = a.cx - (total-1)*pipSpacing/2 + i*pipSpacing;
        const py = a.cy + a.r * 2.4;
        ctx.fillStyle   = i < a.bounceCount ? '#ef4444' : 'rgba(255,255,255,0.3)';
        ctx.shadowColor = '#ef4444'; ctx.shadowBlur = i < a.bounceCount ? 10 : 0;
        ctx.beginPath(); ctx.arc(px, py, pipR, 0, Math.PI*2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
      continue;
    }
  }
}

// ─── Draw boss sprite ──────────────────────────────────────────────────────────

function _drawBoss(ctx, t) {
  const b = gp.boss;
  if (!b) return;
  if      (b.type === 'kira') _drawKiraSprite(ctx, t, b);
  else if (b.type === 'enel') _drawEnelSprite(ctx, t, b);
  else if (b.type === 'gojo') _drawGojoSprite(ctx, t, b);
}

function _drawGojoSprite(ctx, t, b) {
  ctx.save();
  // IT animation: fade out on departure, fade in on arrival
  if (b.returnLanding) {
    const DEPART_END = 0.28, TOTAL = 0.58;
    if (!b.itDeparted) {
      ctx.globalAlpha = Math.max(0, 1 - b.returnTimer / DEPART_END);
    } else {
      ctx.globalAlpha = Math.min(1, (b.returnTimer - DEPART_END) / (TOTAL - DEPART_END));
    }
  }
  const cx = b.x + b.w/2, cy = b.y + b.h/2;
  const dying = b.isDead && b.deathTimer > 0;

  // ── Death Phase A: Infinity shatters (1.0s, deathTimer 3.4→2.4) ─────────────
  if (dying && b.deathTimer > 2.4) {
    const prog = 1 - (b.deathTimer - 2.4) / 1.0;
    // Shard explosion — expanding hexagonal rings fracturing outward
    const nRings = 3;
    for (let ri = 0; ri < nRings; ri++) {
      const rProg = Math.max(0, prog - ri * 0.18);
      if (rProg <= 0) continue;
      const ringR = 20 + rProg * (80 + ri * 30);
      const rA    = Math.max(0, 0.8 - rProg * 1.1);
      ctx.strokeStyle = `rgba(167,139,250,${rA})`;
      ctx.lineWidth   = 3 - ri;
      ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 24;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + ri * 0.5;
        const rx  = cx + Math.cos(ang) * ringR;
        const ry  = cy + Math.sin(ang) * ringR;
        i === 0 ? ctx.moveTo(rx, ry) : ctx.lineTo(rx, ry);
      }
      ctx.closePath(); ctx.stroke();
    }
    // Central purple burst
    const burstG = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20 + prog * 80);
    burstG.addColorStop(0,   `rgba(255,255,255,${0.9 * (1-prog)})`);
    burstG.addColorStop(0.35,`rgba(192,132,252,${0.75 * (1-prog)})`);
    burstG.addColorStop(1,   'rgba(88,28,135,0)');
    ctx.fillStyle = burstG; ctx.shadowBlur = 40;
    ctx.beginPath(); ctx.arc(cx, cy, 20 + prog*80, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    // Polygon shards fly outward
    const nShards = 10;
    for (let i = 0; i < nShards; i++) {
      const ang  = (i / nShards) * Math.PI * 2 + 0.3;
      const dist = prog * prog * 140;
      const sx   = cx + Math.cos(ang) * dist;
      const sy   = cy + Math.sin(ang) * dist;
      const sA   = Math.max(0, 0.85 - prog * 1.0);
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(ang + prog * 3);
      ctx.fillStyle   = `rgba(167,139,250,${sA})`;
      ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(4, 2); ctx.lineTo(-4, 2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // Gojo (death image) fading
    const dImg = Assets.getGojoDeathImg() || Assets.getGojoImg();
    if (dImg) {
      const vs = 1.8, dw = b.w*vs, dh = b.h*vs;
      ctx.globalAlpha = 1 - prog * 0.6;
      ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 30;
      ctx.drawImage(dImg, cx - dw/2, cy - dh/2, dw, dh);
      ctx.shadowBlur = 0;
    } else {
      ctx.globalAlpha = 1 - prog * 0.6;
      _drawGojoFallback(ctx, b, cx, cy, false);
    }
    ctx.restore();
    return;
  }

  // ── Death Phase B: white/purple flash (0.5s, deathTimer 2.4→1.9) ────────────
  if (dying && b.deathTimer > 1.9) {
    const flashProg = 1 - (b.deathTimer - 1.9) / 0.5;
    const flashA    = Math.max(0, 1 - flashProg * 1.4);
    ctx.globalAlpha = flashA;
    const blastR = 70 + flashProg * 90;
    const blastG = ctx.createRadialGradient(cx, cy, 0, cx, cy, blastR);
    blastG.addColorStop(0,   'rgba(255,255,255,1)');
    blastG.addColorStop(0.3, 'rgba(216,180,254,0.9)');
    blastG.addColorStop(1,   'rgba(139,92,246,0)');
    ctx.fillStyle   = blastG;
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 70;
    ctx.beginPath(); ctx.arc(cx, cy, blastR, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    // Gojo death face fades in
    const dImg2 = Assets.getGojoDeathImg() || Assets.getGojoImg();
    ctx.globalAlpha = Math.min(1, flashProg * 2.2);
    if (dImg2) { const vs=1.8,dw=b.w*vs,dh=b.h*vs; ctx.drawImage(dImg2,cx-dw/2,cy-dh/2,dw,dh); }
    else        { _drawGojoFallback(ctx, b, cx, cy, false); }
    ctx.restore();
    return;
  }

  // ── Death Phase C: Team Rocket launch upward (1.9s) ─────────────────────────
  if (dying) {
    const launchT    = 1.9 - b.deathTimer;
    const launchProg = launchT / 1.9;
    const lx   = b.launchX0 + launchProg * 30;
    const ly   = b.launchY0 - launchProg * launchProg * 950;
    const spin = launchProg * Math.PI * 9;
    const alph = Math.max(0, 1 - Math.max(0, launchProg - 0.75) / 0.25);
    // Particle trail
    const nTrail = 18;
    for (let i = 0; i < nTrail; i++) {
      const tf  = Math.max(0, launchProg - i * 0.04);
      if (tf <= 0) continue;
      const tx  = b.launchX0 + tf * 30;
      const ty  = b.launchY0 - tf * tf * 950;
      const ta  = Math.max(0, 0.55 - i * 0.032);
      const tc  = i % 2 === 0 ? '#a78bfa' : '#60a5fa';
      ctx.fillStyle   = tc;
      ctx.shadowColor = tc; ctx.shadowBlur = 12;
      ctx.globalAlpha = ta;
      ctx.beginPath(); ctx.arc(tx, ty, 5 - i*0.2, 0, Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alph;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(spin);
    const dImg3 = Assets.getGojoDeathImg() || Assets.getGojoImg();
    const vs=1.8, dw=b.w*vs, dh=b.h*vs;
    if (dImg3) { ctx.drawImage(dImg3, -dw/2, -dh/2, dw, dh); }
    else        { _drawGojoFallback(ctx, b, 0, 0, false); }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }

  // ── Normal rendering ─────────────────────────────────────────────────────────
  const flash = b.flashTimer > 0 && Math.floor(b.flashTimer * 24) % 2 === 0;

  // Infinity passive aura (two slowly rotating hexagons)
  const pulse = 0.28 + Math.sin(t * 0.0022) * 0.14;
  for (let ring = 0; ring < 2; ring++) {
    const rr  = 46 + ring * 22;
    const rot = t * (ring === 0 ? 0.00038 : -0.00028);
    ctx.strokeStyle = `rgba(167,139,250,${pulse * 0.38 / (ring+1)})`;
    ctx.lineWidth   = 1.5 - ring * 0.4;
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + rot;
      i === 0 ? ctx.moveTo(cx + Math.cos(ang)*rr, cy + Math.sin(ang)*rr)
              : ctx.lineTo(cx + Math.cos(ang)*rr, cy + Math.sin(ang)*rr);
    }
    ctx.closePath(); ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Infinity ripples (from blocked attacks)
  for (const rp of b.infinityRipples) {
    ctx.strokeStyle = `rgba(167,139,250,${rp.alpha})`;
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(cx, cy, rp.r, 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Hollow Purple charge orb building above sprite
  if (b.purpleState === 'charging') {
    const cp  = 1 - b.purpleChargeTimer / 1.6;
    const orbR = 6 + cp * 26;
    const oG   = ctx.createRadialGradient(cx, cy - b.h * 0.72, 0, cx, cy - b.h * 0.72, orbR * 1.5);
    oG.addColorStop(0,   `rgba(255,255,255,${0.9 * cp})`);
    oG.addColorStop(0.35,`rgba(192,132,252,${0.85 * cp})`);
    oG.addColorStop(1,   'rgba(88,28,135,0)');
    ctx.fillStyle   = oG;
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 40 * cp;
    ctx.beginPath(); ctx.arc(cx, cy - b.h * 0.72, orbR * 1.5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ── Infinity Barrier wall ──────────────────────────────────────────────────────
  if (b.stunTimer <= 0 && !b.returnLanding && !b.isDead) {
    _drawGojoBarrier(ctx, t, b);
  }

  // Spin landing is drawn by _drawGojoStunOverlay (after player) — skip normal sprite
  if (b.spinLanding) { ctx.restore(); return; }

  // Sprite
  // Attack poses: purple only while charging; red only while catching/throwing (gojoReturnDelay)
  const redPose    = gp.bossAttacks.some(a => a.type === 'red_ball' && a.gojoReturnDelay > 0);
  const spriteImg  = b.purpleState === 'charging' ? (Assets.getGojoPurpleImg() || Assets.getGojoImg())
                   : redPose                       ? (Assets.getGojoRedImg()    || Assets.getGojoImg())
                   : Assets.getGojoImg();
  const vs = 1.8, dw = b.w*vs, dh = b.h*vs;
  if (spriteImg) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = flash ? 30 : 14;
    ctx.drawImage(spriteImg, cx - dw/2, cy - dh/2, dw, dh);
    ctx.shadowBlur = 0;
  } else {
    _drawGojoFallback(ctx, b, cx, cy, flash);
  }

  // Flash tint
  if (flash) {
    ctx.fillStyle = 'rgba(192,132,252,0.48)';
    ctx.beginPath(); roundRect(ctx, b.x, b.y, b.w, b.h, 4); ctx.fill();
  }

  ctx.restore();
}

// Instant Transmission visual: departure rings + arrival rings around Gojo's teleport
function _drawGojoIT(ctx, b) {
  if (!b.returnLanding) return;
  const DEPART_END = 0.28;
  const TOTAL      = 0.58;
  const prog = b.returnTimer;
  ctx.save();

  if (!b.itDeparted) {
    // Departure: expanding rings from where Gojo was, white/purple flash
    const dFrac = prog / DEPART_END;
    const cx = b.itDepartX, cy = b.itDepartY;
    for (let i = 0; i < 4; i++) {
      const rp = Math.max(0, Math.min(1, dFrac * 1.6 - i * 0.25));
      if (rp <= 0) continue;
      const radius = rp * 130;
      const alpha  = (1 - rp) * (i === 0 ? 0.9 : 0.5);
      ctx.strokeStyle = i < 2 ? `rgba(255,255,255,${alpha})` : `rgba(167,139,250,${alpha})`;
      ctx.lineWidth   = 3 - i * 0.5;
      ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    }
    // Central white flash
    const flashAlpha = Math.max(0, 1 - dFrac * 2.5) * 0.7;
    if (flashAlpha > 0) {
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
      fg.addColorStop(0, `rgba(255,255,255,${flashAlpha})`);
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    // Arrival: rings burst outward at anchor position
    const aFrac = (prog - DEPART_END) / (TOTAL - DEPART_END);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (let i = 0; i < 4; i++) {
      const rp = Math.max(0, Math.min(1, aFrac * 1.6 - i * 0.2));
      if (rp <= 0) continue;
      const radius = rp * 110;
      const alpha  = (1 - rp) * (i === 0 ? 0.85 : 0.45);
      ctx.strokeStyle = i < 2 ? `rgba(255,255,255,${alpha})` : `rgba(167,139,250,${alpha})`;
      ctx.lineWidth   = 3 - i * 0.5;
      ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    }
    // Arrival flash — bright centre that quickly fades
    const flashAlpha = Math.max(0, 1 - aFrac * 3) * 0.8;
    if (flashAlpha > 0) {
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 50);
      fg.addColorStop(0, `rgba(255,255,255,${flashAlpha})`);
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

// Drawn AFTER _drawPlayer so stun effects appear on top of the character sprite
function _drawGojoStunOverlay(ctx, t, b) {
  if (!b || b.type !== 'gojo') return;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const flash = b.flashTimer > 0;

  // Stars orbiting above Gojo's head during stun
  if (b.stunTimer > 0 && !b.spinLanding) {
    const headTop = cy - b.h * 0.52;
    const nStars  = 5;
    const orbitRx = 32, orbitRy = 10;
    ctx.save();
    for (let i = 0; i < nStars; i++) {
      const ang = b.stunStarAngle + (i / nStars) * Math.PI * 2;
      const sx  = cx + Math.cos(ang) * orbitRx;
      const sy  = headTop + Math.sin(ang) * orbitRy;
      const sz  = 7 + Math.sin(ang + Math.PI / 2) * 2;
      ctx.shadowColor = '#fde047'; ctx.shadowBlur = 12;
      ctx.fillStyle   = '#fef08a';
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const r = k % 2 === 0 ? sz : sz * 0.42;
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        k === 0 ? ctx.moveTo(sx + Math.cos(a)*r, sy + Math.sin(a)*r)
                : ctx.lineTo(sx + Math.cos(a)*r, sy + Math.sin(a)*r);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Spin landing: ghost trail + spinning Gojo sprite
  if (b.spinLanding) {
    const vs = 1.8, dw = b.w * vs, dh = b.h * vs;
    const spriteImg = Assets.getGojoImg();
    const ghostAlphas = [0.3, 0.2, 0.1];
    for (let gi = 0; gi < ghostAlphas.length; gi++) {
      const ghostAngle = b.spinAngle - (gi + 1) * 0.5;
      ctx.save();
      ctx.globalAlpha = ghostAlphas[gi];
      ctx.translate(cx, cy);
      ctx.rotate(ghostAngle);
      ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 20;
      if (spriteImg) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(spriteImg, -dw/2, -dh/2, dw, dh);
      } else {
        _drawGojoFallback(ctx, b, 0, 0, false);
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(b.spinAngle);
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = flash ? 30 : 20;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (spriteImg) {
      ctx.drawImage(spriteImg, -dw/2, -dh/2, dw, dh);
    } else {
      _drawGojoFallback(ctx, b, 0, 0, flash);
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function _drawGojoFallback(ctx, b, cx, cy, flash) {
  ctx.save();
  const s = b.h / 80;
  // Robe
  ctx.fillStyle = flash ? '#c4b5fd' : '#f0f0f0';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10*s, 20*s, 30*s, 0, 0, Math.PI*2);
  ctx.fill();
  // Head
  ctx.fillStyle = flash ? '#c4b5fd' : '#f5f5dc';
  ctx.beginPath(); ctx.arc(cx, cy - 22*s, 16*s, 0, Math.PI*2); ctx.fill();
  // Black blindfold
  ctx.fillStyle = '#0f0f1a';
  ctx.fillRect(cx - 18*s, cy - 29*s, 36*s, 10*s);
  // Six Eyes glow through cloth
  for (let i = -2; i <= 2; i++) {
    ctx.fillStyle = 'rgba(192,132,252,0.52)';
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(cx + i*7*s, cy - 24*s, 1.8*s, 0, Math.PI*2); ctx.fill();
  }
  ctx.shadowBlur = 0;
  // White spiky hair
  ctx.fillStyle = flash ? '#c4b5fd' : '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy - 36*s, 15*s, Math.PI, Math.PI*2); ctx.fill();
  ctx.restore();
}

function _drawGojoBarrier(ctx, t, b) {
  ctx.save();
  const bx     = GOJO_BARRIER_X;
  const pulse  = 0.45 + Math.sin(t * 0.0055) * 0.22;
  const hh     = ROOM.h;
  const by     = ROOM.y;

  // Proximity factor: 0 when far away, 1 when right at the barrier
  const playerCx   = gp.player.x + PW / 2;
  const distToWall = Math.max(0, bx - playerCx);
  const proxRange  = 420;  // within this px range the barrier becomes visible
  const proxFactor = Math.max(0, 1 - distToWall / proxRange); // 0…1, nonlinear feel
  const proxEased  = proxFactor * proxFactor;                  // ease-in so it stays subtle far away

  // Base alpha: very faint (glass) at full distance, fully drawn when close
  const baseAlpha  = 0.04 + proxEased * 0.96;

  // Refraction / glass-pane shimmer: faint wavy vertical bands
  const shimmerCols = 5;
  for (let sc = 0; sc < shimmerCols; sc++) {
    const sx     = bx - 14 + sc * 6 + Math.sin(t * 0.004 + sc * 1.3) * 3;
    const sAlpha = (0.015 + proxEased * 0.07) * (0.5 + 0.5 * Math.sin(t * 0.006 + sc * 2.1));
    const sg     = ctx.createLinearGradient(sx, by, sx, by + hh);
    sg.addColorStop(0,   `rgba(255,255,255,0)`);
    sg.addColorStop(0.2, `rgba(255,255,255,${sAlpha})`);
    sg.addColorStop(0.5, `rgba(200,185,255,${sAlpha * 1.4})`);
    sg.addColorStop(0.8, `rgba(255,255,255,${sAlpha})`);
    sg.addColorStop(1,   `rgba(255,255,255,0)`);
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 2, by, 5, hh);
  }

  // Hexagonal tile grid along the barrier line
  const hexH = 42, hexW = 24;
  const nRows = Math.ceil(hh / hexH) + 1;
  for (let row = 0; row < nRows; row++) {
    const offset = (row % 2) * hexW / 2;
    const hy = by + row * hexH - hexH / 2;
    const hx = bx - hexW / 2 + offset;
    const alpha = baseAlpha * (0.12 + pulse * 0.10) * (0.6 + 0.4 * Math.sin(t * 0.003 + row * 0.7));
    ctx.strokeStyle = `rgba(167,139,250,${alpha})`;
    ctx.lineWidth   = 1;
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = proxEased > 0.1 ? 8 : 2;
    ctx.beginPath();
    for (let k = 0; k <= 6; k++) {
      const ang = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const px  = hx + Math.cos(ang) * hexW / 2;
      const py  = hy + Math.sin(ang) * hexH / 2;
      k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  }

  // Main energy column — scaled by proximity
  const colAlphaA = baseAlpha * (0.22 + pulse * 0.14);
  const colAlphaB = baseAlpha * (0.38 + pulse * 0.20);
  const colGrad = ctx.createLinearGradient(bx - 10, 0, bx + 10, 0);
  colGrad.addColorStop(0,   'rgba(124,58,237,0)');
  colGrad.addColorStop(0.35, `rgba(167,139,250,${colAlphaA})`);
  colGrad.addColorStop(0.5,  `rgba(196,181,253,${colAlphaB})`);
  colGrad.addColorStop(0.65, `rgba(167,139,250,${colAlphaA})`);
  colGrad.addColorStop(1,   'rgba(124,58,237,0)');
  ctx.fillStyle   = colGrad;
  ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 10 + proxEased * 12;
  ctx.fillRect(bx - 10, by, 20, hh);

  // Glass edge highlight — thin bright lines at barrier edges, proximity-only
  if (proxEased > 0.05) {
    const edgeA = proxEased * 0.18;
    const eGrad = ctx.createLinearGradient(0, by, 0, by + hh);
    eGrad.addColorStop(0,   `rgba(255,255,255,0)`);
    eGrad.addColorStop(0.15, `rgba(255,255,255,${edgeA})`);
    eGrad.addColorStop(0.5,  `rgba(220,210,255,${edgeA * 1.2})`);
    eGrad.addColorStop(0.85, `rgba(255,255,255,${edgeA})`);
    eGrad.addColorStop(1,   `rgba(255,255,255,0)`);
    ctx.fillStyle = eGrad;
    ctx.shadowBlur = 0;
    ctx.fillRect(bx - 12, by, 2, hh);
    ctx.fillRect(bx + 10, by, 2, hh);
  }

  // Barrier hit ripples — dramatic hex bursts at impact points
  for (const hit of b.barrierHits) {
    const prog = 1 - hit.alpha;
    const rings = 3;
    for (let ri = 0; ri < rings; ri++) {
      const rDelay = ri * 0.22;
      if (prog < rDelay) continue;
      const rp    = (prog - rDelay) / (1 - rDelay);
      const rr    = 12 + rp * (50 + ri * 20);
      const rA    = hit.alpha * Math.max(0, 0.8 - rp * 0.9) / (ri + 1);
      ctx.strokeStyle = `rgba(196,181,253,${rA})`;
      ctx.lineWidth   = 2 - ri * 0.5;
      ctx.shadowColor = '#c4b5fd'; ctx.shadowBlur = 20;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const ang = (k / 6) * Math.PI * 2 + prog * 2;
        const px  = bx + Math.cos(ang) * rr;
        const py  = hit.y + Math.sin(ang) * rr * 0.7;
        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
    }
    // Shockwave sparks
    if (prog < 0.6) {
      const nSparks = 8;
      for (let si = 0; si < nSparks; si++) {
        const sang = (si / nSparks) * Math.PI * 2 + prog;
        const sdist = prog * 65;
        const sx = bx + Math.cos(sang) * sdist * 0.5;
        const sy = hit.y + Math.sin(sang) * sdist;
        const sA = hit.alpha * Math.max(0, 0.9 - prog * 1.5);
        ctx.fillStyle   = `rgba(255,255,255,${sA})`;
        ctx.shadowColor = '#c4b5fd'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI*2); ctx.fill();
      }
    }
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function _drawKiraSprite(ctx, t, b) {
  const flash = b.flashTimer > 0 && Math.floor(b.flashTimer * 24) % 2 === 0;

  // ── Death Phase A: sprite + cartoon explosion (first 0.5s of 2.2s total) ────
  if (b.isDead && b.deathTimer > 1.7) {
    const prog = 1 - (b.deathTimer - 1.7) / 0.5;
    // Draw Kira at his death position first (behind explosion)
    ctx.save();
    const img = Assets.getKiraImg();
    if (img) {
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const maxW = b.w * 1.8, maxH = b.h * 1.8;
      const s  = Math.min(maxW / iw, maxH / ih);
      const dw = iw * s, dh = ih * s;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.shadowColor = '#7c3aed';
      ctx.shadowBlur  = 26;
      ctx.drawImage(img, b.launchX0 - dw / 2, b.launchY0 - dh / 2, dw, dh);
    } else {
      ctx.fillStyle = '#1a1a2e';
      roundRect(ctx, b.launchX0 - b.w / 2, b.launchY0 - b.h / 2, b.w, b.h, 4);
      ctx.fill();
    }
    ctx.restore();
    // Explosion on top
    _drawCartoonExplosion(ctx, b.launchX0, b.launchY0, 110, prog, true);
    return;
  }

  // ── Death Phase B: Team Rocket launch (remaining 1.7s) ─────────────────────
  if (b.isDead) {
    const launchT    = 1.7 - b.deathTimer;
    const launchProg = launchT / 1.7;
    const lx    = b.launchX0 + launchProg * 90;
    const ly    = b.launchY0 - launchProg * launchProg * 920;
    const spin  = launchProg * Math.PI * 9;
    const alpha = Math.max(0, 1 - Math.max(0, launchProg - 0.72) / 0.28);

    ctx.save();

    // Alternating purple + red particle trail
    for (let i = 8; i >= 1; i--) {
      const tBack = Math.max(0, launchT - i * 0.065);
      const tf    = tBack / 1.7;
      const tx    = b.launchX0 + tf * 90;
      const ty    = b.launchY0 - tf * tf * 920;
      ctx.globalAlpha = alpha * ((9 - i) / 8) * 0.5;
      ctx.fillStyle   = i % 2 === 0 ? '#7c3aed' : '#dc2626';
      ctx.shadowColor = i % 2 === 0 ? '#7c3aed' : '#dc2626';
      ctx.shadowBlur  = 12;
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(1.5, 5.5 - i * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = alpha;

    // Spin and draw Kira centered at (lx, ly)
    ctx.translate(lx, ly);
    ctx.rotate(spin);

    const img = Assets.getKiraImg();
    if (img) {
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const maxW = b.w * 1.8, maxH = b.h * 1.8;
      const s  = Math.min(maxW / iw, maxH / ih);
      const dw = iw * s, dh = ih * s;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.shadowColor = '#7c3aed';
      ctx.shadowBlur  = 24;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    } else {
      ctx.fillStyle = '#1a1a2e';
      roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 4);
      ctx.fill();
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(-4, -b.h / 4, 8, b.h / 2);
    }

    ctx.restore();
    return;
  }

  // ── Normal (alive) drawing ──────────────────────────────────────────────────
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;

  const img = Assets.getKiraImg();
  ctx.save();

  if (img) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const maxW = b.w * 1.8, maxH = b.h * 1.8;
    const s  = Math.min(maxW / iw, maxH / ih);
    const dw = iw * s, dh = ih * s;
    const dx = cx - dw / 2, dy = cy - dh / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.shadowColor = '#7c3aed';
    ctx.shadowBlur  = 26 + Math.sin(t * 0.003) * 8;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.shadowBlur = 0;
    if (flash) {
      ctx.fillStyle = 'rgba(255,50,50,0.45)';
      ctx.fillRect(dx, dy, dw, dh);
    }
    ctx.restore();
    return;
  }

  const suitC = flash ? '#cc3333' : '#1a1a2e';
  const suitH = flash ? '#dd4444' : '#252545';

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(cx, b.y + b.h + 5, b.w * 0.42, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Purple aura glow
  ctx.shadowColor = '#7c3aed';
  ctx.shadowBlur  = 26 + Math.sin(t * 0.003) * 8;

  const bodyX = b.x + 6, bodyY = b.y + 22;
  const bodyW = b.w - 12, bodyH = b.h - 22;

  // Suit body
  ctx.fillStyle = suitC;
  roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 4);
  ctx.fill();

  // Pinstripes
  if (!flash) {
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1;
    for (let sx = bodyX + 8; sx < bodyX + bodyW - 4; sx += 9) {
      ctx.beginPath();
      ctx.moveTo(sx, bodyY);
      ctx.lineTo(sx, bodyY + bodyH);
      ctx.stroke();
    }
    ctx.shadowColor = '#7c3aed';
    ctx.shadowBlur  = 26 + Math.sin(t * 0.003) * 8;
  }

  // Suit shading overlay
  const sG = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW, bodyY);
  sG.addColorStop(0,   'rgba(0,0,0,0.42)');
  sG.addColorStop(0.2, 'rgba(0,0,0,0.08)');
  sG.addColorStop(0.5, 'rgba(255,255,255,0.03)');
  sG.addColorStop(0.8, 'rgba(0,0,0,0.08)');
  sG.addColorStop(1,   'rgba(0,0,0,0.38)');
  ctx.fillStyle = sG;
  roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 4);
  ctx.fill();

  // Lapels
  ctx.fillStyle = suitH;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(cx - 6, bodyY);
  ctx.lineTo(cx - 10, bodyY + 16);
  ctx.lineTo(cx, bodyY + 12);
  ctx.lineTo(cx + 10, bodyY + 16);
  ctx.lineTo(cx + 6, bodyY);
  ctx.closePath();
  ctx.fill();

  // Gold tie
  ctx.fillStyle   = '#ca8a04';
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  ctx.moveTo(cx - 3, bodyY + 12);
  ctx.lineTo(cx + 3, bodyY + 12);
  ctx.lineTo(cx + 5, bodyY + 30);
  ctx.lineTo(cx,     bodyY + 36);
  ctx.lineTo(cx - 5, bodyY + 30);
  ctx.closePath();
  ctx.fill();

  // Crown insignia (Killer Queen)
  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth   = 1.5;
  ctx.shadowColor = '#fde68a';
  ctx.shadowBlur  = 6;
  const kqy = bodyY + 20;
  ctx.beginPath();
  ctx.moveTo(cx - 5, kqy + 8);
  ctx.lineTo(cx - 5, kqy);
  ctx.lineTo(cx - 2, kqy + 3);
  ctx.lineTo(cx,     kqy - 2);
  ctx.lineTo(cx + 2, kqy + 3);
  ctx.lineTo(cx + 5, kqy);
  ctx.lineTo(cx + 5, kqy + 8);
  ctx.closePath();
  ctx.stroke();

  // Head oval
  ctx.shadowColor = '#7c3aed';
  ctx.shadowBlur  = 20;
  ctx.fillStyle   = flash ? '#dd5555' : '#e8c5a0';
  ctx.beginPath();
  ctx.ellipse(cx, b.y + 14, 13, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neck
  ctx.fillStyle = flash ? '#dd5555' : '#e8c5a0';
  ctx.shadowBlur = 0;
  ctx.fillRect(cx - 5, b.y + 19, 10, 8);

  // Eyes
  ctx.fillStyle = '#1e3a5f';
  ctx.fillRect(cx - 9, b.y + 10, 6, 5);
  ctx.fillRect(cx + 3, b.y + 10, 6, 5);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(cx - 8, b.y + 11, 4, 3);
  ctx.fillRect(cx + 4, b.y + 11, 4, 3);
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - 7, b.y + 11, 2, 3);
  ctx.fillRect(cx + 5, b.y + 11, 2, 3);

  // Smirk
  ctx.strokeStyle = '#a07050';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 4, b.y + 20);
  ctx.quadraticCurveTo(cx, b.y + 22, cx + 5, b.y + 19);
  ctx.stroke();

  // Hair (blonde)
  ctx.fillStyle   = flash ? '#ee4444' : '#e2c84a';
  ctx.shadowColor = '#fcd34d';
  ctx.shadowBlur  = 5;
  ctx.beginPath();
  ctx.moveTo(cx - 12, b.y + 8);
  ctx.quadraticCurveTo(cx - 8, b.y - 6, cx, b.y - 5);
  ctx.quadraticCurveTo(cx + 10, b.y - 6, cx + 13, b.y + 7);
  ctx.quadraticCurveTo(cx + 8, b.y - 2, cx, b.y - 3);
  ctx.quadraticCurveTo(cx - 8, b.y - 2, cx - 12, b.y + 8);
  ctx.closePath();
  ctx.fill();

  // Arms
  ctx.shadowBlur = 0;
  ctx.fillStyle  = suitC;
  ctx.fillRect(b.x + 1, bodyY + 3, 7, 22);
  ctx.fillRect(b.x + b.w - 8, bodyY + 3, 7, 22);

  // Hands
  ctx.fillStyle = flash ? '#ee5555' : '#e8c5a0';
  ctx.beginPath();
  ctx.ellipse(b.x + 4.5, bodyY + 27, 4.5, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(b.x + b.w - 4.5, bodyY + 27, 4.5, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = suitC;
  ctx.fillRect(b.x + 10, b.y + b.h - 20, 18, 20);
  ctx.fillRect(b.x + b.w - 28, b.y + b.h - 20, 18, 20);

  // Shoes
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(b.x + 19, b.y + b.h + 1, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(b.x + b.w - 19, b.y + b.h + 1, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function _drawEnelShockedFace(ctx, b, cx, cy) {
  const r = b.h * 0.54;

  // Face
  ctx.shadowColor = '#7dd3fc';
  ctx.shadowBlur  = 20;
  ctx.fillStyle   = '#c8965c';
  ctx.beginPath();
  ctx.arc(cx, cy - 4, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Wide shocked eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(cx - r * 0.38, cy - r * 0.18, r * 0.26, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.38, cy - r * 0.18, r * 0.26, 0, Math.PI * 2); ctx.fill();
  // Tiny pupils looking upward
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx - r * 0.38, cy - r * 0.28, r * 0.10, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.38, cy - r * 0.28, r * 0.10, 0, Math.PI * 2); ctx.fill();

  // Screaming O mouth
  ctx.fillStyle = '#2a0a0a';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.35, r * 0.25, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a1010';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.28, r * 0.13, r * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sweat drops
  ctx.fillStyle = 'rgba(100,180,255,0.72)';
  ctx.beginPath(); ctx.ellipse(cx + r * 0.78, cy - r * 0.4, 4, 6, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx - r * 0.68, cy - r * 0.1, 3, 5,  0.3, 0, Math.PI * 2); ctx.fill();

  // Lightning zap on forehead
  ctx.shadowColor = '#7dd3fc';
  ctx.shadowBlur  = 8;
  ctx.strokeStyle = '#bae6fd';
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.12, cy - r * 0.72);
  ctx.lineTo(cx - r * 0.22, cy - r * 0.55);
  ctx.lineTo(cx - r * 0.08, cy - r * 0.55);
  ctx.lineTo(cx - r * 0.18, cy - r * 0.38);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Drum earrings
  ctx.shadowColor = '#bae6fd';
  ctx.shadowBlur  = 6;
  ctx.fillStyle   = '#7dd3fc';
  ctx.beginPath(); ctx.arc(cx - r - 2, cy - 4, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r + 2, cy - 4, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle  = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(cx - r - 2, cy - 4, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r + 2, cy - 4, 3, 0, Math.PI * 2); ctx.fill();
}

function _drawEnelSprite(ctx, t, b) {
  const cx    = b.x + b.w / 2;
  const cy    = b.y + b.h / 2;
  const dying = b.isDead;
  const flash = b.flashTimer > 0 && Math.floor(b.flashTimer * 24) % 2 === 0;

  ctx.save();

  // ── Death Phase A: shocked face + bolt incoming from right (1.0s, deathTimer 3.2→2.2) ──
  if (dying && b.deathTimer > 2.2) {
    const boltProg = 1 - (b.deathTimer - 2.2) / 1.0;  // 0→1

    // Shocked face at rest position
    const deathImg = Assets.getEnelDeathImg();
    if (deathImg) {
      const iw = deathImg.naturalWidth || deathImg.width;
      const ih = deathImg.naturalHeight || deathImg.height;
      const s  = Math.min((b.w * 1.8) / iw, (b.h * 1.8) / ih);
      const dw = iw * s, dh = ih * s;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.shadowColor = '#7dd3fc';
      ctx.shadowBlur  = 22;
      ctx.drawImage(deathImg, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.shadowBlur = 0;
    } else {
      _drawEnelShockedFace(ctx, b, cx, cy);
    }

    // Bolt travelling from right edge toward Enel
    if (boltProg > 0.05) {
      const boltY   = cy;
      const tipX    = W - (W - cx) * Math.min(1, (boltProg - 0.05) / 0.95);
      const nSegs   = 14;
      const pts     = [{ x: W + 40, y: boltY }];
      for (let i = 1; i < nSegs; i++) {
        const fx = 1 - i / nSegs;
        pts.push({
          x: tipX + (W + 40 - tipX) * fx,
          y: boltY + (Math.random() - 0.5) * 28,
        });
      }
      pts.push({ x: tipX, y: boltY });
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
      // Outer glow
      ctx.strokeStyle = 'rgba(125,211,252,0.55)';
      ctx.lineWidth   = 28;
      ctx.shadowColor = '#7dd3fc';
      ctx.shadowBlur  = 50;
      ctx.beginPath();
      pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
      ctx.stroke();
      // Core
      ctx.strokeStyle = 'rgba(186,230,253,0.92)';
      ctx.lineWidth   = 12;
      ctx.shadowBlur  = 28;
      ctx.beginPath();
      pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
      ctx.stroke();
      // White center
      ctx.strokeStyle = 'rgba(255,255,255,0.98)';
      ctx.lineWidth   = 4;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur  = 16;
      ctx.beginPath();
      pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Buildup corona at impact point when bolt is nearly home
    if (boltProg > 0.78) {
      const chargeProg = (boltProg - 0.78) / 0.22;
      ctx.save();
      ctx.globalAlpha = chargeProg * 0.9;
      const coronaR = 10 + chargeProg * 26;
      const cG = ctx.createRadialGradient(cx, cy, 0, cx, cy, coronaR);
      cG.addColorStop(0,   'rgba(255,255,255,1)');
      cG.addColorStop(0.4, 'rgba(186,230,253,0.85)');
      cG.addColorStop(1,   'rgba(125,211,252,0)');
      ctx.fillStyle   = cG;
      ctx.shadowColor = '#7dd3fc';
      ctx.shadowBlur  = 36;
      ctx.beginPath(); ctx.arc(cx, cy, coronaR, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.restore();
    }

    ctx.restore();
    return;
  }

  // ── Death Phase B: impact flash (0.5s, deathTimer 2.2→1.7) ──────────────────
  if (dying && b.deathTimer > 1.7) {
    const flashProg = 1 - (b.deathTimer - 1.7) / 0.5;  // 0→1
    const flashA    = Math.max(0, 1 - flashProg * 1.4);

    // Electric shock burst — jagged spikes + spark puffs, visible first ~35% of phase
    const burstAlpha = Math.max(0, 1 - flashProg * 2.8);
    if (burstAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = burstAlpha;
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
      const nSpikes  = 10;
      const expandR  = 18 + flashProg * 70;
      for (let i = 0; i < nSpikes; i++) {
        const baseA    = (i / nSpikes) * Math.PI * 2;
        const midA     = baseA + (Math.random() - 0.5) * 0.5;
        const spikeLen = expandR * (0.6 + Math.random() * 0.7);
        const mx = cx + Math.cos(midA) * spikeLen * 0.45;
        const my = cy + Math.sin(midA) * spikeLen * 0.45;
        const ex = cx + Math.cos(baseA) * spikeLen;
        const ey = cy + Math.sin(baseA) * spikeLen;
        ctx.strokeStyle = 'rgba(125,211,252,0.75)';
        ctx.lineWidth   = 10;
        ctx.shadowColor = '#7dd3fc';
        ctx.shadowBlur  = 28;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.98)';
        ctx.lineWidth   = 3;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur  = 12;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.lineTo(ex, ey); ctx.stroke();
      }
      // Spark puff dots flying outward
      const nPuffs = 9;
      for (let i = 0; i < nPuffs; i++) {
        const pA  = (i / nPuffs) * Math.PI * 2 + 0.22;
        const pR  = expandR * (0.55 + (i % 3) * 0.2);
        const px  = cx + Math.cos(pA) * pR;
        const py  = cy + Math.sin(pA) * pR;
        const dot = 2 + (i % 3) * 2;
        ctx.fillStyle   = i % 2 === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(186,230,253,0.9)';
        ctx.shadowColor = '#7dd3fc';
        ctx.shadowBlur  = 16;
        ctx.beginPath(); ctx.arc(px, py, dot, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Full-position white-blue blast
    ctx.globalAlpha = flashA;
    const blastR = 80 + flashProg * 60;
    const blastG = ctx.createRadialGradient(cx, cy, 0, cx, cy, blastR);
    blastG.addColorStop(0,   'rgba(255,255,255,1)');
    blastG.addColorStop(0.3, 'rgba(186,230,253,0.9)');
    blastG.addColorStop(1,   'rgba(125,211,252,0)');
    ctx.fillStyle   = blastG;
    ctx.shadowColor = '#7dd3fc';
    ctx.shadowBlur  = 60;
    ctx.beginPath();
    ctx.arc(cx, cy, blastR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;

    // Shocked face under the flash
    const deathImg = Assets.getEnelDeathImg();
    ctx.save();
    ctx.globalAlpha = Math.min(1, flashProg * 2);
    if (deathImg) {
      const iw = deathImg.naturalWidth || deathImg.width;
      const ih = deathImg.naturalHeight || deathImg.height;
      const s  = Math.min((b.w * 1.8) / iw, (b.h * 1.8) / ih);
      const dw = iw * s, dh = ih * s;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.shadowColor = '#7dd3fc';
      ctx.shadowBlur  = 22;
      ctx.drawImage(deathImg, cx - dw / 2, cy - dh / 2, dw, dh);
    } else {
      _drawEnelShockedFace(ctx, b, cx, cy);
    }
    ctx.restore();
    ctx.restore();
    return;
  }

  // ── Death Phase C: Team Rocket launch to the LEFT (1.7s) ─────────────────────
  if (dying) {
    const launchT    = 1.7 - b.deathTimer;
    const launchProg = launchT / 1.7;
    const lx    = b.launchX0 - launchProg * launchProg * 1100;
    const ly    = b.launchY0 + launchProg * 60;
    const spin  = -launchProg * Math.PI * 8;  // counterclockwise
    const alpha = Math.max(0, 1 - Math.max(0, launchProg - 0.75) / 0.25);

    // Blue particle trail
    for (let i = 8; i >= 1; i--) {
      const tBack = Math.max(0, launchT - i * 0.065);
      const tf    = tBack / 1.7;
      const tx    = b.launchX0 - tf * tf * 1100;
      const ty    = b.launchY0 + tf * 60;
      ctx.globalAlpha = alpha * ((9 - i) / 8) * 0.5;
      ctx.fillStyle   = i % 2 === 0 ? '#7dd3fc' : '#bae6fd';
      ctx.shadowColor = i % 2 === 0 ? '#7dd3fc' : '#bae6fd';
      ctx.shadowBlur  = 12;
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(1.5, 5.5 - i * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = alpha;

    // Spin shocked face to the left
    ctx.translate(lx, ly);
    ctx.rotate(spin);

    const deathImg = Assets.getEnelDeathImg();
    if (deathImg) {
      const iw = deathImg.naturalWidth || deathImg.width;
      const ih = deathImg.naturalHeight || deathImg.height;
      const s  = Math.min((b.w * 1.8) / iw, (b.h * 1.8) / ih);
      const dw = iw * s, dh = ih * s;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.shadowColor = '#7dd3fc';
      ctx.shadowBlur  = 22;
      ctx.drawImage(deathImg, -dw / 2, -dh / 2, dw, dh);
    } else {
      _drawEnelShockedFace(ctx, b, 0, 0);
    }

    ctx.restore();
    return;
  }

  // ── Normal (alive) drawing ────────────────────────────────────────────────────

  const img = Assets.getEnelImg();
  if (img) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const maxW = b.w * 1.8, maxH = b.h * 1.8;
    const s  = Math.min(maxW / iw, maxH / ih);
    const dw = iw * s, dh = ih * s;
    const dx = cx - dw / 2, dy = cy - dh / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.shadowColor = '#7dd3fc';
    ctx.shadowBlur  = 26 + Math.sin(t * 0.003) * 8;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.shadowBlur = 0;
    if (flash) {
      ctx.fillStyle = 'rgba(100,210,255,0.45)';
      ctx.fillRect(dx, dy, dw, dh);
    }
    ctx.restore();
    return;
  }

  // Canvas fallback
  const bodyX = b.x + 5, bodyY = b.y + 22;
  const bodyW = b.w - 10, bodyH = b.h - 22;
  const robeC = flash ? '#dbeafe' : '#f5f0dc';

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx, b.y + b.h + 5, b.w * 0.42, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Light blue aura
  ctx.shadowColor = '#7dd3fc';
  ctx.shadowBlur  = 28 + Math.sin(t * 0.003) * 8;

  // Robe body
  ctx.fillStyle = robeC;
  roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 6);
  ctx.fill();

  // Robe shading
  const rG = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW, bodyY);
  rG.addColorStop(0,   'rgba(0,0,0,0.28)');
  rG.addColorStop(0.35,'rgba(0,0,0,0.04)');
  rG.addColorStop(0.65,'rgba(255,255,255,0.06)');
  rG.addColorStop(1,   'rgba(0,0,0,0.24)');
  ctx.fillStyle = rG;
  roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 6);
  ctx.fill();

  // Light blue collar
  ctx.fillStyle   = flash ? '#ffffff' : '#7dd3fc';
  ctx.shadowColor = '#bae6fd';
  ctx.shadowBlur  = 10;
  ctx.beginPath();
  ctx.moveTo(cx - 8, bodyY); ctx.lineTo(cx - 12, bodyY + 14);
  ctx.lineTo(cx, bodyY + 10); ctx.lineTo(cx + 12, bodyY + 14);
  ctx.lineTo(cx + 8, bodyY); ctx.closePath();
  ctx.fill();

  // Bald head
  ctx.shadowColor = '#7dd3fc';
  ctx.shadowBlur  = 20;
  ctx.fillStyle   = flash ? '#dbeafe' : '#c8965c';
  ctx.beginPath();
  ctx.ellipse(cx, b.y + 13, 13, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neck
  ctx.shadowBlur = 0;
  ctx.fillStyle  = flash ? '#dbeafe' : '#c8965c';
  ctx.fillRect(cx - 5, b.y + 18, 10, 8);

  // Large drum earrings
  ctx.fillStyle   = flash ? '#ffffff' : '#7dd3fc';
  ctx.shadowColor = '#bae6fd';
  ctx.shadowBlur  = 8;
  ctx.beginPath(); ctx.arc(b.x + 3,       b.y + 12, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(b.x + b.w - 3, b.y + 12, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle  = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(b.x + 3,       b.y + 12, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(b.x + b.w - 3, b.y + 12, 3, 0, Math.PI * 2); ctx.fill();

  // Glowing eyes
  ctx.shadowColor = '#7dd3fc';
  ctx.shadowBlur  = 8;
  ctx.fillStyle   = flash ? '#ffffff' : '#fffde7';
  ctx.fillRect(cx - 9, b.y + 8, 6, 5);
  ctx.fillRect(cx + 3, b.y + 8, 6, 5);
  ctx.fillStyle  = '#000';
  ctx.shadowBlur = 0;
  ctx.fillRect(cx - 7, b.y + 9, 3, 3);
  ctx.fillRect(cx + 4, b.y + 9, 3, 3);

  // Smirk
  ctx.strokeStyle = '#8b6343';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 4, b.y + 18);
  ctx.quadraticCurveTo(cx, b.y + 21, cx + 4, b.y + 18);
  ctx.stroke();

  // Arms
  ctx.fillStyle  = robeC;
  ctx.shadowBlur = 0;
  ctx.fillRect(b.x + 1, bodyY + 2, 6, 20);
  ctx.fillRect(b.x + b.w - 7, bodyY + 2, 6, 20);

  // Hands with lightning
  const lt = (t * 0.008) % (Math.PI * 2);
  ctx.fillStyle   = flash ? '#dbeafe' : '#c8965c';
  ctx.shadowColor = '#7dd3fc';
  ctx.shadowBlur  = flash ? 18 : 8;
  ctx.beginPath(); ctx.ellipse(b.x + 4,       bodyY + 24, 4.5, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(b.x + b.w - 4, bodyY + 24, 4.5, 5, 0, 0, Math.PI * 2); ctx.fill();

  // Lightning arcs from hands
  ctx.strokeStyle = `rgba(125,211,252,${0.65 + Math.sin(lt) * 0.30})`;
  ctx.shadowColor = '#7dd3fc';
  ctx.shadowBlur  = 12;
  ctx.lineWidth   = 1.5;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(b.x + 4, bodyY + 24);
  ctx.lineTo(b.x - 6 + Math.sin(lt * 2) * 3, bodyY + 14);
  ctx.lineTo(b.x - 10 + Math.sin(lt * 3) * 4, bodyY + 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b.x + b.w - 4, bodyY + 24);
  ctx.lineTo(b.x + b.w + 6 + Math.sin(lt * 2 + 1) * 3, bodyY + 14);
  ctx.lineTo(b.x + b.w + 10 + Math.sin(lt * 3 + 1) * 4, bodyY + 20);
  ctx.stroke();

  // Legs
  ctx.shadowBlur = 0;
  ctx.fillStyle  = robeC;
  ctx.fillRect(b.x + 9,        b.y + b.h - 20, 17, 20);
  ctx.fillRect(b.x + b.w - 26, b.y + b.h - 20, 17, 20);

  // Feet (barefoot, darker skin)
  ctx.fillStyle = '#a0724a';
  ctx.beginPath(); ctx.ellipse(b.x + 17,       b.y + b.h + 1, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(b.x + b.w - 17, b.y + b.h + 1, 11, 4, 0, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ─── Boss HP bar (canvas-drawn at top of screen) ─────────────────────────────

function _drawBossHUD(ctx, t) {
  const b = gp.boss;
  if (!b || b.introTimer > 0 || b.isDead) return;

  const isGojo = b.type === 'gojo';
  const barW   = isGojo ? 620 : 440;
  const barH   = isGojo ? 22  : 14;
  const barX   = W / 2 - barW / 2;
  const barY   = isGojo ? 42  : 14;
  const hpFrac = Math.max(0, b.hp / b.maxHp);
  const hpClr  = isGojo ? '#a78bfa' : (b.phase === 2 ? '#f97316' : '#ef4444');

  // Boss name — bigger font for Gojo
  ctx.font      = isGojo ? 'bold 14px "Segoe UI", sans-serif' : 'bold 11px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = isGojo ? 'rgba(220,200,255,0.90)' : 'rgba(255,255,255,0.72)';
  ctx.shadowColor = b.glowColor || '#7c3aed';
  ctx.shadowBlur  = isGojo ? 18 : 10;
  const namePhase = isGojo ? (b.gateIndex >= 2 ? '  ⟨PHASE 2⟩' : '') : (b.phase === 2 ? '  ⟨PHASE 2⟩' : '');
  ctx.fillText(b.name + namePhase, W / 2, barY - (isGojo ? 4 : 2));
  ctx.shadowBlur = 0;

  // Track
  ctx.fillStyle = isGojo ? 'rgba(0,0,0,0.80)' : 'rgba(0,0,0,0.68)';
  roundRect(ctx, barX - 2, barY, barW + 4, barH + 4, isGojo ? 6 : 4);
  ctx.fill();

  // Fill gradient — purple for Gojo
  const fillG = ctx.createLinearGradient(barX, barY, barX + barW * hpFrac, barY);
  if (isGojo) {
    fillG.addColorStop(0, '#7c3aed');
    fillG.addColorStop(0.5, '#a78bfa');
    fillG.addColorStop(1, '#c4b5fd');
  } else {
    fillG.addColorStop(0, b.phase === 2 ? '#f97316' : '#ef4444');
    fillG.addColorStop(1, b.phase === 2 ? (b.glowColor || '#f97316') : '#f97316');
  }
  ctx.fillStyle   = fillG;
  ctx.shadowColor = hpClr;
  ctx.shadowBlur  = isGojo ? 18 : 10;
  if (barW * hpFrac > 0) {
    roundRect(ctx, barX, barY + 2, Math.max(4, barW * hpFrac), barH, isGojo ? 5 : 3);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Gate dividers — Gojo shows 3 (75%/50%/25%), others show one at 50%
  if (b.type === 'gojo') {
    const gates = [0.75, 0.50, 0.25];
    gates.forEach(frac => {
      const gx      = barX + barW * frac;
      const broken  = b.hp < b.maxHp * frac - 0.5;
      ctx.strokeStyle = broken ? 'rgba(167,139,250,0.3)' : (b.glowColor || '#a78bfa');
      ctx.lineWidth   = broken ? 1 : 2;
      ctx.globalAlpha = broken ? 0.25 : 0.75;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(gx, barY - 2); ctx.lineTo(gx, barY + barH + 6);
      ctx.stroke();
      // Small diamond marker
      ctx.fillStyle   = broken ? 'rgba(167,139,250,0.3)' : '#a78bfa';
      ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = broken ? 0 : 8;
      ctx.beginPath();
      ctx.moveTo(gx, barY - 5); ctx.lineTo(gx + 4, barY - 1);
      ctx.lineTo(gx, barY + 3); ctx.lineTo(gx - 4, barY - 1);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
  } else {
    ctx.strokeStyle = b.glowColor || '#f97316';
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(barX + barW * 0.5, barY);
    ctx.lineTo(barX + barW * 0.5, barY + barH + 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // HP text
  ctx.font      = 'bold 10px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fillText(`${Math.ceil(b.hp)} / ${b.maxHp}`, W / 2, barY + barH - 1);
}

// ─── Boss intro overlay ───────────────────────────────────────────────────────

function _drawBossIntro(ctx, t, b) {
  const progress = b.introTimer / 2.8; // 1 → 0 as intro elapses
  const shown    = 1 - progress;       // 0 → 1

  ctx.fillStyle = `rgba(0,0,0,${Math.min(0.78, shown * 2.2)})`;
  ctx.fillRect(0, 0, W, H);

  if (shown > 0.18) {
    const alpha = Math.min(1, (shown - 0.18) * 3.5);
    ctx.save();
    ctx.font      = 'bold 58px "Segoe UI Black", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = b.glowColor || '#7c3aed';
    ctx.shadowBlur  = 44;
    ctx.fillStyle   = `rgba(220,200,255,${alpha})`;
    ctx.fillText(b.name, W / 2, H / 2 - 18);
    ctx.font        = 'italic 22px "Segoe UI", sans-serif';
    ctx.shadowColor = b.glowColor || '#ef4444';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = `rgba(252,165,165,${alpha * 0.88})`;
    ctx.fillText(b.subtitle, W / 2, H / 2 + 28);
    ctx.restore();
  }
}

// ─── Combat hints ─────────────────────────────────────────────────────────────

function _drawCombatHint(ctx) {
  if (!gp || !gp.hints || gp.hints.timer <= 0 || !gp.hints.text) return;
  const h     = gp.hints;
  // fade in first 0.25s, fade out last 0.6s
  const fadeIn  = Math.min(1, (h.maxTimer - h.timer) / 0.25);
  const fadeOut = Math.min(1, h.timer / 0.6);
  const alpha   = Math.min(fadeIn, fadeOut);
  if (alpha <= 0) return;

  const charColor = gp.char.color.main;
  const charGlow  = gp.char.color.glow + '0.6)';

  const lines  = h.text.split('\n');
  const px     = gp.player.x + PW / 2;
  const py     = gp.player.y - 12;
  const lineH  = 20;
  const pad    = 12;
  ctx.save();
  ctx.font = `italic 14px "Segoe UI", Georgia, serif`;
  const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const bw   = maxW + pad * 2;
  const bh   = lines.length * lineH + pad * 1.4;
  const bx   = Math.min(Math.max(px - bw / 2, ROOM.x + 4), ROOM.x + ROOM.w - bw - 4);
  const by   = py - bh - 8;

  // Background bubble
  ctx.globalAlpha = alpha * 0.82;
  ctx.fillStyle   = 'rgba(10,8,20,0.92)';
  ctx.shadowColor = charGlow;
  ctx.shadowBlur  = 14;
  roundRect(ctx, bx, by, bw, bh, 8);
  ctx.fill();

  // Border
  ctx.globalAlpha = alpha * 0.9;
  ctx.strokeStyle = charColor;
  ctx.lineWidth   = 1.2;
  ctx.shadowBlur  = 0;
  roundRect(ctx, bx, by, bw, bh, 8);
  ctx.stroke();

  // Text
  ctx.globalAlpha  = alpha;
  ctx.fillStyle    = 'rgba(240,240,255,0.95)';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor  = charColor;
  ctx.shadowBlur   = 6;
  lines.forEach((line, i) => {
    ctx.fillText(line, bx + bw / 2, by + pad * 0.7 + i * lineH);
  });

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── Domain Expansion tell (pre-void warning) ─────────────────────────────────

function _drawVoidTell(ctx, t, b) {
  const tellProg = 1 - b.voidTellTimer / b.voidTellDuration;  // 0→1

  // Darkness creeps in from edges as a radial gradient
  // At tellProg=0: faint vignette; at tellProg=1: heavy edge darkness, center still visible
  const innerRadius = 320 - tellProg * 180;   // shrinks from 320→140 as tell progresses
  const outerRadius = 700 + tellProg * 100;   // expands slightly
  const centerAlpha = 0.0 + tellProg * 0.55;  // 0→0.55 max darkness at outer edge
  const vignette = ctx.createRadialGradient(W / 2, H / 2, innerRadius, W / 2, H / 2, outerRadius);
  vignette.addColorStop(0,   'rgba(0,0,0,0)');
  vignette.addColorStop(0.3, `rgba(10,0,25,${centerAlpha * 0.4})`);
  vignette.addColorStop(0.6, `rgba(20,0,50,${centerAlpha * 0.7})`);
  vignette.addColorStop(1,   `rgba(30,0,60,${centerAlpha})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // Purple nebula shimmer hinting at the void
  if (tellProg > 0.15) {
    const nebulaAlpha = Math.min(0.18, (tellProg - 0.15) * 0.3);
    ctx.globalAlpha = nebulaAlpha;
    for (let i = 0; i < 4; i++) {
      const sx = W / 2 + Math.cos(t * 0.0012 + i * 1.57) * 350;
      const sy = H / 2 + Math.sin(t * 0.0016 + i * 1.57) * 200;
      const ng = ctx.createRadialGradient(sx, sy, 0, sx, sy, 120);
      ng.addColorStop(0,   'rgba(139,92,246,0.7)');
      ng.addColorStop(1,   'rgba(88,28,135,0)');
      ctx.fillStyle = ng;
      ctx.beginPath(); ctx.arc(sx, sy, 120, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // "Domain Expansion" dialogue bubble — fades in after 20%, fades out in last 20%
  if (tellProg > 0.2) {
    const fadeIn  = Math.min(1, (tellProg - 0.2) / 0.3);
    const fadeOut = Math.min(1, b.voidTellTimer / (b.voidTellDuration * 0.2));
    const alpha   = Math.min(fadeIn, fadeOut);
    if (alpha > 0) {
      const gojoSX = GOJO_ANCHOR_X + BW / 2;
      const gojoSY = b.y - 50;
      _drawCinDialogue(ctx, gojoSX, gojoSY, 'Domain Expansion: Infinite Void', '#c4b5fd', alpha);
    }
  }
}

// ─── Infinite Void overlay ────────────────────────────────────────────────────

function _drawInfiniteVoid(ctx, t, b) {
  const voidProg  = 1 - b.voidTimer / b.voidMaxTimer;   // 0→1 over duration
  // Fade in during first 15%, hold, fade out during last 15%
  const fadeIn    = Math.min(1, b.voidTimer > b.voidMaxTimer * 0.85
    ? (b.voidMaxTimer - b.voidTimer) / (b.voidMaxTimer * 0.15)
    : 1);
  const fadeOut   = Math.min(1, b.voidTimer / (b.voidMaxTimer * 0.15));
  const alpha     = Math.min(fadeIn, fadeOut);
  if (alpha <= 0) return;

  const pcx   = gp.player.x + PW / 2;
  const pcy   = gp.player.y + PH / 2;
  const lightR = 180;  // radius of player's visibility sphere

  ctx.save();

  // ── Darkness overlay with radial gradient hole around player ──
  // Use pure gradient approach (no destination-out) so it layers correctly
  ctx.globalAlpha = alpha;
  const darkGrad = ctx.createRadialGradient(pcx, pcy, lightR * 0.35, pcx, pcy, lightR * 3.5);
  darkGrad.addColorStop(0,    'rgba(0,0,0,0)');
  darkGrad.addColorStop(0.25, 'rgba(0,0,0,0.30)');
  darkGrad.addColorStop(0.45, 'rgba(0,0,0,0.72)');
  darkGrad.addColorStop(0.65, 'rgba(0,0,0,0.88)');
  darkGrad.addColorStop(1,    'rgba(0,0,0,0.94)');
  ctx.fillStyle = darkGrad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  // Warm lantern glow inside the light sphere so the player can clearly see themselves
  ctx.globalAlpha = 0.22 * alpha;
  const glowGrad = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, lightR * 0.9);
  glowGrad.addColorStop(0, 'rgba(255,220,160,0.9)');
  glowGrad.addColorStop(0.5,'rgba(255,180,80,0.3)');
  glowGrad.addColorStop(1,  'rgba(255,120,0,0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath(); ctx.arc(pcx, pcy, lightR * 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // ── Void atmosphere: purple nebula swirls in the darkness ──
  ctx.globalAlpha = 0.22 * alpha;
  for (let i = 0; i < 6; i++) {
    const sx = W / 2 + Math.cos(t * 0.0015 + i * 1.05) * 310;
    const sy = H / 2 + Math.sin(t * 0.0018 + i * 1.05) * 180;
    const ng = ctx.createRadialGradient(sx, sy, 0, sx, sy, 130);
    ng.addColorStop(0,   'rgba(139,92,246,0.7)');
    ng.addColorStop(1,   'rgba(88,28,135,0)');
    ctx.fillStyle = ng;
    ctx.beginPath(); ctx.arc(sx, sy, 130, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Gojo and his attacks glow through the void ──
  // 'lighter' composite adds light to dark pixels, making entities visible
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha * 0.85;

  // Gojo — purple light halo
  const gcx = b.x + b.w / 2, gcy = b.y + b.h / 2;
  const gojoHalo = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, 130);
  gojoHalo.addColorStop(0,   'rgba(192,132,252,0.55)');
  gojoHalo.addColorStop(0.4, 'rgba(139,92,246,0.25)');
  gojoHalo.addColorStop(1,   'rgba(88,28,135,0)');
  ctx.fillStyle = gojoHalo;
  ctx.beginPath(); ctx.arc(gcx, gcy, 130, 0, Math.PI * 2); ctx.fill();

  // Active boss attacks
  for (const a of gp.bossAttacks) {
    if (a.done) continue;
    let rgb, glowR;
    if      (a.type === 'blue_orb')       { rgb = '56,189,248';   glowR = a.r * 6; }
    else if (a.type === 'purple_ball')    { rgb = '167,139,250';  glowR = a.r * 3.5; }
    else if (a.type === 'red_ball')       { rgb = '239,68,68';    glowR = a.r * 3.5; }
    else if (a.type === 'barrier_purple') { rgb = '192,132,252';  glowR = 60; }
    else continue;
    const acx = a.cx ?? (a.x + (a.w ?? 0) / 2);
    const acy = a.cy ?? (a.y + (a.h ?? 0) / 2);
    const ag = ctx.createRadialGradient(acx, acy, 0, acx, acy, glowR);
    ag.addColorStop(0,   `rgba(${rgb},0.75)`);
    ag.addColorStop(0.45,`rgba(${rgb},0.3)`);
    ag.addColorStop(1,   `rgba(${rgb},0)`);
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(acx, acy, glowR, 0, Math.PI * 2); ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── Shadow hands reaching inward from room edges ──
  ctx.save();
  for (const hand of b.voidHands) {
    if (hand.reach <= 2) continue;
    const edgeX = ROOM.x + ROOM.w / 2 + Math.cos(hand.angle) * (ROOM.w * 0.65);
    const edgeY = ROOM.y + ROOM.h / 2 + Math.sin(hand.angle) * (ROOM.h * 0.65);
    const tipX  = edgeX - Math.cos(hand.angle) * hand.reach;
    const tipY  = edgeY - Math.sin(hand.angle) * hand.reach;

    // Palm/wrist connector knuckle points give it a hand silhouette
    const perpA = hand.angle + Math.PI / 2;
    const armW  = 28;
    const pulse = 1 + Math.sin(t * 0.009 + hand.angle * 3) * 0.06;

    // Forearm / wrist shape
    ctx.globalAlpha = 0.90 * alpha;
    ctx.fillStyle   = '#0d0520';
    ctx.shadowColor = '#6d28d9'; ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(edgeX + Math.cos(perpA) * armW * 1.3,  edgeY + Math.sin(perpA) * armW * 1.3);
    ctx.lineTo(tipX  + Math.cos(perpA) * armW * 0.55, tipY  + Math.sin(perpA) * armW * 0.55);
    ctx.lineTo(tipX  - Math.cos(perpA) * armW * 0.55, tipY  - Math.sin(perpA) * armW * 0.55);
    ctx.lineTo(edgeX - Math.cos(perpA) * armW * 1.3,  edgeY - Math.sin(perpA) * armW * 1.3);
    ctx.closePath(); ctx.fill();

    // Knuckle bumps along the arm (gives organic hand look)
    for (let ki = 0; ki < 3; ki++) {
      const kf  = 0.3 + ki * 0.22;
      const kx  = edgeX + (tipX - edgeX) * kf;
      const ky  = edgeY + (tipY - edgeY) * kf;
      const kw  = armW * (1.0 - kf * 0.3);
      ctx.fillStyle   = '#1a0835';
      ctx.shadowColor = '#7c3aed'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.ellipse(kx, ky, kw * 0.9, kw * 0.55, hand.angle + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    }

    // Claw fingers at the tip — longer, curved, menacing
    const nClaws = 5;
    for (let fi = 0; fi < nClaws; fi++) {
      const spread  = (fi / (nClaws - 1) - 0.5) * 0.72;
      const clawAng = hand.angle - Math.PI + spread;
      const clawLen = (38 + (fi % 3) * 12) * pulse;
      const midX    = tipX + Math.cos(clawAng + spread * 0.4) * clawLen * 0.55;
      const midY    = tipY + Math.sin(clawAng + spread * 0.4) * clawLen * 0.55;
      const endX    = tipX + Math.cos(clawAng) * clawLen;
      const endY    = tipY + Math.sin(clawAng) * clawLen;
      // Claw shaft — dark with purple glow
      ctx.strokeStyle = '#1a0a2e';
      ctx.lineWidth   = 5 - fi * 0.4;
      ctx.lineCap     = 'round';
      ctx.shadowColor = '#7c3aed'; ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.quadraticCurveTo(midX, midY, endX, endY);
      ctx.stroke();
      // Claw tip bright highlight
      ctx.strokeStyle = '#c4b5fd';
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      ctx.quadraticCurveTo(midX, midY, endX, endY);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Palm glow — pulsing danger indicator at claw base
    const tipAlpha = 0.65 + Math.sin(t * 0.011 + hand.angle) * 0.28;
    ctx.globalAlpha = tipAlpha * alpha;
    ctx.fillStyle   = '#8b5cf6';
    ctx.shadowColor = '#5b21b6'; ctx.shadowBlur = 28;
    ctx.beginPath(); ctx.arc(tipX, tipY, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle   = '#c4b5fd';
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(tipX, tipY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  ctx.restore();
}

// ─── Gojo ending cinematic ────────────────────────────────────────────────────

const _CIN_DUR = {
  zoom_in:       1.0,
  gojo_text:     2.4,
  player_text1:  2.2,
  player_attack: 1.2,
  white_flash:   0.7,
  reveal:        2.4,
  player_text2:  2.8,
  fade_out:      1.3,
};
const _CIN_NEXT = {
  zoom_in:       'gojo_text',
  gojo_text:     'player_text1',
  player_text1:  'player_attack',
  player_attack: 'white_flash',
  white_flash:   'reveal',
  reveal:        'player_text2',
  player_text2:  'fade_out',
  fade_out:      null,
};

function _startGojoCinematic() {
  gp.bossAttacks   = [];
  gp.projectiles   = [];
  gp.activeAttacks = [];
  const midY       = ROOM.y + ROOM.h / 2;
  const gojoStartX = GOJO_ANCHOR_X + BW / 2;          // right-side anchor
  const gojoCenterX = ROOM.x + ROOM.w * 0.50;         // center — Gojo walks here (Levi)
  // Levi ends up just past Gojo after dashing through
  const leviPostX  = gojoCenterX + BW / 2 + 90;
  gp.cinematic = {
    phase:       'zoom_in',
    timer:       0,
    playerX:     ROOM.x + Math.floor(ROOM.w * 0.18) + PW / 2,
    playerY:     midY,
    gojoX:       gojoStartX,   // authoritative for death pose; updated after white_flash
    gojoY:       midY,
    gojoStartX,
    gojoCenterX,
    leviPostX,
  };
}

function _updateGojoCinematic(dt) {
  const c = gp.cinematic;
  c.timer += dt;
  if (c.timer >= _CIN_DUR[c.phase]) {
    const next = _CIN_NEXT[c.phase];
    if (!next) {
      gp.cinematic     = null;
      gp.floorComplete = true;   // main.js detects this → STATE.WIN
      return;
    }
    // Levi: after flash, move player to post-dash position; Gojo is already at center
    if (c.phase === 'white_flash' && gp.char.id === 'levi') {
      c.playerX = c.leviPostX;
      c.gojoX   = c.gojoCenterX;   // death pose renders here (already where he was walking)
    }
    c.phase = next;
    c.timer = 0;
  }
}

// Attack ease: fast in first 40% of time (covers 70% of distance), slow in remaining 60%
function _cinAttackEase(prog) {
  if (prog < 0.4) return (prog / 0.4) * 0.70;
  return 0.70 + ((prog - 0.4) / 0.6) * 0.30;
}

function _drawGojoCinematic(ctx, t) {
  const c    = gp.cinematic;
  const { phase, timer, playerX, playerY, gojoX, gojoY } = c;
  const dur  = _CIN_DUR[phase];
  const prog = Math.min(1, timer / dur);
  const charId = gp.char.id;

  // ── Levi: Gojo walks from anchor to center across gojo_text + player_text1 ──
  let effectiveGojoX = gojoX;
  if (charId === 'levi') {
    const totalWalkDur = _CIN_DUR.gojo_text + _CIN_DUR.player_text1;
    let elapsed = 0;
    if      (phase === 'gojo_text')    elapsed = timer;
    else if (phase === 'player_text1') elapsed = _CIN_DUR.gojo_text + timer;
    else if (phase !== 'zoom_in')      elapsed = totalWalkDur; // player_attack and beyond
    const wp = Math.min(1, elapsed / totalWalkDur);
    const we = 1 - Math.pow(1 - wp, 3); // ease-out cubic: starts walking fast, slows to stop
    effectiveGojoX = c.gojoStartX + we * (c.gojoCenterX - c.gojoStartX);
  }

  // Zoom: 1.0→1.15 during zoom_in, held at 1.15 for all middle phases
  const targetZoom = 1.15;
  let zoom = 1.0;
  if (phase === 'zoom_in')       zoom = 1.0 + prog * (targetZoom - 1.0);
  else if (phase !== 'fade_out') zoom = targetZoom;

  // Focus point: midpoint between player and effective Gojo position
  const rawFX = (playerX + effectiveGojoX) / 2;
  const rawFY = (playerY + gojoY) / 2;
  const focusX = Math.min(Math.max(rawFX, W / 2 - 60), W / 2 + 60);
  const focusY = Math.min(Math.max(rawFY, H / 2 - 20), H / 2 + 20);

  // Helper: world → screen under this zoom
  const toSX = wx => focusX + (wx - focusX) * zoom;
  const toSY = wy => focusY + (wy - focusY) * zoom;

  // Death pose shown from reveal onward — white flash hides the sprite swap
  const showDeath = (phase === 'reveal' || phase === 'player_text2' || phase === 'fade_out');

  // Attack ease value — frozen at 1.0 during white_flash so attack stays visible under the flash
  const attackEase = (phase === 'white_flash') ? 1.0 : _cinAttackEase(prog);
  const showAttack = (phase === 'player_attack' || phase === 'white_flash');

  // Levi dash target uses effectiveGojoX (center after walk)
  const leviDashEndX = effectiveGojoX + BW / 2 + 60;
  const leviDashX = (showAttack && charId === 'levi')
    ? playerX + attackEase * (leviDashEndX - playerX)
    : playerX;
  const leviMoving = showAttack && charId === 'levi';

  // ── Draw scene under zoom transform ──────────────────────────────────────
  ctx.save();
  ctx.translate(focusX, focusY);
  ctx.scale(zoom, zoom);
  ctx.translate(-focusX, -focusY);

  _drawRoom(ctx);

  // ── Gojo sprite ───────────────────────────────────────────────────────────
  {
    const vs = 1.8, dw = BW * vs, dh = BH * vs;
    if (showDeath) {
      // Slumped at gojoX (updated by _updateGojoCinematic to gojoCenterX for Levi)
      const img = Assets.getGojoDeathImg() || Assets.getGojoImg();
      ctx.save();
      ctx.translate(gojoX, gojoY + dh * 0.08);
      ctx.scale(-1, 1);
      ctx.rotate(-Math.PI * 0.15);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      if (img) {
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      } else {
        ctx.fillStyle = '#e8e8e8';
        ctx.beginPath(); ctx.ellipse(0, 0, 22, 32, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f4f4f4';
        ctx.beginPath(); ctx.arc(0, -34, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillRect(-16, -40, 32, 8);
      }
      ctx.restore();
    } else {
      // Standing — drawn at effectiveGojoX (walks left for Levi)
      const img = Assets.getGojoImg();
      ctx.save();
      ctx.translate(effectiveGojoX, gojoY - dh / 2);
      ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      if (img) {
        ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 14;
        ctx.drawImage(img, -dw / 2, 0, dw, dh);
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
  }

  // ── Finishing attack (player_attack + frozen during white_flash) ──────────
  if (showAttack) {
    if (charId === 'dio') {
      const kx = playerX + PW / 2 + attackEase * (effectiveGojoX - BW / 2 - (playerX + PW / 2));
      const ky = playerY;
      ctx.save();
      ctx.translate(kx, ky);
      ctx.shadowColor = '#c084fc'; ctx.shadowBlur = 16;
      ctx.fillStyle   = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(24, 0); ctx.lineTo(5, -5.5); ctx.lineTo(3, -4);
      ctx.lineTo(3, 4); ctx.lineTo(5, 5.5); ctx.closePath(); ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(5, -5.5); ctx.stroke();
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(1, -7, 4, 14);
      ctx.fillStyle = '#78350f'; ctx.fillRect(-8, -4, 10, 8);
      ctx.restore();

    } else if (charId === 'kaido') {
      const ox = playerX + PW / 2;
      const oy = playerY;
      const maxLen = effectiveGojoX - BW / 2 - ox;
      const beamLen = attackEase * maxLen;
      if (beamLen > 0) {
        const nearH = 9, farH = 45;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(ox, oy - nearH); ctx.lineTo(ox + beamLen, oy - farH);
        ctx.lineTo(ox + beamLen, oy + farH); ctx.lineTo(ox, oy + nearH);
        ctx.closePath(); ctx.clip();
        const flk = 0.75 + Math.sin(t * 0.018) * 0.12;
        const g1 = ctx.createLinearGradient(ox, oy, ox + beamLen, oy);
        g1.addColorStop(0,   `rgba(255,120,0,${flk})`);
        g1.addColorStop(0.5, `rgba(220,55,0,${flk * 0.82})`);
        g1.addColorStop(1,   'rgba(150,8,0,0)');
        ctx.fillStyle = g1; ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 8;
        ctx.fillRect(ox, oy - farH, beamLen, farH * 2);
        const g2 = ctx.createLinearGradient(ox, oy, ox + beamLen, oy);
        g2.addColorStop(0,   `rgba(255,230,180,${flk * 0.8})`);
        g2.addColorStop(0.6, `rgba(255,160,60,${flk * 0.4})`);
        g2.addColorStop(1,   'rgba(200,80,0,0)');
        ctx.fillStyle = g2; ctx.shadowBlur = 0;
        ctx.fillRect(ox, oy - nearH * 0.5, beamLen, nearH);
        ctx.restore();
      }

    } else if (charId === 'levi') {
      // Speed lines trail behind Levi during the dash; frozen in place during white_flash
      const trailEase = phase === 'white_flash' ? 1.0 : attackEase;
      ctx.save();
      ctx.strokeStyle = `rgba(74,222,128,0.45)`;
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 6;
      for (let i = 0; i < 8; i++) {
        const yo = playerY + (i - 3.5) * 11;
        const trailLen = 60 + i * 8;
        ctx.globalAlpha = 0.25 + (1 - trailEase) * 0.4;
        ctx.beginPath();
        ctx.moveTo(leviDashX - trailLen, yo);
        ctx.lineTo(leviDashX - 8, yo);
        ctx.stroke();
      }
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // ── Player sprite ─────────────────────────────────────────────────────────
  {
    const VS = 1.7, vw = PW * VS, vh = PH * VS;
    const pose = showAttack ? 'attack' : 'idle';
    const drawX = leviMoving ? leviDashX : playerX;
    Assets.drawSprite(ctx, gp.char, pose, 'right', drawX - vw / 2, playerY - vh / 2, vw, vh, 0);
  }

  ctx.restore();

  // ── Letterbox bars (screen-space, no transform) ───────────────────────────
  const lbA = phase === 'zoom_in' ? prog : 1;
  const lbH = 58;
  ctx.fillStyle = `rgba(0,0,0,${lbA})`;
  ctx.fillRect(0, 0, W, lbH);
  ctx.fillRect(0, H - lbH, W, lbH);

  // ── White flash: ramp to full white, covering the sprite swap underneath ──
  if (phase === 'white_flash') {
    const flashAlpha = prog * prog;
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Reveal: white melts away to uncover Gojo's death pose ────────────────
  if (phase === 'reveal') {
    const revealFade = Math.max(0, 1 - prog * prog * prog);
    ctx.fillStyle = `rgba(255,255,255,${revealFade})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Dialogue boxes ────────────────────────────────────────────────────────
  const charColor = gp.char.color.main;
  const gojoColor = '#c4b5fd';

  // Gojo line — tracks effectiveGojoX so bubble follows him as he walks
  if (phase === 'gojo_text') {
    const a = prog < 0.12 ? prog / 0.12 : prog > 0.82 ? (1 - prog) / 0.18 : 1;
    _drawCinDialogue(ctx, toSX(effectiveGojoX), toSY(gojoY - BH * 0.9), "This isn't over...", gojoColor, a);
  }

  // Player line 1 — fades out at start of player_attack
  if (phase === 'player_text1') {
    const a = prog < 0.12 ? prog / 0.12 : prog > 0.82 ? (1 - prog) / 0.18 : 1;
    _drawCinDialogue(ctx, toSX(playerX), toSY(playerY - PH * 0.85), 'It already is.', charColor, a);
  }
  if (phase === 'player_attack') {
    const a = Math.max(0, 1 - prog * 2.5);
    if (a > 0) _drawCinDialogue(ctx, toSX(playerX), toSY(playerY - PH * 0.85), 'It already is.', charColor, a);
  }

  // Player line 2 — character-specific comedic finisher
  if (phase === 'player_text2') {
    const a = prog < 0.12 ? prog / 0.12 : prog > 0.82 ? (1 - prog) / 0.18 : 1;
    const finalLine = {
      dio:   "That was it? How pathetic.",
      kaido: "Yet another soul fell to my strength.",
      levi:  "What a waste of a final project...",
    }[charId] || "That was a good fight.";
    _drawCinDialogue(ctx, toSX(playerX), toSY(playerY - PH * 0.85), finalLine, charColor, a);
  }

  // ── Fade to black ─────────────────────────────────────────────────────────
  if (phase === 'fade_out') {
    ctx.fillStyle = `rgba(0,0,0,${prog})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function _drawCinDialogue(ctx, sx, sy, text, borderColor, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const pad  = 14;
  const font = 'italic 16px "Segoe UI", Georgia, serif';
  ctx.font   = font;
  const tw   = ctx.measureText(text).width;
  const bw   = tw + pad * 2;
  const bh   = 40;
  const bx   = Math.min(Math.max(sx - bw / 2, 8), W - bw - 8);
  const by   = Math.max(sy - bh - 10, 8);

  // Dark background
  ctx.fillStyle = 'rgba(6,4,18,0.92)';
  ctx.shadowColor = borderColor; ctx.shadowBlur = 18;
  roundRect(ctx, bx, by, bw, bh, 9); ctx.fill();

  // Border
  ctx.strokeStyle = borderColor; ctx.lineWidth = 1.5;
  ctx.shadowBlur  = 0;
  roundRect(ctx, bx, by, bw, bh, 9); ctx.stroke();

  // Text
  ctx.fillStyle    = 'rgba(248,242,255,0.97)';
  ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor  = borderColor; ctx.shadowBlur = 8;
  ctx.fillText(text, bx + bw / 2, by + bh / 2);

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── Dev boss select ──────────────────────────────────────────────────────────

const _DEV_BOSSES = [
  { id: 'kira',  label: 'KIRA',  sub: 'Floor 1',    ready: true,  color: '#7c3aed' },
  { id: 'enel',  label: 'ENEL',  sub: 'Floor 2',    ready: true,  color: '#7dd3fc' },
  { id: 'gojo',  label: 'GOJO',  sub: 'Floor 3',    ready: true,  color: '#a78bfa' },
];

const _DEATH_FOLDERS = [
  { label: 'Kira Deaths',   color: '#7c3aed', sources: [
    { id: 'bomb',         label: "Kira's Bomb"      },
    { id: 'sha',          label: 'Sheer Heart Attack'},
    { id: 'kira_contact', label: 'Contact'           },
  ]},
  { label: 'Enel Deaths',   color: '#7dd3fc', sources: [
    { id: 'beam',         label: 'Lightning Beam'   },
    { id: 'grid',         label: 'Lightning Grid'   },
    { id: 'enel_contact', label: 'Contact'           },
  ]},
  { label: 'Gojo Deaths',   color: '#a78bfa', sources: [
    { id: 'hollow_purple',  label: 'Hollow Purple'    },
    { id: 'blue_orb',       label: 'Blue Orb'         },
    { id: 'red_ball',       label: 'Red Volleyball'   },
    { id: 'void',           label: 'Infinite Void'    },
    { id: 'barrier_purple', label: 'Barrier Purple'   },
    { id: 'gojo_contact',   label: 'Contact'           },
  ]},
  { label: 'Common Deaths', color: '#94a3b8', sources: [
    { id: 'enemy',        label: 'Basic Enemy'  },
    { id: 'ranged_enemy', label: 'Ranged Enemy' },
    { id: 'tank_enemy',   label: 'Tank/Brute'   },
  ]},
];

function _drawDevDeathBrowser(ctx, t) {
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, W, H);

  ctx.font      = 'bold 22px "Segoe UI Black", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,215,0,0.9)';
  ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 14;
  ctx.fillText('DEATH SCREEN BROWSER', W / 2, 68);
  ctx.shadowBlur = 0;

  ctx.font      = '13px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(148,163,184,0.7)';
  ctx.fillText('Click a death to preview it.  ESC to go back.', W / 2, 92);

  const colW = 248, colGap = 20;
  const totalW = _DEATH_FOLDERS.length * colW + (_DEATH_FOLDERS.length - 1) * colGap;
  const startX = W / 2 - totalW / 2;
  const startY = 118;
  const btnH = 36, btnGap = 6, headerH = 38;

  _DEATH_FOLDERS.forEach((folder, fi) => {
    const fx = startX + fi * (colW + colGap);

    // Column header
    ctx.save();
    ctx.fillStyle = folder.color + '22';
    roundRect(ctx, fx, startY, colW, headerH, 8); ctx.fill();
    ctx.strokeStyle = folder.color + '88'; ctx.lineWidth = 1.5;
    roundRect(ctx, fx, startY, colW, headerH, 8); ctx.stroke();
    ctx.font      = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = folder.color;
    ctx.shadowColor = folder.color; ctx.shadowBlur = 8;
    ctx.fillText(folder.label, fx + colW / 2, startY + headerH / 2 + 5);
    ctx.shadowBlur = 0;
    ctx.restore();

    folder.sources.forEach((src, si) => {
      const by = startY + headerH + 8 + si * (btnH + btnGap);
      const hover = Input.mouseX >= fx && Input.mouseX < fx + colW &&
                    Input.mouseY >= by && Input.mouseY < by + btnH;

      ctx.save();
      ctx.fillStyle = hover ? folder.color + '28' : 'rgba(12,10,28,0.9)';
      ctx.shadowColor = hover ? folder.color : 'transparent';
      ctx.shadowBlur  = hover ? 12 : 0;
      roundRect(ctx, fx, by, colW, btnH, 7); ctx.fill();
      ctx.strokeStyle = hover ? folder.color : 'rgba(80,80,120,0.4)';
      ctx.lineWidth   = hover ? 1.8 : 1;
      ctx.shadowBlur  = 0;
      roundRect(ctx, fx, by, colW, btnH, 7); ctx.stroke();
      ctx.font      = `${hover ? 'bold ' : ''}14px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = hover ? '#fff' : 'rgba(200,200,220,0.82)';
      ctx.fillText(src.label, fx + colW / 2, by + btnH / 2 + 5);
      ctx.restore();
    });
  });
}

function _updateDevDeathBrowser(t) {
  if (Input.justPressed('Escape')) { gp.devDeathScreen = false; return; }
  if (!Input.clicked) return;

  const colW = 248, colGap = 20;
  const totalW = _DEATH_FOLDERS.length * colW + (_DEATH_FOLDERS.length - 1) * colGap;
  const startX = W / 2 - totalW / 2;
  const startY = 118;
  const btnH = 36, btnGap = 6, headerH = 38;

  _DEATH_FOLDERS.forEach((folder, fi) => {
    const fx = startX + fi * (colW + colGap);
    folder.sources.forEach((src, si) => {
      const by = startY + headerH + 8 + si * (btnH + btnGap);
      if (Input.mouseX >= fx && Input.mouseX < fx + colW &&
          Input.mouseY >= by && Input.mouseY < by + btnH) {
        gp.devDeathPreview = { source: src.id, startT: t - 1000 };
      }
    });
  });
}

function _drawDevBossSelect(ctx, t) {
  // Death screen preview — overlays everything
  if (gp.devDeathPreview) {
    drawGameOverScreen(ctx, t, gp.char, gp.devDeathPreview.source, gp.devDeathPreview.startT);
    ctx.font      = '13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(148,163,184,0.55)';
    ctx.fillText('ESC — back to browser', W / 2, H - 16);
    return;
  }

  // Death browser sub-menu
  if (gp.devDeathScreen) {
    _drawDevDeathBrowser(ctx, t);
    return;
  }

  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, 0, W, H);

  ctx.font      = 'bold 26px "Segoe UI Black", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,215,0,0.92)';
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur  = 18;
  ctx.fillText('DEV BOSS SELECT', W / 2, 96);
  ctx.shadowBlur = 0;

  ctx.font      = '15px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(148,163,184,0.78)';
  ctx.fillText('Click a boss to fight it directly.  ESC to return.', W / 2, 126);

  const cardW = 210, cardH = 112, gap = 22;
  const total = _DEV_BOSSES.length * cardW + (_DEV_BOSSES.length - 1) * gap;
  const sx    = W / 2 - total / 2;
  const cy    = H / 2 - cardH / 2 - 4;

  _DEV_BOSSES.forEach((btn, i) => {
    const x     = sx + i * (cardW + gap);
    const hover = btn.ready &&
                  Input.mouseX >= x && Input.mouseX < x + cardW &&
                  Input.mouseY >= cy && Input.mouseY < cy + cardH;
    const alpha = btn.ready ? (hover ? 1 : 0.8) : 0.32;

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = 'rgba(12,12,28,0.97)';
    roundRect(ctx, x, cy, cardW, cardH, 10);
    ctx.fill();

    ctx.strokeStyle = hover ? btn.color : 'rgba(80,80,120,0.55)';
    ctx.lineWidth   = hover ? 2.5 : 1.5;
    ctx.shadowColor = btn.color;
    ctx.shadowBlur  = hover ? 18 : 0;
    roundRect(ctx, x, cy, cardW, cardH, 10);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.font      = 'bold 20px "Segoe UI Black", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = btn.color;
    ctx.fillText(btn.label, x + cardW / 2, cy + 44);

    ctx.font      = '14px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(200,200,220,0.82)';
    ctx.fillText(btn.sub, x + cardW / 2, cy + 66);

    ctx.font      = '11px "Courier New", monospace';
    ctx.fillStyle = btn.ready ? 'rgba(74,222,128,0.88)' : 'rgba(90,90,120,0.7)';
    ctx.fillText(btn.ready ? '[ PLAYABLE ]' : '[ COMING SOON ]', x + cardW / 2, cy + 90);

    ctx.restore();
  });

  // "Ending Animation" button below the Gojo card (index 2)
  {
    const gojoCardX = sx + 2 * (cardW + gap);
    const btnW = cardW, btnH = 36, btnY = cy + cardH + 10;
    const hover = Input.mouseX >= gojoCardX && Input.mouseX < gojoCardX + btnW &&
                  Input.mouseY >= btnY       && Input.mouseY < btnY + btnH;
    ctx.save();
    ctx.globalAlpha = hover ? 1 : 0.78;
    ctx.fillStyle   = hover ? 'rgba(30,10,60,0.98)' : 'rgba(12,8,28,0.90)';
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = hover ? 16 : 4;
    roundRect(ctx, gojoCardX, btnY, btnW, btnH, 7); ctx.fill();
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = hover ? 2 : 1.2;
    roundRect(ctx, gojoCardX, btnY, btnW, btnH, 7); ctx.stroke();
    ctx.shadowBlur  = 0;
    ctx.font        = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = '#c4b5fd';
    ctx.fillText('▶  Ending Animation', gojoCardX + btnW / 2, btnY + btnH / 2 + 1);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // "Death Screens" + "Credits" buttons — paired row centered below all boss cards
  {
    const btnW = 210, btnRowH = 36, btnGap = 16;
    const rowY  = cy + cardH + 56;
    const rowX  = W / 2 - btnW - btnGap / 2;

    // Death Screens
    const dsBtnX = rowX;
    const dsHover = Input.mouseX >= dsBtnX && Input.mouseX < dsBtnX + btnW &&
                    Input.mouseY >= rowY    && Input.mouseY < rowY + btnRowH;
    ctx.save();
    ctx.globalAlpha = dsHover ? 1 : 0.78;
    ctx.fillStyle   = dsHover ? 'rgba(10,4,28,0.98)' : 'rgba(8,4,18,0.90)';
    ctx.shadowColor = '#ef4444'; ctx.shadowBlur = dsHover ? 16 : 4;
    roundRect(ctx, dsBtnX, rowY, btnW, btnRowH, 7); ctx.fill();
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = dsHover ? 2 : 1.2;
    roundRect(ctx, dsBtnX, rowY, btnW, btnRowH, 7); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font        = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = '#fca5a5';
    ctx.fillText('☠  Death Screens', dsBtnX + btnW / 2, rowY + btnRowH / 2 + 5);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Credits
    const crBtnX = rowX + btnW + btnGap;
    const crHover = Input.mouseX >= crBtnX && Input.mouseX < crBtnX + btnW &&
                    Input.mouseY >= rowY    && Input.mouseY < rowY + btnRowH;
    ctx.save();
    ctx.globalAlpha = crHover ? 1 : 0.78;
    ctx.fillStyle   = crHover ? 'rgba(6,2,22,0.98)' : 'rgba(8,4,18,0.90)';
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = crHover ? 16 : 4;
    roundRect(ctx, crBtnX, rowY, btnW, btnRowH, 7); ctx.fill();
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = crHover ? 2 : 1.2;
    roundRect(ctx, crBtnX, rowY, btnW, btnRowH, 7); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font        = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = '#c4b5fd';
    ctx.fillText('✦  Credits', crBtnX + btnW / 2, rowY + btnRowH / 2 + 5);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.font      = '12px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(80,80,110,0.65)';
  ctx.fillText('Walk left through the purple door in the first room to return here', W / 2, H - 54);
}

function _updateDevBossSelect(t) {
  // Death preview: ESC dismisses
  if (gp.devDeathPreview) {
    if (Input.justPressed('Escape')) gp.devDeathPreview = null;
    return;
  }

  // Death browser sub-menu
  if (gp.devDeathScreen) {
    _updateDevDeathBrowser(t);
    return;
  }

  if (Input.justPressed('Escape')) {
    gp.devBossSelect    = false;
    gp.devDeathScreen   = false;
    gp.devDeathPreview  = null;
    gp.player.x         = ROOM.x + 24;
    gp.player.y         = ROOM.y + ROOM.h / 2 - PH / 2;
    return;
  }
  if (!Input.clicked) return;

  const cardW = 210, cardH = 112, gap = 22;
  const total = _DEV_BOSSES.length * cardW + (_DEV_BOSSES.length - 1) * gap;
  const sx    = W / 2 - total / 2;
  const cy    = H / 2 - cardH / 2 - 4;

  // "Death Screens" button
  const btnW = 210, btnRowH = 36, btnGap = 16;
  const rowY  = cy + cardH + 56;
  const rowX  = W / 2 - btnW - btnGap / 2;

  const dsBtnX = rowX;
  if (Input.mouseX >= dsBtnX && Input.mouseX < dsBtnX + btnW &&
      Input.mouseY >= rowY    && Input.mouseY < rowY + btnRowH) {
    gp.devDeathScreen = true;
    return;
  }

  // "Credits" button
  const crBtnX = rowX + btnW + btnGap;
  if (Input.mouseX >= crBtnX && Input.mouseX < crBtnX + btnW &&
      Input.mouseY >= rowY    && Input.mouseY < rowY + btnRowH) {
    gp.devBossSelect      = false;
    gp.devLaunchCredits   = true;
    return;
  }

  // "Ending Animation" button below Gojo card
  const gojoCardX = sx + 2 * (cardW + gap);
  const btnH = 36, btnY = cy + cardH + 10;
  if (Input.mouseX >= gojoCardX && Input.mouseX < gojoCardX + cardW &&
      Input.mouseY >= btnY       && Input.mouseY < btnY + btnH) {
    gp.devCinematicPicker = true;
    return;
  }

  _DEV_BOSSES.forEach((btn, i) => {
    if (!btn.ready) return;
    const x = sx + i * (cardW + gap);
    if (Input.mouseX >= x && Input.mouseX < x + cardW &&
        Input.mouseY >= cy  && Input.mouseY < cy + cardH) {
      _launchDevBossFight(btn.id);
    }
  });
}

function _applyDevPowerUpgrade() {
  const pw = gp.power;
  switch (pw.id) {
    case 'haki':         pw.upgraded = true; pw.hakiReflect       = true; break;
    case 'timestop':     pw.upgraded = true; pw.timestopUpgraded  = true; break;
    case 'ally_summon':  pw.upgraded = true; pw.allyUpgraded      = true; break;
    case 'spin':         pw.upgraded = true; pw.spinUpgraded      = true; break;
    case 'king_crimson': pw.upgraded = true; pw.kcUpgraded        = true; break;
    case 'awakening':    pw.upgraded = true; pw.awakeningUpgraded = true; break;
  }
  // Re-init power state so cooldownMax and other init-time values reflect the upgrade
  gp.powerState = _initPowerState(gp.power);
}

function _applyDevStatBoost() {
  const charId   = gp.char.id;
  const awakened = gp.power.id === 'awakening' && gp.power.awakeningUpgraded;
  if (charId === 'kaido') {
    const mult = awakened ? 1.60 : 1.30;
    gp.char.stats.hp = Math.round(gp.char.stats.hp * mult);
    gp.player.maxHp  = gp.char.stats.hp;
    gp.player.hp     = gp.char.stats.hp;
  } else if (charId === 'dio') {
    const mult = awakened ? 1.60 : 1.30;
    gp.char.stats.damage = Math.round(gp.char.stats.damage * mult);
  } else {
    const mult = awakened ? 1.50 : 1.25;
    gp.char.stats.speed = Math.round(gp.char.stats.speed * 100 * mult) / 100;
    gp.player.speed     = gp.char.stats.speed * 58;
  }
  // Full HP restore for all characters (mirrors normal floor 2 transition)
  gp.player.hp = gp.player.maxHp;
}

function _launchDevBossFight(bossType) {
  gp.devBossSelect = false;
  gp.floor         = bossType === 'gojo' ? 3 : bossType === 'enel' ? 2 : 1;
  gp.roomIndex     = gp.rooms.length - 1;
  gp.rooms[gp.roomIndex] = 'boss';
  gp.enemies       = [];
  gp.enemyBullets  = [];
  gp.projectiles   = [];
  gp.activeAttacks = [];
  gp.bossAttacks   = [];
  gp.boss          = null;
  gp.bossDefeated  = false;
  gp.roomCleared   = false;
  gp.kaidoBreath   = { state: 'idle', chargeTimer: 0, fireTimer: 0, cooldownTimer: 0, dir: 'right', tickTimer: 0 };
  gp.player.x      = ROOM.x + 80;
  gp.player.y      = ROOM.y + ROOM.h / 2 - PH / 2;

  // Silently apply upgrades matching what the player would have earned by this floor
  if (bossType === 'enel' || bossType === 'gojo') _applyDevPowerUpgrade();
  if (bossType === 'gojo') _applyDevStatBoost();

  _spawnBoss(bossType);
}

// ─── Dev cinematic picker ─────────────────────────────────────────────────────

const _CIN_CHARS = [
  { id: 'kaido', label: 'KAIDO', color: '#60a5fa' },
  { id: 'dio',   label: 'DIO',   color: '#eab308' },
  { id: 'levi',  label: 'LEVI',  color: '#4ade80' },
];

function _drawDevCinematicPicker(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, W, H);

  ctx.font      = 'bold 24px "Segoe UI Black", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c4b5fd';
  ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 20;
  ctx.fillText('ENDING ANIMATION — CHOOSE CHARACTER', W / 2, 100);
  ctx.shadowBlur = 0;

  ctx.font      = '14px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(148,163,184,0.75)';
  ctx.fillText('Preview the Gojo death cinematic for any character.  ESC to go back.', W / 2, 130);

  const cardW = 200, cardH = 100, gap = 24;
  const total = _CIN_CHARS.length * cardW + (_CIN_CHARS.length - 1) * gap;
  const sx    = W / 2 - total / 2;
  const cy    = H / 2 - cardH / 2;

  _CIN_CHARS.forEach((ch, i) => {
    const x     = sx + i * (cardW + gap);
    const hover = Input.mouseX >= x && Input.mouseX < x + cardW &&
                  Input.mouseY >= cy && Input.mouseY < cy + cardH;
    ctx.save();
    ctx.globalAlpha = hover ? 1 : 0.82;
    ctx.fillStyle   = 'rgba(12,12,28,0.97)';
    roundRect(ctx, x, cy, cardW, cardH, 10); ctx.fill();
    ctx.strokeStyle = hover ? ch.color : 'rgba(80,80,120,0.5)';
    ctx.lineWidth   = hover ? 2.5 : 1.5;
    ctx.shadowColor = ch.color; ctx.shadowBlur = hover ? 20 : 0;
    roundRect(ctx, x, cy, cardW, cardH, 10); ctx.stroke();
    ctx.shadowBlur  = 0;
    ctx.font        = 'bold 22px "Segoe UI Black", "Arial Black", sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = ch.color;
    ctx.fillText(ch.label, x + cardW / 2, cy + 46);
    ctx.font        = '13px "Segoe UI", sans-serif';
    ctx.fillStyle   = 'rgba(200,200,220,0.78)';
    ctx.fillText('[ WATCH ENDING ]', x + cardW / 2, cy + 70);
    ctx.globalAlpha = 1;
    ctx.restore();
  });
}

function _updateDevCinematicPicker() {
  if (Input.justPressed('Escape')) {
    gp.devCinematicPicker = false;
    return;
  }
  if (!Input.clicked) return;

  const cardW = 200, cardH = 100, gap = 24;
  const total = _CIN_CHARS.length * cardW + (_CIN_CHARS.length - 1) * gap;
  const sx    = W / 2 - total / 2;
  const cy    = H / 2 - cardH / 2;

  _CIN_CHARS.forEach((ch, i) => {
    const x = sx + i * (cardW + gap);
    if (Input.mouseX >= x && Input.mouseX < x + cardW &&
        Input.mouseY >= cy && Input.mouseY < cy + cardH) {
      _launchDevCinematic(ch.id);
    }
  });
}

function _launchDevCinematic(charId) {
  const char  = CHARACTERS.find(c => c.id === charId);
  const power = POWERS.find(p => p.id === 'haki') || POWERS[0]; // placeholder power
  gp.devCinematicPicker = false;
  gp.devBossSelect      = false;
  gp.char               = char;
  gp.power              = power;
  // Spawn a dead Gojo boss so asset references work
  _spawnBoss('gojo');
  gp.boss.isDead      = true;
  gp.boss.hp          = 0;
  gp.player.x         = ROOM.x + Math.floor(ROOM.w * 0.18);
  gp.player.y         = ROOM.y + ROOM.h / 2 - PH / 2;
  gp.floor            = 3;
  gp.bossAttacks      = [];
  gp.projectiles      = [];
  gp.activeAttacks    = [];
  gp.kaidoBreath      = { state: 'idle', chargeTimer: 0, fireTimer: 0, cooldownTimer: 0, dir: 'right', tickTimer: 0 };
  gp.powerState       = _initPowerState(power, char);
  _startGojoCinematic();
}

// ─── Skull icon helper (boss door indicator) ─────────────────────────────────

function _drawSkullIcon(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 20;

  ctx.fillStyle   = 'rgba(220,50,50,0.88)';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur  = 10;
  // Cranium
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.08, size * 0.40, size * 0.40, 0, 0, Math.PI * 2);
  ctx.fill();
  // Jaw
  ctx.fillStyle = 'rgba(185,35,35,0.88)';
  ctx.fillRect(-size * 0.24, size * 0.05, size * 0.48, size * 0.20);
  ctx.beginPath();
  ctx.arc(0, size * 0.25, size * 0.24, 0, Math.PI);
  ctx.fill();
  // Eyes
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.ellipse(-size * 0.13, -size * 0.12, size * 0.11, size * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(size * 0.13, -size * 0.12, size * 0.11, size * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Teeth
  ctx.fillStyle = 'rgba(240,220,180,0.82)';
  for (let i = -1; i <= 1; i++) {
    ctx.fillRect(i * size * 0.14 - size * 0.05, size * 0.14, size * 0.10, size * 0.12);
  }

  ctx.restore();
}
