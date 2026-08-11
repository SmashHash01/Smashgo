// ============================================================
//  NEON DELIVERY — camera.js
//  Smooth-following camera that keeps the drone centred.
//  World: 1920×1920 px.  Viewport: 960×640 px.
// ============================================================
NeonDelivery.Camera = (function () {
    const C  = NeonDelivery.Config;
    const CW = C.CANVAS_W;
    const CH = C.CANVAS_H;
    const WS = C.WORLD_SIZE;   // 1920

    // Top-left corner of the viewport in world space
    let x = 0;
    let y = 0;

    // Target (set each frame before update)
    let tx = 0;
    let ty = 0;

    function init(startX, startY) {
        x  = Math.max(0, Math.min(startX - CW / 2, WS - CW));
        y  = Math.max(0, Math.min(startY - CH / 2, WS - CH));
        tx = x;
        ty = y;
    }

    /** Call once per frame with the drone's world position. */
    function update(droneX, droneY, dt) {
        // Desired top-left so drone is at the viewport centre
        tx = droneX - CW / 2;
        ty = droneY - CH / 2;

        // Clamp target to world bounds
        tx = Math.max(0, Math.min(tx, WS - CW));
        ty = Math.max(0, Math.min(ty, WS - CH));

        // Lerp towards target (frame-rate independent)
        const alpha = 1 - Math.pow(1 - C.CAMERA_LERP, dt / 16.67);
        x += (tx - x) * alpha;
        y += (ty - y) * alpha;
    }

    /** World → screen transform. */
    function worldToScreen(wx, wy) {
        return { x: wx - x, y: wy - y };
    }

    /** Screen → world transform. */
    function screenToWorld(sx, sy) {
        return { x: sx + x, y: sy + y };
    }

    /** Returns true if the world rect (wx,wy,ww,wh) is inside the viewport. */
    function inView(wx, wy, ww, wh) {
        return wx + ww > x && wx < x + CW &&
               wy + wh > y && wy < y + CH;
    }

    return {
        get x()  { return x;  },
        get y()  { return y;  },
        init, update, worldToScreen, screenToWorld, inView
    };
})();
