// ─── Game entry point ─────────────────────────────────────────────────────────

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

Input.init(canvas);

let _lastTime = 0;

// ─── Game state ───────────────────────────────────────────────────────────────

let currentState = STATE.TITLE;
let _prevState   = STATE.CHAR_SELECT; // restored when leaving DEV_POWERS

let _gameOverChar       = null;
let _gameOverKillSource = 'enemy';
let _gameOverStartT     = 0;
let _creditsStartT      = 0;

// ─── Pause menu ───────────────────────────────────────────────────────────────

let _paused      = false;
let _pauseSel    = 0; // 0=Resume 1=Restart 2=Quit

const _PAUSE_ITEMS = ['Resume', 'Restart Run', 'Quit to Title'];

function _canPause() {
  // Only pause during active gameplay — not during cinematic, game-over, boss-defeated, or dev overlays
  return currentState === STATE.PLAYING && gp && !gp.cinematic && !gp.gameOver &&
         !gp.bossDefeated && !gp.devBossSelect && !gp.devCinematicPicker;
}

function _autoPause() {
  if (_canPause() && !_paused) {
    _paused   = true;
    _pauseSel = 0;
  }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) _autoPause(); });
window.addEventListener('blur', _autoPause);

function _updatePauseMenu() {
  // Keyboard navigation
  if (Input.justPressed('ArrowUp')   || Input.justPressed('KeyW')) _pauseSel = (_pauseSel + 2) % 3;
  if (Input.justPressed('ArrowDown') || Input.justPressed('KeyS')) _pauseSel = (_pauseSel + 1) % 3;

  // Mouse hover
  const { bx, by, bw, itemH, gap } = _pauseLayout();
  for (let i = 0; i < _PAUSE_ITEMS.length; i++) {
    const iy = by + i * (itemH + gap);
    if (Input.mouseX >= bx && Input.mouseX < bx + bw &&
        Input.mouseY >= iy && Input.mouseY < iy + itemH) {
      _pauseSel = i;
    }
  }

  // Confirm
  const clicked = Input.clicked;
  const entered = Input.justPressed('Enter');
  if (!clicked && !entered) return;

  if (clicked) {
    // Only activate if mouse is over the hovered item
    const iy = by + _pauseSel * (itemH + gap);
    if (!(Input.mouseX >= bx && Input.mouseX < bx + bw &&
          Input.mouseY >= iy && Input.mouseY < iy + itemH)) return;
  }

  _paused = false;
  if (_pauseSel === 0) {
    // Resume — nothing else to do
  } else if (_pauseSel === 1) {
    // Restart Run: fresh floor 1 with same char + power
    initGameplay(gp.char, gp.power);
  } else {
    // Quit to Title
    charSelectState.hoveredCard  = -1;
    charSelectState.selectedCard = -1;
    currentState = STATE.CHAR_SELECT;
  }
}

function _pauseLayout() {
  const bw    = 340;
  const itemH = 52;
  const gap   = 10;
  const titleH = 70;
  const padV   = 28;
  const totalH = titleH + padV + _PAUSE_ITEMS.length * itemH + (_PAUSE_ITEMS.length - 1) * gap + padV;
  const bx    = W / 2 - bw / 2;
  const by    = H / 2 - totalH / 2 + titleH + padV;
  return { bx, by, bw, itemH, gap, totalH, titleH, padV };
}

