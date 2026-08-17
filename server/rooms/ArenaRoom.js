const Gameplay = require('../../src/shared/gameplay');
const ArenaMap = require('../world/ArenaMap');
const PowerSystem = require('../combat/PowerSystem');
const DamageSystem = require('../combat/DamageSystem');

const C = Gameplay.COMBAT;
const N = Gameplay.NET;
const P = Gameplay.PHYSICS;
const POWERS = Gameplay.POWERS;

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function round1(v) {
    return Math.round(v * 10) / 10;
}

class ArenaRoom {
    constructor(roomCode, hostId, io) {
        this.roomCode = roomCode;
        this.hostId = hostId;
        this.io = io;
        this.maxPlayers = 8;
        this.matchMinutes = 5;
        this.matchTimer = 0;
        this.state = 'lobby';
        this.rankings = [];

        this.players = new Map();
        this.powerups = [];
        this.powerupIdCounter = 0;
        this.powerSystem = new PowerSystem();
        this.map = null;

        this.loopInterval = null;
        this.spawnerInterval = null;
        this.lastTime = 0;
        this.tickCounter = 0;
        this.snapshotEveryTicks = Math.max(1, Math.round(N.SERVER_TICK_HZ / N.SNAPSHOT_HZ));
        this.destroyed = false;
    }

    addPlayer(socketId, username) {
        const player = {
            id: socketId,
            username,
            isReady: false,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            angle: 0,
            health: C.PLAYER_MAX_HEALTH,
            kills: 0,
            deaths: 0,
            score: 0,
            power: null,
            alive: true,
            boosting: false,
            boostTimer: 0,
            boostCoolTimer: 0,
            respawnTimer: 0,
            spawnProtection: 0,
            shieldTimer: 0,
            maceTimer: 0,
            shootCooldown: 0,
            hitFlash: 0,
            hitWall: false,
            lastFireSeq: 0,
            pendingFire: false,
            inputs: { dx: 0, dy: 0, boost: false, shootHeld: false }
        };
        this.players.set(socketId, player);
        this.broadcastState();
        return this.packPlayer(player);
    }

    removePlayer(socketId) {
        this.powerSystem.removePlayerHazards(socketId);
        this.players.delete(socketId);
        if (this.hostId === socketId && this.players.size > 0) {
            this.hostId = this.players.keys().next().value;
        }
        if (this.players.size > 0) this.broadcastState();
    }

    destroy() {
        this.destroyed = true;
        if (this.loopInterval) clearInterval(this.loopInterval);
        if (this.spawnerInterval) clearInterval(this.spawnerInterval);
        this.loopInterval = null;
        this.spawnerInterval = null;
        this.players.clear();
        this.powerSystem.reset();
        this.powerups.length = 0;
        this.map = null;
    }

    setPlayerReady(socketId, isReady) {
        const player = this.players.get(socketId);
        if (!player) return;
        player.isReady = !!isReady;
        this.broadcastState();
    }

    setMatchDuration(minutes) {
        const allowed = [3, 5, 8, 10];
        if (!allowed.includes(minutes)) return;
        this.matchMinutes = minutes;
        this.broadcastState();
    }

    setPlayerInputs(socketId, rawInputs) {
        const player = this.players.get(socketId);
        if (!player || !rawInputs || typeof rawInputs !== 'object') return;

        let dx = Number.isFinite(rawInputs.dx) ? rawInputs.dx : 0;
        let dy = Number.isFinite(rawInputs.dy) ? rawInputs.dy : 0;
        const len = Math.hypot(dx, dy);
        if (len > 1) {
            dx /= len;
            dy /= len;
        }
        player.inputs.dx = clamp(dx, -1, 1);
        player.inputs.dy = clamp(dy, -1, 1);
        player.inputs.boost = rawInputs.boost === true;
        player.inputs.shootHeld = rawInputs.shootHeld === true || rawInputs.shoot === true;

        if (Number.isInteger(rawInputs.fireSeq) && rawInputs.fireSeq > player.lastFireSeq && rawInputs.fireSeq <= player.lastFireSeq + 8) {
            player.lastFireSeq = rawInputs.fireSeq;
            if (player.alive && player.power) {
                player.pendingFire = true;
            }
        }
    }

