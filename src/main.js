// ─── Game entry point ─────────────────────────────────────────────────────────

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

Input.init(canvas);

// ─── Game State ───────────────────────────────────────────────────────────────

let currentState = STATE.CHAR_SELECT;
let selectedChar = null;

const charSelectState = {
  hoveredCard:  -1,
  selectedCard: -1,
};

// ─── Placeholder screens ──────────────────────────────────────────────────────

function drawPowerSelectPlaceholder(ctx, t) {
  drawBackground(ctx, t);
  ctx.font = `bold 36px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#a855f7';
  ctx.shadowBlur = 20;
  ctx.fillText('POWER SELECT', W / 2, H / 2 - 20);
  ctx.shadowBlur = 0;
  ctx.font = `18px "Segoe UI", sans-serif`;
  ctx.fillStyle = COLORS.dim;
  ctx.fillText('(Coming next…)', W / 2, H / 2 + 20);
  ctx.fillStyle = selectedChar ? selectedChar.color.main : '#fff';
  ctx.fillText(
    selectedChar ? `Playing as ${selectedChar.name}` : '',
    W / 2, H / 2 + 54
  );
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

let lastTime = 0;

function loop(timestamp) {
  const t = timestamp;
  ctx.clearRect(0, 0, W, H);

  switch (currentState) {
    case STATE.CHAR_SELECT: {
      drawCharSelect(ctx, charSelectState, t);
      const result = updateCharSelect(charSelectState, t);
      if (result) {
        selectedChar   = result.char;
        currentState   = result.next;
      }
      break;
    }

    case STATE.POWER_SELECT: {
      drawPowerSelectPlaceholder(ctx, t);
      break;
    }

    default:
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
  }

  Input.flush();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
