// ============================================================
//  SmashGo — BotAI.js
//  Server-side medium-difficulty bot controller.
//  Bots are fake players with AI-driven inputs each tick.
// ============================================================

const Gameplay = require('../../src/shared/gameplay');

const ARENA = Gameplay.ARENA;
const POWERS = Gameplay.POWERS;
const TS = ARENA.tileSize;

// Pre-compute road center world positions (intersections are waypoints)
const ROAD_WORLD = ARENA.roadCenters.map(rc => rc * TS + TS / 2);
const INTERSECTIONS = [];
for (const rx of ROAD_WORLD) {
    for (const ry of ROAD_WORLD) {
        INTERSECTIONS.push({ x: rx, y: ry });
    }
}

// Bot names pool
const BOT_NAMES = [
    'NEON-X', 'CYBER-7', 'VOLT-3', 'BLITZ-9', 'GHOST-5',
    'RAZOR-2', 'FLUX-8', 'PULSE-4', 'STORM-6', 'NOVA-1'
];

let botNameIdx = 0;
function nextBotName() {
    const name = BOT_NAMES[botNameIdx % BOT_NAMES.length];
    botNameIdx++;
    return name;
}

// Medium difficulty constants
const REACTION_TICKS = 6;        // ~200ms at 30Hz — how often bot re-evaluates target
const AIM_WOBBLE_RAD = 0.14;     // ±8° random steering wobble
const FIRE_MISS_CHANCE = 0.30;   // 30% chance to skip a fire opportunity
const BOOST_CHANCE_PER_SEC = 0.30;
const POWERUP_SEEK_RANGE = 600;  // how far bot looks for powerups
const HUNT_RANGE = 400;          // how far bot looks for enemies
const ATTACK_RANGE = {
    machinegun: 200,
    rockets: 160,
    cannon: 140,
    arcbomb: 130,
    mine: 100,
    fakecrate: 100,
    shield: Infinity,  // activate on health threshold
    mace: 60
};
const ATTACK_ANGLE = {
    machinegun: 0.44,  // ~25°
    rockets: 0.35,     // ~20°
    cannon: 0.35,
    arcbomb: 0.35,
    mine: Math.PI,     // any angle (drops behind)
    fakecrate: Math.PI,
    shield: Math.PI,
    mace: 0.5
};

class BotState {
    constructor(playerId) {
        this.playerId = playerId;
        this.tickCounter = 0;
        this.waypointX = 0;
        this.waypointY = 0;
        this.targetPlayerId = null;
        this.lastDecisionTick = 0;
        this.wobble = 0;
        this.pickNewWaypoint();
    }

    pickNewWaypoint() {
        const wp = INTERSECTIONS[Math.floor(Math.random() * INTERSECTIONS.length)];
        this.waypointX = wp.x;
        this.waypointY = wp.y;
    }
}

// Store per-bot AI state (keyed by bot player id)
const botStates = new Map();

function registerBot(playerId) {
    const state = new BotState(playerId);
    botStates.set(playerId, state);
    return state;
}

function unregisterBot(playerId) {
    botStates.delete(playerId);
}

function clearAll() {
    botStates.clear();
}

function angleDiff(a, b) {
    let d = a - b;
    while (d < -Math.PI) d += Math.PI * 2;
    while (d > Math.PI) d -= Math.PI * 2;
    return d;
}

function distSq(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
}

// ── Main update: called once per server tick ─────────────────
function updateAll(room) {
    for (const player of room.players.values()) {
        if (!player.isBot) continue;
        const bs = botStates.get(player.id);
        if (!bs) continue;
        bs.tickCounter++;
        updateBot(room, player, bs);
    }
}

