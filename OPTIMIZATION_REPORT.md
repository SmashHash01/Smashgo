# SmashGo Multiplayer Optimization & Combat Audit

## Result

This pass focuses on multiplayer bandwidth/memory, server lifecycle leaks, client render cost, client/server desync, code duplication, and a Smash-Karts-style weapon pickup loop.

The uploaded project itself is only about 12 MB including dependencies. The "huge game" symptom is therefore runtime/network churn rather than asset storage.

## Critical flaws found

1. **Abandoned room simulation leak**
   - A room was deleted from the global `rooms` map after its final player disconnected, but its game and power-up `setInterval` timers were not stopped.
   - Each abandoned room could remain alive through its interval closures and keep ticking/spawning forever.
   - Fixed with `ArenaRoom.destroy()` and centralized room-detach cleanup.

2. **Full room state broadcast at 30 Hz**
   - Every physics tick broadcast the entire player list, power-ups, projectiles, rankings, map config, and even each player's input object.
   - Fixed by keeping server simulation at 30 Hz but snapshot replication at 15 Hz.
   - Static map config is sent at match start instead of every frame.
   - Player inputs are never serialized in snapshots.
   - Numeric values are packed/rounded for smaller packets.
   - High-frequency snapshots are volatile so a slow client does not need an ever-growing backlog of obsolete states.

3. **Client input spam tied to render FPS**
   - Inputs were emitted every `requestAnimationFrame`, typically ~60/sec and potentially more on high-refresh displays.
   - Fixed with a 20 Hz network send cap, immediate button-edge sends, and a small keepalive.

4. **Client/server collision map mismatch**
   - The client generated random alleys that the authoritative server did not know about.
   - The server also used a different passable-width calculation than the client.
   - Players could visually see a driveable area while the server treated it as a wall.
   - Multiplayer now disables client-only random alleys, and arena geometry/constants come from shared gameplay config.

5. **Duplicated gameplay constants and helpers**
   - Physics values were duplicated between client config and server code.
   - `angleDiff` existed independently in multiple files.
   - Arena layout constants were duplicated server/client.
   - These are now centralized in `src/shared/gameplay.js` and consumed by both browser and Node server.

6. **Unbounded canvas-width formula**
   - The old resize code used `640 * (windowWidth / windowHeight)` for the internal canvas width.
   - A temporarily tiny browser height (mobile browser chrome, devtools, resize edge cases) could create an extremely wide internal canvas and large backing buffers.
   - The renderer now preserves viewport aspect ratio while capping the internal canvas to a 1280x720-equivalent pixel budget.

7. **Per-frame multiplayer garbage**
   - Every frame created an `Array.from(...).map(...)` player list for the minimap.
   - The scoreboard cloned and sorted all players every render frame.
   - These are now stable/reused visual objects, and scoreboard ordering is cached when a network snapshot arrives.

8. **Client data trusted too much**
   - The server retained the raw input object sent by the client.
   - Movement values were not normalized/clamped at the network boundary.
   - Usernames were not length-limited.
   - Inputs are now copied into a small authoritative schema, vectors are normalized, booleans are strict, and usernames are normalized/capped.

9. **No explicit room-leave protocol**
   - Multiplayer leave mostly relied on page reload/disconnect.
   - Added a `leaveRoom` socket event and server cleanup path.

10. **Combat was not a real power-up system**
    - The old multiplayer fire path was always available and every projectile immediately set target health to zero.
    - There was no weapon inventory/ammo distinction or invincibility-style defense.
    - Replaced with authoritative pickup inventory and differentiated weapon behavior.

## New multiplayer powers

Weapon crates are shown as purple `?` boxes. On pickup, the server randomly awards one of:

- **Machine Gun** — 16 rounds, 26 damage each, hold X/Shift (or mobile Shoot) to fire.
- **Rocket** — 3 rockets, slower fire rate, lethal splash damage.
- **Mine** — 3 mines, drops behind the car, arms after a short delay, lethal trigger blast.
- **Shield** — immediate temporary invulnerability for 5 seconds.

Existing health and overdrive pickups remain. Respawn protection was also added to reduce spawn-killing.

All damage, ammo, kills, deaths, shields, pickup awards, projectile collision, and respawning are server-authoritative.

## Measured snapshot improvement

A synthetic 8-player state with 20 projectiles and 10 pickups produced:

- Before: ~5,833 bytes/snapshot at 30 snapshots/sec = ~170.9 KiB/sec per client before transport overhead.
- After: ~4,897 bytes/snapshot at 15 snapshots/sec = ~71.7 KiB/sec per client before transport overhead.
- Snapshot throughput reduction in that sample: ~58%.

Input messages are also reduced from render-rate sends (~60/sec on a normal display) to a maximum normal cadence of 20/sec, with immediate sends for important button state changes.

## Main files changed

- `src/shared/gameplay.js` — shared physics, arena, networking and weapon constants.
- `server/rooms/ArenaRoom.js` — authoritative combat, packed snapshots, lower replication rate, lifecycle cleanup, input validation.
- `server/index.js` — safer room lifecycle, explicit leave, username/room normalization.
- `server/world/ArenaMap.js` — shared arena geometry/collision.
- `src/modes/multiplayer.js` — throttled input, lower garbage, cached scoreboard, weapon/projectile/pickup/shield rendering and HUD.
- `src/multiplayer/network.js` — explicit leave support and cleaner network facade.
- `src/input.js` — held Shoot support for machine gun/mobile controls.
- `src/main.js` — bounded internal canvas pixel budget.
- `src/config.js`, `src/world.js`, `src/drone.js` — shared constants/helpers and multiplayer map consistency.
- `tests/combat-smoke.js` — basic authoritative combat/input/cleanup regression tests.

## Run and test

```bash
npm install
npm test
npm start
```

Then open `http://localhost:3000` in two browser windows/devices, create/join the same room, start a match, drive through purple `?` crates, and use X/Shift or the mobile Shoot button.

## Remaining improvements worth doing later

For the current 8-player cap, the new O(players × projectiles) hit checking is small. If the game later grows to dozens of players or hundreds of projectiles, add a spatial hash/grid on the server before increasing tick rate.

The next major bandwidth step would be delta/binary snapshots (only changed fields, numeric arrays rather than JSON objects). That is not necessary for an 8-player prototype after this pass, but it would be the right direction for large-scale rooms.

The detailed `drawCar()` routine still constructs several canvas paths/gradients per visible car each frame. If profiling shows GPU/Canvas2D time is still high on low-end phones, the next rendering optimization is pre-rendered car sprites/offscreen canvases for remote players, then rotate/blit those sprites instead of rebuilding the whole car vector drawing every frame.
