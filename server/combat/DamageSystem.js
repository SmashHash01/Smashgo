const Gameplay = require('../../src/shared/gameplay');

class DamageSystem {
    static canDamage(target, ownerId) {
        if (!target || !target.alive) return false;
        if (ownerId && target.id === ownerId) return false;
        if (target.spawnProtection > 0) return false;
        if (target.shieldTimer > 0) return false;
        return true;
    }

    static applyDamage(room, target, amount, source = {}) {
        if (!DamageSystem.canDamage(target, source.ownerId)) return false;

        const actualDamage = Math.max(0, Math.round(amount));
        target.health = Math.max(0, target.health - actualDamage);
        target.hitFlash = 180;

        if (source.ownerId && source.ownerId !== target.id) {
            if (typeof room.emitToPlayer === 'function') {
                room.emitToPlayer(source.ownerId, 'combatConfirm', {
                    type: 'hit',
                    damage: actualDamage,
                    victimId: target.id
                });
            }
        }

        if (target.health <= 0) {
            DamageSystem.killPlayer(room, target, source);
        }
        return true;
    }

    static applyRadialDamage(room, x, y, radius, maxDmg, minDmg, source = {}, filterFn = null) {
        let hitCount = 0;
        for (const target of room.players.values()) {
            if (!DamageSystem.canDamage(target, source.ownerId)) continue;
            if (typeof filterFn === 'function' && !filterFn(target)) continue;

            const dist = Math.hypot(target.x - x, target.y - y);
            if (dist < radius) {
                const dmg = Gameplay.radialDamage(dist, radius, maxDmg, minDmg);
                if (dmg > 0) {
                    DamageSystem.applyDamage(room, target, dmg, source);
                    hitCount++;
                }
            }
        }
        return hitCount;
    }

    static killPlayer(room, target, source = {}) {
        target.alive = false;
        target.deaths = (target.deaths || 0) + 1;
        target.respawnTimer = Gameplay.COMBAT.RESPAWN_MS;
        target.power = null;
        target.shieldTimer = 0;
        target.maceTimer = 0;
        target.shootCooldown = 0;
        target.pendingFire = false;
        target.vx = 0;
        target.vy = 0;

        const killerId = source.ownerId;
        if (killerId) {
            const killer = room.players.get(killerId);
            if (killer && killer.id !== target.id) {
                killer.kills = (killer.kills || 0) + 1;
                killer.score = (killer.score || 0) + 100;
                if (typeof room.emitToPlayer === 'function') {
                    room.emitToPlayer(killer.id, 'combatConfirm', {
                        type: 'kill',
                        victimId: target.id,
                        victimName: target.username
                    });
                }
            }
        }
    }
}

module.exports = DamageSystem;
