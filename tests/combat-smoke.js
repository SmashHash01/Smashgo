const assert = require('assert');
const ArenaRoom = require('../server/rooms/ArenaRoom');

const io = { to() { return { emit() {} }; } };
const room = new ArenaRoom('TEST01', 'a', io);
room.addPlayer('a', 'Alpha');
room.addPlayer('b', 'Bravo');

room.setPlayerInputs('a', { dx: 9, dy: 9, boost: 'not-a-bool', shoot: true, junk: 'ignored' });
const input = room.players.get('a').inputs;
assert(Math.hypot(input.dx, input.dy) <= 1.000001, 'movement must be normalized');
assert.strictEqual(input.boost, false, 'boost must require boolean true');
assert.strictEqual(Object.prototype.hasOwnProperty.call(room.getState().players[0], 'inputs'), false, 'inputs must not be broadcast');

const a = room.players.get('a');
const b = room.players.get('b');
a.alive = b.alive = true;
a.spawnProtection = b.spawnProtection = 0;
a.shieldTimer = b.shieldTimer = 0;
a.health = b.health = 100;
room.applyDamage(b, 26, 'a');
assert.strictEqual(b.health, 74, 'machine-gun style damage should be partial');

b.shieldTimer = 1000;
room.applyDamage(b, 100, 'a');
assert.strictEqual(b.health, 74, 'shield must block damage');
b.shieldTimer = 0;
room.applyDamage(b, 100, 'a');
assert.strictEqual(b.alive, false, 'lethal damage should kill');
assert.strictEqual(a.kills, 1, 'killer should receive one kill');

room.destroy();
assert.strictEqual(room.loopInterval, null);
assert.strictEqual(room.spawnerInterval, null);
assert.strictEqual(room.players.size, 0);
console.log('combat smoke tests passed');
