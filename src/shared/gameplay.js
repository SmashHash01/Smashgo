// Shared gameplay constants used by both browser and Node server.
(function (root, factory) {
    const gameplay = factory();
    if (typeof module === 'object' && module.exports) module.exports = gameplay;
    if (root) {
        root.NeonDelivery = root.NeonDelivery || {};
        root.NeonDelivery.Gameplay = gameplay;
    }
})(typeof window !== 'undefined' ? window : null, function () {
    function angleDiff(a, b) {
        let diff = a - b;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        return diff;
    }

    function distToNearestRoadCenter(tileCoord, roadCenters) {
        let best = Infinity;
        for (const center of roadCenters) best = Math.min(best, Math.abs(tileCoord - center));
        return best;
    }

    function isArenaBlocked(wx, wy, arena) {
        const tx = Math.floor(wx / arena.tileSize);
        const ty = Math.floor(wy / arena.tileSize);
        if (tx < 0 || ty < 0 || tx >= arena.worldTiles || ty >= arena.worldTiles) return true;
        const dx = distToNearestRoadCenter(tx, arena.roadCenters);
        const dy = distToNearestRoadCenter(ty, arena.roadCenters);
        const passableLimit = arena.roadHalfTiles + arena.grassTiles + arena.sidewalkTiles;
        return dx > passableLimit && dy > passableLimit;
    }

    function stepVehicle(state, input, dt, world, physics) {
        const P = physics || rootPhysics;
        const dtMs = typeof dt === 'number' ? dt : (1000 / 60);
        const substeps = Math.max(1, Math.round(dtMs / (1000 / 60)));
        const inDx = (input && input.dx) || 0;
        const inDy = (input && input.dy) || 0;

        for (let step = 0; step < substeps; step++) {
            const speedMult = state.dashing ? (P.DASH_SPEED_MULT || 3.2) : (state.boosting ? (P.BOOST_SPEED_MULT || 2.0) : 1.0);
            const maxSpd = (P.DRONE_MAX_SPEED || 11.0) * speedMult;
            const accel = (P.DRONE_ACCEL || 0.95) * (state.dashing ? (P.DASH_SPEED_MULT || 3.2) * 1.2 : speedMult);
            const friction = state.dashing ? 0.95 : (P.DRONE_FRICTION || 0.91);

            state.vx = (state.vx || 0) + inDx * accel;
            state.vy = (state.vy || 0) + inDy * accel;

            if (state.windX || state.windY) {
                state.vx += state.windX;
                state.vy += state.windY;
            }

            const spd = Math.hypot(state.vx, state.vy);
            if (spd > maxSpd) {
                state.vx = (state.vx / spd) * maxSpd;
                state.vy = (state.vy / spd) * maxSpd;
            }

            state.vx *= friction;
            state.vy *= friction;

            const curSpd = Math.hypot(state.vx, state.vy);
            if (curSpd > 0.2) {
                const targetAngle = Math.atan2(state.vy, state.vx);
                state.angle = (state.angle || 0) + angleDiff(targetAngle, state.angle || 0) * 0.18;
            }

            const R = P.DRONE_RADIUS || 10;
            const nx = state.x + state.vx;
            const ny = state.y + state.vy;

            let hitWall = false;
            let blockedX = false;
            let blockedY = false;

            if (world && typeof world.isBlockedRect === 'function') {
                blockedX = world.isBlockedRect(nx, state.y, R);
                blockedY = world.isBlockedRect(state.x, ny, R);
            }

            if (!blockedX) {
                state.x = nx;
            } else {
                state.vx *= -0.35;
                hitWall = true;
            }

            if (!blockedY) {
                state.y = ny;
            } else {
                state.vy *= -0.35;
                hitWall = true;
            }

            const worldSize = (world && (world.worldSize || world.WORLD_SIZE)) || 1920;
            state.x = Math.max(R, Math.min(worldSize - R, state.x));
            state.y = Math.max(R, Math.min(worldSize - R, state.y));
            state.hitWall = hitWall;
        }

        return state;
    }

    function radialDamage(distance, radius, maxDamage, minDamage) {
        if (distance >= radius) return 0;
        const t = Math.min(1, Math.max(0, distance / radius));
        return Math.round(maxDamage + (minDamage - maxDamage) * t);
    }

    const POWERS = Object.freeze({
        machinegun: Object.freeze({
            id: 0,
            label: 'PULSE BLASTER',
            icon: '🔫',
            trigger: 'hold',
            charges: 18,
            cooldownMs: 95,
            damage: 14,
            range: 250,
            speed: 28,
            rarityWeight: 24
        }),

        rockets: Object.freeze({
            id: 1,
            label: 'TRI-ROCKET',
            icon: '🚀',
            trigger: 'press',
            charges: 1,
            count: 3,
            spreadRad: 0.087, // ~5 degrees
            speed: 16,
            lifeMs: 1800,
            directDamage: 45,
            splashDamage: 22,
            splashRadius: 52,
            rarityWeight: 18
        }),

        mine: Object.freeze({
            id: 2,
            label: 'NEON MINES',
            icon: '💣',
            trigger: 'press',
            charges: 3,
            cooldownMs: 500,
            armMs: 450,
            lifeMs: 10000,
            damage: 100,
            triggerRadius: 32,
            maxPerOwner: 3,
            rarityWeight: 16
        }),

        shield: Object.freeze({
            id: 3,
            label: 'PHASE SHIELD',
            icon: '🛡️',
            trigger: 'press',
            charges: 1,
            durationMs: 4500,
            rarityWeight: 8
        }),

        cannon: Object.freeze({
            id: 4,
            label: 'MORTAR BURST',
            icon: '💥',
            trigger: 'press',
            charges: 1,
            count: 4,
            ranges: Object.freeze([70, 115, 160, 205]),
            delaysMs: Object.freeze([520, 620, 720, 820]),
            impactRadius: 34,
            maxDamage: 85,
            minDamage: 28,
            rarityWeight: 14
        }),

        arcbomb: Object.freeze({
            id: 5,
            label: 'ARC BOMB',
            icon: '⚡',
            trigger: 'press',
            charges: 1,
            range: 120,
            fuseMs: 950,
            warningMs: 300,
            blastRadius: 90,
            maxDamage: 100,
            minDamage: 25,
            rarityWeight: 10
        }),

        fakecrate: Object.freeze({
            id: 6,
            label: 'MIMIC CRATE',
            icon: '📦',
            trigger: 'press',
            charges: 1,
            armMs: 650,
            lifeMs: 14000,
            damage: 100,
            triggerRadius: 22,
            maxPerOwner: 1,
            rarityWeight: 6
        }),

        mace: Object.freeze({
            id: 7,
            label: 'WRECKING HALO',
            icon: '⚙️',
            trigger: 'press',
            charges: 1,
            durationMs: 4000,
            hitRadius: 29,
            damage: 100,
            rarityWeight: 4
        })
    });

    const POWER_IDS = Object.freeze({
        machinegun: 0,
        rockets: 1,
        mine: 2,
        shield: 3,
        cannon: 4,
        arcbomb: 5,
        fakecrate: 6,
        mace: 7
    });

    const ENTITY_KINDS = Object.freeze({
        ROCKET: 'rocket',
        MINE: 'mine',
        FAKECRATE: 'fakecrate',
        CANNON_IMPACT: 'cannon',
        ARCBOMB: 'arcbomb'
    });

    const COMBAT_EVENT = Object.freeze({
        BLASTER_TRACE: 0,
        ROCKET_EXPLODE: 1,
        MINE_EXPLODE: 2,
        CANNON_EXPLODE: 3,
        ARCBOMB_EXPLODE: 4,
        FAKECRATE_EXPLODE: 5,
        SHIELD_ON: 6,
        MACE_ON: 7,
        HIT_CONFIRM: 8,
        KILL_CONFIRM: 9,
        MINE_PLACE: 10,
        ROCKET_FIRE: 11
    });

    function chooseWeightedPower(defs = POWERS, excludeType = null) {
        let total = 0;
        const keys = Object.keys(defs);
        for (const key of keys) {
            if (key === excludeType && keys.length > 1) continue;
            total += (defs[key].rarityWeight || 1);
        }

        let roll = Math.random() * total;
        for (const key of keys) {
            if (key === excludeType && keys.length > 1) continue;
            roll -= (defs[key].rarityWeight || 1);
            if (roll <= 0) return key;
        }
        return 'machinegun';
    }

    const rootPhysics = Object.freeze({
        DRONE_RADIUS: 10,
        DRONE_ACCEL: 0.72,
        DRONE_MAX_SPEED: 8.8,
        DRONE_FRICTION: 0.88,
        BOOST_SPEED_MULT: 1.8,
        BOOST_DURATION: 950,
        BOOST_COOLDOWN: 2200
    });

    return Object.freeze({
        angleDiff,
        distToNearestRoadCenter,
        isArenaBlocked,
        stepVehicle,
        radialDamage,
        chooseWeightedPower,
        POWERS,
        POWER_IDS,
        ENTITY_KINDS,
        COMBAT_EVENT,
        ARENA: Object.freeze({
            tileSize: 16,
            worldTiles: 120,
            roadCenters: Object.freeze([14, 36, 58, 80, 102]),
            roadHalfTiles: 3,
            grassTiles: 2,
            sidewalkTiles: 1
        }),
        // Multiplayer Fast Combat Racing Physics
        PHYSICS: rootPhysics,

        // Solo Courier Delivery Physics (moderate, controllable pace)
        SOLO_PHYSICS: Object.freeze({
            DRONE_RADIUS: 10,
            DRONE_ACCEL: 0.45,
            DRONE_MAX_SPEED: 5.2,
            DRONE_FRICTION: 0.86,
            BOOST_SPEED_MULT: 2.2,
            DASH_SPEED_MULT: 3.2,
            BOOST_DURATION: 900,
            BOOST_COOLDOWN: 3000
        }),

        NET: Object.freeze({
            SERVER_TICK_HZ: 30,
            SNAPSHOT_HZ: 15,
            INPUT_HZ: 30,
            INPUT_KEEPALIVE_MS: 250,
            MAX_PROJECTILES: 48,
            MAX_HAZARDS: 32
        }),

        COMBAT: Object.freeze({
            PLAYER_MAX_HEALTH: 100,
            RESPAWN_MS: 3000,
            SPAWN_PROTECTION_MS: 1200,
            PICKUP_RADIUS_SQ: 1400,
            HIT_RADIUS_SQ: 500,
            MAX_POWERUPS: 12,
            POWERUP_SPAWN_MS: 2400,
            SHIELD_MS: 4500,
            OVERDRIVE_MS: 4000
        })
    });
});
