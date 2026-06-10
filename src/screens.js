// ─── Text helpers ─────────────────────────────────────────────────────────────

// Center-aligned word-wrap. ctx.textAlign must be 'center' before calling.
function wrapTextCenter(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, y);
      line = words[i];
      y += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, cx, y);
}

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
  const col       = char.color;
  const portraitH = 200;
  const r         = 14;
  const pad       = 20;

  // Outer glow
  if (hovered || selected) {
    const glowAlpha = selected ? 0.55 : 0.28 + Math.sin(t * 0.004) * 0.08;
    ctx.shadowColor = col.main;
    ctx.shadowBlur  = selected ? 40 : 22;
    roundRect(ctx, x, y, cw, ch, r);
    ctx.fillStyle = `${col.glow}${glowAlpha})`;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Card background — subtle character-color tint
  roundRect(ctx, x, y, cw, ch, r);
  const cardGrad = ctx.createLinearGradient(x, y, x, y + ch);
  cardGrad.addColorStop(0,   `${col.glow}0.10)`);
  cardGrad.addColorStop(0.5, `${col.glow}0.04)`);
  cardGrad.addColorStop(1,   'rgba(0,0,0,0.28)');
  ctx.fillStyle = cardGrad;
  ctx.fill();

  // Border
  roundRect(ctx, x, y, cw, ch, r);
  ctx.strokeStyle = selected
    ? col.main
    : hovered
      ? `${col.glow}0.65)`
      : `${col.glow}0.22)`;
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.stroke();

  // Portrait (clipped to top rounded corners)
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
  Assets.drawSprite(ctx, char, 'idle', 'down', x, y, cw, portraitH, 0, 'cover-top');
  ctx.restore();

  // Divider under portrait
  ctx.strokeStyle = `${col.glow}0.35)`;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(x + 16, y + portraitH);
  ctx.lineTo(x + cw - 16, y + portraitH);
  ctx.stroke();

  let ty = y + portraitH + 28;

  // Name
  ctx.font        = `bold 28px "Segoe UI", sans-serif`;
  ctx.textAlign   = 'center';
  ctx.fillStyle   = col.main;
  ctx.shadowColor = col.main;
  ctx.shadowBlur  = selected ? 18 : 8;
  ctx.fillText(char.name, x + cw / 2, ty);
  ctx.shadowBlur  = 0;

  // Title
  ty += 32;
  ctx.font      = `italic 13px "Segoe UI", sans-serif`;
  ctx.fillStyle = 'rgba(148,163,184,0.7)';
  ctx.fillText(char.title, x + cw / 2, ty);

  // Stat bars
  ty += 34;
  const barX = x + pad;
  const barW  = cw - pad * 2;
  drawStatBar(ctx, 'HP',  char.stats.hpBar,  barX, ty,      barW, COLORS.hpBar);
  drawStatBar(ctx, 'DMG', char.stats.dmgBar, barX, ty + 26, barW, COLORS.dmgBar);
  drawStatBar(ctx, 'SPD', char.stats.spdBar, barX, ty + 52, barW, COLORS.spdBar);

  // Attack badge
  ty += 88;   // 52 (3rd bar offset) + 10 (bar height) + 26 (gap)
  const badgeX = x + pad;
  const badgeW  = cw - pad * 2;
  roundRect(ctx, badgeX, ty, badgeW, 28, 6);
  ctx.fillStyle = `${col.glow}0.18)`;
  ctx.fill();
  roundRect(ctx, badgeX, ty, badgeW, 28, 6);
  ctx.strokeStyle = `${col.glow}0.40)`;
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.fillStyle   = col.main;
  ctx.font        = `bold 12px "Segoe UI", sans-serif`;
  ctx.textAlign   = 'center';
  ctx.fillText(`⚔  ${char.attack.name}`, x + cw / 2, ty + 18);

  // Attack description
  ty += 46;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font      = `12px "Segoe UI", sans-serif`;
  ctx.fillText(char.attack.desc, x + cw / 2, ty);

  // Flavor text
  ty += 32;
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.font      = `italic 11px "Segoe UI", sans-serif`;
  char.flavor.split('\n').forEach((line, i) => {
    ctx.fillText(line, x + cw / 2, ty + i * 19);
  });

  // "SELECTED" at bottom of card
  if (selected) {
    ctx.fillStyle   = col.main;
    ctx.shadowColor = col.main;
    ctx.shadowBlur  = 16;
    ctx.font        = `bold 11px "Segoe UI", sans-serif`;
    ctx.textAlign   = 'center';
    ctx.fillText('✦  SELECTED  ✦', x + cw / 2, y + ch - 14);
    ctx.shadowBlur  = 0;
  }
}

// ─── Character Select Screen ──────────────────────────────────────────────────

const CARD_W = 300;
const CARD_H = 540;
const CARD_GAP = 40;

const CHAR_TITLE_Y  = 34;              // baseline anchor for the title block
const CHAR_PROMPT_Y = H - 28;          // baseline of the bottom hint text

function getCardBounds() {
  const totalW       = 3 * CARD_W + 2 * CARD_GAP;
  const startX       = (W - totalW) / 2;
  const headerBottom = CHAR_TITLE_Y + 60 + 16;   // subtitle baseline + padding
  const footerTop    = CHAR_PROMPT_Y - 16;        // prompt baseline - padding
  const cardY = Math.round(headerBottom + (footerTop - headerBottom - CARD_H) / 2);
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
  const titleY = CHAR_TITLE_Y;
  ctx.font      = `bold 12px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.dim;
  ctx.fillText('— A  R O G U E L I K E  A D V E N T U R E —', W / 2, titleY - 10);

  const titlePulse = 0.85 + Math.sin(t * 0.0018) * 0.15;
  ctx.font        = `bold 52px "Segoe UI Black", "Arial Black", sans-serif`;
  ctx.shadowColor = `rgba(168,85,247,${titlePulse})`;
  ctx.shadowBlur  = 30;
  ctx.fillStyle   = '#fff';
  ctx.fillText('CROSSOVER GAUNTLET', W / 2, titleY + 34);
  ctx.shadowBlur  = 0;

  ctx.font      = `17px "Segoe UI", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.50)';
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
  const promptY = CHAR_PROMPT_Y;
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

// ─── Power Card ───────────────────────────────────────────────────────────────
// compact=false → normal 2-card layout   (PC_W × PC_H)
// compact=true  → dev 6-card grid layout (DPC_W × DPC_H)

const PC_W   = 380;  // normal card width
const PC_H   = 510;  // normal card height
const PC_GAP = 80;   // gap between the 2 normal cards

const DPC_W       = 374;  // dev card width
const DPC_H       = 268;  // dev card height
const DPC_COL_GAP = 29;   // horizontal gap between dev cards
const DPC_ROW_GAP = 22;   // vertical gap between dev card rows

