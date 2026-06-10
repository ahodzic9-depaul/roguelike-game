// ─── Power definitions ────────────────────────────────────────────────────────

const POWERS = [
  {
    id:      'haki',
    name:    'Haki',
    type:    'passive',
    color:   { main: '#f59e0b', glow: 'rgba(245,158,11,' },
    desc:    'Passive damage reduction — every hit you take deals less damage.',
    upgrade: 'Also reflects a portion of incoming damage back at your attacker.',
    icon:    'shield',
  },
  {
    id:      'timestop',
    name:    'Timestop',
    type:    'active',
    color:   { main: '#a78bfa', glow: 'rgba(167,139,250,' },
    desc:    'Briefly freezes all enemies in the room.',
    upgrade: 'Reduces cooldown significantly and deals light damage to frozen enemies.',
    icon:    'clock',
  },
  {
    id:      'ally_summon',
    name:    'Ally Summon',
    type:    'active',
    color:   { main: '#34d399', glow: 'rgba(52,211,153,' },
    desc:    'Summons a temporary allied fighter to battle alongside you.',
    upgrade: 'Summons two allies instead of one.',
    icon:    'ally',
  },
  {
    id:      'spin',
    name:    'Spin',
    type:    'passive',
    color:   { main: '#fb923c', glow: 'rgba(251,146,60,' },
    desc:    'Your attacks gain homing, curving toward nearby enemies.',
    upgrade: 'Homing tightens and knives pierce through additional enemies. For Levi, increases sweep radius instead.',
    icon:    'spin',
  },
  {
    id:      'king_crimson',
    name:    'King Crimson',
    type:    'active',
    color:   { main: '#f43f5e', glow: 'rgba(244,63,94,' },
    desc:    'Dash or blink forward to dodge incoming attacks.',
    upgrade: 'Leave damaging afterimages along the dash path that hurt any enemy they pass through.',
    icon:    'dash',
  },
  {
    id:      'awakening',
    name:    'Awakening',
    type:    'passive',
    color:   { main: '#e879f9', glow: 'rgba(232,121,249,' },
    desc:    '20% chance to crit for 2× damage on every hit. Stat upgrades are also far more extreme.',
    upgrade: 'The Floor 3 character stat boost becomes absolutely massive.',
    icon:    'burst',
  },
];

// Returns two distinct powers chosen at random.
// charId: exclude Spin from Kaido's pool (homing on a beam makes no sense).
function pickPowers(charId) {
  let pool = POWERS;
  if (charId === 'kaido') pool = POWERS.filter(p => p.id !== 'spin');
  const s = [...pool].sort(() => Math.random() - 0.5);
  return [s[0], s[1]];
}

// ─── Power icons (canvas) ─────────────────────────────────────────────────────

