const Gameplay = require('../../src/shared/gameplay');
const DamageSystem = require('./DamageSystem');

const POWERS = Gameplay.POWERS;
const COMBAT_EVENT = Gameplay.COMBAT_EVENT;
const ENTITY_KINDS = Gameplay.ENTITY_KINDS;

function removeUnordered(arr, index) {
    if (index >= 0 && index < arr.length) {
        arr[index] = arr[arr.length - 1];
        arr.pop();
    }
}

class PowerSystem {
    constructor() {
        this.projectiles = [];
        this.hazards = [];
        this.timedEffects = [];
        this.entityIdCounter = 0;
    }

    reset() {
        this.projectiles.length = 0;
        this.hazards.length = 0;
        this.timedEffects.length = 0;
        this.entityIdCounter = 0;
    }

    nextId() {
        return ++this.entityIdCounter;
    }

    removeOldestOwned(list, ownerId, kind, maxAllowed) {
        const matching = [];
        for (let i = 0; i < list.length; i++) {
            if (list[i].ownerId === ownerId && list[i].kind === kind) {
                matching.push(i);
            }
        }
        while (matching.length >= maxAllowed && matching.length > 0) {
            const idxToRemove = matching.shift();
            removeUnordered(list, idxToRemove);
            // Re-index remaining matching items
            for (let j = 0; j < matching.length; j++) {
                if (matching[j] === list.length) {
                    matching[j] = idxToRemove;
                }
            }
        }
    }

    removePlayerHazards(playerId) {
        for (let i = this.hazards.length - 1; i >= 0; i--) {
            if (this.hazards[i].ownerId === playerId) {
                removeUnordered(this.hazards, i);
            }
        }
        for (let i = this.timedEffects.length - 1; i >= 0; i--) {
            if (this.timedEffects[i].ownerId === playerId) {
                removeUnordered(this.timedEffects, i);
            }
        }
    }

    grantRandomPower(player, excludeType = null) {
        const type = Gameplay.chooseWeightedPower(POWERS, excludeType);
        const def = POWERS[type] || POWERS.machinegun;
        player.power = {
            type,
            charges: def.charges
        };
        return player.power;
    }

    tryUsePower(room, player) {
        if (!player.alive || !player.power) {
            player.pendingFire = false;
            return false;
        }
        if (player.shootCooldown > 0) return false;

        const def = POWERS[player.power.type];
        if (!def) return false;

        let wantsUse = false;
        if (def.trigger === 'hold') {
            wantsUse = Boolean(player.inputs && (player.inputs.shootHeld || player.inputs.shoot));
        } else {
            wantsUse = Boolean(player.pendingFire);
        }

        if (!wantsUse) return false;

        const handler = this.handlers[player.power.type];
        if (!handler) return false;

        const success = handler.call(this, room, player, def);
        if (!success) return false;

        if (def.trigger === 'press') {
            player.pendingFire = false;
        }

        player.power.charges--;
        if (player.power.charges <= 0) {
            player.power = null;
        }
        return true;
    }

    // ── 8 Power Handlers ─────────────────────────────────────

    fireMachineGun(room, player, def) {
        const cos = Math.cos(player.angle);
        const sin = Math.sin(player.angle);
        const startX = player.x + cos * 18;
        const startY = player.y + sin * 18;
        const maxRange = def.range || 250;

        let endX = startX + cos * maxRange;
        let endY = startY + sin * maxRange;

        // Step raycast to check wall collision and player hit
        let hitTarget = null;
        let hitDist = maxRange;
        const stepSize = 12;

        for (let d = 0; d <= maxRange; d += stepSize) {
            const checkX = startX + cos * d;
            const checkY = startY + sin * d;

            if (room.map && room.map.isBlockedRect(checkX, checkY, 4)) {
                endX = checkX;
                endY = checkY;
                hitDist = d;
                break;
            }

            // Check enemy hit
            for (const target of room.players.values()) {
                if (!DamageSystem.canDamage(target, player.id)) continue;
                const pDist = Math.hypot(target.x - checkX, target.y - checkY);
                if (pDist <= (Gameplay.PHYSICS.DRONE_RADIUS + 4)) {
                    hitTarget = target;
                    endX = checkX;
                    endY = checkY;
                    hitDist = d;
                    break;
                }
            }
            if (hitTarget) break;
        }

        if (hitTarget) {
            DamageSystem.applyDamage(room, hitTarget, def.damage, {
                ownerId: player.id,
                powerType: 'machinegun'
            });
        }

        if (typeof room.emitCombatFx === 'function') {
            room.emitCombatFx({
                t: COMBAT_EVENT.BLASTER_TRACE,
                x1: Math.round(startX),
                y1: Math.round(startY),
                x2: Math.round(endX),
                y2: Math.round(endY),
                hit: Boolean(hitTarget)
            });
        }

        player.shootCooldown = def.cooldownMs || 95;
        return true;
    }

