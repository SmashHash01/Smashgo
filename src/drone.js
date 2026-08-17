// ============================================================
//  NEON DELIVERY — drone.js
//  Player drone: floating-point physics, boost, collision,
//  package-carry state, shield.
// ============================================================
NeonDelivery.Drone = (function () {
    const C  = NeonDelivery.Config;
    const WS = C.WORLD_SIZE;

    // ── State ────────────────────────────────────────────────
    let x  = 0, y  = 0;   // world position
    let vx = 0, vy = 0;   // velocity (px/frame)
    let angle = 0;         // visual heading (radians)

    // Normal boost
    let boostSpeedMult  = C.BOOST_SPEED_MULT;
    let boostDuration   = C.BOOST_DURATION;
    let boostCooldown   = C.BOOST_COOLDOWN;
    let boostTimer      = 0;   // ms remaining in active boost
    let boostCoolTimer  = 0;   // ms remaining in cooldown
    let boosting        = false;

    // ── DOUBLE-BOOST (DASH) ───────────────────────────────────
    // Activated by double-tapping Space within DASH_WINDOW ms.
    // Gives 3× speed for DASH_DURATION ms, then 6s cooldown.
    const DASH_SPEED_MULT = 3.2;
    const DASH_DURATION   = 350;   // ms of actual dash
    const DASH_COOLDOWN   = 6000;  // ms cooldown after dash
    const DASH_WINDOW     = 450;   // ms between taps to count as double
    let dashing        = false;
    let dashTimer      = 0;   // ms remaining in active dash
    let dashCoolTimer  = 0;   // ms remaining in cooldown
    let lastBoostPress = -9999; // timestamp of previous Space press

    // Shield / damage
    let shieldMax  = 0;
    let shields    = 0;
    let hitFlash   = 0;   // ms of red flash after hit
    let invincible = 0;   // ms of invincibility after hit

    // Spawn protection
    let spawnProtection = 0;   // ms of full invincibility at game start
    const SPAWN_PROTECT_MS = 5000;

    // Package carrying
    let maxCarry   = 1;
    let carrying   = [];   // array of job refs
    let magnetRange = 0;   // px (upgrade)
    let extraDeliveryTime = 0; // seconds (upgrade)

    // Delivery tracking
    let cleanRun = true;   // no collision since last pickup

    // ── Init ─────────────────────────────────────────────────
    function init(startX, startY, ownedUpgrades) {
        x  = startX; y  = startY;
        vx = 0;      vy = 0;
        angle = 0;

        boostSpeedMult = C.BOOST_SPEED_MULT;
        boostDuration  = C.BOOST_DURATION;
        boostCooldown  = C.BOOST_COOLDOWN;
        boostTimer     = 0;
        boostCoolTimer = 0;
        boosting       = false;

        dashing       = false;
        dashTimer     = 0;
        dashCoolTimer = 0;
        lastBoostPress = -9999;

        shieldMax  = 0;
        shields    = 0;
        hitFlash   = 0;
        invincible = 0;

        spawnProtection = SPAWN_PROTECT_MS;  // 5s shield on start

        maxCarry          = 1;
        carrying          = [];
        magnetRange       = 0;
        extraDeliveryTime = 0;
        cleanRun          = true;

        // Apply saved upgrades
        NeonDelivery.Upgrades.applyAll(
            { boostSpeedMult, boostDuration, boostCooldown, shieldMax, shields,
              maxCarry, magnetRange, extraDeliveryTime,
              // apply() writes directly here; bind via setter below
              set boostSpeedMult(v) { boostSpeedMult = v; },
              set boostDuration(v)  { boostDuration  = v; },
              set boostCooldown(v)  { boostCooldown  = v; },
              set shieldMax(v)      { shieldMax = v; },
              set shields(v)        { shields   = v; },
              set maxCarry(v)       { maxCarry  = v; },
              set magnetRange(v)    { magnetRange = v; },
              set extraDeliveryTime(v) { extraDeliveryTime = v; }
            },
            ownedUpgrades || {}
        );
    }

    // ── Update ───────────────────────────────────────────────
    function update(dt, input, world, eventState) {
        const move = input.getMove();

        // Spawn protection countdown
        if (spawnProtection > 0) spawnProtection -= dt;

        // ── Dash double-tap detection (uses press EDGE, not held state) ──
        // isBoostPressed() fires ONCE per physical keydown, so gap timing is reliable.
        const boostPressed = input.isBoostPressed();
        const now = performance.now();

        if (boostPressed && !dashing) {
            const gap = now - lastBoostPress;
            if (gap < DASH_WINDOW && dashCoolTimer <= 0) {
                // DOUBLE-TAP → DASH
                dashing        = true;
                dashTimer      = DASH_DURATION;
                dashCoolTimer  = DASH_COOLDOWN;
                // Cancel any active normal boost so dash speed applies cleanly
                boosting       = false;
                boostTimer     = 0;
                lastBoostPress = -9999; // consume
                NeonDelivery.Audio.overdrive();
            } else {
                // First tap → record time (normal boost fires below via isBoost())
                lastBoostPress = now;
            }
        }

        // ── Normal boost activation (sustained hold) ─────────────
        const wantBoost = input.isBoost();
        if (wantBoost && !boosting && boostCoolTimer <= 0 && !dashing) {
            boosting       = true;
            boostTimer     = boostDuration;
            boostCoolTimer = boostCooldown;
            NeonDelivery.Audio.boost();
        }

        // Boost tick
        if (boosting) {
            boostTimer -= dt;
            if (boostTimer <= 0) { boosting = false; boostTimer = 0; }
        }
        if (boostCoolTimer > 0) boostCoolTimer -= dt;

        // Dash tick
        if (dashing) {
            dashTimer -= dt;
            if (dashTimer <= 0) { dashing = false; dashTimer = 0; }
        }
        if (dashCoolTimer > 0) dashCoolTimer -= dt;

        // ── Timers ───────────────────────────────────────────
        if (hitFlash   > 0) hitFlash   -= dt;
        if (invincible > 0) invincible -= dt;

        // ── Movement & collision simulation using shared kernel ───
        const droneState = {
            x, y, vx, vy, angle,
            boosting, dashing,
            windX: (eventState && eventState.type === 'wind') ? eventState.windX * C.WIND_MAX_FORCE : 0,
            windY: (eventState && eventState.type === 'wind') ? eventState.windY * C.WIND_MAX_FORCE : 0
        };

        const soloPhysics = NeonDelivery.Gameplay.SOLO_PHYSICS || C;
        NeonDelivery.Gameplay.stepVehicle(droneState, move, dt, world, soloPhysics);

        x = droneState.x;
        y = droneState.y;
        vx = droneState.vx;
        vy = droneState.vy;
        angle = droneState.angle;

        if (droneState.hitWall) {
            const impactSpd = Math.hypot(vx, vy);
            onCollision(impactSpd);
        }

        // Particles — dash gets magenta, normal boost gets cyan
        if (dashing && Math.random() < 0.85) {
            NeonDelivery.Particles.emit('dash', x, y, 2);
        } else if (boosting && Math.random() < 0.7) {
            NeonDelivery.Particles.emit('boost', x, y, 1);
        }
    }

    // ── Collision with building wall ──────────────────────────
    function onCollision(impactSpd) {
        // Spawn protection: no damage or pixel erasure during grace period
        if (spawnProtection > 0) return;
        if (invincible > 0) return;
        cleanRun = false;

        const dmgR = Math.min(18 + (impactSpd || 0) * 3.5, 40);
        NeonDelivery.Renderer.damageAt(x, y, dmgR);
        NeonDelivery.Particles.emit('shatter', x, y, 16);
        NeonDelivery.Audio.collision();

        if (shields > 0) {
            shields--;
            hitFlash   = 300;
            invincible = 1200;
        } else {
            hitFlash   = 500;
            invincible = 800;
        }
    }

    /**
     * External collision (car hit, police caught, etc).
     * Returns true if the drone is destroyed (game over).
     */
    function takeDamage() {
        // Full immunity during spawn protection
        if (spawnProtection > 0) return false;
        if (invincible > 0) return false;
        cleanRun = false;

        NeonDelivery.Renderer.damageAt(x, y, 32);
        NeonDelivery.Particles.emit('shatter', x, y, 22);
        NeonDelivery.Audio.collision();

        if (shields > 0) {
            shields--;
            hitFlash   = 300;
            invincible = 1400;
            return false;
        } else {
            hitFlash   = 800;
            invincible = 600;
            NeonDelivery.Audio.explosion();
            NeonDelivery.Particles.emit('explosion', x, y, 20);
            return true; // game over
        }
    }

    // ── Package carry ───────────────────────────────────────
    function pickupJob(job) {
        if (carrying.length >= maxCarry) return false;
        carrying.push(job);
        cleanRun = true;
        NeonDelivery.Audio.pickup();
        NeonDelivery.Particles.emit('pickup', x, y, 12);
        return true;
    }

    function dropPackage(job) {
        const idx = carrying.indexOf(job);
        if (idx !== -1) carrying.splice(idx, 1);
    }

    function deliverJob(job) {
        dropPackage(job);
        NeonDelivery.Audio.delivery();
        NeonDelivery.Particles.emit('delivery', x, y, 18);
    }

    function resetCleanRun() { cleanRun = true; }

    // ── Helpers ──────────────────────────────────────────────

    // ── Public ───────────────────────────────────────────────
    return {
        init, update, takeDamage, pickupJob, dropPackage, deliverJob, resetCleanRun,

        get x()               { return x;               },
        get y()               { return y;               },
        get vx()              { return vx;              },
        get vy()              { return vy;              },
        get angle()           { return angle;           },
        get boosting()        { return boosting;        },
        get boostTimer()      { return boostTimer;      },
        get boostCoolTimer()  { return boostCoolTimer;  },
        get boostCooldown()   { return boostCooldown;   },
        get boostDuration()   { return boostDuration;   },
        get dashing()         { return dashing;         },
        get dashTimer()       { return dashTimer;       },
        get dashCoolTimer()   { return dashCoolTimer;   },
        get dashCooldown()    { return DASH_COOLDOWN;   },
        get dashDuration()    { return DASH_DURATION;   },
        get spawnProtection() { return spawnProtection; },
        get spawnProtectMax() { return SPAWN_PROTECT_MS;},
        get hitFlash()        { return hitFlash;        },
        get shields()         { return shields;         },
        get shieldMax()       { return shieldMax;       },
        get carrying()        { return carrying;        },
        get maxCarry()        { return maxCarry;        },
        get magnetRange()     { return magnetRange;     },
        get extraDeliveryTime(){ return extraDeliveryTime; },
        get cleanRun()        { return cleanRun;        }
    };
})();