function drawPowerCard(ctx, power, x, y, cw, ch, hovered, selected, t, compact = false) {
  const col   = power.color;
  const r     = 14;
  const iconH = compact ? 68 : 114;
  const pad   = compact ? 14 : 18;

  // Outer glow
  if (hovered || selected) {
    const ga = selected ? 0.50 : 0.24 + Math.sin(t * 0.004) * 0.07;
    ctx.shadowColor = col.main;
    ctx.shadowBlur  = selected ? 40 : 22;
    roundRect(ctx, x, y, cw, ch, r);
    ctx.fillStyle = `${col.glow}${ga})`;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Card background
  roundRect(ctx, x, y, cw, ch, r);
  const bg = ctx.createLinearGradient(x, y, x, y + ch);
  bg.addColorStop(0, 'rgba(18,8,36,0.97)');
  bg.addColorStop(1, 'rgba(4,2,10,0.99)');
  ctx.fillStyle = bg;
  ctx.fill();

  // Icon zone tint (clipped to card so corners stay clean)
  ctx.save();
  roundRect(ctx, x, y, cw, ch, r);
  ctx.clip();
  const ig = ctx.createLinearGradient(x, y, x, y + iconH);
  ig.addColorStop(0,   `${col.glow}0.38)`);
  ig.addColorStop(0.6, `${col.glow}0.14)`);
  ig.addColorStop(1,   `${col.glow}0.00)`);
  ctx.fillStyle = ig;
  ctx.fillRect(x, y, cw, iconH);
  ctx.restore();

  // Icon — uses PNG from assets/ if available, canvas fallback otherwise
  Assets.drawPowerIcon(ctx, power, x + cw / 2, y + iconH * 0.52, compact ? 22 : 35);

  // Card border
  roundRect(ctx, x, y, cw, ch, r);
  ctx.strokeStyle = selected
    ? col.main
    : hovered ? `${col.glow}0.60)` : 'rgba(255,255,255,0.08)';
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.stroke();

  // Divider below icon zone
  ctx.strokeStyle = `${col.glow}0.28)`;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(x + pad,      y + iconH);
  ctx.lineTo(x + cw - pad, y + iconH);
  ctx.stroke();

  ctx.textAlign = 'center';
  let ty = y + iconH + (compact ? 15 : 22);

  // Power name
  ctx.font        = `bold ${compact ? 17 : 23}px "Segoe UI", sans-serif`;
  ctx.fillStyle   = col.main;
  ctx.shadowColor = col.main;
  ctx.shadowBlur  = selected ? 16 : 5;
  ctx.fillText(power.name, x + cw / 2, ty);
  ctx.shadowBlur  = 0;
  ty += compact ? 8 : 10;

  // PASSIVE / ACTIVE badge
  const bLabel = power.type === 'passive' ? 'PASSIVE' : 'ACTIVE';
  const bColor = power.type === 'passive' ? '#d97706' : '#0ea5e9';
  const bW = compact ? 58 : 68;
  const bH = compact ? 16 : 19;
  ty += compact ? 4 : 6;
  const bx = x + cw / 2 - bW / 2;
  roundRect(ctx, bx, ty, bW, bH, bH / 2);
  ctx.fillStyle = bColor + '28';
  ctx.fill();
  roundRect(ctx, bx, ty, bW, bH, bH / 2);
  ctx.strokeStyle = bColor;
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.fillStyle   = bColor;
  ctx.font        = `bold ${compact ? 9 : 10}px "Courier New", monospace`;
  ctx.fillText(bLabel, x + cw / 2, ty + bH - 4);
  ty += bH + (compact ? 10 : 14);

  // Thin divider
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(x + pad,      ty);
  ctx.lineTo(x + cw - pad, ty);
  ctx.stroke();
  ty += compact ? 10 : 14;

  // Description
  ctx.fillStyle = 'rgba(255,255,255,0.76)';
  ctx.font      = `${compact ? 12 : 14}px "Segoe UI", sans-serif`;
  wrapTextCenter(ctx, power.desc, x + cw / 2, ty, cw - pad * 2, compact ? 17 : 21);
  ty += (compact ? 17 : 21) * (compact ? 2 : 3) + (compact ? 6 : 10);

  // Upgrade label
  ctx.fillStyle   = COLORS.gold;
  ctx.shadowColor = COLORS.gold;
  ctx.shadowBlur  = 5;
  ctx.font        = `bold ${compact ? 9 : 10}px "Courier New", monospace`;
  ctx.fillText('— UPGRADE —', x + cw / 2, ty);
  ctx.shadowBlur  = 0;
  ty += compact ? 13 : 17;

  // Upgrade description
  ctx.fillStyle = 'rgba(255,255,255,0.48)';
  ctx.font      = `italic ${compact ? 11 : 13}px "Segoe UI", sans-serif`;
  wrapTextCenter(ctx, power.upgrade, x + cw / 2, ty, cw - pad * 2, compact ? 15 : 19);

  // Selected badge
  if (selected) {
    ctx.fillStyle   = col.main;
    ctx.shadowColor = col.main;
    ctx.shadowBlur  = 14;
    ctx.font        = `bold 11px "Segoe UI", sans-serif`;
    ctx.fillText('✦  SELECTED  ✦', x + cw / 2, y + ch - 12);
    ctx.shadowBlur = 0;
  }
}

// ─── Power Select Screen (normal gameplay) ────────────────────────────────────

function drawPowerSelect(ctx, state, t) {
  drawBackground(ctx, t);

  // Dev menu hint (top-right corner — F1 only works here)
  ctx.font      = `11px "Courier New", monospace`;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(100,116,139,0.55)';
  ctx.fillText('[ F1 ]  Dev Menu', W - 18, 22);

  // Header
  ctx.textAlign = 'center';
  ctx.font      = `bold 13px "Courier New", monospace`;
  ctx.fillStyle = COLORS.dim;
  ctx.fillText('— P O W E R  S E L E C T —', W / 2, 38);

  const pulse = 0.85 + Math.sin(t * 0.0018) * 0.15;
  ctx.font        = `bold 46px "Segoe UI Black", "Arial Black", sans-serif`;
  ctx.shadowColor = `rgba(168,85,247,${pulse})`;
  ctx.shadowBlur  = 28;
  ctx.fillStyle   = '#fff';
  ctx.fillText('CHOOSE YOUR POWER', W / 2, 72);
  ctx.shadowBlur  = 0;

  if (state.char) {
    const cc = state.char.color;
    ctx.font        = `16px "Segoe UI", sans-serif`;
    ctx.fillStyle   = cc.main;
    ctx.shadowColor = cc.main;
    ctx.shadowBlur  = 8;
    ctx.fillText(state.char.name, W / 2, 98);
    ctx.shadowBlur  = 0;
  }

  // 2 cards
  const totalW = 2 * PC_W + PC_GAP;
  const startX = (W - totalW) / 2;
  const cardY  = 108;

  state.offered.forEach((power, i) => {
    const bx  = startX + i * (PC_W + PC_GAP);
    const hov = state.hoveredCard  === i;
    const sel = state.selectedCard === i;
    drawPowerCard(ctx, power, bx, cardY + (hov || sel ? -4 : 0), PC_W, PC_H, hov, sel, t, false);
  });

  // Bottom prompt
  if (state.selectedCard >= 0) {
    const cc = state.offered[state.selectedCard].color;
    ctx.font        = `bold 18px "Segoe UI", sans-serif`;
    ctx.fillStyle   = cc.main;
    ctx.shadowColor = cc.main;
    ctx.shadowBlur  = 14;
    ctx.fillText('Press  ENTER  or click again to begin your run', W / 2, H - 24);
    ctx.shadowBlur  = 0;
  } else {
    ctx.font      = `16px "Segoe UI", sans-serif`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('Hover to preview  ·  Click to select', W / 2, H - 24);
  }
}

function updatePowerSelect(state, t) {
  const totalW = 2 * PC_W + PC_GAP;
  const startX = (W - totalW) / 2;
  const cardY  = 108;

  state.hoveredCard = -1;
  state.offered.forEach((_, i) => {
    const bx = startX + i * (PC_W + PC_GAP);
    if (Input.mouseX >= bx && Input.mouseX <= bx + PC_W &&
        Input.mouseY >= cardY && Input.mouseY <= cardY + PC_H) {
      state.hoveredCard = i;
    }
  });

  if (Input.clicked && state.hoveredCard >= 0) {
    if (state.selectedCard === state.hoveredCard) {
      return { next: STATE.PLAYING, power: state.offered[state.hoveredCard] };
    }
    state.selectedCard = state.hoveredCard;
  }

  if (Input.justPressed('Enter') && state.selectedCard >= 0) {
    return { next: STATE.PLAYING, power: state.offered[state.selectedCard] };
  }

  return null;
}

// ─── Dev Powers Screen (all 6 powers, 3×2 grid) ──────────────────────────────

function drawDevPowers(ctx, state, t) {
  drawBackground(ctx, t);

  // Header
  ctx.textAlign = 'center';
  ctx.font      = `bold 12px "Courier New", monospace`;
  ctx.fillStyle = COLORS.dim;
  ctx.fillText('— D E V  P R E V I E W —', W / 2, 30);

  ctx.font        = `bold 34px "Segoe UI Black", "Arial Black", sans-serif`;
  ctx.shadowColor = 'rgba(168,85,247,0.85)';
  ctx.shadowBlur  = 22;
  ctx.fillStyle   = '#fff';
  ctx.fillText('ALL POWERS', W / 2, 62);
  ctx.shadowBlur  = 0;

  ctx.font      = `12px "Segoe UI", sans-serif`;
  ctx.fillStyle = COLORS.dim;
  ctx.fillText('[ F1 ] or [ ESC ]  to return  ·  Click a card to assign power and begin run', W / 2, 84);

  // 3 × 2 grid
  const totalW = 3 * DPC_W + 2 * DPC_COL_GAP;
  const startX = (W - totalW) / 2;
  const startY = 96;

  POWERS.forEach((power, i) => {
    const col  = i % 3;
    const row  = Math.floor(i / 3);
    const bx   = startX + col * (DPC_W + DPC_COL_GAP);
    const by   = startY + row * (DPC_H + DPC_ROW_GAP);
    const hov  = state.hoveredCard === i;
    drawPowerCard(ctx, power, bx, by + (hov ? -3 : 0), DPC_W, DPC_H, hov, false, t, true);
  });
}

function updateDevPowers(state, t) {
  const totalW = 3 * DPC_W + 2 * DPC_COL_GAP;
  const startX = (W - totalW) / 2;
  const startY = 96;

  state.hoveredCard = -1;
  POWERS.forEach((_, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const bx  = startX + col * (DPC_W + DPC_COL_GAP);
    const by  = startY + row * (DPC_H + DPC_ROW_GAP);
    if (Input.mouseX >= bx && Input.mouseX <= bx + DPC_W &&
        Input.mouseY >= by && Input.mouseY <= by + DPC_H) {
      state.hoveredCard = i;
    }
  });

  if (Input.clicked && state.hoveredCard >= 0) {
    return { power: POWERS[state.hoveredCard] };
  }
  return null;
}

// ─── Upgrade Screen (after Floor 1) ──────────────────────────────────────────

function _drawFloorTransitionCards(ctx, state, t, headerText, subText) {
  const mx = Input.mouseX, my = Input.mouseY;
  const cardW = 260, cardH = 220, gap = 40;
  const totalW = cardW * state.options.length + gap * (state.options.length - 1);
  const startX = W / 2 - totalW / 2;
  const cardY  = H / 2 - cardH / 2 + 30;

  // Header
  glowText(ctx, headerText, W/2, H/2 - cardH/2 - 52, '#a78bfa', 28,
    'bold 42px "Segoe UI Black", "Arial Black", sans-serif');
  ctx.font      = '16px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(200,200,255,0.6)';
  ctx.fillText(subText, W/2, H/2 - cardH/2 - 20);

  state.hoveredCard = -1;
  state.options.forEach((opt, i) => {
    const cx = startX + i * (cardW + gap);
    const hovered  = mx >= cx && mx <= cx + cardW && my >= cardY && my <= cardY + cardH;
    const selected = state.selectedCard === i;
    if (hovered) state.hoveredCard = i;

    const lift = (hovered || selected) ? 4 : 0;

    // Card shadow
    ctx.save();
    ctx.shadowColor = selected ? '#a78bfa' : (hovered ? 'rgba(167,139,250,0.5)' : 'rgba(0,0,0,0.4)');
    ctx.shadowBlur  = selected ? 28 : (hovered ? 18 : 10);

    // Background
    const bg = ctx.createLinearGradient(cx, cardY - lift, cx, cardY - lift + cardH);
    bg.addColorStop(0, selected ? 'rgba(109,40,217,0.38)' : (hovered ? 'rgba(109,40,217,0.22)' : 'rgba(20,14,40,0.85)'));
    bg.addColorStop(1, 'rgba(8,5,20,0.92)');
    ctx.fillStyle = bg;
    roundRect(ctx, cx, cardY - lift, cardW, cardH, 10);
    ctx.fill();

    // Border
    ctx.strokeStyle = selected ? '#a78bfa' : (hovered ? 'rgba(167,139,250,0.7)' : 'rgba(167,139,250,0.18)');
    ctx.lineWidth   = selected ? 2.5 : 1.5;
    roundRect(ctx, cx, cardY - lift, cardW, cardH, 10);
    ctx.stroke();
    ctx.restore();

    // Label
    ctx.font      = 'bold 18px "Segoe UI Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = selected ? '#c4b5fd' : (hovered ? '#e9d5ff' : 'rgba(255,255,255,0.88)');
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = hovered ? 14 : 6;
    ctx.fillText(opt.label, cx + cardW/2, cardY - lift + 56);
    ctx.shadowBlur = 0;

    // Description
    ctx.font      = '14px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(200,185,255,0.72)';
    ctx.fillText(opt.desc, cx + cardW/2, cardY - lift + 90);

    // Icon
    ctx.font      = '36px sans-serif';
    const icons   = ['⚔', '✨', '❤'];
    ctx.fillStyle = 'rgba(196,181,253,0.85)';
    ctx.fillText(icons[i] || '★', cx + cardW/2, cardY - lift + 155);

    // Selected badge
    if (selected) {
      ctx.font      = 'bold 11px "Courier New", monospace';
      ctx.fillStyle = '#a78bfa';
      ctx.fillText('✦ SELECTED ✦', cx + cardW/2, cardY - lift + cardH - 14);
    }
  });

  // Confirm hint
  if (state.selectedCard >= 0) {
    ctx.font      = '15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('Click again or press ENTER to confirm', W/2, cardY + cardH + 36);
  } else {
    ctx.font      = '14px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('Choose your upgrade', W/2, cardY + cardH + 36);
  }
}

function drawUpgradeScreen(ctx, state, t) {
  const power = state.power;
  const col   = power.color;
  const CX    = W / 2;

  // Header
  glowText(ctx, 'FLOOR 1 CLEARED!', CX, H / 2 - 198, '#a78bfa', 28,
    'bold 42px "Segoe UI Black", "Arial Black", sans-serif');

  // Power icon
  Assets.drawPowerIcon(ctx, power, CX, H / 2 - 122, 48);

  // Power name
  ctx.font        = 'bold 30px "Segoe UI", sans-serif';
  ctx.textAlign   = 'center';
  ctx.fillStyle   = col.main;
  ctx.shadowColor = col.main;
  ctx.shadowBlur  = 18;
  ctx.fillText(power.name, CX, H / 2 - 58);
  ctx.shadowBlur  = 0;

  // "POWER UPGRADED" label
  ctx.font        = 'bold 11px "Courier New", monospace';
  ctx.fillStyle   = COLORS.gold;
  ctx.shadowColor = COLORS.gold;
  ctx.shadowBlur  = 6;
  ctx.fillText('— POWER UPGRADED —', CX, H / 2 - 34);
  ctx.shadowBlur  = 0;

  // Upgrade description panel
  const panelW = 580, panelH = 76;
  const panelX = CX - panelW / 2, panelY = H / 2 - 16;
  ctx.save();
  roundRect(ctx, panelX, panelY, panelW, panelH, 10);
  ctx.fillStyle = `${col.glow}0.10)`;
  ctx.fill();
  ctx.strokeStyle = `${col.glow}0.38)`;
  ctx.lineWidth   = 1.5;
  roundRect(ctx, panelX, panelY, panelW, panelH, 10);
  ctx.stroke();
  ctx.restore();

  ctx.font      = '16px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(220,215,255,0.92)';
  wrapTextCenter(ctx, power.upgrade, CX, panelY + 30, panelW - 36, 22);

  // HP restored notice
  ctx.font        = 'bold 15px "Segoe UI", sans-serif';
  ctx.fillStyle   = '#4ade80';
  ctx.shadowColor = '#4ade80';
  ctx.shadowBlur  = 10;
  ctx.fillText('✦  HP Fully Restored  ✦', CX, panelY + panelH + 42);
  ctx.shadowBlur  = 0;

  // Continue prompt (blinking)
  const blink = 0.55 + Math.sin(t * 0.003) * 0.35;
  ctx.font        = 'bold 17px "Segoe UI", sans-serif';
  ctx.fillStyle   = `rgba(255,255,255,${blink})`;
  ctx.shadowColor = col.main;
  ctx.shadowBlur  = blink > 0.7 ? 12 : 4;
  ctx.fillText('Press ENTER or click to continue', CX, H - 44);
  ctx.shadowBlur  = 0;
}

function updateUpgradeScreen(state, t) {
  if (Input.clicked || Input.justPressed('Enter')) {
    const char = state.char;
    const pow  = state.power;
    state.options[0].apply(char, pow);
    return { char, power: pow, fullHeal: true };
  }
  return null;
}

// ─── Stat Boost Screen (after Floor 2) ───────────────────────────────────────

function drawStatBoostScreen(ctx, state, t) {
  const opt  = state.option;
  const char = state.char;
  const col  = char.color;
  const CX   = W / 2;

  glowText(ctx, 'FLOOR 2 CLEARED!', CX, H / 2 - 198, '#a78bfa', 28,
    'bold 42px "Segoe UI Black", "Arial Black", sans-serif');

  ctx.font        = 'bold 20px "Segoe UI", sans-serif';
  ctx.textAlign   = 'center';
  ctx.fillStyle   = col.main;
  ctx.shadowColor = col.main;
  ctx.shadowBlur  = 12;
  ctx.fillText(char.name, CX, H / 2 - 148);
  ctx.shadowBlur  = 0;

  ctx.font        = 'bold 36px "Segoe UI", sans-serif';
  ctx.fillStyle   = col.main;
  ctx.shadowColor = col.main;
  ctx.shadowBlur  = 22;
  ctx.fillText(opt.label, CX, H / 2 - 90);
  ctx.shadowBlur  = 0;

  ctx.font        = 'bold 11px "Courier New", monospace';
  ctx.fillStyle   = COLORS.gold;
  ctx.shadowColor = COLORS.gold;
  ctx.shadowBlur  = 6;
  ctx.fillText('— STAT BOOSTED —', CX, H / 2 - 58);
  ctx.shadowBlur  = 0;

  const panelW = 580, panelH = 76;
  const panelX = CX - panelW / 2, panelY = H / 2 - 40;
  ctx.save();
  roundRect(ctx, panelX, panelY, panelW, panelH, 10);
  ctx.fillStyle = `${col.glow}0.10)`;
  ctx.fill();
  ctx.strokeStyle = `${col.glow}0.38)`;
  ctx.lineWidth   = 1.5;
  roundRect(ctx, panelX, panelY, panelW, panelH, 10);
  ctx.stroke();
  ctx.restore();

  ctx.font      = '16px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(220,215,255,0.92)';
  ctx.fillText(opt.desc, CX, panelY + 44);

  const healText = '✦  HP Fully Restored  ✦';
  ctx.font        = 'bold 15px "Segoe UI", sans-serif';
  ctx.fillStyle   = '#4ade80';
  ctx.shadowColor = '#4ade80';
  ctx.shadowBlur  = 10;
  ctx.fillText(healText, CX, panelY + panelH + 42);
  ctx.shadowBlur  = 0;

  const blink = 0.55 + Math.sin(t * 0.003) * 0.35;
  ctx.font        = 'bold 17px "Segoe UI", sans-serif';
  ctx.fillStyle   = `rgba(255,255,255,${blink})`;
  ctx.shadowColor = col.main;
  ctx.shadowBlur  = blink > 0.7 ? 12 : 4;
  ctx.fillText('Press ENTER or click to continue', CX, H - 44);
  ctx.shadowBlur  = 0;
}

function updateStatBoostScreen(state, t) {
  if (Input.clicked || Input.justPressed('Enter')) {
    const char = state.char;
    const pow  = state.power;
    state.option.apply(char, pow);
    return { char, power: pow, fullHeal: state.fullHeal };
  }
  return null;
}

// ─── Win Screen ───────────────────────────────────────────────────────────────

function drawWinScreen(ctx, t) {
  // Victory particle shimmer
  const nParticles = 36;
  for (let i = 0; i < nParticles; i++) {
    const px = (i / nParticles) * W;
    const py = H * 0.3 + Math.sin(t * 0.001 * (i % 5 + 1) + i) * 60;
    const alpha = 0.4 + Math.sin(t * 0.002 + i * 0.4) * 0.3;
    ctx.fillStyle = `rgba(167,139,250,${alpha})`;
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI*2); ctx.fill();
  }
  ctx.shadowBlur = 0;

  glowText(ctx, 'YOU WIN!', W/2, H/2 - 60, '#a78bfa', 40,
    'bold 78px "Segoe UI Black", "Arial Black", sans-serif');

  ctx.font      = 'bold 22px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(220,200,255,0.85)';
  ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 14;
  ctx.fillText('All three floors cleared!', W/2, H/2 + 14);
  ctx.shadowBlur = 0;

  ctx.font      = '17px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('The Crossover Gauntlet bows before you.', W/2, H/2 + 50);

  ctx.font      = '16px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('Press ENTER — view credits', W/2, H/2 + 100);
}

