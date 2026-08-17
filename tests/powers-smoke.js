const assert = require('assert');
const Gameplay = require('../src/shared/gameplay');
const ArenaRoom = require('../server/rooms/ArenaRoom');
const DamageSystem = require('../server/combat/DamageSystem');
const PowerSystem = require('../server/combat/PowerSystem');

const io = {
    to() {
        return {
            emit() {},
            volatile: { emit() {} }
        };
    }
};

const room = new ArenaRoom('TEST8P', 'p1', io);
room.addPlayer('p1', 'PlayerOne');
room.addPlayer('p2', 'PlayerTwo');
const p1 = room.players.get('p1');
const p2 = room.players.get('p2');
room.state = 'playing';
room.map = {
    worldSize: 1920,
    isBlockedRect() { return false; },
    getRandomSpawnPoint() { return { x: 500, y: 500 }; }
};

// Ensure active state
function resetMatchState() {
    p1.alive = p2.alive = true;
    p1.health = p2.health = 100;
    p1.x = 500; p1.y = 500; p1.angle = 0;
    p2.x = 600; p2.y = 500; p2.angle = Math.PI;
    p1.spawnProtection = p2.spawnProtection = 0;
    p1.shieldTimer = p2.shieldTimer = 0;
    p1.maceTimer = p2.maceTimer = 0;
    p1.shootCooldown = p2.shootCooldown = 0;
    p1.pendingFire = p2.pendingFire = false;
    room.powerSystem.reset();
}

console.log('Testing 1: Pulse Blaster (Hitscan & Hold Trigger)...');
resetMatchState();
p1.power = { type: 'machinegun', charges: 18 };
p1.inputs.shootHeld = true;
const usedBlaster = room.powerSystem.tryUsePower(room, p1);
assert.strictEqual(usedBlaster, true, 'Pulse Blaster should fire');
assert.strictEqual(p1.power.charges, 17, 'Charges should decrease by 1');
assert.strictEqual(p2.health, 100 - Gameplay.POWERS.machinegun.damage, 'Target should take blaster damage');
assert(p1.shootCooldown > 0, 'Shoot cooldown should be set');

console.log('Testing 2: Tri-Rocket (3 Rockets & Splash Damage)...');
resetMatchState();
p1.power = { type: 'rockets', charges: 1 };
p1.pendingFire = true;
const usedRockets = room.powerSystem.tryUsePower(room, p1);
assert.strictEqual(usedRockets, true, 'Tri-Rocket should fire');
assert.strictEqual(p1.power, null, '1-charge power should clear from inventory');
assert.strictEqual(room.powerSystem.projectiles.length, 3, 'Should spawn 3 rockets');
assert.strictEqual(p1.pendingFire, false, 'Pending fire should be consumed');

// Simulate rocket flight & impact
room.powerSystem.updateProjectiles(room, 120);
assert(p2.health < 100, 'Rockets should impact target');

console.log('Testing 3: Neon Mines (Arm Time, Trigger & Cap of 3)...');
resetMatchState();
p1.power = { type: 'mine', charges: 3 };
p1.pendingFire = true;
room.powerSystem.tryUsePower(room, p1);
assert.strictEqual(room.powerSystem.hazards.length, 1, 'Should deploy 1 mine');
assert.strictEqual(room.powerSystem.hazards[0].armTimer > 0, true, 'Mine must start arming');

// Place p2 directly on mine while arming (should NOT explode yet)
const mine = room.powerSystem.hazards[0];
p2.x = mine.x; p2.y = mine.y;
room.powerSystem.updateHazards(room, 50);
assert.strictEqual(p2.health, 100, 'Unarmed mine must not trigger');

// Fast-forward past arm time (450ms)
room.powerSystem.updateHazards(room, 500);
assert(p2.health <= 0 || !p2.alive, 'Armed mine must trigger and damage enemy');

// Verify owner cap of 3
resetMatchState();
p1.power = { type: 'mine', charges: 3 };
for (let i = 0; i < 4; i++) {
    p1.pendingFire = true;
    p1.shootCooldown = 0;
    p1.power = { type: 'mine', charges: 3 };
    room.powerSystem.tryUsePower(room, p1);
}
assert.strictEqual(room.powerSystem.hazards.length, 3, 'Max 3 active mines per owner');

