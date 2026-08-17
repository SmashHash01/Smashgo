const assert = require('assert');
const Gameplay = require('../src/shared/gameplay');

function runSimulation(hz, seconds, input, initialBoost, physics) {
    const totalSteps = Math.round(hz * seconds);
    const dt = 1000 / hz;
    const state = {
        x: 960,
        y: 960,
        vx: 0,
        vy: 0,
        angle: 0,
        boosting: Boolean(initialBoost)
    };

    for (let i = 0; i < totalSteps; i++) {
        Gameplay.stepVehicle(state, input, dt, null, physics);
    }
    return state;
}

// 1. Test straight-line movement (2 seconds)
const testPhysics = {
    DRONE_RADIUS: 10,
    DRONE_ACCEL: 0.42,
    DRONE_MAX_SPEED: 4.8,
    DRONE_FRICTION: 0.86,
    BOOST_SPEED_MULT: 2.4
};

const straight60 = runSimulation(60, 2.0, { dx: 1, dy: 0 }, false, testPhysics);
const straight30 = runSimulation(30, 2.0, { dx: 1, dy: 0 }, false, testPhysics);

console.log('Straight-line 60 Hz:', straight60.x, straight60.vx);
console.log('Straight-line 30 Hz:', straight30.x, straight30.vx);

assert(Math.abs(straight60.x - straight30.x) < 1e-5, `Position mismatch: 60Hz=${straight60.x}, 30Hz=${straight30.x}`);
assert(Math.abs(straight60.vx - straight30.vx) < 1e-5, `Velocity mismatch: 60Hz=${straight60.vx}, 30Hz=${straight30.vx}`);

// 2. Test boosted diagonal movement (2 seconds)
const diag60 = runSimulation(60, 2.0, { dx: 0.7071, dy: 0.7071 }, true, Gameplay.PHYSICS);
const diag30 = runSimulation(30, 2.0, { dx: 0.7071, dy: 0.7071 }, true, Gameplay.PHYSICS);

console.log('Boosted diagonal 60 Hz:', diag60.x, diag60.y, diag60.vx, diag60.vy);
console.log('Boosted diagonal 30 Hz:', diag30.x, diag30.y, diag30.vx, diag30.vy);

assert(Math.abs(diag60.x - diag30.x) < 1e-5, `Diag X mismatch: 60Hz=${diag60.x}, 30Hz=${diag30.x}`);
assert(Math.abs(diag60.y - diag30.y) < 1e-5, `Diag Y mismatch: 60Hz=${diag60.y}, 30Hz=${diag30.y}`);
assert(Math.abs(diag60.vx - diag30.vx) < 1e-5, `Diag VX mismatch: 60Hz=${diag60.vx}, 30Hz=${diag30.vx}`);
assert(Math.abs(diag60.vy - diag30.vy) < 1e-5, `Diag VY mismatch: 60Hz=${diag60.vy}, 30Hz=${diag30.vy}`);

console.log('Physics synchronization smoke tests passed cleanly!');