    packPlayer(player) {
        return {
            id: player.id,
            username: player.username,
            isReady: player.isReady,
            x: round1(player.x),
            y: round1(player.y),
            vx: round1(player.vx),
            vy: round1(player.vy),
            angle: Math.round(player.angle * 1000) / 1000,
            health: Math.max(0, Math.round(player.health)),
            kills: player.kills,
            deaths: player.deaths,
            score: player.score,
            power: player.power ? { type: player.power.type, charges: player.power.charges } : null,
            alive: player.alive,
            boosting: player.boosting,
            boostTimer: Math.max(0, Math.round(player.boostTimer)),
            boostCoolTimer: Math.max(0, Math.round(player.boostCoolTimer)),
            respawnTimer: Math.max(0, Math.round(player.respawnTimer)),
            spawnProtection: Math.max(0, Math.round(player.spawnProtection)),
            shieldTimer: Math.max(0, Math.round(player.shieldTimer)),
            maceTimer: Math.max(0, Math.round(player.maceTimer)),
            shootCooldown: Math.max(0, Math.round(player.shootCooldown)),
            hitFlash: Math.max(0, Math.round(player.hitFlash)),
            hitWall: player.hitWall
        };
    }

    getState(includeMap = false) {
        const state = {
            roomCode: this.roomCode,
            hostId: this.hostId,
            maxPlayers: this.maxPlayers,
            matchMinutes: this.matchMinutes,
            matchTimer: Math.max(0, Math.round(this.matchTimer)),
            state: this.state,
            players: Array.from(this.players.values(), p => this.packPlayer(p)),
            powerups: this.powerups,
            projectiles: this.powerSystem.projectiles.map(p => ({
                id: p.id,
                ownerId: p.ownerId,
                kind: p.kind,
                x: round1(p.x),
                y: round1(p.y),
                vx: round1(p.vx || 0),
                vy: round1(p.vy || 0),
                angle: Math.round((p.angle || 0) * 1000) / 1000
            })),
            hazards: this.powerSystem.hazards.map(h => ({
                id: h.id,
                ownerId: h.ownerId,
                kind: h.kind,
                x: round1(h.x),
                y: round1(h.y),
                armed: h.armTimer <= 0
            })),
            timedEffects: this.powerSystem.timedEffects.map(t => ({
                id: t.id,
                ownerId: t.ownerId,
                kind: t.kind,
                x: round1(t.x),
                y: round1(t.y),
                originX: round1(t.originX || t.x),
                originY: round1(t.originY || t.y),
                remainingMs: Math.max(0, Math.round(t.remainingMs)),
                totalMs: Math.max(0, Math.round(t.totalMs || t.remainingMs)),
                warningMs: t.warningMs ? Math.max(0, Math.round(t.warningMs)) : undefined,
                radius: t.radius
            }))
        };

        if (includeMap && this.map) state.mapConfig = this.map.getMapConfig();
        if (this.state === 'ended') state.rankings = this.rankings;
        return state;
    }

    broadcastState(includeMap = false, volatile = false) {
        if (this.destroyed) return;
        const target = this.io.to(this.roomCode);
        const broadcaster = volatile && target.volatile ? target.volatile : target;
        broadcaster.emit('roomStateUpdate', this.getState(includeMap));
    }

    emitCombatFx(eventData) {
        if (this.destroyed) return;
        const target = this.io.to(this.roomCode);
        const broadcaster = target.volatile ? target.volatile : target;
        broadcaster.emit('combatFx', eventData);
    }

    emitToPlayer(socketId, eventName, data) {
        if (this.destroyed) return;
        this.io.to(socketId).emit(eventName, data);
    }

    startMatch() {
        if (this.state !== 'lobby' || this.destroyed) return;
        this.state = 'playing';
        this.matchTimer = this.matchMinutes * 60 * 1000;
        this.rankings = [];
        this.tickCounter = 0;

        if (this.loopInterval) clearInterval(this.loopInterval);
        if (this.spawnerInterval) clearInterval(this.spawnerInterval);
        this.powerups.length = 0;
        this.powerSystem.reset();

        try {
            this.map = new ArenaMap();
            for (const player of this.players.values()) this.resetPlayerForSpawn(player, true);

            this.broadcastState(true);

            this.lastTime = Date.now();
            this.loopInterval = setInterval(() => this.tick(), 1000 / N.SERVER_TICK_HZ);
            this.spawnerInterval = setInterval(() => this.spawnPowerup(), C.POWERUP_SPAWN_MS);
        } catch (err) {
            console.error('Error in startMatch:', err);
        }
    }

