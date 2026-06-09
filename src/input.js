const Input = (() => {
  let _mouseX = 0, _mouseY = 0;
  let _clicked = false;
  let _keys = {};
  let _keysJustPressed = {};
  let _scaleFactor = 1;
  let _offsetX = 0, _offsetY = 0;

  function _toCanvas(clientX, clientY) {
    return {
      x: (clientX - _offsetX) / _scaleFactor,
      y: (clientY - _offsetY) / _scaleFactor,
    };
  }

  function init(canvas) {
    function updateScale() {
      const rect = canvas.getBoundingClientRect();
      _scaleFactor = rect.width / W;
      _offsetX = rect.left;
      _offsetY = rect.top;
    }
    window.addEventListener('resize', updateScale);
    updateScale();

    canvas.addEventListener('mousemove', e => {
      const p = _toCanvas(e.clientX, e.clientY);
      _mouseX = p.x;
      _mouseY = p.y;
    });

    canvas.addEventListener('click', e => {
      _clicked = true;
    });

    window.addEventListener('keydown', e => {
      if (!_keys[e.code]) _keysJustPressed[e.code] = true;
      _keys[e.code] = true;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });

    window.addEventListener('keyup', e => {
      _keys[e.code] = false;
    });
  }

  function flush() {
    _clicked = false;
    _keysJustPressed = {};
  }

  // Returns { x, y } unit vector for WASD movement, or { x:0, y:0 } when idle.
  // Diagonals are normalized so speed is consistent in all directions.
  function _moveDir() {
    let x = 0, y = 0;
    if (_keys['KeyW']) y -= 1;
    if (_keys['KeyS']) y += 1;
    if (_keys['KeyA']) x -= 1;
    if (_keys['KeyD']) x += 1;
    if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }

  // Returns { x, y } unit vector for arrow-key shooting, or null when no arrow
  // key is held (null lets the game know not to fire, vs. firing at zero vector).
  function _shootDir() {
    let x = 0, y = 0;
    if (_keys['ArrowUp'])    y -= 1;
    if (_keys['ArrowDown'])  y += 1;
    if (_keys['ArrowLeft'])  x -= 1;
    if (_keys['ArrowRight']) x += 1;
    if (x === 0 && y === 0) return null;
    if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }

  return {
    init,
    flush,
    get mouseX()    { return _mouseX; },
    get mouseY()    { return _mouseY; },
    get clicked()   { return _clicked; },
    get moveDir()   { return _moveDir(); },
    get shootDir()  { return _shootDir(); },
    get isMoving()  { const d = _moveDir(); return d.x !== 0 || d.y !== 0; },
    key:         code => !!_keys[code],
    justPressed: code => !!_keysJustPressed[code],
  };
})();