// ─── Title Screen ─────────────────────────────────────────────────────────────

function drawTitleScreen(ctx, t) {
  drawBackground(ctx, t);

  // Subtle vertical light column behind title
  const col = ctx.createLinearGradient(W / 2, H * 0.1, W / 2, H * 0.85);
  col.addColorStop(0, 'rgba(168,85,247,0)');
  col.addColorStop(0.4, 'rgba(168,85,247,0.06)');
  col.addColorStop(0.6, 'rgba(168,85,247,0.06)');
  col.addColorStop(1, 'rgba(168,85,247,0)');
  ctx.fillStyle = col;
  ctx.fillRect(W / 2 - 260, 0, 520, H);

  // Subtitle label above title
  ctx.font      = 'bold 12px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(148,163,184,0.6)';
  ctx.letterSpacing = '4px';
  ctx.fillText('A  R O G U E L I K E  A D V E N T U R E', W / 2, H / 2 - 80);
  ctx.letterSpacing = '0px';

  // Thin divider lines flanking the subtitle
  ctx.save();
  ctx.strokeStyle = 'rgba(168,85,247,0.28)';
  ctx.lineWidth   = 1;
  const divY = H / 2 - 94;
  ctx.beginPath(); ctx.moveTo(100, divY); ctx.lineTo(W / 2 - 258, divY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W - 100, divY); ctx.lineTo(W / 2 + 258, divY); ctx.stroke();
  ctx.restore();

  // Main title — multi-layer glow
  const pulse = 0.8 + Math.sin(t * 0.0016) * 0.2;
  ctx.save();
  ctx.font      = 'bold 74px "Segoe UI Black", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = `rgba(168,85,247,${pulse * 0.5})`;
  ctx.shadowBlur  = 60;
  ctx.fillStyle   = 'transparent';
  ctx.fillText('CROSSOVER GAUNTLET', W / 2, H / 2 - 14);
  ctx.shadowColor = `rgba(200,160,255,${pulse * 0.8})`;
  ctx.shadowBlur  = 20;
  ctx.fillStyle   = '#fff';
  ctx.fillText('CROSSOVER GAUNTLET', W / 2, H / 2 - 14);
  ctx.restore();

  // Press ENTER prompt — blink
  const blink = Math.sin(t * 0.003) > 0 ? 0.95 : 0.45;
  ctx.save();
  ctx.font        = 'bold 20px "Segoe UI", sans-serif';
  ctx.textAlign   = 'center';
  ctx.fillStyle   = `rgba(255,255,255,${blink})`;
  ctx.shadowColor = '#a78bfa';
  ctx.shadowBlur  = blink > 0.7 ? 18 : 6;
  ctx.fillText('PRESS  ENTER  TO  START', W / 2, H - 50);
  ctx.restore();

  // Bottom version label
  ctx.font      = '11px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(71,85,105,0.5)';
  ctx.fillText('v1.0', W / 2, H - 18);
}

