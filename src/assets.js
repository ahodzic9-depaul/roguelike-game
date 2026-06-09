// ─── Asset loader + sprite renderer ──────────────────────────────────────────
//
// Character sprites (12 files, drop into assets/):
//   <id>_idle_down.jpg   facing camera  (default / character select)
//   <id>_idle_up.jpg     facing away
//   <id>_idle_side.jpg   facing right   (flipped automatically for left)
//   <id>_attack.jpg      attack pose    (flipped automatically for left)
//
// Power icons (6 files, drop into assets/):
//   haki.png  timestop.png  ally_summon.png  spin.png  king_crimson.png  awakening.png
//
// Drop any file in and reload — no code changes needed.

const Assets = (() => {
  // Keyed by string: "<charId>_<imageKey>" for sprites, "power_<powerId>" for icons.
  const _imgs = {};

  // Returns a Promise that resolves once every image has either loaded or failed,
  // so the render loop can start without any fallback-flash on first frame.
  function init() {
    const loads = [];
    CHARACTERS.forEach(char => {
      Object.entries(char.images).forEach(([key, src]) => {
        loads.push(_load(`${char.id}_${key}`, src));
      });
    });
    POWERS.forEach(power => {
      loads.push(_load(`power_${power.id}`, `assets/${power.id}.png`));
    });
    loads.push(_load('ally',               'assets/ally.png'));
    loads.push(_load('bomb',               'assets/bomb.png'));
    loads.push(_load('sheer_heart_attack', 'assets/sheer_heart_attack.png'));
    loads.push(_load('boss_kira',          'assets/kira.png'));
    loads.push(_load('boss_enel',          'assets/enel.png'));
    loads.push(_load('boss_enel_death',    'assets/enel_death.png'));
    loads.push(_load('boss_gojo',          'assets/gojo.png'));
    loads.push(_load('boss_gojo_purple',   'assets/gojo_purple.png'));
    loads.push(_load('boss_gojo_blue',     'assets/gojo_blue.png'));
    loads.push(_load('boss_gojo_red',      'assets/gojo_red.png'));
    loads.push(_load('boss_gojo_death',    'assets/gojo_death.png'));
    loads.push(_load('purple_ball',        'assets/purple_ball.png'));
    loads.push(_load('blue_orb',           'assets/blue_orb.png'));
    loads.push(_load('red_ball',           'assets/red_ball.png'));
    loads.push(_load('lightning',          'assets/lightning.png'));
    return Promise.allSettled(loads);
  }

  function _load(key, src) {
    _imgs[key] = null;
    const pngSrc = src.replace(/\.[^.]+$/, '.png');
    const jpgSrc = src.replace(/\.[^.]+$/, '.jpg');

    return new Promise(resolve => {
      const tryJpg = () => {
        const img = new Image();
        img.onload  = () => { _imgs[key] = _stripBackground(img); resolve(); };
        img.onerror = () => { resolve(); }; // stays null; canvas fallback will draw
        img.src = jpgSrc;
      };

      // PNG takes priority and is used as-is (already has transparency).
      const img = new Image();
      img.onload  = () => { _imgs[key] = img; resolve(); };
      img.onerror = tryJpg; // PNG failed — try JPG; tryJpg owns the resolve
      img.src = pngSrc;
    });
  }

  // Flood-fill background removal: seed from all edge pixels and remove connected
  // near-black or near-white pixels outward, stopping at character pixels. Internal
  // details that aren't connected to the background edge are left untouched.
  function _stripBackground(img) {
    const oc = document.createElement('canvas');
    oc.width  = img.naturalWidth;
    oc.height = img.naturalHeight;
    const octx = oc.getContext('2d');
    octx.drawImage(img, 0, 0);
    const px  = octx.getImageData(0, 0, oc.width, oc.height);
    const d   = px.data;
    const iw  = oc.width, ih = oc.height;

    // Near-black or near-white — raised thresholds absorb JPEG compression fringing.
    const isBg = i =>
      (d[i] < 30 && d[i+1] < 30 && d[i+2] < 30) ||
      (d[i] > 225 && d[i+1] > 225 && d[i+2] > 225);
    const idx = (x, y) => (y * iw + x) * 4;

    const visited = new Uint8Array(iw * ih);
    const queue = [];
    let qi = 0;

    const seed = (x, y) => {
      if (!visited[y * iw + x] && isBg(idx(x, y))) {
        visited[y * iw + x] = 1;
        queue.push(x, y);
      }
    };

    for (let x = 0; x < iw; x++) { seed(x, 0); seed(x, ih - 1); }
    for (let y = 1; y < ih - 1; y++) { seed(0, y); seed(iw - 1, y); }

    while (qi < queue.length) {
      const x = queue[qi++], y = queue[qi++];
      d[idx(x, y) + 3] = 0;
      if (x > 0)      seed(x - 1, y);
      if (x < iw - 1) seed(x + 1, y);
      if (y > 0)      seed(x, y - 1);
      if (y < ih - 1) seed(x, y + 1);
    }

    octx.putImageData(px, 0, 0);
    return oc;
  }

  // ─── Character sprites ────────────────────────────────────────────────────

  function _resolveSprite(char, pose, dir) {
    if (pose === 'idle') {
      if (dir === 'up')    return { img: _imgs[`${char.id}_idle_up`],   flipH: false };
      if (dir === 'left')  return { img: _imgs[`${char.id}_idle_side`], flipH: true  };
      if (dir === 'right') return { img: _imgs[`${char.id}_idle_side`], flipH: false };
      /* down (default) */ return { img: _imgs[`${char.id}_idle_down`], flipH: false };
    }
    if (pose === 'charge' || pose === 'attack') {
      // Kaido's charge/attack rotate to face the aim direction.
      if (char.id === 'kaido') {
        if (dir === 'up')   return { img: _imgs[`${char.id}_${pose}`], flipH: false, rotate: -Math.PI / 2 };
        if (dir === 'down') return { img: _imgs[`${char.id}_${pose}`], flipH: false, rotate:  Math.PI / 2 };
        if (dir === 'left') return { img: _imgs[`${char.id}_${pose}`], flipH: true,  rotate: 0 };
        /* right */         return { img: _imgs[`${char.id}_${pose}`], flipH: false, rotate: 0 };
      }
      if (pose === 'charge') return { img: _imgs[`${char.id}_charge`], flipH: dir === 'left' };
      // Levi's attack image rotated/flipped for all four directions.
      if (char.id === 'levi' && pose === 'attack') {
        if (dir === 'up')   return { img: _imgs['levi_attack'], flipH: false, rotate: -Math.PI / 2 };
        if (dir === 'down') return { img: _imgs['levi_attack'], flipH: false, rotate:  Math.PI / 2 };
        if (dir === 'left') return { img: _imgs['levi_attack'], flipH: true,  rotate: 0 };
        /* right */         return { img: _imgs['levi_attack'], flipH: false, rotate: 0 };
      }
    }
    // attack — Dio's sprite faces left by default, so flip logic is reversed for him
    const flipLeft = char.id === 'dio' ? dir === 'right' : dir === 'left';
    return { img: _imgs[`${char.id}_attack`], flipH: flipLeft };
  }

  // pose:  'idle' | 'attack'
  // dir:   'down' | 'up' | 'left' | 'right'
  // tilt:  rotation in radians for walk bob (0 or omit for static)
  // fit:   'stretch' (default) | 'contain' (preserve aspect ratio, letterbox)
  function drawSprite(ctx, char, pose, dir, x, y, w, h, tilt = 0, fit = 'stretch') {
    const { img, flipH, rotate = 0 } = _resolveSprite(char, pose, dir);
    if (img) {
      _drawImage(ctx, img, x, y, w, h, tilt, flipH, fit, rotate);
    } else {
      _drawSpriteFallback(ctx, char, x, y, w, h, tilt, flipH);
    }
  }

  function _drawImage(ctx, img, x, y, w, h, tilt, flipH, fit = 'stretch', rotate = 0) {
    let dx = x, dy = y, dw = w, dh = h;
    if (fit === 'contain' || fit === 'cover' || fit === 'cover-top') {
      const iw = img.naturalWidth  || img.width;
      const ih = img.naturalHeight || img.height;
      const scale = fit === 'contain'
        ? Math.min(w / iw, h / ih)
        : Math.max(w / iw, h / ih);
      dw = iw * scale;
      dh = ih * scale;
      dx = x + (w - dw) / 2;
      dy = fit === 'cover-top' ? y - h * 0.12 : y + (h - dh) / 2;
    }
    const isQuarter = rotate === Math.PI / 2 || rotate === -Math.PI / 2;
    const rdw = isQuarter ? dh : dw;
    const rdh = isQuarter ? dw : dh;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (!tilt && !flipH && !rotate) {
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
      return;
    }
    ctx.translate(dx + dw / 2, dy + dh / 2);
    if (flipH)          ctx.scale(-1, 1);
    if (tilt || rotate) ctx.rotate(tilt + rotate);
    ctx.drawImage(img, -rdw / 2, -rdh / 2, rdw, rdh);
    ctx.restore();
  }

  function _drawSpriteFallback(ctx, char, x, y, w, h, tilt, flipH) {
    ctx.save();
    if (tilt || flipH) {
      ctx.translate(x + w / 2, y + h / 2);
      if (flipH) ctx.scale(-1, 1);
      if (tilt)  ctx.rotate(tilt);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }
    const t = performance.now();
    if      (char.id === 'kaido') drawKaidoPortrait(ctx, x, y, w, h, t);
    else if (char.id === 'dio')   drawDioPortrait(ctx, x, y, w, h, t);
    else if (char.id === 'levi')  drawLeviPortrait(ctx, x, y, w, h, t);
    ctx.restore();
  }

  // ─── Power icons ──────────────────────────────────────────────────────────
  // Draws the power icon centered at (cx, cy) fitting within radius r.
  // Uses the PNG from assets/ if loaded; otherwise falls back to canvas drawing.

  function drawPowerIcon(ctx, power, cx, cy, r) {
    const img = _imgs[`power_${power.id}`];
    if (img) {
      // Draw the PNG centered, with a color glow to match the canvas style.
      ctx.save();
      ctx.shadowColor = power.color.main;
      ctx.shadowBlur  = 18;
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
      ctx.shadowBlur = 0;
      ctx.restore();
    } else {
      // Canvas fallback (defined in powers.js)
      drawPowerIcon_canvas(ctx, power.icon, cx, cy, r, power.color);
    }
  }

  return {
    init, drawSprite, drawPowerIcon,
    getAllyImg:  () => _imgs['ally'],
    getBombImg:  () => _imgs['bomb'],
    getSHAImg:   () => _imgs['sheer_heart_attack'],
    getKiraImg:     () => _imgs['boss_kira'],
    getEnelImg:      () => _imgs['boss_enel'],
    getEnelDeathImg: () => _imgs['boss_enel_death'],
    getGojoImg:       () => _imgs['boss_gojo'],
    getGojoPurpleImg: () => _imgs['boss_gojo_purple'],
    getGojoBlueImg:   () => _imgs['boss_gojo_blue'],
    getGojoRedImg:    () => _imgs['boss_gojo_red'],
    getGojoDeathImg:  () => _imgs['boss_gojo_death'],
    getPurpleBallImg: () => _imgs['purple_ball'],
    getBlueOrbImg:    () => _imgs['blue_orb'],
    getRedBallImg:    () => _imgs['red_ball'],
    getLightningImg:  () => _imgs['lightning'],
  };
})();
