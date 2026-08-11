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

    // Boost
    let boostSpeedMult  = C.BOOST_SPEED_MULT;
    let boostDuration   = C.BOOST_DURATION;
    let boostCooldown   = C.BOOST_COOLDOWN;
    let boostTimer      = 0;   // ms remaining in active boost
    let boostCoolTimer  = 0;   // ms remaining in cooldown
    let boosting        = false;

    // Shield / damage
    let shieldMax  = 0;
    let shields    = 0;
    let hitFlash   = 0;   // ms of red flash after hit
    let invincible = 0;   // ms of invincibility after hit

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

        shieldMax  = 0;
        shields    = 0;
        hitFlash   = 0;
        invincible = 0;

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
        const wantBoost = input.isBoost();

        // ── Boost activation ─────────────────────────────────
        if (wantBoost && !boosting && boostCoolTimer <= 0) {
            boosting       = true;
            boostTimer     = boostDuration;
            boostCoolTimer = boostCooldown;
            NeonDelivery.Audio.boost();
        }

        if (boosting) {
            boostTimer -= dt;
            if (boostTimer <= 0) {
                boosting   = false;
                boostTimer = 0;
            }
        }
        if (boostCoolTimer > 0) boostCoolTimer -= dt;

        // ── Timers ───────────────────────────────────────────
        if (hitFlash   > 0) hitFlash   -= dt;
        if (invincible > 0) invincible -= dt;

        // ── Acceleration ─────────────────────────────────────
        const speedMult = boosting ? boostSpeedMult : 1;
        const maxSpd    = C.DRONE_MAX_SPEED * speedMult;

        vx += move.dx * C.DRONE_ACCEL * speedMult;
        vy += move.dy * C.DRONE_ACCEL * speedMult;

        // Wind event
        if (eventState && eventState.type === 'wind') {
            vx += eventState.windX * C.WIND_MAX_FORCE;
            vy += eventState.windY * C.WIND_MAX_FORCE;
        }

        // Clamp speed
        const spd = Math.sqrt(vx * vx + vy * vy);
        if (spd > maxSpd) {
            vx = vx / spd * maxSpd;
            vy = vy / spd * maxSpd;
        }

        // Friction
        vx *= C.DRONE_FRICTION;
        vy *= C.DRONE_FRICTION;

        // Heading angle
        if (spd > 0.2) {
            const targetAngle = Math.atan2(vy, vx);
            const da = angleDiff(targetAngle, angle);
            angle += da * 0.18;
        }

        // ── Move & collide ───────────────────────────────────
        const R  = C.DRONE_RADIUS;
        const nx = x + vx;
        const ny = y + vy;

        const blockedX = world.isBlockedRect(nx, y, R);
        const blockedY = world.isBlockedRect(x, ny, R);
        const blockedB = blockedX && blockedY;

        // Capture speed BEFORE the bounce mutates vx/vy
        const impactSpd = Math.sqrt(vx * vx + vy * vy);

        if (!blockedX) x = nx; else { vx *= -0.35; onCollision(impactSpd); }
        if (!blockedY) y = ny; else { vy *= -0.35; onCollision(impactSpd); }
        if (blockedB)           { vx = 0; vy = 0; }

        // World clamp
        x = Math.max(R, Math.min(WS - R, x));
        y = Math.max(R, Math.min(WS - R, y));

        // Emit boost particles
        if (boosting && Math.random() < 0.7) {
            NeonDelivery.Particles.emit('boost', x, y, 1);
        }
    }

    // ── Collision with building wall ──────────────────────────
    function onCollision(impactSpd) {
        if (invincible > 0) return;
        cleanRun = false;

        // Damage radius: min 18px at low speed, up to 40px at full boost speed
        const dmgR = Math.min(18 + (impactSpd || 0) * 3.5, 40);

        // Permanently erase window pixels from world canvas
        NeonDelivery.Renderer.damageAt(x, y, dmgR);

        // Shatter particle burst (matches the pixel debris visually)
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
        if (invincible > 0) return false;
        cleanRun = false;

        // Car / police hit — fixed 32px damage radius
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

    function angleDiff(a, b) {
        let d = a - b;
        while (d >  Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    }

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
