// ============================================================
//  NEON DELIVERY — input.js
//
//  Unified input:
//
//  DESKTOP MOUSE
//  ------------------------------------------------------------
//  Move cursor          = steer drone
//  Cursor distance      = normal movement speed
//  Hold LEFT CLICK      = boost
//  Release LEFT CLICK   = normal flight continues
//  No idle state
//
//  KEYBOARD
//  ------------------------------------------------------------
//  WASD / Arrow Keys    = move
//  Space                = boost
//  Escape / P           = pause
//
//  MOBILE
//  ------------------------------------------------------------
//  Virtual joystick     = move
//  Boost button         = boost
//
// ============================================================

NeonDelivery.Input = (function () {

    // =========================================================
    // KEYBOARD STATE
    // =========================================================

    const keys = {};

    let pauseConsumed = false;


    // =========================================================
    // MOUSE STATE
    // =========================================================

    let canvas = null;

    const mouse = {

        // Logical canvas coordinates
        x: 0,
        y: 0,

        // Mouse has entered / interacted with canvas
        active: false,

        // Left mouse button
        leftDown: false,

        // Current steering direction
        dx: 1,
        dy: 0,

        // Normal movement throttle
        power: 0.65

    };


    // ---------------------------------------------------------
    // Remember previous valid direction.
    //
    // If cursor goes directly over drone or leaves the canvas,
    // the drone keeps moving in its previous direction.
    // ---------------------------------------------------------

    let lastMouseDX = 1;
    let lastMouseDY = 0;


    // =========================================================
    // MOUSE TUNING
    // =========================================================

    /*
     * Minimum normal flight speed.
     *
     * 0.45 = slow minimum
     * 0.60 = arcade feel
     * 0.75 = very aggressive
     */

    const MIN_MOUSE_POWER = 0.0;


    /*
     * Distance from drone where normal speed reaches 100%.
     *
     * Smaller number = reaches full speed faster.
     */

    const MOUSE_FULL_SPEED_RADIUS = 0;


    /*
     * Cursor distance where we stop changing direction.
     *
     * IMPORTANT:
     * The drone DOES NOT stop.
     * It keeps its previous direction.
     */

    const MOUSE_DIRECTION_DEAD_ZONE = 0;


    // =========================================================
    // VIRTUAL JOYSTICK
    // =========================================================

    const joystick = {

        dx: 0,
        dy: 0,
        active: false

    };


    let joystickBase = null;

    let joystickTouchId = null;

    const JOYSTICK_RADIUS = 0;


    // =========================================================
    // MOBILE BOOST
    // =========================================================

    let boostTouched = false;


    // Joystick knob DOM element
    let knobEl = null;


    // =========================================================
    // INIT
    // =========================================================

    function init() {

        canvas = document.getElementById('game-canvas');


        // =====================================================
        // KEYBOARD EVENTS
        // =====================================================

        window.addEventListener('keydown', e => {

            keys[e.code] = true;


            if (
                e.code === 'Space' ||
                e.code === 'ArrowUp' ||
                e.code === 'ArrowDown' ||
                e.code === 'ArrowLeft' ||
                e.code === 'ArrowRight'
            ) {

                e.preventDefault();

            }

        });


        window.addEventListener('keyup', e => {

            keys[e.code] = false;

        });


        // =====================================================
        // MOUSE EVENTS
        // =====================================================

        if (canvas) {

            // -------------------------------------------------
            // Mouse enters game
            // -------------------------------------------------

            canvas.addEventListener('mouseenter', e => {

                mouse.active = true;

                updateMousePosition(e);

            });


            // -------------------------------------------------
            // Mouse movement
            //
            // Cursor movement continuously changes direction.
            // No click required.
            // -------------------------------------------------

            canvas.addEventListener('mousemove', e => {

                mouse.active = true;

                updateMousePosition(e);

            });


            // -------------------------------------------------
            // LEFT MOUSE DOWN = BOOST
            // -------------------------------------------------

            canvas.addEventListener('mousedown', e => {

                if (e.button !== 0) return;

                mouse.leftDown = true;

                mouse.active = true;

                updateMousePosition(e);

                e.preventDefault();

            });


            // -------------------------------------------------
            // LEFT MOUSE RELEASE = NORMAL SPEED
            //
            // IMPORTANT:
            // Direction is NOT reset.
            // Drone continues flying.
            // -------------------------------------------------

            canvas.addEventListener('mouseup', e => {

                if (e.button !== 0) return;

                mouse.leftDown = false;

                e.preventDefault();

            });


            // -------------------------------------------------
            // Mouse released outside canvas
            // -------------------------------------------------

            window.addEventListener('mouseup', e => {

                if (e.button !== 0) return;

                mouse.leftDown = false;

            });


            // -------------------------------------------------
            // Cursor leaves canvas
            //
            // DO NOT STOP THE DRONE.
            // It keeps the last known direction.
            // -------------------------------------------------

            canvas.addEventListener('mouseleave', () => {

                /*
                 * Intentionally empty.
                 *
                 * We do NOT set:
                 *
                 * mouse.active = false
                 * mouse.dx = 0
                 * mouse.dy = 0
                 *
                 * This creates continuous flight.
                 */

            });


            // Prevent dragging canvas
            canvas.addEventListener('dragstart', e => {

                e.preventDefault();

            });


            // Prevent browser text selection behavior
            canvas.addEventListener('selectstart', e => {

                e.preventDefault();

            });

        }


        // =====================================================
        // MOBILE CONTROLS
        // =====================================================

        const joystickZone =
            document.getElementById('joystick-zone');


        knobEl =
            document.getElementById('joystick-knob');


        const boostBtn =
            document.getElementById('boost-btn');


        // -----------------------------------------------------
        // Joystick
        // -----------------------------------------------------

        if (joystickZone) {

            joystickZone.addEventListener(
                'touchstart',
                onJoyStart,
                {
                    passive: false
                }
            );


            joystickZone.addEventListener(
                'touchmove',
                onJoyMove,
                {
                    passive: false
                }
            );


            joystickZone.addEventListener(
                'touchend',
                onJoyEnd,
                {
                    passive: false
                }
            );


            joystickZone.addEventListener(
                'touchcancel',
                onJoyEnd,
                {
                    passive: false
                }
            );

        }


        // -----------------------------------------------------
        // Mobile boost
        // -----------------------------------------------------

        if (boostBtn) {

            boostBtn.addEventListener(
                'touchstart',
                e => {

                    e.preventDefault();

                    boostTouched = true;

                },
                {
                    passive: false
                }
            );


            boostBtn.addEventListener(
                'touchend',
                e => {

                    e.preventDefault();

                    boostTouched = false;

                },
                {
                    passive: false
                }
            );


            boostBtn.addEventListener(
                'touchcancel',
                () => {

                    boostTouched = false;

                }
            );

        }

    }


    // =========================================================
    // MOUSE POSITION / DIRECTION
    // =========================================================

    function updateMousePosition(e) {

        if (!canvas) return;


        const rect =
            canvas.getBoundingClientRect();


        /*
         * Convert browser coordinates to internal
         * logical canvas coordinates.
         *
         * This is important because your canvas is
         * responsive/scaled with CSS.
         */

        mouse.x =
            (e.clientX - rect.left) *
            (canvas.width / rect.width);


        mouse.y =
            (e.clientY - rect.top) *
            (canvas.height / rect.height);


        /*
         * Your camera normally keeps the drone close
         * to the centre of the canvas.
         */

        const centerX =
            canvas.width / 2;


        const centerY =
            canvas.height / 2;


        const dx =
            mouse.x - centerX;


        const dy =
            mouse.y - centerY;


        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );


        // =====================================================
        // DIRECTION
        // =====================================================

        if (distance > MOUSE_DIRECTION_DEAD_ZONE) {

            // Normalised mouse direction
            mouse.dx =
                dx / distance;


            mouse.dy =
                dy / distance;


            // Remember direction
            lastMouseDX =
                mouse.dx;


            lastMouseDY =
                mouse.dy;

        } else {

            /*
             * Cursor is directly over the drone.
             *
             * DO NOT STOP.
             *
             * Keep previous direction.
             */

            mouse.dx =
                lastMouseDX;


            mouse.dy =
                lastMouseDY;

        }


        // =====================================================
        // SPEED
        // =====================================================

        /*
         * Cursor close:
         *
         * minimum normal speed
         *
         *
         * Cursor far:
         *
         * maximum normal speed
         */

        const calculatedPower =
            distance /
            MOUSE_FULL_SPEED_RADIUS;


        mouse.power =
            Math.max(
                MIN_MOUSE_POWER,
                Math.min(
                    1,
                    calculatedPower
                )
            );

    }


    // =========================================================
    // MOBILE JOYSTICK
    // =========================================================

    function onJoyStart(e) {

        e.preventDefault();


        const touch =
            e.changedTouches[0];


        joystickTouchId =
            touch.identifier;


        const rect =
            e.currentTarget.getBoundingClientRect();


        joystickBase = {

            x:
                rect.left +
                rect.width / 2,

            y:
                rect.top +
                rect.height / 2

        };


        joystick.active = true;


        updateJoystick(
            touch.clientX,
            touch.clientY
        );

    }


    function onJoyMove(e) {

        e.preventDefault();


        for (const touch of e.changedTouches) {

            if (
                touch.identifier === joystickTouchId &&
                joystickBase
            ) {

                updateJoystick(
                    touch.clientX,
                    touch.clientY
                );

            }

        }

    }


    function onJoyEnd(e) {

        for (const touch of e.changedTouches) {

            if (
                touch.identifier === joystickTouchId
            ) {

                joystick.dx = 0;

                joystick.dy = 0;

                joystick.active = false;


                joystickBase = null;

                joystickTouchId = null;


                if (knobEl) {

                    knobEl.style.transform =
                        'translate(-50%, -50%)';

                }

            }

        }

    }


    function updateJoystick(cx, cy) {

        if (!joystickBase) return;


        const dx =
            cx -
            joystickBase.x;


        const dy =
            cy -
            joystickBase.y;


        const dist =
            Math.sqrt(
                dx * dx +
                dy * dy
            );


        const clamped =
            Math.min(
                dist,
                JOYSTICK_RADIUS
            );


        const nx =
            dist > 4
                ? dx / dist
                : 0;


        const ny =
            dist > 4
                ? dy / dist
                : 0;


        joystick.dx =
            nx *
            (
                clamped /
                JOYSTICK_RADIUS
            );


        joystick.dy =
            ny *
            (
                clamped /
                JOYSTICK_RADIUS
            );


        // =====================================================
        // VISUAL JOYSTICK KNOB
        // =====================================================

        if (knobEl) {

            const ox =
                nx *
                Math.min(
                    dist,
                    JOYSTICK_RADIUS - 8
                );


            const oy =
                ny *
                Math.min(
                    dist,
                    JOYSTICK_RADIUS - 8
                );


            knobEl.style.transform =
                `translate(
                    calc(-50% + ${ox}px),
                    calc(-50% + ${oy}px)
                )`;

        }

    }


    // =========================================================
    // MOVEMENT
    // =========================================================

    /**
     * Returns:
     *
     * {
     *     dx,
     *     dy
     * }
     *
     * Maximum vector length = 1.
     *
     * Mouse values can be below 1 so cursor distance
     * can control normal movement speed.
     */

    function getMove() {

        let dx = 0;
        let dy = 0;


        let keyboardActive = false;


        // =====================================================
        // KEYBOARD
        // =====================================================

        if (
            keys['KeyW'] ||
            keys['ArrowUp']
        ) {

            dy -= 1;

            keyboardActive = true;

        }


        if (
            keys['KeyS'] ||
            keys['ArrowDown']
        ) {

            dy += 1;

            keyboardActive = true;

        }


        if (
            keys['KeyA'] ||
            keys['ArrowLeft']
        ) {

            dx -= 1;

            keyboardActive = true;

        }


        if (
            keys['KeyD'] ||
            keys['ArrowRight']
        ) {

            dx += 1;

            keyboardActive = true;

        }


        // =====================================================
        // MOBILE JOYSTICK
        //
        // Highest priority when active.
        // =====================================================

        if (joystick.active) {

            dx =
                joystick.dx;


            dy =
                joystick.dy;

        }


        // =====================================================
        // MOUSE
        //
        // Mouse controls automatically when keyboard and
        // joystick are not being used.
        //
        // NO CLICK REQUIRED.
        // =====================================================

        else if (!keyboardActive) {

            /*
             * Even if the mouse hasn't moved recently,
             * use the remembered direction.
             *
             * This gives us NO IDLE STATE.
             */

            dx =
                mouse.dx *
                mouse.power;


            dy =
                mouse.dy *
                mouse.power;

        }


        // =====================================================
        // LIMIT VECTOR
        // =====================================================

        const len =
            Math.sqrt(
                dx * dx +
                dy * dy
            );


        /*
         * Only reduce vectors above 1.
         *
         * Don't normalise smaller vectors because
         * their magnitude controls normal mouse speed.
         */

        if (len > 1) {

            dx /= len;

            dy /= len;

        }


        // =====================================================
        // SAFETY: NO IDLE STATE
        // =====================================================

        const finalLength =
            Math.sqrt(
                dx * dx +
                dy * dy
            );


        /*
         * If desktop controls somehow return zero,
         * continue using the previous mouse direction.
         *
         * Don't do this while mobile joystick is active
         * because mobile users need to be able to release
         * the joystick normally.
         */

        if (
            finalLength < 0.001 &&
            !joystick.active
        ) {

            dx =
                lastMouseDX *
                MIN_MOUSE_POWER;


            dy =
                lastMouseDY *
                MIN_MOUSE_POWER;

        }


        return {

            dx,
            dy

        };

    }


    // =========================================================
    // BOOST
    // =========================================================

    /**
     * Boost is active while:
     *
     * Desktop:
     * LEFT CLICK is held
     *
     * Keyboard:
     * SPACE is held
     *
     * Mobile:
     * boost button is held
     */

    function isBoost() {

        return !!(

            keys['Space'] ||

            boostTouched ||

            mouse.leftDown

        );

    }


    // =========================================================
    // PAUSE
    // =========================================================

    /**
     * Returns true only once per key press.
     */

    function isPause() {

        const pressed =
            !!(
                keys['Escape'] ||
                keys['KeyP']
            );


        if (
            pressed &&
            !pauseConsumed
        ) {

            pauseConsumed = true;

            return true;

        }


        if (!pressed) {

            pauseConsumed = false;

        }


        return false;

    }


    // =========================================================
    // OPTIONAL POINTER DATA
    // =========================================================

    /**
     * Renderer / drone can use this later to rotate
     * toward the actual cursor.
     */

    function getPointer() {

        return {

            x: mouse.x,

            y: mouse.y,

            dx: mouse.dx,

            dy: mouse.dy,

            power: mouse.power,

            down: mouse.leftDown,

            active: mouse.active

        };

    }


    // =========================================================
    // PUBLIC API
    // =========================================================

    return {

        init,

        getMove,

        isBoost,

        isPause,

        getPointer

    };

})();