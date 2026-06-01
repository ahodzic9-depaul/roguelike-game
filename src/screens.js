// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function glowText(ctx, text, x, y, color, blur, font) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + ' ';
    if (ctx.measureText(test).width > maxW && i > 0) {
      ctx.fillText(line.trim(), x, y);
      line = words[i] + ' ';
      y += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, y);
}

// ─── Background ───────────────────────────────────────────────────────────────

let _bgStars = null;

function initStars() {
  _bgStars = Array.from({ length: 120 }, () => ({
    x:  Math.random() * W,
    y:  Math.random() * H,
    r:  Math.random() * 1.5 + 0.3,
    a:  Math.random() * Math.PI * 2,
    spd: Math.random() * 0.3 + 0.05,
  }));
}

function drawBackground(ctx, t) {
  // Deep space gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#04040f');
  bg.addColorStop(1, '#0a0520');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (!_bgStars) initStars();

  _bgStars.forEach(s => {
    s.y += s.spd;
    if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    const pulse = 0.4 + 0.6 * Math.sin(t * 0.001 + s.a);
    ctx.fillStyle = `rgba(200,210,255,${pulse * 0.8})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Vignette
  const vig = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.85);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

// ─── Portraits ────────────────────────────────────────────────────────────────

function drawKaidoPortrait(ctx, x, y, w, h, t) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#3b0000');
  g.addColorStop(1, '#0f0000');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  const cx = x + w / 2, cy = y + h * 0.56;

  // Legs
  ctx.fillStyle = '#991b1b';
  ctx.fillRect(cx - 28, cy + 28, 22, 50);
  ctx.fillRect(cx + 6,  cy + 28, 22, 50);

  // Wide torso
  ctx.fillStyle = '#b91c1c';
  ctx.beginPath();
  ctx.roundRect(cx - 46, cy - 22, 92, 58, 10);
  ctx.fill();

  // Arms (huge)
  ctx.fillStyle = '#9f1313';
  ctx.beginPath();
  ctx.ellipse(cx - 58, cy + 2, 16, 36, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 58, cy + 2, 16, 36, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#b91c1c';
  ctx.beginPath();
  ctx.arc(cx, cy - 42, 32, 0, Math.PI * 2);
  ctx.fill();

  // Horns
  ctx.fillStyle = '#d97706';
  [[cx - 20, cy - 68, cx - 32, cy - 106, cx - 8, cy - 70],
   [cx + 20, cy - 68, cx + 32, cy - 106, cx + 8, cy - 70]].forEach(([x1,y1,x2,y2,x3,y3]) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
  });

  // Scales on torso
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      ctx.beginPath();
      ctx.arc(cx - 36 + i * 18, cy - 8 + j * 20, 9, 0, Math.PI);
      ctx.stroke();
    }
  }

  // Glowing eyes
  const eyeGlow = 0.65 + Math.sin(t * 0.003) * 0.35;
  ctx.shadowColor = '#facc15';
  ctx.shadowBlur = 12;
  ctx.fillStyle = `rgba(255,220,0,${eyeGlow})`;
  ctx.beginPath();
  ctx.ellipse(cx - 12, cy - 42, 8, 5, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 12, cy - 42, 8, 5, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Kanabō (spiked club)
  const clubX = cx + 72, clubBaseY = cy + 65, clubTopY = cy - 78;
  ctx.fillStyle = '#78350f';
  ctx.fillRect(clubX - 7, clubTopY, 14, clubBaseY - clubTopY);
  ctx.fillStyle = '#57534e';
  for (let i = 0; i < 6; i++) {
    const sy = clubTopY + 14 + i * 20;
    ctx.beginPath();
    ctx.arc(clubX - 12, sy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(clubX + 12, sy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fire breath (animated)
  const ft = t * 0.0042;
  for (let i = 0; i < 7; i++) {
    const frac = i / 7;
    const fw = (1 - frac) * 22 + 4;
    const fx = cx - 52 - frac * 30 + Math.sin(ft + i) * 8;
    const fy = cy - 36 - frac * 10;
    const alpha = (1 - frac) * 0.75 + 0.1;
    ctx.fillStyle = i < 3
      ? `rgba(255,${80 + i*40},0,${alpha})`
      : `rgba(255,220,0,${alpha * 0.6})`;
    ctx.beginPath();
    ctx.arc(fx, fy, fw / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawDioPortrait(ctx, x, y, w, h, t) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#1e0535');
  g.addColorStop(1, '#08010f');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  const cx = x + w / 2, cy = y + h * 0.52;

  // Cape (back layer)
  ctx.fillStyle = '#3b0764';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 65);
  ctx.bezierCurveTo(cx - 70, cy - 20, cx - 85, cy + 40, cx - 55, cy + 85);
  ctx.lineTo(cx + 55, cy + 85);
  ctx.bezierCurveTo(cx + 85, cy + 40, cx + 70, cy - 20, cx, cy - 65);
  ctx.fill();
  // Cape highlight
  ctx.fillStyle = '#4c1d95';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 65);
  ctx.bezierCurveTo(cx - 50, cy - 10, cx - 60, cy + 30, cx - 35, cy + 80);
  ctx.lineTo(cx + 35, cy + 80);
  ctx.bezierCurveTo(cx + 60, cy + 30, cx + 50, cy - 10, cx, cy - 65);
  ctx.fill();

  // Torso / shirt
  ctx.fillStyle = '#1e1b4b';
  ctx.beginPath();
  ctx.roundRect(cx - 26, cy - 18, 52, 55, 5);
  ctx.fill();
  // Heart emblem
  ctx.fillStyle = '#c084fc';
  ctx.beginPath();
  ctx.arc(cx - 6, cy + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 6, cy + 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy + 6);
  ctx.lineTo(cx, cy + 20);
  ctx.lineTo(cx + 12, cy + 6);
  ctx.fill();

  // Head
  ctx.fillStyle = '#fde8c8';
  ctx.beginPath();
  ctx.arc(cx, cy - 44, 28, 0, Math.PI * 2);
  ctx.fill();

  // Hair (Dio's iconic swept-back hair)
  ctx.fillStyle = '#d4a017';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 70, 22, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy - 62);
  ctx.quadraticCurveTo(cx - 40, cy - 56, cx - 28, cy - 44);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 22, cy - 62);
  ctx.quadraticCurveTo(cx + 40, cy - 56, cx + 28, cy - 44);
  ctx.fill();

  // Crown
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.moveTo(cx - 24, cy - 74);
  ctx.lineTo(cx - 20, cy - 94);
  ctx.lineTo(cx - 10, cy - 80);
  ctx.lineTo(cx,      cy - 96);
  ctx.lineTo(cx + 10, cy - 80);
  ctx.lineTo(cx + 20, cy - 94);
  ctx.lineTo(cx + 24, cy - 74);
  ctx.closePath();
  ctx.fill();
  // Crown jewels
  ctx.fillStyle = '#c084fc';
  [[cx - 16, cy - 78], [cx, cy - 82], [cx + 16, cy - 78]].forEach(([jx, jy]) => {
    ctx.beginPath();
    ctx.arc(jx, jy, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Eyes (vampiric red glow)
  const eGlow = 0.6 + Math.sin(t * 0.0025) * 0.4;
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 14;
  ctx.fillStyle = `rgba(239,68,68,${eGlow})`;
  ctx.beginPath();
  ctx.ellipse(cx - 10, cy - 44, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 10, cy - 44, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Fangs
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - 32);
  ctx.lineTo(cx - 3, cy - 22);
  ctx.lineTo(cx, cy - 32);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 32);
  ctx.lineTo(cx + 3, cy - 22);
  ctx.lineTo(cx + 6, cy - 32);
  ctx.fill();

  // Floating knives (animated)
  const knifeAngle = t * 0.002;
  const knifeCount = 5;
  for (let i = 0; i < knifeCount; i++) {
    const angle = knifeAngle + (i / knifeCount) * Math.PI * 2;
    const orbitR = 75;
    const kx = cx + Math.cos(angle) * orbitR;
    const ky = cy + Math.sin(angle) * orbitR * 0.4 - 10;
    ctx.save();
    ctx.translate(kx, ky);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(3, 6);
    ctx.lineTo(0, 4);
    ctx.lineTo(-3, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-2, 6, 4, 8);
    ctx.restore();
  }

  ctx.restore();
}

function drawLeviPortrait(ctx, x, y, w, h, t) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#001a3a');
  g.addColorStop(1, '#00060f');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  const cx = x + w / 2, cy = y + h * 0.54;

  // ODM gear (harness straps)
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 4;
  // Torso straps
  [[cx, cy - 20, cx - 30, cy + 30],
   [cx, cy - 20, cx + 30, cy + 30],
   [cx - 30, cy + 30, cx - 30, cy + 60],
   [cx + 30, cy + 30, cx + 30, cy + 60]].forEach(([x1,y1,x2,y2]) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });

  // Legs
  ctx.fillStyle = '#1e3a5f';
  ctx.fillRect(cx - 24, cy + 30, 18, 50);
  ctx.fillRect(cx + 6,  cy + 30, 18, 50);

  // Torso (Survey Corps jacket)
  ctx.fillStyle = '#1e3a5f';
  ctx.beginPath();
  ctx.roundRect(cx - 32, cy - 22, 64, 58, 8);
  ctx.fill();
  // Wings of Freedom (simplified)
  ctx.fillStyle = '#bfdbfe';
  ctx.beginPath();
  ctx.ellipse(cx - 10, cy + 4, 12, 6, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 10, cy + 4, 12, 6, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.arc(cx, cy + 4, 4, 0, Math.PI * 2);
  ctx.fill();

  // Arms
  ctx.fillStyle = '#1a3050';
  ctx.beginPath();
  ctx.ellipse(cx - 44, cy + 2, 13, 28, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 44, cy + 2, 13, 28, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#f5e6d3';
  ctx.beginPath();
  ctx.arc(cx, cy - 44, 26, 0, Math.PI * 2);
  ctx.fill();

  // Short dark hair (undercut)
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.arc(cx, cy - 52, 26, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - 26, cy - 62, 52, 18);

  // Eyes (piercing cold gaze)
  const eGlow = 0.7 + Math.sin(t * 0.002) * 0.3;
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 10;
  ctx.fillStyle = `rgba(56,189,248,${eGlow})`;
  ctx.beginPath();
  ctx.ellipse(cx - 9, cy - 43, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 9, cy - 43, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Eyebrows (furrowed, iconic)
  ctx.strokeStyle = '#1c1917';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy - 52);
  ctx.lineTo(cx - 2, cy - 50);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 16, cy - 52);
  ctx.lineTo(cx + 2, cy - 50);
  ctx.stroke();

  // Spinning blade arcs (animated)
  const bladeAngle = t * 0.0035;
  const bladeR = 72;
  ctx.save();
  ctx.translate(cx, cy);

  // Left blade
  ctx.save();
  ctx.rotate(bladeAngle);
  ctx.fillStyle = '#e2e8f0';
  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-bladeR, -5);
  ctx.lineTo(-18, -3);
  ctx.lineTo(-18, 3);
  ctx.lineTo(-bladeR, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Blade edge glow
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = '#bae6fd';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-bladeR, 0);
  ctx.lineTo(-18, 0);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // Right blade
  ctx.save();
  ctx.rotate(bladeAngle + Math.PI);
  ctx.fillStyle = '#e2e8f0';
  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-bladeR, -5);
  ctx.lineTo(-18, -3);
  ctx.lineTo(-18, 3);
  ctx.lineTo(-bladeR, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = '#bae6fd';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-bladeR, 0);
  ctx.lineTo(-18, 0);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.restore(); // un-translate
  ctx.restore();
}

// ─── Stat Bar ─────────────────────────────────────────────────────────────────

function drawStatBar(ctx, label, value, x, y, w, color) {
  const barH = 10, labelW = 42, gap = 8;
  const barX = x + labelW + gap;
  const barW = w - labelW - gap;

  ctx.fillStyle = COLORS.dim;
  ctx.font = '11px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y + 9);

  // Track
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.roundRect(barX, y, barW, barH, 3);
  ctx.fill();

  // Fill
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.roundRect(barX, y, barW * value, barH, 3);
  ctx.fill();
  ctx.shadowBlur = 0;
}

// ─── Character Card ───────────────────────────────────────────────────────────

function drawCharCard(ctx, char, x, y, cw, ch, hovered, selected, t) {
  const col = char.color;
  const portraitH = 165;
  const r = 14;

  // Outer glow when hovered or selected
  if (hovered || selected) {
    const glowAlpha = selected ? 0.55 : 0.28 + Math.sin(t * 0.004) * 0.08;
    ctx.shadowColor = col.main;
    ctx.shadowBlur = selected ? 40 : 22;
    roundRect(ctx, x, y, cw, ch, r);
    ctx.fillStyle = `${col.glow}${glowAlpha})`;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Card background
  roundRect(ctx, x, y, cw, ch, r);
  const cardGrad = ctx.createLinearGradient(x, y, x, y + ch);
  cardGrad.addColorStop(0, 'rgba(255,255,255,0.07)');
  cardGrad.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = cardGrad;
  ctx.fill();

  // Border
  roundRect(ctx, x, y, cw, ch, r);
  ctx.strokeStyle = selected
    ? col.main
    : hovered
      ? `${col.glow}0.7)`
      : 'rgba(255,255,255,0.1)';
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.stroke();

  // Portrait area clip
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + cw - r, y);
  ctx.arcTo(x + cw, y, x + cw, y + r, r);
  ctx.lineTo(x + cw, y + portraitH);
  ctx.lineTo(x, y + portraitH);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.clip();

  if (char.id === 'kaido') drawKaidoPortrait(ctx, x, y, cw, portraitH, t);
  else if (char.id === 'dio') drawDioPortrait(ctx, x, y, cw, portraitH, t);
  else if (char.id === 'levi') drawLeviPortrait(ctx, x, y, cw, portraitH, t);

  ctx.restore();

  // Divider line under portrait
  ctx.strokeStyle = `${col.glow}0.4)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 12, y + portraitH);
  ctx.lineTo(x + cw - 12, y + portraitH);
  ctx.stroke();

  const pad = 18;
  let ty = y + portraitH + 22;

  // Character name
  ctx.fillStyle = col.main;
  ctx.shadowColor = col.main;
  ctx.shadowBlur = selected ? 18 : 8;
  ctx.font = `bold 28px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(char.name, x + cw / 2, ty);
  ctx.shadowBlur = 0;

  // Title
  ty += 22;
  ctx.fillStyle = COLORS.dim;
  ctx.font = `italic 13px "Segoe UI", sans-serif`;
  ctx.fillText(char.title, x + cw / 2, ty);

  // Stat bars
  ty += 24;
  const barX = x + pad;
  const barW = cw - pad * 2;
  drawStatBar(ctx, 'HP',  char.stats.hpBar,  barX, ty,      barW, COLORS.hpBar);
  drawStatBar(ctx, 'DMG', char.stats.dmgBar, barX, ty + 20, barW, COLORS.dmgBar);
  drawStatBar(ctx, 'SPD', char.stats.spdBar, barX, ty + 40, barW, COLORS.spdBar);

  // Attack name badge
  ty += 72;
  const badgeX = x + pad;
  const badgeW = cw - pad * 2;
  roundRect(ctx, badgeX, ty, badgeW, 28, 6);
  ctx.fillStyle = `${col.glow}0.2)`;
  ctx.fill();
  roundRect(ctx, badgeX, ty, badgeW, 28, 6);
  ctx.strokeStyle = `${col.glow}0.4)`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = col.main;
  ctx.font = `bold 12px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`⚔  ${char.attack.name}`, x + cw / 2, ty + 18);

  // Attack description
  ty += 36;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `12px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(char.attack.desc, x + cw / 2, ty);

  // Flavor text (multiline)
  ty += 24;
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = `italic 11px "Segoe UI", sans-serif`;
  char.flavor.split('\n').forEach((line, i) => {
    ctx.fillText(line, x + cw / 2, ty + i * 16);
  });

  // Selected checkmark / "SELECTED" badge
  if (selected) {
    const bx = x + cw / 2, by = y + 10;
    ctx.fillStyle = col.main;
    ctx.shadowColor = col.main;
    ctx.shadowBlur = 16;
    ctx.font = `bold 11px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('✦  SELECTED  ✦', bx, by + portraitH - 14);
    ctx.shadowBlur = 0;
  }
}