function _drawPauseMenu() {
  const charColor = (gp && gp.char) ? gp.char.color.main : '#a78bfa';

  // Dim the scene behind
  ctx.fillStyle = 'rgba(2,2,14,0.78)';
  ctx.fillRect(0, 0, W, H);

  const { bx, by, bw, itemH, gap, totalH, titleH, padV } = _pauseLayout();
  const panelX = bx - 28;
  const panelY = H / 2 - totalH / 2;
  const panelW = bw + 56;
  const panelH = totalH;

  // Panel background
  ctx.save();
  ctx.fillStyle   = 'rgba(6,4,22,0.97)';
  ctx.shadowColor = charColor;
  ctx.shadowBlur  = 32;
  roundRect(ctx, panelX, panelY, panelW, panelH, 14);
  ctx.fill();
  ctx.strokeStyle = charColor;
  ctx.lineWidth   = 1.8;
  ctx.shadowBlur  = 0;
  roundRect(ctx, panelX, panelY, panelW, panelH, 14);
  ctx.stroke();
  ctx.restore();

  // Title
  ctx.save();
  ctx.font        = 'bold 36px "Segoe UI Black", "Arial Black", sans-serif';
  ctx.textAlign   = 'center';
  ctx.fillStyle   = charColor;
  ctx.shadowColor = charColor;
  ctx.shadowBlur  = 22;
  ctx.fillText('PAUSED', W / 2, panelY + 46);
  ctx.shadowBlur  = 0;

  // Thin divider
  ctx.strokeStyle = `${charColor}55`;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(panelX + 20, panelY + titleH);
  ctx.lineTo(panelX + panelW - 20, panelY + titleH);
  ctx.stroke();
  ctx.restore();

  // Menu items
  for (let i = 0; i < _PAUSE_ITEMS.length; i++) {
    const iy      = by + i * (itemH + gap);
    const sel     = i === _pauseSel;
    const isQuit  = i === 2;
    const itemColor = isQuit ? '#f87171' : sel ? charColor : 'rgba(200,200,220,0.72)';

    ctx.save();
    ctx.globalAlpha = sel ? 1 : 0.82;

    // Item bg
    ctx.fillStyle   = sel ? `${charColor}18` : 'rgba(255,255,255,0.03)';
    ctx.shadowColor = sel ? charColor : 'transparent';
    ctx.shadowBlur  = sel ? 14 : 0;
    roundRect(ctx, bx, iy, bw, itemH, 8);
    ctx.fill();

    // Item border
    ctx.strokeStyle = sel ? itemColor : 'rgba(80,80,120,0.35)';
    ctx.lineWidth   = sel ? 1.8 : 1;
    ctx.shadowBlur  = 0;
    roundRect(ctx, bx, iy, bw, itemH, 8);
    ctx.stroke();

    // Label
    ctx.font        = `${sel ? 'bold' : ''} 18px "Segoe UI", sans-serif`;
    ctx.textAlign   = 'center';
    ctx.fillStyle   = itemColor;
    ctx.shadowColor = sel ? itemColor : 'transparent';
    ctx.shadowBlur  = sel ? 10 : 0;
    ctx.fillText(_PAUSE_ITEMS[i], bx + bw / 2, iy + itemH / 2 + 6);

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Hint
  ctx.font      = '12px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(100,100,130,0.65)';
  ctx.fillText('↑↓ navigate   Enter confirm   ESC resume', W / 2, panelY + panelH + 18);
}

let selectedChar  = null;
let selectedPower = null;

const charSelectState = {
  hoveredCard:  -1,
  selectedCard: -1,
};

const powerSelectState = {
  char:         null,
  offered:      [],
  hoveredCard:  -1,
  selectedCard: -1,
};

const devPowersState = {
  hoveredCard: -1,
};

// Floor transition screens
const upgradeState = {
  char: null, power: null,
  options: [], hoveredCard: -1, selectedCard: -1,
};

const statBoostState = {
  char: null, power: null,
  options: [], hoveredCard: -1, selectedCard: -1,
};

function _initUpgradeState() {
  upgradeState.char  = { ...gp.char, stats: { ...gp.char.stats } };
  upgradeState.power = { ...gp.power };

  // One power-specific upgrade applied on confirm
  const _applyMap = {
    haki:         (c, pw) => { pw.upgraded = true; pw.hakiReflect     = true; },
    timestop:     (c, pw) => { pw.upgraded = true; pw.timestopUpgraded = true; },
    ally_summon:  (c, pw) => { pw.upgraded = true; pw.allyUpgraded    = true; },
    spin:         (c, pw) => { pw.upgraded = true; pw.spinUpgraded    = true; },
    king_crimson: (c, pw) => { pw.upgraded = true; pw.kcUpgraded      = true; },
    awakening:    (c, pw) => { pw.upgraded = true; pw.awakeningUpgraded = true; },
  };
  const applyFn = _applyMap[gp.power.id] || ((c, pw) => { pw.upgraded = true; });
  upgradeState.options      = [{ apply: applyFn }];
  upgradeState.hoveredCard  = -1;
  upgradeState.selectedCard = -1;
}

function _initStatBoostState() {
  statBoostState.char  = { ...gp.char, stats: { ...gp.char.stats } };
  statBoostState.power = { ...gp.power };

  const charId   = gp.char.id;
  const awakened = gp.power.id === 'awakening' && gp.power.awakeningUpgraded;
  if (charId === 'kaido') {
    const mult  = awakened ? 1.60 : 1.30;
    const label = awakened ? 'MAX HP +60%' : 'MAX HP +30%';
    statBoostState.option   = { label, desc: `+${awakened ? 60 : 30}% Max HP — your endurance grows`, apply: (c) => { c.stats.hp = Math.round(c.stats.hp * mult); } };
    statBoostState.fullHeal = true;
  } else if (charId === 'dio') {
    const mult  = awakened ? 1.60 : 1.30;
    const label = awakened ? 'DAMAGE +60%' : 'DAMAGE +30%';
    statBoostState.option   = { label, desc: `+${awakened ? 60 : 30}% attack damage — your power intensifies`, apply: (c) => { c.stats.damage = Math.round(c.stats.damage * mult); } };
    statBoostState.fullHeal = false;
  } else {
    const mult  = awakened ? 1.50 : 1.25;
    const label = awakened ? 'SPEED +50%' : 'SPEED +25%';
    statBoostState.option   = { label, desc: `+${awakened ? 50 : 25}% movement & attack speed — you become a blur`, apply: (c) => { c.stats.speed = Math.round(c.stats.speed * 100 * mult) / 100; } };
    statBoostState.fullHeal = false;
  }
}

// ─── HUD visibility ───────────────────────────────────────────────────────────

const _hudTop    = document.getElementById('hud-top');
const _hudBottom = document.getElementById('hud-bottom');
let   _hudShown  = false;

function _setHUD(visible) {
  if (visible === _hudShown) return;
  _hudShown = visible;
  const v = visible ? 'flex' : 'none';
  _hudTop.style.display    = v;
  _hudBottom.style.display = v;
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

function loop(timestamp) {
  const dt = Math.min((timestamp - _lastTime) / 1000, 0.05);
  _lastTime = timestamp;
  const t   = timestamp;
  ctx.clearRect(0, 0, W, H);

  _setHUD(currentState === STATE.PLAYING && !(gp && gp.cinematic));

  switch (currentState) {

    case STATE.TITLE: {
      drawTitleScreen(ctx, t);
      if (Input.justPressed('Enter')) {
        charSelectState.hoveredCard  = -1;
        charSelectState.selectedCard = -1;
        currentState = STATE.CHAR_SELECT;
      }
      break;
    }

    case STATE.CHAR_SELECT: {
      drawCharSelect(ctx, charSelectState, t);
      const result = updateCharSelect(charSelectState, t);
      if (result) {
        selectedChar = result.char;
        // Initialise power select for this run
        powerSelectState.char         = selectedChar;
        powerSelectState.offered      = pickPowers(selectedChar.id);
        powerSelectState.hoveredCard  = -1;
        powerSelectState.selectedCard = -1;
        currentState = result.next; // STATE.POWER_SELECT
      }
      break;
    }

    case STATE.POWER_SELECT: {
      // F1 opens dev menu only from this screen
      if (Input.justPressed('F1')) {
        _prevState   = currentState;
        currentState = STATE.DEV_POWERS;
        break;
      }
      drawPowerSelect(ctx, powerSelectState, t);
      const result = updatePowerSelect(powerSelectState, t);
      if (result) {
        selectedPower = result.power;
        initGameplay(selectedChar, selectedPower);
        currentState  = result.next; // STATE.PLAYING
      }
      break;
    }

    case STATE.DEV_POWERS: {
      drawDevPowers(ctx, devPowersState, t);
      const devResult = updateDevPowers(devPowersState, t);
      if (devResult) {
        selectedPower = devResult.power;
        initGameplay(powerSelectState.char, selectedPower);
        currentState = STATE.PLAYING;
      }
      if (Input.justPressed('Escape') || Input.justPressed('F1')) {
        currentState = _prevState;
      }
      break;
    }

    case STATE.PLAYING: {
      // Pause toggle — only when gameplay is in an interruptible state
      if (Input.justPressed('Escape') && (_canPause() || _paused)) {
        _paused   = !_paused;
        _pauseSel = 0;
      }

      if (!_paused) updateGameplay(dt, t);
      drawGameplay(ctx, t);

      if (_paused) {
        _drawPauseMenu();
        _updatePauseMenu();
      }

      // Transition to dedicated game over screen
      if (!_paused && gp && gp.gameOver) {
        _gameOverChar       = gp.char;
        _gameOverKillSource = gp.killSource || 'enemy';
        _gameOverStartT     = t;
        currentState = STATE.GAME_OVER;
        break;
      }

      // Dev shortcut: launch credits directly from boss picker
      if (gp && gp.devLaunchCredits) {
        gp.devLaunchCredits = false;
        _creditsStartT = t;
        currentState = STATE.CREDITS;
        break;
      }

      // Check for floor completion signal
      if (!_paused && gp && gp.floorComplete) {
        _paused          = false;
        gp.floorComplete = false;
        if (gp.floor === 1) {
          _initUpgradeState();
          currentState = STATE.UPGRADE;
        } else if (gp.floor === 2) {
          _initStatBoostState();
          currentState = STATE.STAT_BOOST;
        } else {
          _creditsStartT = t;
          currentState = STATE.CREDITS;
        }
      }
      break;
    }

    case STATE.UPGRADE: {
      drawBackground(ctx, t);
      drawUpgradeScreen(ctx, upgradeState, t);
      const upResult = updateUpgradeScreen(upgradeState, t);
      if (upResult) {
        const boostedChar  = upResult.char;
        const boostedPower = upResult.power;
        initGameplay(boostedChar, boostedPower, { floor: 2, startHp: boostedChar.stats.hp });
        selectedChar  = boostedChar;
        selectedPower = boostedPower;
        currentState  = STATE.PLAYING;
      }
      break;
    }

    case STATE.STAT_BOOST: {
      drawBackground(ctx, t);
      drawStatBoostScreen(ctx, statBoostState, t);
      const sbResult = updateStatBoostScreen(statBoostState, t);
      if (sbResult) {
        const boostedChar  = sbResult.char;
        const boostedPower = sbResult.power;
        const floorHp = boostedChar.stats.hp;
        initGameplay(boostedChar, boostedPower, { floor: 3, startHp: floorHp });
        selectedChar  = boostedChar;
        selectedPower = boostedPower;
        currentState  = STATE.PLAYING;
      }
      break;
    }

    case STATE.GAME_OVER: {
      // Draw frozen gameplay scene underneath, then overlay death screen
      drawGameplay(ctx, t);
      drawGameOverScreen(ctx, t, _gameOverChar, _gameOverKillSource, _gameOverStartT);
      if (Input.justPressed('Enter')) {
        charSelectState.hoveredCard  = -1;
        charSelectState.selectedCard = -1;
        currentState = STATE.TITLE;
      }
      break;
    }

    case STATE.CREDITS: {
      drawCreditsScreen(ctx, t, _creditsStartT);
      if (Input.justPressed('Enter')) {
        charSelectState.hoveredCard  = -1;
        charSelectState.selectedCard = -1;
        currentState = STATE.CHAR_SELECT;
      }
      break;
    }

    default: {
      drawBackground(ctx, t);
      break;
    }
  }

  Input.flush();
  requestAnimationFrame(loop);
}

Assets.init().then(() => requestAnimationFrame(loop));
