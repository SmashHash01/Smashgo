// ============================================================
//  NEON DELIVERY — input.js
//
//  DESKTOP
//  WASD / Arrow Keys  = move
//  Space (single tap) = boost
//  Space (double tap) = DASH (double boost)
//  Escape / P         = pause
//
//  MOBILE
//  Virtual joystick   = move
//  Boost button       = boost  (double-tap boost btn = dash)
// ============================================================

NeonDelivery.Input = (function () {

    const keys = {};
    let pauseConsumed = false;

    // ── Boost edge detection ──────────────────────────────────
    // boostJustPressed is set TRUE on the keydown frame,
    // then consumed (set false) the moment it's read.
    // This is how we detect single vs double tap reliably.
    let boostJustPressed = false;
    let spaceHeld        = false;   // true while Space is held

    // Mobile boost tap edge
    let boostTouchJustPressed = false;
    let boostTouched          = false;

    // ── Virtual joystick (mobile) ─────────────────────────────
    const joystick = { dx: 0, dy: 0, active: false };
    let joystickBase    = null;
    let joystickTouchId = null;
    const JOYSTICK_RADIUS = 52;
    let knobEl = null;

    // ── Init ─────────────────────────────────────────────────
    function init() {

        // Keyboard
        window.addEventListener('keydown', e => {
            keys[e.code] = true;

            // Fire edge on the actual keydown, not while held (e.repeat guard)
            if (e.code === 'Space' && !e.repeat) {
                boostJustPressed = true;
                spaceHeld = true;
            }

            if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', e => {
            keys[e.code] = false;
            if (e.code === 'Space') spaceHeld = false;
        });

        // Mobile joystick
        const joystickZone = document.getElementById('joystick-zone');
        knobEl = document.getElementById('joystick-knob');
        const boostBtn = document.getElementById('boost-btn');

        if (joystickZone) {
            joystickZone.addEventListener('touchstart',  onJoyStart, { passive: false });
            joystickZone.addEventListener('touchmove',   onJoyMove,  { passive: false });
            joystickZone.addEventListener('touchend',    onJoyEnd,   { passive: false });
            joystickZone.addEventListener('touchcancel', onJoyEnd,   { passive: false });
        }

        if (boostBtn) {
            boostBtn.addEventListener('touchstart', e => {
                e.preventDefault();
                boostTouched          = true;
                boostTouchJustPressed = true;
            }, { passive: false });
            boostBtn.addEventListener('touchend',    e => { e.preventDefault(); boostTouched = false; }, { passive: false });
            boostBtn.addEventListener('touchcancel', () => { boostTouched = false; });
        }
    }

    // ── Mobile joystick handlers ──────────────────────────────
    function onJoyStart(e) {
        e.preventDefault();
        const touch = e.changedTouches[0];
        joystickTouchId = touch.identifier;
        const rect = e.currentTarget.getBoundingClientRect();
        joystickBase = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        joystick.active = true;
        updateJoystick(touch.clientX, touch.clientY);
    }

    function onJoyMove(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier === joystickTouchId && joystickBase) {
                updateJoystick(t.clientX, t.clientY);
            }
        }
    }

    function onJoyEnd(e) {
        for (const t of e.changedTouches) {
            if (t.identifier === joystickTouchId) {
                joystick.dx = 0; joystick.dy = 0; joystick.active = false;
                joystickBase = null; joystickTouchId = null;
                if (knobEl) knobEl.style.transform = 'translate(-50%, -50%)';
            }
        }
    }

    function updateJoystick(cx, cy) {
        if (!joystickBase) return;
        const dx = cx - joystickBase.x, dy = cy - joystickBase.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clamped = Math.min(dist, JOYSTICK_RADIUS);
        const nx = dist > 4 ? dx / dist : 0, ny = dist > 4 ? dy / dist : 0;
        joystick.dx = nx * (clamped / JOYSTICK_RADIUS);
        joystick.dy = ny * (clamped / JOYSTICK_RADIUS);
        if (knobEl) {
            const ox = nx * Math.min(dist, JOYSTICK_RADIUS - 8);
            const oy = ny * Math.min(dist, JOYSTICK_RADIUS - 8);
            knobEl.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
        }
    }

    // ── Public API ───────────────────────────────────────────

    function getMove() {
        if (joystick.active) return { dx: joystick.dx, dy: joystick.dy };
        let dx = 0, dy = 0;
        if (keys['KeyW'] || keys['ArrowUp'])    dy -= 1;
        if (keys['KeyS'] || keys['ArrowDown'])  dy += 1;
        if (keys['KeyA'] || keys['ArrowLeft'])  dx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 1) { dx /= len; dy /= len; }
        return { dx, dy };
    }

    // True while Space / boost-btn is held — used for sustained boost
    function isBoost() {
        return !!(spaceHeld || boostTouched);
    }

    // True ONCE per physical key press — used for dash double-tap detection
    function isBoostPressed() {
        const v = boostJustPressed || boostTouchJustPressed;
        boostJustPressed      = false;  // consume
        boostTouchJustPressed = false;
        return v;
    }

    function isPause() {
        const pressed = !!(keys['Escape'] || keys['KeyP']);
        if (pressed && !pauseConsumed) { pauseConsumed = true; return true; }
        if (!pressed) pauseConsumed = false;
        return false;
    }

    return { init, getMove, isBoost, isBoostPressed, isPause };

})();