// ─── Character Select Screen ──────────────────────────────────────────────────

const CARD_W = 300;
const CARD_H = 458;
const CARD_GAP = 44;

function getCardBounds() {
  const totalW = 3 * CARD_W + 2 * CARD_GAP;
  const startX = (W - totalW) / 2;
  const cardY = (H - CARD_H) / 2 + 8;
  return CHARACTERS.map((_, i) => ({
    x: startX + i * (CARD_W + CARD_GAP),
    y: cardY,
    w: CARD_W,
    h: CARD_H,
  }));
}

function drawCharSelect(ctx, state, t) {
  drawBackground(ctx, t);

  // Title
  const titleY = 54;
  ctx.font = `bold 13px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.dim;
  ctx.fillText('— A R O G U E L I K E  A D V E N T U R E —', W / 2, titleY - 16);

  const titlePulse = 0.85 + Math.sin(t * 0.0018) * 0.15;
  ctx.font = `bold 52px "Segoe UI Black", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.shadowColor = `rgba(168,85,247,${titlePulse})`;
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#fff';
  ctx.fillText('REALM OF LEGENDS', W / 2, titleY + 32);
  ctx.shadowBlur = 0;

  ctx.font = `18px "Segoe UI", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('Choose Your Character', W / 2, titleY + 60);

  // Cards
  const bounds = getCardBounds();
  CHARACTERS.forEach((char, i) => {
    const b = bounds[i];
    const hovered  = state.hoveredCard === i;
    const selected = state.selectedCard === i;
    const scaleOffset = (hovered || selected) ? -4 : 0;
    drawCharCard(ctx, char, b.x, b.y + scaleOffset, b.w, b.h, hovered, selected, t);
  });

  // Bottom prompt
  const promptY = H - 28;
  if (state.selectedCard >= 0) {
    const col = CHARACTERS[state.selectedCard].color;
    ctx.shadowColor = col.main;
    ctx.shadowBlur = 14;
    ctx.font = `bold 18px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = col.main;
    ctx.fillText('Press  ENTER  or click again to begin your run', W / 2, promptY);
    ctx.shadowBlur = 0;
  } else {
    ctx.font = `16px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('Hover to preview  ·  Click to select', W / 2, promptY);
  }
}

function updateCharSelect(state, t) {
  const bounds = getCardBounds();
  state.hoveredCard = -1;
  bounds.forEach((b, i) => {
    if (
      Input.mouseX >= b.x && Input.mouseX <= b.x + b.w &&
      Input.mouseY >= b.y && Input.mouseY <= b.y + b.h
    ) {
      state.hoveredCard = i;
    }
  });

  if (Input.clicked) {
    if (state.hoveredCard >= 0) {
      if (state.selectedCard === state.hoveredCard) {
        // Confirmed — proceed
        return { next: STATE.POWER_SELECT, char: CHARACTERS[state.hoveredCard] };
      }
      state.selectedCard = state.hoveredCard;
    }
  }

  if (Input.justPressed('Enter') && state.selectedCard >= 0) {
    return { next: STATE.POWER_SELECT, char: CHARACTERS[state.selectedCard] };
  }

  return null;
}