// ─── Game Over Screen ─────────────────────────────────────────────────────────

const _DEATH_DATA = {
  enemy:          { msg: 'You were killed by a basic enemy.\nNo comment.',                                                         bg: '#0d0404', accent: '#7f1d1d', label: 'Basic Enemy'            },
  ranged_enemy:   { msg: "Didn't you hear? It's hunting season!\nShouldda kept your head low...",                                  bg: '#021014', accent: '#0891b2', label: 'Ranged Enemy'           },
  tank_enemy:     { msg: "He smashed you like a bug.\nNext time get out of his way.",                                             bg: '#140600', accent: '#ea580c', label: 'Tank/Brute'             },
  bomb:           { msg: 'Killer Queen has already touched that spot...',                                                          bg: '#080416', accent: '#7c3aed', label: "Kira's Bomb"            },
  sha:            { msg: 'Sheer Heart Attack...\nhas no weakness.',                                                                bg: '#080416', accent: '#7c3aed', label: 'Sheer Heart Attack'      },
  kira_contact:   { msg: "Bites the Dust has reset time...\nback to the title screen!",                                           bg: '#080416', accent: '#7c3aed', label: 'Kira'                   },
  beam:           { msg: 'You stood still for a split second\ntoo long. Enel noticed.',                                           bg: '#040d16', accent: '#7dd3fc', label: 'Lightning Beam'         },
  grid:           { msg: 'The sky itself became your enemy.\nEnel sends his regards.',                                            bg: '#040d16', accent: '#7dd3fc', label: 'Lightning Grid'         },
  enel_contact:   { msg: 'He sure does have a SHOCKING personality.',                                                             bg: '#040d16', accent: '#7dd3fc', label: 'Enel'                   },
  blue_orb:       { msg: "Gravity doesn't care about\nyour feelings.",                                                            bg: '#050812', accent: '#2563eb', label: 'Blue Orb'              },
  hollow_purple:  { msg: "You like donuts?\nWell you're one now!",                                                                bg: '#0a0414', accent: '#7c3aed', label: 'Hollow Purple'         },
  barrier_purple: { msg: 'The Anti-Cheese System has logged your behavior.\nDo the fight correctly next time.',                   bg: '#0a0414', accent: '#7c3aed', label: 'Infinity Punishment'   },
  red_ball:       { msg: "You didn't read the text the\nfirst time? HIT THE RED BALL!!!",                                        bg: '#130304', accent: '#dc2626', label: 'Red Volleyball'        },
  void:           { msg: 'You were shown the entirety of the universe,\nbut your feeble mind couldn\'t handle it.',               bg: '#040010', accent: '#a78bfa', label: 'Infinite Void'         },
  gojo_contact:   { msg: 'He killed you without even laying a finger on you.',                                                    bg: '#040010', accent: '#a78bfa', label: 'Gojo'                  },
};

