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
  ctx.fillText('REALM OF LEGENDS', W / 2, titleY + 34);
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
  _drawFloorTransitionCards(ctx, state, t, 'FLOOR 1 CLEARED!', 'Choose a power upgrade — +50% HP restored on all options');
}

function updateUpgradeScreen(state, t) {
  if (Input.clicked && state.hoveredCard >= 0) {
    if (state.selectedCard === state.hoveredCard) {
      // Confirm
      const opt  = state.options[state.selectedCard];
      const char = state.char;
      const pow  = state.power;
      opt.apply(char, pow);
      const fullHeal = state.selectedCard === 2;  // Vitality option
      return { char, power: pow, fullHeal };
    }
    state.selectedCard = state.hoveredCard;
  }
  if (Input.justPressed('Enter') && state.selectedCard >= 0) {
    const opt  = state.options[state.selectedCard];
    const char = state.char;
    const pow  = state.power;
    opt.apply(char, pow);
    const fullHeal = state.selectedCard === 2;
    return { char, power: pow, fullHeal };
  }
  return null;
}

// ─── Stat Boost Screen (after Floor 2) ───────────────────────────────────────

function drawStatBoostScreen(ctx, state, t) {
  _drawFloorTransitionCards(ctx, state, t, 'FLOOR 2 CLEARED!', 'Choose a stat boost — +30% HP restored on all options');
}

function updateStatBoostScreen(state, t) {
  if (Input.clicked && state.hoveredCard >= 0) {
    if (state.selectedCard === state.hoveredCard) {
      const opt  = state.options[state.selectedCard];
      const char = state.char;
      const pow  = state.power;
      opt.apply(char, pow);
      const fullHeal = state.selectedCard === 0;  // Max HP option restores to full
      return { char, power: pow, fullHeal };
    }
    state.selectedCard = state.hoveredCard;
  }
  if (Input.justPressed('Enter') && state.selectedCard >= 0) {
    const opt  = state.options[state.selectedCard];
    const char = state.char;
    const pow  = state.power;
    opt.apply(char, pow);
    const fullHeal = state.selectedCard === 0;
    return { char, power: pow, fullHeal };
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
  ctx.fillText('The Realm of Legends bows before you.', W/2, H/2 + 50);

  ctx.font      = '16px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('Press ENTER to play again', W/2, H/2 + 100);
}