    resetPlayerForSpawn(player, initial = false) {
        const spawn = this.map ? this.map.getRandomSpawnPoint() : { x: 960, y: 960 };
        player.x = spawn.x;
        player.y = spawn.y;
        player.vx = 0;
        player.vy = 0;
        player.angle = 0;
        player.alive = true;
        player.health = C.PLAYER_MAX_HEALTH;
        this.powerSystem.grantRandomPower(player);
        player.boosting = false;
        player.boostTimer = 0;
        player.boostCoolTimer = 0;
        player.respawnTimer = 0;
        player.spawnProtection = initial ? 1800 : C.SPAWN_PROTECTION_MS;
        player.shieldTimer = 0;
        player.maceTimer = 0;
        player.shootCooldown = 0;
        player.hitFlash = 0;
        player.hitWall = false;
        player.lastFireSeq = 0;
        player.pendingFire = false;
    }

    spawnPowerup() {
        if (this.destroyed || this.state !== 'playing' || this.powerups.length >= C.MAX_POWERUPS || !this.map) return;
        const spawn = this.map.getRandomSpawnPoint();
        const roll = Math.random();
        const type = roll < 0.82 ? 'power' : roll < 0.92 ? 'health' : 'overdrive';
        this.powerups.push({ id: ++this.powerupIdCounter, x: spawn.x, y: spawn.y, type });
    }

    applyDamage(target, damage, ownerId) {
        return DamageSystem.applyDamage(this, target, damage, { ownerId });
    }

    tick() {
        if (this.destroyed || this.state !== 'playing') return;

        try {
            const now = Date.now();
            const dt = Math.min(Math.max(now - this.lastTime, 1), 50);
            this.lastTime = now;

            this.matchTimer -= dt;
            if (this.matchTimer <= 0) {
                this.matchTimer = 0;
                this.state = 'ended';
                if (this.loopInterval) clearInterval(this.loopInterval);
                if (this.spawnerInterval) clearInterval(this.spawnerInterval);
                this.loopInterval = null;
                this.spawnerInterval = null;
                this.rankings = Array.from(this.players.values())
                    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
                    .map(p => ({ id: p.id, username: p.username, kills: p.kills, deaths: p.deaths, score: p.score }));
                this.broadcastState();
                return;
            }

            for (const p of this.players.values()) {
                if (!p.alive) {
                    p.respawnTimer -= dt;
                    if (p.respawnTimer <= 0) this.resetPlayerForSpawn(p, false);
                    continue;
                }

                if (p.shootCooldown > 0) p.shootCooldown -= dt;
                if (p.hitFlash > 0) p.hitFlash -= dt;
                if (p.spawnProtection > 0) p.spawnProtection -= dt;
                if (p.shieldTimer > 0) p.shieldTimer -= dt;

                const i = p.inputs;
                if (i.boost && !p.boosting && p.boostCoolTimer <= 0) {
                    p.boosting = true;
                    p.boostTimer = P.BOOST_DURATION;
                    p.boostCoolTimer = P.BOOST_COOLDOWN;
                }
                if (p.boosting) {
                    p.boostTimer -= dt;
                    if (p.boostTimer <= 0) {
                        p.boosting = false;
                        p.boostTimer = 0;
                    }
                }
                if (p.boostCoolTimer > 0) p.boostCoolTimer -= dt;

                // Authoritative movement using shared stepVehicle with 60Hz reference substeps
                Gameplay.stepVehicle(p, i, dt, this.map, P);

                // Collect powerups
                for (let j = this.powerups.length - 1; j >= 0; j--) {
                    const pu = this.powerups[j];
                    const dx = pu.x - p.x;
                    const dy = pu.y - p.y;
                    if (dx * dx + dy * dy >= C.PICKUP_RADIUS_SQ) continue;

                    if (pu.type === 'health') {
                        p.health = Math.min(C.PLAYER_MAX_HEALTH, p.health + 45);
                    } else if (pu.type === 'overdrive') {
                        p.boosting = true;
                        p.boostTimer = C.OVERDRIVE_MS;
                    } else {
                        this.powerSystem.grantRandomPower(p);
                        p.pendingFire = false;
                        p.shootCooldown = Math.max(p.shootCooldown || 0, 200);
                    }
                    this.powerups.splice(j, 1);
                }

                // Power activation
                this.powerSystem.tryUsePower(this, p);
            }

            // Update combat systems (projectiles, timed effects, hazards, ramming)
            this.powerSystem.update(this, dt);

            // Broadcast snapshots at 15 Hz
            this.tickCounter++;
            if (this.tickCounter % this.snapshotEveryTicks === 0) this.broadcastState(false, true);
        } catch (err) {
            console.error('Error in tick:', err);
        }
    }
}

module.exports = ArenaRoom;