function drawPowerIcon_canvas(ctx, id, cx, cy, r, col) {
  ctx.save();
  ctx.fillStyle   = col.main;
  ctx.strokeStyle = col.main;
  ctx.shadowColor = col.main;
  ctx.shadowBlur  = 18;

  switch (id) {

    case 'shield': {
      // Heraldic shield body
      ctx.beginPath();
      ctx.moveTo(cx,           cy - r);
      ctx.lineTo(cx + r * .74, cy - r * .36);
      ctx.lineTo(cx + r * .60, cy + r * .58);
      ctx.lineTo(cx,           cy + r);
      ctx.lineTo(cx - r * .60, cy + r * .58);
      ctx.lineTo(cx - r * .74, cy - r * .36);
      ctx.closePath();
      ctx.fill();
      // Cross inlay
      ctx.shadowBlur = 0;
      ctx.fillStyle  = 'rgba(0,0,0,0.30)';
      ctx.fillRect(cx - r*.09, cy - r*.58, r*.18, r*.90);
      ctx.fillRect(cx - r*.44, cy - r*.12, r*.88, r*.20);
      break;
    }

    case 'clock': {
      // Outer ring
      ctx.lineWidth = r * .11;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      // Hour markers
      ctx.lineWidth = r * .08;
      for (let i = 0; i < 12; i++) {
        const a     = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const inner = i % 3 === 0 ? r * .65 : r * .78;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner,    cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * r * .90,  cy + Math.sin(a) * r * .90);
        ctx.stroke();
      }
      // Clock hands (stopped at 10:10)
      ctx.lineCap   = 'round';
      const hA = (10 / 12) * Math.PI * 2 - Math.PI / 2;
      const mA = ( 2 / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.lineWidth = r * .11;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(hA) * r * .52, cy + Math.sin(hA) * r * .52);
      ctx.stroke();
      ctx.lineWidth = r * .08;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(mA) * r * .74, cy + Math.sin(mA) * r * .74);
      ctx.stroke();
      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, r * .10, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'ally': {
      const person = (px, py, scale, alpha) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = col.main;
        ctx.shadowBlur  = alpha > .8 ? 14 : 0;
        ctx.beginPath();
        ctx.arc(px, py - r * .50 * scale, r * .23 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(px - r*.19*scale, py - r*.27*scale, r*.38*scale, r*.60*scale, r*.08*scale);
        ctx.fill();
      };
      person(cx - r * .40, cy + r * .08, .88, .42);
      person(cx + r * .28, cy,           1.0, 1.0);
      ctx.globalAlpha = 1;
      break;
    }

    case 'spin': {
      ctx.lineWidth = r * .12;
      ctx.lineCap   = 'round';
      for (let i = 0; i < 3; i++) {
        const s = (i / 3) * Math.PI * 2 - .10;
        const e = s + Math.PI * 1.20;
        ctx.beginPath();
        ctx.arc(cx, cy, r * .58, s, e);
        ctx.stroke();
        // Arrowhead at arc end
        const ax = cx + Math.cos(e) * r * .58;
        const ay = cy + Math.sin(e) * r * .58;
        const tg = e + Math.PI / 2;
        ctx.lineWidth = r * .10;
        ctx.beginPath();
        ctx.moveTo(ax + Math.cos(tg - .5) * r*.22, ay + Math.sin(tg - .5) * r*.22);
        ctx.lineTo(ax, ay);
        ctx.lineTo(ax + Math.cos(tg + .5) * r*.22, ay + Math.sin(tg + .5) * r*.22);
        ctx.stroke();
        ctx.lineWidth = r * .12;
      }
      break;
    }

    case 'dash': {
      const silhouette = (ox, oy, scale, alpha) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = col.main;
        ctx.shadowBlur  = alpha > .8 ? 14 : 0;
        ctx.beginPath();
        ctx.arc(ox, oy - r*.46*scale, r*.21*scale, 0, Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(ox - r*.17*scale, oy - r*.25*scale, r*.34*scale, r*.54*scale, r*.07*scale);
        ctx.fill();
      };
      silhouette(cx - r * .74, cy, .84, .16);
      silhouette(cx - r * .32, cy, .92, .42);
      silhouette(cx + r * .12, cy, 1.0, 1.0);
      ctx.globalAlpha = 1;
      // Speed lines
      ctx.strokeStyle  = col.main;
      ctx.lineWidth    = r * .07;
      ctx.lineCap      = 'round';
      ctx.shadowBlur   = 6;
      [- r*.18, 0, r*.18].forEach(dy => {
        ctx.globalAlpha = .45;
        ctx.beginPath();
        ctx.moveTo(cx - r * .72, cy + dy);
        ctx.lineTo(cx - r * .38, cy + dy);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      break;
    }

    case 'burst': {
      // Alternating long/short rays
      for (let i = 0; i < 8; i++) {
        const a    = (i / 8) * Math.PI * 2;
        const long = i % 2 === 0;
        ctx.lineWidth = long ? r * .14 : r * .08;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * .33, cy + Math.sin(a) * r * .33);
        ctx.lineTo(cx + Math.cos(a) * (long ? r : r * .70),
                   cy + Math.sin(a) * (long ? r : r * .70));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r * .28, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
}
