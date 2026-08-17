// ============================================================
//  NEON DELIVERY — camera.js
//  Smooth-following camera that keeps the drone centred.
//  World: 1920×1920 px.  Viewport: 960×640 px.
// ============================================================
NeonDelivery.Camera = (function () {
    const C  = NeonDelivery.Config;
    let x = 0;
    let y = 0;

    // Target (set each frame before update)
    let tx = 0;
    let ty = 0;

    function init(startX, startY) {
        const WS = C.WORLD_SIZE || (NeonDelivery.World && NeonDelivery.World.worldSize) || 1920;
        x  = Math.max(0, Math.min(startX - C.CANVAS_W / 2, WS - C.CANVAS_W));
        y  = Math.max(0, Math.min(startY - C.CANVAS_H / 2, WS - C.CANVAS_H));
        tx = x;
        ty = y;
    }

    /** Call once per frame with the drone's world position. */
    function update(droneX, droneY, dt) {
        const WS = C.WORLD_SIZE || (NeonDelivery.World && NeonDelivery.World.worldSize) || 1920;
        // Desired top-left so drone is at the viewport centre
        tx = droneX - C.CANVAS_W / 2;
        ty = droneY - C.CANVAS_H / 2;

        // Clamp target to world bounds
        tx = Math.max(0, Math.min(tx, WS - C.CANVAS_W));
        ty = Math.max(0, Math.min(ty, WS - C.CANVAS_H));

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
        return wx + ww > x && wx < x + C.CANVAS_W &&
               wy + wh > y && wy < y + C.CANVAS_H;
    }

    return {
        get x()  { return x;  },
        get y()  { return y;  },
        init, update, worldToScreen, screenToWorld, inView
    };
})();