    fireRockets(room, player, def) {
        if (this.projectiles.length >= Gameplay.NET.MAX_PROJECTILES) return false;

        const baseAngle = player.angle;
        const spreads = [-def.spreadRad, 0, def.spreadRad];
        const count = Math.min(def.count || 3, Gameplay.NET.MAX_PROJECTILES - this.projectiles.length);

        for (let i = 0; i < count; i++) {
            const angle = baseAngle + spreads[i];
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            this.projectiles.push({
                id: this.nextId(),
                ownerId: player.id,
                kind: ENTITY_KINDS.ROCKET,
                x: player.x + cos * 22,
                y: player.y + sin * 22,
                vx: cos * def.speed,
                vy: sin * def.speed,
                angle,
                directDamage: def.directDamage,
                splashDamage: def.splashDamage,
                splashRadius: def.splashRadius,
                lifeMs: def.lifeMs
            });
        }

        player.shootCooldown = 400;
        return true;
    }

    dropMine(room, player, def) {
        this.removeOldestOwned(this.hazards, player.id, ENTITY_KINDS.MINE, def.maxPerOwner || 3);
        if (this.hazards.length >= Gameplay.NET.MAX_HAZARDS) return false;

        const cos = Math.cos(player.angle);
        const sin = Math.sin(player.angle);

        this.hazards.push({
            id: this.nextId(),
            ownerId: player.id,
            kind: ENTITY_KINDS.MINE,
            x: player.x - cos * 24,
            y: player.y - sin * 24,
            armTimer: def.armMs,
            lifeMs: def.lifeMs,
            damage: def.damage,
            triggerRadius: def.triggerRadius
        });

        player.shootCooldown = def.cooldownMs || 500;
        return true;
    }

    activateShield(room, player, def) {
        player.shieldTimer = def.durationMs || 4500;
        if (typeof room.emitCombatFx === 'function') {
            room.emitCombatFx({
                t: COMBAT_EVENT.SHIELD_ON,
                x: Math.round(player.x),
                y: Math.round(player.y),
                ownerId: player.id
            });
        }
        player.shootCooldown = 250;
        return true;
    }

    fireMortar(room, player, def) {
        this.removeOldestOwned(this.timedEffects, player.id, ENTITY_KINDS.CANNON_IMPACT, def.count || 4);

        const cos = Math.cos(player.angle);
        const sin = Math.sin(player.angle);

        for (let i = 0; i < def.ranges.length; i++) {
            const range = def.ranges[i];
            const delay = def.delaysMs[i];

            this.timedEffects.push({
                id: this.nextId(),
                ownerId: player.id,
                kind: ENTITY_KINDS.CANNON_IMPACT,
                originX: player.x,
                originY: player.y,
                x: player.x + cos * range,
                y: player.y + sin * range,
                remainingMs: delay,
                totalMs: delay,
                radius: def.impactRadius,
                maxDamage: def.maxDamage,
                minDamage: def.minDamage
            });
        }

        player.shootCooldown = 500;
        return true;
    }

    throwArcBomb(room, player, def) {
        this.removeOldestOwned(this.timedEffects, player.id, ENTITY_KINDS.ARCBOMB, 1);

        const cos = Math.cos(player.angle);
        const sin = Math.sin(player.angle);

        this.timedEffects.push({
            id: this.nextId(),
            ownerId: player.id,
            kind: ENTITY_KINDS.ARCBOMB,
            originX: player.x,
            originY: player.y,
            x: player.x + cos * def.range,
            y: player.y + sin * def.range,
            remainingMs: def.fuseMs,
            totalMs: def.fuseMs,
            warningMs: def.warningMs,
            radius: def.blastRadius,
            maxDamage: def.maxDamage,
            minDamage: def.minDamage
        });

        player.shootCooldown = 600;
        return true;
    }

