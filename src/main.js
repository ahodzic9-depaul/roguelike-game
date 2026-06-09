// ─── Game entry point ─────────────────────────────────────────────────────────

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

Input.init(canvas);

let _lastTime = 0;

// ─── Game state ───────────────────────────────────────────────────────────────

let currentState = STATE.CHAR_SELECT;
let _prevState   = STATE.CHAR_SELECT; // restored when leaving DEV_POWERS

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
  upgradeState.char    = { ...gp.char, stats: { ...gp.char.stats } };
  upgradeState.power   = { ...gp.power };
  upgradeState.options = [
    { label: 'DAMAGE UP',   desc: '+25% attack damage',         apply: (c, pw) => { c.stats.damage *= 1.25; } },
    { label: 'ABILITY CD',  desc: 'Ability cooldown -30%',       apply: (c, pw) => { pw.cooldownMult = (pw.cooldownMult || 1) * 0.70; } },
    { label: 'VITALITY',    desc: '+20% Max HP, restore 50% HP', apply: (c, pw) => { c.stats.hp = Math.round(c.stats.hp * 1.20); } },
  ];
  upgradeState.hoveredCard  = -1;
  upgradeState.selectedCard = -1;
}

function _initStatBoostState() {
  statBoostState.char    = { ...gp.char, stats: { ...gp.char.stats } };
  statBoostState.power   = { ...gp.power };
  statBoostState.options = [
    { label: 'MAX HP +30%',   desc: '+30% Max HP, full restore', apply: (c, pw) => { c.stats.hp = Math.round(c.stats.hp * 1.30); } },
    { label: 'DAMAGE +30%',   desc: '+30% attack damage',        apply: (c, pw) => { c.stats.damage = Math.round(c.stats.damage * 1.30); } },
    { label: 'SPEED +25%',    desc: '+25% movement & attack speed', apply: (c, pw) => { c.stats.speed = Math.round(c.stats.speed * 100 * 1.25) / 100; } },
  ];
  statBoostState.hoveredCard  = -1;
  statBoostState.selectedCard = -1;
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
      updateGameplay(dt, t);
      drawGameplay(ctx, t);
      // Check for floor completion signal
      if (gp && gp.floorComplete) {
        gp.floorComplete = false;
        if (gp.floor === 1) {
          _initUpgradeState();
          currentState = STATE.UPGRADE;
        } else if (gp.floor === 2) {
          _initStatBoostState();
          currentState = STATE.STAT_BOOST;
        } else {
          currentState = STATE.WIN;
        }
      }
      break;
    }

    case STATE.UPGRADE: {
      drawBackground(ctx, t);
      drawUpgradeScreen(ctx, upgradeState, t);
      const upResult = updateUpgradeScreen(upgradeState, t);
      if (upResult) {
        // Apply upgrade to a clone of char/power, then start floor 2
        const boostedChar  = upResult.char;
        const boostedPower = upResult.power;
        const healedHp = Math.min(boostedChar.stats.hp,
          Math.floor(gp.player.hp + (boostedChar.stats.hp - gp.player.hp) * 0.5));
        const floorHp = upResult.fullHeal ? boostedChar.stats.hp : healedHp;
        initGameplay(boostedChar, boostedPower, { floor: 2, startHp: floorHp });
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
        const floorHp = sbResult.fullHeal ? boostedChar.stats.hp
          : Math.min(boostedChar.stats.hp,
              Math.floor(gp.player.hp + (boostedChar.stats.hp - gp.player.hp) * 0.6));
        initGameplay(boostedChar, boostedPower, { floor: 3, startHp: floorHp });
        selectedChar  = boostedChar;
        selectedPower = boostedPower;
        currentState  = STATE.PLAYING;
      }
      break;
    }

    case STATE.WIN: {
      drawBackground(ctx, t);
      drawWinScreen(ctx, t);
      if (Input.justPressed('Enter')) {
        // Reset to fresh character select
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
