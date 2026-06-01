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
    });

    window.addEventListener('keyup', e => {
      _keys[e.code] = false;
    });
  }

  function flush() {
    _clicked = false;
    _keysJustPressed = {};
  }

  return {
    init,
    flush,
    get mouseX()   { return _mouseX; },
    get mouseY()   { return _mouseY; },
    get clicked()  { return _clicked; },
    key:      code => !!_keys[code],
    justPressed: code => !!_keysJustPressed[code],
  };
})();