    dropFakeCrate(room, player, def) {
        this.removeOldestOwned(this.hazards, player.id, ENTITY_KINDS.FAKECRATE, def.maxPerOwner || 1);
        if (this.hazards.length >= Gameplay.NET.MAX_HAZARDS) return false;

        const cos = Math.cos(player.angle);
        const sin = Math.sin(player.angle);

        this.hazards.push({
            id: this.nextId(),
            ownerId: player.id,
            kind: ENTITY_KINDS.FAKECRATE,
            x: player.x - cos * 24,
            y: player.y - sin * 24,
            armTimer: def.armMs,
            lifeMs: def.lifeMs,
            damage: def.damage,
            triggerRadius: def.triggerRadius
        });

        player.shootCooldown = 500;
        return true;
    }

    activateMace(room, player, def) {
        player.maceTimer = def.durationMs || 4000;
        if (typeof room.emitCombatFx === 'function') {
            room.emitCombatFx({
                t: COMBAT_EVENT.MACE_ON,
                x: Math.round(player.x),
                y: Math.round(player.y),
                ownerId: player.id
            });
        }
        player.shootCooldown = 250;
        return true;
    }

    // ── Simulation Loops ─────────────────────────────────────

    update(room, dt) {
        this.updateProjectiles(room, dt);
        this.updateTimedEffects(room, dt);
        this.updateHazards(room, dt);
        this.updateRamming(room, dt);
    }