console.log('Testing 4: Phase Shield (Manual Activation & Total Immunity)...');
resetMatchState();
p1.power = { type: 'shield', charges: 1 };
assert.strictEqual(p1.shieldTimer, 0, 'Shield should not auto-activate on inventory grant');
p1.pendingFire = true;
room.powerSystem.tryUsePower(room, p1);
assert(p1.shieldTimer > 4000, 'Shield timer should activate on trigger');
assert.strictEqual(p1.power, null, 'Shield charge consumed');

// Attempt damage on shielded player
const blocked = DamageSystem.applyDamage(room, p1, 100, { ownerId: 'p2' });
assert.strictEqual(blocked, false, 'Shielded player must reject damage');
assert.strictEqual(p1.health, 100, 'Health unchanged');

console.log('Testing 5: Mortar Burst (4 Lobbed Timed Impacts)...');
resetMatchState();
p1.power = { type: 'cannon', charges: 1 };
p1.pendingFire = true;
room.powerSystem.tryUsePower(room, p1);
assert.strictEqual(room.powerSystem.timedEffects.length, 4, 'Should create 4 timed impact points');
// Place p2 on first impact point and advance time
const imp = room.powerSystem.timedEffects[0];
p2.x = imp.x; p2.y = imp.y;
room.powerSystem.updateTimedEffects(room, 550);
assert(p2.health < 100, 'Target on mortar impact point takes damage');

console.log('Testing 6: Arc Bomb (Fuse Delay & Blast Area)...');
resetMatchState();
p1.power = { type: 'arcbomb', charges: 1 };
p1.pendingFire = true;
room.powerSystem.tryUsePower(room, p1);
assert.strictEqual(room.powerSystem.timedEffects.length, 1, 'Should deploy 1 Arc Bomb');
const bomb = room.powerSystem.timedEffects[0];
p2.x = bomb.x; p2.y = bomb.y;
// Advance time before fuse
room.powerSystem.updateTimedEffects(room, 500);
assert.strictEqual(p2.health, 100, 'Bomb should not explode before fuse expires');
// Advance time to detonation (950ms)
room.powerSystem.updateTimedEffects(room, 500);
assert(p2.health <= 0 || !p2.alive, 'Arc bomb must detonate and deal lethal center damage');

console.log('Testing 7: Mimic Crate (Decoy Trap & Cap of 1)...');
resetMatchState();
p1.power = { type: 'fakecrate', charges: 1 };
p1.pendingFire = true;
room.powerSystem.tryUsePower(room, p1);
assert.strictEqual(room.powerSystem.hazards.length, 1, 'Should deploy 1 fake crate');
// Deploy second fake crate -> should replace oldest
p1.power = { type: 'fakecrate', charges: 1 };
p1.shootCooldown = 0;
p1.pendingFire = true;
room.powerSystem.tryUsePower(room, p1);
assert.strictEqual(room.powerSystem.hazards.length, 1, 'Max 1 active fake crate per owner');

console.log('Testing 8: Wrecking Halo (Spinning Spikes & Contact Ramming)...');
resetMatchState();
p1.power = { type: 'mace', charges: 1 };
p1.pendingFire = true;
room.powerSystem.tryUsePower(room, p1);
assert(p1.maceTimer > 3500, 'Halo mace timer active');

// Move p2 into contact radius (dist <= 39)
p2.x = p1.x + 25; p2.y = p1.y;
room.powerSystem.updateRamming(room, 33);
assert(p2.health <= 0 || !p2.alive, 'Wrecking halo should ram and destroy enemy on contact');

console.log('Testing 9: fireSeq Monotonic Input Buffering...');
resetMatchState();
p1.power = { type: 'rockets', charges: 1 };
room.setPlayerInputs('p1', { dx: 0, dy: 0, boost: false, shootHeld: false, fireSeq: 1 });
assert.strictEqual(p1.pendingFire, true, 'fireSeq=1 sets pendingFire');
room.setPlayerInputs('p1', { dx: 0, dy: 0, boost: false, shootHeld: false, fireSeq: 1 });
assert.strictEqual(p1.pendingFire, true, 'Same fireSeq does not clear pendingFire');
room.powerSystem.tryUsePower(room, p1);
assert.strictEqual(p1.pendingFire, false, 'Pending fire consumed after successful use');

room.destroy();
console.log('All 8-power multiplayer combat tests passed with flying colors! 🏆');
