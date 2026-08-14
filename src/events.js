// ============================================================
//  NEON DELIVERY — events.js
//  Director-driven random events with cooldown.
//  Prevents event stacking (thunderstorm → blackout → chase).
// ============================================================
NeonDelivery.Events = (function () {
    const C = NeonDelivery.Config;

    let currentEvent   = null;  // { type, duration, elapsed, data }
    let cooldownTimer  = 0;     // ms until next event can trigger
    let enabled        = false;
    let level          = 1;

    // ── Event definitions ────────────────────────────────────

    const EVENT_DEFS = [
        {
            type: 'thunderstorm',
            duration: 12000,
            weight: 3,
            onStart(data) {
                data.flashTimer = 0;
                data.flashInterval = 1800 + Math.random() * 2200;
                NeonDelivery.Audio.warning();
            },
            onTick(data, dt) {
                data.flashTimer += dt;
                if (data.flashTimer >= data.flashInterval) {
                    data.flashTimer = 0;
                    data.flashInterval = 800 + Math.random() * 3000;
                    data.lightning = 180; // ms of white flash
                    NeonDelivery.Particles.emit('rain', NeonDelivery.Drone.x, NeonDelivery.Drone.y, 20);
                }
                if (data.lightning > 0) data.lightning -= dt;
            }
        },
        {
            type: 'wind',
            duration: 10000,
            weight: 3,
            onStart(data) {
                const ang = Math.random() * Math.PI * 2;
                data.windX = Math.cos(ang);
                data.windY = Math.sin(ang);
                NeonDelivery.Audio.warning();
            },
            onTick(data, dt) {
                // Slowly rotate wind direction
                const a = Math.atan2(data.windY, data.windX) + 0.0003 * dt;
                data.windX = Math.cos(a);
                data.windY = Math.sin(a);
            }
        },
        {
            type: 'vip_bonus',
            duration: 6000,
            weight: 1,
            onStart(_data) { NeonDelivery.Audio.comboUp(); },
            onTick(_data, _dt) {}
        }
    ];

    // ── Init & reset ─────────────────────────────────────────

    function init(lvl) {
        currentEvent  = null;
        cooldownTimer = C.EVENT_COOLDOWN;
        enabled       = lvl >= 3;   // events start from level 3
        level         = lvl;
    }

    // ── Update ───────────────────────────────────────────────

    function update(dt) {
        if (!enabled) return;

        if (currentEvent) {
            currentEvent.elapsed += dt;
            const def = EVENT_DEFS.find(d => d.type === currentEvent.type);
            if (def) def.onTick(currentEvent.data, dt);

            if (currentEvent.elapsed >= currentEvent.duration) {
                currentEvent  = null;
                cooldownTimer = C.EVENT_COOLDOWN;
            }
            return;
        }

        if (cooldownTimer > 0) {
            cooldownTimer -= dt;
            return;
        }

        // Try to trigger an event
        const chance = Math.min(
            C.EVENT_BASE_CHANCE + level * C.EVENT_LEVEL_SCALE,
            C.EVENT_MAX_CHANCE
        );

        if (Math.random() < chance * (dt / 1000)) {
            triggerRandom();
        }
    }

    function triggerRandom() {
        // Weighted random selection
        const totalWeight = EVENT_DEFS.reduce((a, d) => a + d.weight, 0);
        let r = Math.random() * totalWeight;
        let def = EVENT_DEFS[0];
        for (const d of EVENT_DEFS) {
            r -= d.weight;
            if (r <= 0) { def = d; break; }
        }
        triggerEvent(def.type);
    }

    function triggerEvent(type) {
        const def = EVENT_DEFS.find(d => d.type === type);
        if (!def) return;
        const data = {};
        currentEvent = { type, duration: def.duration, elapsed: 0, data };
        def.onStart(data);
    }

    // ── Getters ──────────────────────────────────────────────

    function getState() {
        if (!currentEvent) return null;
        return { type: currentEvent.type, data: currentEvent.data,
                 progress: currentEvent.elapsed / currentEvent.duration };
    }

    function isActive(type) {
        return currentEvent && currentEvent.type === type;
    }

    return { init, update, triggerEvent, getState, isActive };
})();