    updateProjectiles(room, dt) {
        const substeps = Math.max(1, Math.round(dt / 16.67));
        const subDt = dt / substeps;
        const subScale = subDt / 16.67;

        for (let s = 0; s < substeps; s++) {
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const p = this.projectiles[i];
                p.lifeMs -= subDt;
                if (p.lifeMs <= 0) {
                    removeUnordered(this.projectiles, i);
                    continue;
                }

                p.x += p.vx * subScale;
                p.y += p.vy * subScale;

                const blocked = room.map ? room.map.isBlockedRect(p.x, p.y, 6) : false;
                let hitTarget = null;

                if (!blocked) {
                    for (const target of room.players.values()) {
                        if (!DamageSystem.canDamage(target, p.ownerId)) continue;
                        const d = Math.hypot(target.x - p.x, target.y - p.y);
                        if (d <= (Gameplay.PHYSICS.DRONE_RADIUS + 10)) {
                            hitTarget = target;
                            break;
                        }
                    }
                }

                if (blocked || hitTarget) {
                    if (hitTarget) {
                        DamageSystem.applyDamage(room, hitTarget, p.directDamage || 45, {
                            ownerId: p.ownerId,
                            powerType: 'rockets',
                            entityId: p.id
                        });
                    }
                    // Radial splash damage
                    DamageSystem.applyRadialDamage(
                        room,
                        p.x,
                        p.y,
                        p.splashRadius || 52,
                        p.splashDamage || 22,
                        8,
                        { ownerId: p.ownerId, powerType: 'rockets', entityId: p.id },
                        target => target.id !== (hitTarget ? hitTarget.id : null)
                    );

                    if (typeof room.emitCombatFx === 'function') {
                        room.emitCombatFx({
                            t: COMBAT_EVENT.ROCKET_EXPLODE,
                            x: Math.round(p.x),
                            y: Math.round(p.y),
                            ownerId: p.ownerId
                        });
                    }

                    removeUnordered(this.projectiles, i);
                }
            }
        }
    }

    updateTimedEffects(room, dt) {
        for (let i = this.timedEffects.length - 1; i >= 0; i--) {
            const eff = this.timedEffects[i];
            eff.remainingMs -= dt;

            if (eff.remainingMs <= 0) {
                DamageSystem.applyRadialDamage(
                    room,
                    eff.x,
                    eff.y,
                    eff.radius || 34,
                    eff.maxDamage || 85,
                    eff.minDamage || 25,
                    { ownerId: eff.ownerId, powerType: eff.kind === ENTITY_KINDS.ARCBOMB ? 'arcbomb' : 'cannon', entityId: eff.id }
                );

                if (typeof room.emitCombatFx === 'function') {
                    room.emitCombatFx({
                        t: eff.kind === ENTITY_KINDS.ARCBOMB ? COMBAT_EVENT.ARCBOMB_EXPLODE : COMBAT_EVENT.CANNON_EXPLODE,
                        x: Math.round(eff.x),
                        y: Math.round(eff.y),
                        ownerId: eff.ownerId
                    });
                }

                removeUnordered(this.timedEffects, i);
            }
        }
    }

    updateHazards(room, dt) {
        for (let i = this.hazards.length - 1; i >= 0; i--) {
            const h = this.hazards[i];
            h.lifeMs -= dt;
            if (h.lifeMs <= 0) {
                removeUnordered(this.hazards, i);
                continue;
            }

            if (h.armTimer > 0) {
                h.armTimer -= dt;
                if (h.armTimer > 0) {
                    continue; // Still arming
                }
            }

            let triggered = false;
            let hitTarget = null;

            for (const target of room.players.values()) {
                if (!DamageSystem.canDamage(target, h.ownerId)) continue;
                const d = Math.hypot(target.x - h.x, target.y - h.y);
                if (d <= (h.triggerRadius || 32)) {
                    triggered = true;
                    hitTarget = target;
                    break;
                }
            }

            if (triggered) {
                if (hitTarget) {
                    DamageSystem.applyDamage(room, hitTarget, h.damage || 100, {
                        ownerId: h.ownerId,
                        powerType: h.kind === ENTITY_KINDS.FAKECRATE ? 'fakecrate' : 'mine',
                        entityId: h.id
                    });
                }
                // Small area splash
                DamageSystem.applyRadialDamage(
                    room,
                    h.x,
                    h.y,
                    (h.triggerRadius || 32) * 1.5,
                    50,
                    15,
                    { ownerId: h.ownerId, powerType: h.kind, entityId: h.id },
                    t => t.id !== (hitTarget ? hitTarget.id : null)
                );

                if (typeof room.emitCombatFx === 'function') {
                    room.emitCombatFx({
                        t: h.kind === ENTITY_KINDS.FAKECRATE ? COMBAT_EVENT.FAKECRATE_EXPLODE : COMBAT_EVENT.MINE_EXPLODE,
                        x: Math.round(h.x),
                        y: Math.round(h.y),
                        ownerId: h.ownerId
                    });
                }

                removeUnordered(this.hazards, i);
            }
        }
    }

    updateRamming(room, dt) {
        const haloPlayers = [];
        for (const p of room.players.values()) {
            if (p.alive && p.maceTimer > 0) {
                p.maceTimer = Math.max(0, p.maceTimer - dt);
                haloPlayers.push(p);
            }
        }
        if (haloPlayers.length === 0) return;

        const pendingDamage = [];

        for (const haloPlayer of haloPlayers) {
            const hitRadius = POWERS.mace.hitRadius || 29;

            for (const other of room.players.values()) {
                if (!other.alive || other.id === haloPlayer.id) continue;
                if (!DamageSystem.canDamage(other, haloPlayer.id)) continue;

                const d = Math.hypot(other.x - haloPlayer.x, other.y - haloPlayer.y);
                if (d <= (hitRadius + Gameplay.PHYSICS.DRONE_RADIUS)) {
                    pendingDamage.push({
                        target: other,
                        amount: 100,
                        source: { ownerId: haloPlayer.id, powerType: 'mace' }
                    });
                }
            }
        }

        // Apply collected ramming damage in batch
        for (const pd of pendingDamage) {
            DamageSystem.applyDamage(room, pd.target, pd.amount, pd.source);
        }
    }
}

PowerSystem.prototype.handlers = {
    machinegun: PowerSystem.prototype.fireMachineGun,
    rockets: PowerSystem.prototype.fireRockets,
    mine: PowerSystem.prototype.dropMine,
    shield: PowerSystem.prototype.activateShield,
    cannon: PowerSystem.prototype.fireMortar,
    arcbomb: PowerSystem.prototype.throwArcBomb,
    fakecrate: PowerSystem.prototype.dropFakeCrate,
    mace: PowerSystem.prototype.activateMace
};

module.exports = PowerSystem;