function updateBot(room, bot, bs) {
    if (!bot.alive) return;

    const shouldDecide = (bs.tickCounter - bs.lastDecisionTick) >= REACTION_TICKS;

    // ── 1. Find nearest enemy and nearest powerup ───────────
    let nearestEnemy = null;
    let nearestEnemyDist = Infinity;
    let nearestPowerup = null;
    let nearestPowerupDist = Infinity;

    if (shouldDecide) {
        bs.lastDecisionTick = bs.tickCounter;
        bs.wobble = (Math.random() - 0.5) * AIM_WOBBLE_RAD * 2;

        for (const p of room.players.values()) {
            if (p.id === bot.id || !p.alive) continue;
            if (p.spawnProtection > 0) continue;
            const d = Math.sqrt(distSq(bot.x, bot.y, p.x, p.y));
            if (d < nearestEnemyDist) {
                nearestEnemyDist = d;
                nearestEnemy = p;
            }
        }

        if (!bot.power) {
            for (const pu of room.powerups) {
                const d = Math.sqrt(distSq(bot.x, bot.y, pu.x, pu.y));
                if (d < nearestPowerupDist) {
                    nearestPowerupDist = d;
                    nearestPowerup = pu;
                }
            }
        }

        bs.targetPlayerId = nearestEnemy ? nearestEnemy.id : null;
        bs.targetPowerupId = nearestPowerup ? nearestPowerup.id : null;
    } else {
        // Use cached target
        if (bs.targetPlayerId) {
            nearestEnemy = room.players.get(bs.targetPlayerId);
            if (nearestEnemy && nearestEnemy.alive) {
                nearestEnemyDist = Math.sqrt(distSq(bot.x, bot.y, nearestEnemy.x, nearestEnemy.y));
            } else {
                nearestEnemy = null;
                bs.targetPlayerId = null;
            }
        }
    }

    // ── 2. Decide where to drive ────────────────────────────
    let goalX, goalY;
    let mode = 'roam'; // roam | seek_powerup | hunt

    const hasPower = !!(bot.power && bot.power.charges > 0);
    const hasShield = bot.power && bot.power.type === 'shield';
    const hasMace = bot.power && bot.power.type === 'mace';

    // Priority: low health + shield → activate shield
    // No power → seek powerup crate
    // Has power + enemy in range → hunt
    // Otherwise → roam
    if (!hasPower && nearestPowerup && nearestPowerupDist < POWERUP_SEEK_RANGE) {
        mode = 'seek_powerup';
        goalX = nearestPowerup.x;
        goalY = nearestPowerup.y;
    } else if (hasPower && nearestEnemy && nearestEnemyDist < HUNT_RANGE) {
        mode = 'hunt';
        goalX = nearestEnemy.x;
        goalY = nearestEnemy.y;
    } else {
        mode = 'roam';
        // Drive toward current waypoint
        const wpDist = Math.sqrt(distSq(bot.x, bot.y, bs.waypointX, bs.waypointY));
        if (wpDist < 60) {
            bs.pickNewWaypoint();
        }
        goalX = bs.waypointX;
        goalY = bs.waypointY;
    }

    // ── 3. Compute steering input ───────────────────────────
    const dxGoal = goalX - bot.x;
    const dyGoal = goalY - bot.y;
    const goalDist = Math.sqrt(dxGoal * dxGoal + dyGoal * dyGoal);

    let steerDx = 0, steerDy = 0;
    if (goalDist > 8) {
        steerDx = dxGoal / goalDist;
        steerDy = dyGoal / goalDist;
    }

    // Add aim wobble (medium difficulty)
    const cosW = Math.cos(bs.wobble), sinW = Math.sin(bs.wobble);
    const finalDx = steerDx * cosW - steerDy * sinW;
    const finalDy = steerDx * sinW + steerDy * cosW;

    // Wall avoidance: check ahead and nudge away
    if (room.map) {
        const lookAhead = 40;
        const checkX = bot.x + finalDx * lookAhead;
        const checkY = bot.y + finalDy * lookAhead;
        if (room.map.isBlockedRect(checkX, checkY, 8)) {
            // Try perpendicular directions
            const perpDx = -finalDy;
            const perpDy = finalDx;
            const leftX = bot.x + perpDx * lookAhead;
            const leftY = bot.y + perpDy * lookAhead;
            if (!room.map.isBlockedRect(leftX, leftY, 8)) {
                bot.inputs.dx = perpDx;
                bot.inputs.dy = perpDy;
            } else {
                bot.inputs.dx = -perpDx;
                bot.inputs.dy = -perpDy;
            }
        } else {
            bot.inputs.dx = finalDx;
            bot.inputs.dy = finalDy;
        }
    } else {
        bot.inputs.dx = finalDx;
        bot.inputs.dy = finalDy;
    }

    // ── 4. Boost decision ───────────────────────────────────
    // Boost when chasing or randomly
    const boostRoll = Math.random() < (BOOST_CHANCE_PER_SEC / 30); // per tick at 30Hz
    bot.inputs.boost = false;
    if (mode === 'hunt' && nearestEnemyDist > 200 && boostRoll) {
        bot.inputs.boost = true;
    } else if (mode === 'seek_powerup' && nearestPowerupDist > 200 && boostRoll) {
        bot.inputs.boost = true;
    } else if (mode === 'roam' && boostRoll) {
        bot.inputs.boost = true;
    }

    // ── 5. Fire / power usage ───────────────────────────────
    bot.inputs.shootHeld = false;
    bot.pendingFire = false;

    if (!hasPower || !bot.alive || bot.shootCooldown > 0) return;

    const powerType = bot.power.type;
    const def = POWERS[powerType];
    if (!def) return;

    // Shield: activate when health is low
    if (powerType === 'shield') {
        if (bot.health < 40) {
            fireBotWeapon(bot, def);
        }
        return;
    }

    // Mace: activate when enemy is very close
    if (powerType === 'mace') {
        if (nearestEnemy && nearestEnemyDist < ATTACK_RANGE.mace) {
            fireBotWeapon(bot, def);
        }
        return;
    }

    // Mine / FakeCrate: drop when enemy is nearby (behind bot logic not needed — just drop)
    if (powerType === 'mine' || powerType === 'fakecrate') {
        if (nearestEnemy && nearestEnemyDist < ATTACK_RANGE[powerType]) {
            if (Math.random() > FIRE_MISS_CHANCE) {
                fireBotWeapon(bot, def);
            }
        }
        return;
    }

    // Ranged weapons: check angle and distance
    if (!nearestEnemy) return;
    const angleToEnemy = Math.atan2(nearestEnemy.y - bot.y, nearestEnemy.x - bot.x);
    const angleDelta = Math.abs(angleDiff(bot.angle, angleToEnemy));
    const attackRange = ATTACK_RANGE[powerType] || 160;
    const attackAngle = ATTACK_ANGLE[powerType] || 0.4;

    if (nearestEnemyDist < attackRange && angleDelta < attackAngle) {
        // Medium difficulty: sometimes miss
        if (Math.random() > FIRE_MISS_CHANCE) {
            if (def.trigger === 'hold') {
                bot.inputs.shootHeld = true;
            } else {
                fireBotWeapon(bot, def);
            }
        }
    }
}

function fireBotWeapon(bot, def) {
    if (def.trigger === 'hold') {
        bot.inputs.shootHeld = true;
    } else {
        // Simulate a press-edge fire: increment fireSeq and set pendingFire
        bot.lastFireSeq = (bot.lastFireSeq || 0) + 1;
        bot.pendingFire = true;
    }
}

module.exports = {
    registerBot,
    unregisterBot,
    clearAll,
    updateAll,
    nextBotName,
    BOT_NAMES
};