function _drawKillerIcon(ctx, cx, cy, killSource, t) {
  const s = 80; // base size unit
  ctx.save();
  ctx.translate(cx, cy);

  if (killSource === 'enemy') {
    // Red square enemy with yellow eyes
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.roundRect(-s*0.55, -s*0.55, s*1.1, s*1.1, 6); ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-s*0.28, -s*0.12, s*0.18, s*0.22);
    ctx.fillRect( s*0.10, -s*0.12, s*0.18, s*0.22);

  } else if (killSource === 'ranged_enemy') {
    // Teal square archer — body + bow + arrow
    ctx.fillStyle = '#164e63'; ctx.fillRect(-s*0.55, -s*0.55, s*1.1, s*1.1);
    ctx.fillStyle = '#0891b2'; ctx.fillRect(-s*0.46, -s*0.46, s*0.92, s*0.92);
    ctx.fillStyle = '#0e7490'; ctx.fillRect(-s*0.30, -s*0.30, s*0.60, s*0.60);
    // Squinting eyes
    ctx.fillStyle = '#ecfeff'; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 4;
    ctx.fillRect(-s*0.36, -s*0.22, s*0.24, s*0.10);
    ctx.fillRect( s*0.12, -s*0.22, s*0.24, s*0.10);
    ctx.shadowBlur = 0;
    // Bow (vertical arc on right side, aiming right)
    const br = s * 0.22;
    ctx.strokeStyle = '#a5f3fc'; ctx.lineWidth = s*0.04;
    ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(s*0.18, 0, br, -Math.PI*0.6, Math.PI*0.6); ctx.stroke();
    const sy2 = Math.sin(Math.PI*0.6)*br;
    ctx.beginPath(); ctx.moveTo(s*0.18, -sy2); ctx.lineTo(s*0.18, sy2); ctx.stroke();
    // Arrow
    ctx.strokeStyle = '#fde68a'; ctx.lineWidth = s*0.03; ctx.shadowColor = '#fde68a';
    ctx.beginPath(); ctx.moveTo(-s*0.32, 0); ctx.lineTo(s*0.24, 0); ctx.stroke();
    ctx.fillStyle = '#fde68a';
    ctx.beginPath(); ctx.moveTo(s*0.38, 0); ctx.lineTo(s*0.22, -s*0.1); ctx.lineTo(s*0.22, s*0.1); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;

  } else if (killSource === 'tank_enemy') {
    // Skull — cranium + jaw + glowing eye sockets
    // Cranium
    ctx.fillStyle = '#7c2d12';
    ctx.beginPath(); ctx.roundRect(-s*0.52, -s*0.62, s*1.04, s*0.78, [10,10,3,3]); ctx.fill();
    ctx.fillStyle = '#991b1b';
    ctx.beginPath(); ctx.roundRect(-s*0.44, -s*0.56, s*0.88, s*0.66, [8,8,2,2]); ctx.fill();
    // Jaw
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(-s*0.46, s*0.08, s*0.92, s*0.34);
    ctx.fillStyle = '#6b1f0e';
    ctx.fillRect(-s*0.38, s*0.13, s*0.76, s*0.24);
    // Teeth
    ctx.fillStyle = '#f5f5f4';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(-s*0.32 + i*s*0.22, s*0.1, s*0.16, s*0.14);
    }
    // Nasal cavity
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath(); ctx.moveTo(-s*0.08, s*0.04); ctx.lineTo(0, -s*0.06); ctx.lineTo(s*0.08, s*0.04); ctx.closePath(); ctx.fill();
    // Eye sockets — glowing red
    ctx.fillStyle = '#1c0a06';
    ctx.beginPath(); ctx.roundRect(-s*0.42, -s*0.48, s*0.34, s*0.36, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect( s*0.08, -s*0.48, s*0.34, s*0.36, 4); ctx.fill();
    ctx.fillStyle = '#ef4444'; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.roundRect(-s*0.40, -s*0.46, s*0.30, s*0.32, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect( s*0.10, -s*0.46, s*0.30, s*0.32, 3); ctx.fill();
    ctx.shadowBlur = 0;

  } else if (killSource === 'bomb') {
    // Dark bomb with glowing fuse
    const radG = ctx.createRadialGradient(s*0.1, -s*0.1, 2, 0, 0, s*0.55);
    radG.addColorStop(0, '#374151'); radG.addColorStop(1, '#111827');
    ctx.fillStyle = radG;
    ctx.beginPath(); ctx.arc(0, s*0.08, s*0.52, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, s*0.08, s*0.52, 0, Math.PI*2); ctx.stroke();
    // Fuse
    const fuseFlicker = 0.7 + Math.sin(t * 0.008) * 0.3;
    ctx.strokeStyle = '#92400e'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(s*0.18, -s*0.36); ctx.quadraticCurveTo(s*0.45, -s*0.52, s*0.3, -s*0.7); ctx.stroke();
    ctx.fillStyle = `rgba(251,191,36,${fuseFlicker})`;
    ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(s*0.3, -s*0.7, 5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

  } else if (killSource === 'sha') {
    // Triangular tank SHA
    ctx.fillStyle = '#1f2937';
    ctx.beginPath(); ctx.moveTo(-s*0.7, s*0.3); ctx.lineTo(s*0.7, s*0.3); ctx.lineTo(s*0.4, -s*0.2); ctx.lineTo(-s*0.4, -s*0.2); ctx.closePath(); ctx.fill();
    // Skull face
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath(); ctx.arc(0, s*0.05, s*0.28, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#1f2937';
    ctx.beginPath(); ctx.arc(-s*0.1, s*0.02, s*0.07, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( s*0.1, s*0.02, s*0.07, 0, Math.PI*2); ctx.fill();
    // Treads
    ctx.fillStyle = '#374151';
    ctx.fillRect(-s*0.7, s*0.28, s*1.4, s*0.18);

  } else if (killSource === 'kira_contact') {
    // Kira — hands-in-pockets silhouette
    ctx.fillStyle = '#6d28d9';
    // Body
    ctx.beginPath(); ctx.roundRect(-s*0.3, -s*0.2, s*0.6, s*0.7, 6); ctx.fill();
    // Head
    ctx.beginPath(); ctx.arc(0, -s*0.42, s*0.26, 0, Math.PI*2); ctx.fill();
    // Tie
    ctx.fillStyle = '#c084fc';
    ctx.beginPath(); ctx.moveTo(-s*0.05, -s*0.2); ctx.lineTo( s*0.05, -s*0.2); ctx.lineTo(s*0.03, s*0.2); ctx.lineTo(-s*0.03, s*0.2); ctx.closePath(); ctx.fill();
    // Eyes — glowing
    const eg = 0.6 + Math.sin(t * 0.003) * 0.4;
    ctx.fillStyle = `rgba(196,132,252,${eg})`;
    ctx.shadowColor = '#c084fc'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.ellipse(-s*0.09, -s*0.44, s*0.055, s*0.035, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( s*0.09, -s*0.44, s*0.055, s*0.035, 0, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

  } else if (killSource === 'beam') {
    // Lightning bolt
    ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 5;
    ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(-s*0.1, -s*0.75); ctx.lineTo( s*0.25, -s*0.05);
    ctx.lineTo(-s*0.1,  s*0.05); ctx.lineTo( s*0.2,   s*0.75);
    ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(-s*0.1, -s*0.75); ctx.lineTo( s*0.25, -s*0.05);
    ctx.lineTo(-s*0.1,  s*0.05); ctx.lineTo( s*0.2,   s*0.75);
    ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (killSource === 'grid' || killSource === 'enel_contact') {
    // Crossing lightning grid
    const lines = [[-s*0.6, -s*0.15, s*0.6, -s*0.15], [-s*0.6, s*0.15, s*0.6, s*0.15],
                   [-s*0.15, -s*0.6, -s*0.15, s*0.6],  [s*0.15, -s*0.6,  s*0.15, s*0.6]];
    ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 4;
    ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = 18;
    lines.forEach(([x1,y1,x2,y2]) => { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); });
    ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 1.5; ctx.shadowBlur = 6;
    lines.forEach(([x1,y1,x2,y2]) => { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); });
    ctx.shadowBlur = 0;
    // Enel crown for enel_contact
    if (killSource === 'enel_contact') {
      ctx.fillStyle = '#7dd3fc'; ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = 10;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI/2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*s*0.25, Math.sin(a)*s*0.25);
        ctx.lineTo(Math.cos(a)*s*0.46, Math.sin(a)*s*0.46); ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

  } else if (killSource === 'blue_orb') {
    // Gravitational blue orb with pull rings
    const rg = ctx.createRadialGradient(0, 0, 4, 0, 0, s*0.52);
    rg.addColorStop(0, '#93c5fd'); rg.addColorStop(0.5, '#2563eb'); rg.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = rg;
    ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.arc(0, 0, s*0.52, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    // Distortion rings
    for (let i = 1; i <= 3; i++) {
      const ring = s * 0.52 + i * s * 0.22 + Math.sin(t * 0.003 + i) * 4;
      ctx.strokeStyle = `rgba(96,165,250,${0.4 - i * 0.1})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, ring, 0, Math.PI*2); ctx.stroke();
    }

  } else if (killSource === 'hollow_purple') {
    // Purple destructive ball
    const pg = ctx.createRadialGradient(0, 0, 5, 0, 0, s*0.56);
    pg.addColorStop(0, '#f5f3ff'); pg.addColorStop(0.3, '#c4b5fd'); pg.addColorStop(0.7, '#7c3aed'); pg.addColorStop(1, '#2e1065');
    ctx.fillStyle = pg;
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 35;
    ctx.beginPath(); ctx.arc(0, 0, s*0.56, 0, Math.PI*2); ctx.fill();
    // Energy streaks
    ctx.strokeStyle = 'rgba(245,243,255,0.6)'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t * 0.001;
      ctx.beginPath(); ctx.moveTo(Math.cos(a)*s*0.2, Math.sin(a)*s*0.2);
      ctx.lineTo(Math.cos(a)*s*0.54, Math.sin(a)*s*0.54); ctx.stroke();
    }
    ctx.shadowBlur = 0;

  } else if (killSource === 'barrier_purple') {
    // Vertical barrier purple sweep
    const vg = ctx.createLinearGradient(0, -s*0.7, 0, s*0.7);
    vg.addColorStop(0, 'rgba(167,139,250,0)'); vg.addColorStop(0.3, 'rgba(167,139,250,0.9)');
    vg.addColorStop(0.5, '#c4b5fd'); vg.addColorStop(0.7, 'rgba(167,139,250,0.9)'); vg.addColorStop(1, 'rgba(167,139,250,0)');
    ctx.fillStyle = vg;
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 24;
    ctx.fillRect(-s*0.15, -s*0.75, s*0.3, s*1.5);
    ctx.shadowBlur = 0;

  } else if (killSource === 'red_ball') {
    // Red volleyball
    const rg2 = ctx.createRadialGradient(-s*0.15, -s*0.15, 4, 0, 0, s*0.52);
    rg2.addColorStop(0, '#fca5a5'); rg2.addColorStop(0.5, '#ef4444'); rg2.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = rg2;
    ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(0, 0, s*0.52, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    // Volleyball curve lines
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-s*0.52, 0); ctx.bezierCurveTo(-s*0.2, -s*0.3, s*0.2, -s*0.3, s*0.52, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s*0.52, 0); ctx.bezierCurveTo(-s*0.2, s*0.3, s*0.2, s*0.3, s*0.52, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -s*0.52); ctx.bezierCurveTo(-s*0.3, -s*0.2, -s*0.3, s*0.2, 0, s*0.52); ctx.stroke();

  } else if (killSource === 'void') {
    // Shadow hand reaching out
    ctx.fillStyle = 'rgba(15,5,30,0.95)';
    ctx.beginPath(); ctx.arc(0, 0, s*0.75, 0, Math.PI*2); ctx.fill();
    // Arm
    ctx.fillStyle = '#1a0a2e';
    ctx.beginPath(); ctx.moveTo(-s*0.18, s*0.7); ctx.lineTo(s*0.18, s*0.7); ctx.lineTo(s*0.14, -s*0.1); ctx.lineTo(-s*0.14, -s*0.1); ctx.closePath(); ctx.fill();
    // Claws
    ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 3; ctx.shadowColor = '#7c3aed'; ctx.shadowBlur = 12;
    const clawAngles = [-0.5, -0.2, 0.05, 0.3, 0.55];
    clawAngles.forEach(a => {
      ctx.beginPath(); ctx.moveTo(Math.cos(a - Math.PI/2)*s*0.12, -s*0.1 + Math.sin(a - Math.PI/2)*s*0.12);
      ctx.lineTo(Math.cos(a - Math.PI/2)*s*0.46, -s*0.1 + Math.sin(a - Math.PI/2)*s*0.46); ctx.stroke();
    });
    ctx.shadowBlur = 0;

  } else {
    // gojo_contact — blindfolded figure
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath(); ctx.roundRect(-s*0.28, -s*0.15, s*0.56, s*0.65, 6); ctx.fill();
    ctx.fillStyle = '#ede9fe';
    ctx.beginPath(); ctx.arc(0, -s*0.38, s*0.24, 0, Math.PI*2); ctx.fill();
    // Blindfold
    ctx.fillStyle = '#4c1d95';
    ctx.fillRect(-s*0.28, -s*0.46, s*0.56, s*0.14);
    // Purple aura
    ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 22;
    ctx.strokeStyle = 'rgba(167,139,250,0.6)'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.001;
      ctx.beginPath(); ctx.moveTo(Math.cos(a)*s*0.45, Math.sin(a)*s*0.45);
      ctx.lineTo(Math.cos(a)*s*0.7, Math.sin(a)*s*0.7); ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function drawGameOverScreen(ctx, t, char, killSource, startT) {
  const data    = _DEATH_DATA[killSource] || _DEATH_DATA.enemy;
  const fadeIn  = Math.min(1, (t - startT) / 700);

  ctx.save();
  ctx.globalAlpha = fadeIn;

  // Background fill
  ctx.fillStyle = data.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial light from center
  const ambG = ctx.createRadialGradient(W/2, H/2, 60, W/2, H/2, H * 0.72);
  ambG.addColorStop(0, `${data.accent}18`);
  ambG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ambG;
  ctx.fillRect(0, 0, W, H);

  // ── GAME OVER title ──
  ctx.save();
  ctx.font        = 'bold 68px "Segoe UI Black", "Arial Black", sans-serif';
  ctx.textAlign   = 'center';
  ctx.shadowColor = data.accent;
  ctx.shadowBlur  = 40;
  ctx.fillStyle   = data.accent;
  ctx.fillText('GAME OVER', W / 2, 88);
  ctx.shadowBlur  = 0;
  ctx.restore();

  // Horizontal rule under title
  ctx.save();
  ctx.strokeStyle = `${data.accent}55`;
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(80, 106); ctx.lineTo(W - 80, 106); ctx.stroke();
  ctx.restore();

  // ── Player portrait (left panel) ──
  const portW = 280, portH = 340;
  const portX  = 100, portY = 148;

  ctx.save();
  ctx.shadowColor = char.color.main;
  ctx.shadowBlur  = 20;
  roundRect(ctx, portX, portY, portW, portH, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.shadowBlur = 0;
  roundRect(ctx, portX, portY, portW, portH, 12);
  ctx.strokeStyle = char.color.main + '80';
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.restore();

  // Portrait clip + draw — use idle_down PNG, fall back to canvas portrait
  ctx.save();
  roundRect(ctx, portX, portY, portW, portH, 12);
  ctx.clip();
  Assets.drawSprite(ctx, char, 'idle', 'down', portX, portY, portW, portH, 0, 'contain');
  ctx.restore();

  // Character name below portrait
  ctx.font        = `bold 20px "Segoe UI", sans-serif`;
  ctx.textAlign   = 'center';
  ctx.fillStyle   = char.color.main;
  ctx.shadowColor = char.color.main;
  ctx.shadowBlur  = 10;
  ctx.fillText(char.name, portX + portW / 2, portY + portH + 28);
  ctx.shadowBlur  = 0;

  // ── Killer illustration (right panel) ──
  const kW = 280, kH = 340;
  const kX  = W - 100 - kW, kY = portY;

  ctx.save();
  ctx.shadowColor = data.accent;
  ctx.shadowBlur  = 20;
  roundRect(ctx, kX, kY, kW, kH, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.shadowBlur = 0;
  roundRect(ctx, kX, kY, kW, kH, 12);
  ctx.strokeStyle = data.accent + '80';
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.restore();

  // Killer PNG — use boss sprite if available, fall back to canvas icon
  {
    const killerImg = (() => {
      if (killSource === 'bomb')          return Assets.getBombImg()      || Assets.getKiraImg();
      if (killSource === 'sha')           return Assets.getSHAImg()       || Assets.getKiraImg();
      if (killSource === 'kira_contact')  return Assets.getKiraImg();
      if (killSource === 'beam')          return Assets.getLightningImg() || Assets.getEnelImg();
      if (killSource === 'grid')          return Assets.getEnelImg();
      if (killSource === 'enel_contact')  return Assets.getEnelImg();
      if (killSource === 'blue_orb')      return Assets.getBlueOrbImg()   || Assets.getGojoImg();
      if (killSource === 'hollow_purple') return Assets.getPurpleBallImg()|| Assets.getGojoImg();
      if (killSource === 'barrier_purple')return Assets.getPurpleBallImg()|| Assets.getGojoImg();
      if (killSource === 'red_ball')      return Assets.getRedBallImg()   || Assets.getGojoImg();
      if (killSource === 'void')          return Assets.getGojoImg();
      if (killSource === 'gojo_contact')  return Assets.getGojoImg();
      return null; // enemy — no PNG
    })();

    ctx.save();
    roundRect(ctx, kX, kY, kW, kH, 12);
    ctx.clip();
    if (killerImg) {
      const iw = killerImg.naturalWidth  || killerImg.width;
      const ih = killerImg.naturalHeight || killerImg.height;
      const scale = Math.min(kW / iw, kH / ih);
      const dw = iw * scale, dh = ih * scale;
      ctx.drawImage(killerImg, kX + (kW - dw) / 2, kY + (kH - dh) / 2, dw, dh);
    } else {
      _drawKillerIcon(ctx, kX + kW / 2, kY + kH / 2, killSource, t);
    }
    ctx.restore();
  }

  // Kill source label below icon
  ctx.font        = `bold 20px "Segoe UI", sans-serif`;
  ctx.textAlign   = 'center';
  ctx.fillStyle   = data.accent;
  ctx.shadowColor = data.accent;
  ctx.shadowBlur  = 10;
  ctx.fillText(data.label, kX + kW / 2, kY + kH + 28);
  ctx.shadowBlur  = 0;

  // ── Center arrow + label ──
  const arrowY   = portY + portH / 2;
  const arrowX1  = portX + portW + 24;
  const arrowX2  = kX - 24;
  const arrowMX  = (arrowX1 + arrowX2) / 2;

  ctx.save();
  ctx.strokeStyle = data.accent;
  ctx.lineWidth   = 2.5;
  ctx.shadowColor = data.accent;
  ctx.shadowBlur  = 12;
  ctx.beginPath(); ctx.moveTo(arrowX1, arrowY); ctx.lineTo(arrowX2, arrowY); ctx.stroke();
  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(arrowX2, arrowY);
  ctx.lineTo(arrowX2 - 16, arrowY - 9);
  ctx.lineTo(arrowX2 - 16, arrowY + 9);
  ctx.closePath();
  ctx.fillStyle = data.accent;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  // "this killed you" label on arrow
  ctx.font      = 'bold 13px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = `${data.accent}cc`;
  ctx.fillText('this killed you', arrowMX, arrowY - 12);

  // ── Death message ──
  const msgY = portY + portH + 66;
  ctx.font      = 'italic 22px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(226,232,240,0.9)';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur  = 6;
  const msgLines = data.msg.split('\n');
  msgLines.forEach((line, i) => {
    ctx.fillText(line, W / 2, msgY + i * 32);
  });
  ctx.shadowBlur = 0;

  // ── Press ENTER ──
  const enterBlink = 0.55 + Math.sin(t * 0.003) * 0.35;
  ctx.font      = `bold 17px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(148,163,184,${enterBlink})`;
  ctx.fillText('Press ENTER to return to title', W / 2, H - 34);

  ctx.restore(); // globalAlpha
}

// ─── Credits Screen ───────────────────────────────────────────────────────────

function drawCreditsScreen(ctx, t, startT) {
  const elapsed      = (t - (startT || 0)) / 1000;
  const SCROLL_SPEED = 75; // px/s
  const scrollY      = elapsed * SCROLL_SPEED;

  drawBackground(ctx, t);

  // Portrait dimensions — 3 across, centred in the full canvas width
  const PORT_W = 244, PORT_H = 272, PORT_GAP = 46;
  const PORT_ROW_W  = PORT_W * 3 + PORT_GAP * 2;
  const PORT_START_X = Math.round((W - PORT_ROW_W) / 2);

  // Boss data for portrait rows (colours match CLAUDE.md glowColor values)
  const _BOSS_PORTRAITS = [
    { name: 'Kira',  img: () => Assets.getKiraImg(),  color: '#7c3aed', glow: 'rgba(124,58,237,'  },
    { name: 'Enel',  img: () => Assets.getEnelImg(),  color: '#7dd3fc', glow: 'rgba(125,211,252,' },
    { name: 'Gojo',  img: () => Assets.getGojoImg(),  color: '#a78bfa', glow: 'rgba(167,139,250,' },
  ];

  // Draws one portrait panel at (px, py) with rounded border, image, and name label.
  // imgFn() returns an Image/canvas or null; charObj is used for player sprites.
  function _drawPortrait(px, py, color, glowPrefix, name, imgFn, charObj) {
    // Background
    roundRect(ctx, px, py, PORT_W, PORT_H, 11);
    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    ctx.fill();

    // Image / sprite
    ctx.save();
    roundRect(ctx, px, py, PORT_W, PORT_H, 11);
    ctx.clip();
    if (charObj) {
      Assets.drawSprite(ctx, charObj, 'idle', 'down', px, py, PORT_W, PORT_H, 0, 'contain');
    } else {
      const img = imgFn && imgFn();
      if (img) {
        const iw = img.naturalWidth  || img.width;
        const ih = img.naturalHeight || img.height;
        const sc = Math.min(PORT_W / iw, PORT_H / ih);
        ctx.drawImage(img, px + (PORT_W - iw * sc) / 2, py + (PORT_H - ih * sc) / 2, iw * sc, ih * sc);
      }
    }
    ctx.restore();

    // Border glow
    roundRect(ctx, px, py, PORT_W, PORT_H, 11);
    ctx.strokeStyle = `${glowPrefix}0.60)`;
    ctx.lineWidth   = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 14;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // Name label centred below the panel
    ctx.font        = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 8;
    ctx.fillText(name, px + PORT_W / 2, py + PORT_H + 22);
    ctx.shadowBlur  = 0;
  }

  // ── Items list ─────────────────────────────────────────────────────────────
  // portrait_row height = PORT_H + name label (22px) + bottom margin (16px)
  const PORT_ROW_H = PORT_H + 38;
  const CX = W / 2;

  const items = [
    { type: 'win_title', h: 92 },
    { type: 'win_sub',   h: 52 },
    { type: 'spacer',    h: 78 },
    { type: 'game_title',h: 68 },
    { type: 'spacer',    h: 60 },
    { type: 'section',   text: 'CREATED BY', h: 36 },
    { type: 'row',       label: 'Director / Created by', value: 'Anel Hodzic', h: 40 },
    { type: 'row',       label: 'Built with',            value: 'Claude Code',  h: 40 },
    { type: 'spacer',    h: 80 },
    { type: 'section',   text: 'CHARACTERS', h: 36 },
    { type: 'spacer',    h: 22 },
    { type: 'portrait_row', group: 'players', h: PORT_ROW_H },
    { type: 'spacer',    h: 22 },
    { type: 'charrow',   label: 'Kaido', value: 'One Piece',                color: '#60a5fa', h: 36 },
    { type: 'charrow',   label: 'Dio',   value: "JoJo's Bizarre Adventure", color: '#eab308', h: 36 },
    { type: 'charrow',   label: 'Levi',  value: 'Attack on Titan',          color: '#4ade80', h: 36 },
    { type: 'spacer',    h: 80 },
    { type: 'section',   text: 'BOSSES', h: 36 },
    { type: 'spacer',    h: 22 },
    { type: 'portrait_row', group: 'bosses', h: PORT_ROW_H },
    { type: 'spacer',    h: 22 },
    { type: 'charrow',   label: 'Kira',  value: "JoJo's Bizarre Adventure", color: '#7c3aed', h: 36 },
    { type: 'charrow',   label: 'Enel',  value: 'One Piece',                color: '#7dd3fc', h: 36 },
    { type: 'charrow',   label: 'Gojo',  value: 'Jujutsu Kaisen',           color: '#a78bfa', h: 36 },
    { type: 'spacer',    h: 40 },
  ];

  const totalH = items.reduce((s, i) => s + i.h, 0);

  // Ending-sequence timing (in seconds from startT)
  // Last item exits the top of the screen when scrollY >= H + totalH
  const allGoneAt    = (H + totalH) / SCROLL_SPEED; // last content clears viewport
  const thanksShowAt = allGoneAt + 0.5;              // 0.5s empty pause, then "Thanks"
  const enterShowAt  = thanksShowAt + 1.0;           // 1s later, "Press ENTER" fades in

  const inEndingPhase = elapsed >= thanksShowAt;

  // ── Scrolling credits (only while content is still visible) ────────────────
  if (!inEndingPhase) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    let curY = H - scrollY;
    for (const item of items) {
      const iy  = curY;
      curY += item.h;
      if (curY < -(PORT_ROW_H + 40) || iy > H + 40) continue;

      ctx.save();

      if (item.type === 'win_title') {
        const pulse = 0.8 + Math.sin(t * 0.002) * 0.2;
        ctx.font        = 'bold 76px "Segoe UI Black", "Arial Black", sans-serif';
        ctx.textAlign   = 'center';
        ctx.shadowColor = `rgba(167,139,250,${pulse})`;
        ctx.shadowBlur  = 44;
        ctx.fillStyle   = '#fff';
        ctx.fillText('YOU WIN!', CX, iy + 74);
        ctx.shadowBlur  = 0;

      } else if (item.type === 'win_sub') {
        ctx.font        = 'bold 22px "Segoe UI", sans-serif';
        ctx.textAlign   = 'center';
        ctx.fillStyle   = 'rgba(220,200,255,0.85)';
        ctx.shadowColor = '#a78bfa';
        ctx.shadowBlur  = 14;
        ctx.fillText('All three floors cleared!', CX, iy + 32);
        ctx.shadowBlur  = 0;

      } else if (item.type === 'game_title') {
        const gp2 = 0.8 + Math.sin(t * 0.0016) * 0.2;
        ctx.font        = 'bold 44px "Segoe UI Black", "Arial Black", sans-serif';
        ctx.textAlign   = 'center';
        ctx.shadowColor = `rgba(168,85,247,${gp2})`;
        ctx.shadowBlur  = 28;
        ctx.fillStyle   = '#fff';
        ctx.fillText('CROSSOVER GAUNTLET', CX, iy + 48);
        ctx.shadowBlur  = 0;
        ctx.font      = 'bold 12px "Courier New", monospace';
        ctx.fillStyle = 'rgba(148,163,184,0.5)';
        ctx.fillText('C  R  E  D  I  T  S', CX, iy + 66);

      } else if (item.type === 'section') {
        ctx.font      = 'bold 12px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(168,85,247,0.75)';
        ctx.fillText('— ' + item.text + ' —', CX, iy + 20);
        const tw = ctx.measureText('— ' + item.text + ' —').width;
        ctx.strokeStyle = 'rgba(168,85,247,0.18)';
        ctx.lineWidth   = 1;
        const ly = iy + 12;
        ctx.beginPath(); ctx.moveTo(60, ly); ctx.lineTo(CX - tw / 2 - 8, ly); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(CX + tw / 2 + 8, ly); ctx.lineTo(W - 60, ly); ctx.stroke();

      } else if (item.type === 'row') {
        ctx.textAlign   = 'right';
        ctx.font        = '15px "Segoe UI", sans-serif';
        ctx.fillStyle   = 'rgba(148,163,184,0.65)';
        ctx.fillText(item.label, CX - 14, iy + 26);
        ctx.textAlign   = 'left';
        ctx.font        = 'bold 16px "Segoe UI", sans-serif';
        ctx.fillStyle   = 'rgba(226,232,240,0.92)';
        ctx.shadowColor = 'rgba(168,85,247,0.35)';
        ctx.shadowBlur  = 6;
        ctx.fillText(item.value, CX + 14, iy + 26);
        ctx.shadowBlur  = 0;

      } else if (item.type === 'charrow') {
        ctx.textAlign   = 'right';
        ctx.font        = 'bold 17px "Segoe UI", sans-serif';
        ctx.fillStyle   = item.color;
        ctx.shadowColor = item.color;
        ctx.shadowBlur  = 8;
        ctx.fillText(item.label, CX - 14, iy + 26);
        ctx.shadowBlur  = 0;
        ctx.textAlign   = 'left';
        ctx.font        = '15px "Segoe UI", sans-serif';
        ctx.fillStyle   = 'rgba(148,163,184,0.65)';
        ctx.fillText(item.value, CX + 14, iy + 26);

      } else if (item.type === 'portrait_row') {
        if (item.group === 'players') {
          CHARACTERS.forEach((char, i) => {
            _drawPortrait(
              PORT_START_X + i * (PORT_W + PORT_GAP), iy,
              char.color.main, char.color.glow, char.name,
              null, char
            );
          });
        } else {
          _BOSS_PORTRAITS.forEach((b, i) => {
            _drawPortrait(
              PORT_START_X + i * (PORT_W + PORT_GAP), iy,
              b.color, b.glow, b.name,
              b.img, null
            );
          });
        }

      } else if (item.type === 'thanks') {
        const pulse = 0.6 + Math.sin(t * 0.0018) * 0.3;
        ctx.font        = 'italic 18px "Segoe UI", sans-serif';
        ctx.textAlign   = 'center';
        ctx.fillStyle   = `rgba(196,181,253,${pulse})`;
        ctx.shadowColor = '#a78bfa';
        ctx.shadowBlur  = 10;
        ctx.fillText('Thank you for playing. The Gauntlet remembers.', CX, iy + 34);
        ctx.shadowBlur  = 0;
      }

      ctx.restore();
    }

    ctx.restore(); // end clip

    // Top/bottom fade overlays (only while scrolling — hidden in ending phase)
    const fadeH = 90;
    const topG  = ctx.createLinearGradient(0, 0, 0, fadeH);
    topG.addColorStop(0, '#04040f');
    topG.addColorStop(1, 'rgba(4,4,15,0)');
    ctx.fillStyle = topG;
    ctx.fillRect(0, 0, W, fadeH);

    const botG = ctx.createLinearGradient(0, H - fadeH, 0, H);
    botG.addColorStop(0, 'rgba(4,4,15,0)');
    botG.addColorStop(1, '#04040f');
    ctx.fillStyle = botG;
    ctx.fillRect(0, H - fadeH, W, fadeH);
  }

  // ── Ending phase: bare starfield + two centred lines ──────────────────────
  if (inEndingPhase) {
    // "Thanks for Playing!" — fades in over 0.9s
    const thanksA = Math.min(1, (elapsed - thanksShowAt) / 0.9);
    ctx.save();
    ctx.globalAlpha = thanksA;
    ctx.font        = 'bold 54px "Segoe UI Black", "Arial Black", sans-serif';
    ctx.textAlign   = 'center';
    ctx.shadowColor = '#a78bfa';
    ctx.shadowBlur  = 38;
    ctx.fillStyle   = '#fff';
    ctx.fillText('Thanks for Playing!', CX, H / 2 - 22);
    ctx.shadowBlur  = 0;
    ctx.restore();

    // "Press ENTER to play again" — fades in over 0.7s, then blinks
    const enterRaw = Math.max(0, (elapsed - enterShowAt) / 0.7);
    const enterA   = Math.min(1, enterRaw);
    if (enterA > 0) {
      const blink = enterA < 1 ? enterA : 0.55 + Math.sin(t * 0.003) * 0.35;
      ctx.save();
      ctx.globalAlpha = blink;
      ctx.font        = 'bold 18px "Segoe UI", sans-serif';
      ctx.textAlign   = 'center';
      ctx.fillStyle   = '#fff';
      ctx.shadowColor = '#a78bfa';
      ctx.shadowBlur  = 14;
      ctx.fillText('Press ENTER to play again', CX, H / 2 + 36);
      ctx.shadowBlur  = 0;
      ctx.restore();
    }
  }
}
