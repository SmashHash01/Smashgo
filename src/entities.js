// ============================================================
//  NEON DELIVERY — entities.js
//  Manages the 3-job system, cars, and police drones.
// ============================================================
NeonDelivery.Entities = (function () {
    const C  = NeonDelivery.Config;
    const JT = C.JOB_TYPE;

    // ── Job pool ─────────────────────────────────────────────
    let jobs     = [];   // [{type,pkg:{x,y},delivery:{x,y},reward,baseCoins,timeLimit,expressTimer,state}]
    let cars     = [];
    let police   = [];
    let deliveriesCompleted = 0;
    let deliveriesRequired  = 3;

    // ── Init ─────────────────────────────────────────────────
    function init(world, levelConfig) {
        jobs    = [];
        cars    = [];
        police  = [];
        deliveriesCompleted = 0;
        deliveriesRequired  = levelConfig.deliveriesRequired;

        spawnJobs(world, 3);

        // Cars
        if (levelConfig.hazards.includes('cars')) {
            spawnCars(world, levelConfig.carCount);
        }

        // Police (level 4+)
        if (levelConfig.hazards.includes('police')) {
            spawnPolice(world, 2 + Math.floor(levelConfig.level / 2));
        }
    }

    // ── Job spawning ─────────────────────────────────────────

    function spawnJobs(world, count) {
        const types = [JT.STANDARD, JT.EXPRESS, JT.VIP];
        for (let i = 0; i < count; i++) {
            spawnJob(world, types[i % types.length]);
        }
    }

    function spawnJob(world, type) {
        const WS = C.WORLD_SIZE;
        // Pick a random package spawn
        const pkg = world.getRandomSpawnPoint();
        if (!pkg) return;

        // Delivery at least 300 px away
        const del = world.getRandomSpawnFar(pkg.x, pkg.y, 300);
        if (!del) return;

        const dist = Math.sqrt((del.x-pkg.x)**2 + (del.y-pkg.y)**2);

        let reward, baseCoins, timeLimit;
        switch (type) {
            case JT.VIP:
                reward    = C.SCORE_BASE * C.VIP_MULTIPLIER;
                baseCoins = C.BASE_COINS_VIP;
                timeLimit = null; // No per-delivery timer for VIP (just the level timer)
                break;
            case JT.EXPRESS:
                reward    = C.SCORE_BASE * C.EXPRESS_MULTIPLIER;
                baseCoins = C.BASE_COINS_EXPRESS;
                timeLimit = C.EXPRESS_TIME * 1000; // ms
                break;
            default: // STANDARD
                reward    = C.SCORE_BASE;
                baseCoins = C.BASE_COINS_STANDARD;
                timeLimit = null;
        }

        jobs.push({
            id:           Math.random(),
            type,
            pkg:          { x: pkg.x, y: pkg.y },
            delivery:     { x: del.x, y: del.y },
            reward,
            baseCoins,
            timeLimit,
            expressTimer: timeLimit, // counts down in ms when carrying
            dist:         Math.round(dist),
            state:        'available',   // 'available' | 'carrying' | 'delivered' | 'failed'
        });
    }

    // ── Car spawning ─────────────────────────────────────────

    function spawnCars(world, count) {
        const lanes = world.carLanes;
        if (!lanes.length) return;

        for (let i = 0; i < count; i++) {
            const lane = lanes[i % lanes.length];
            const WS   = C.WORLD_SIZE;
            const spd  = C.CAR_SPEED_MIN + Math.random() * (C.CAR_SPEED_MAX - C.CAR_SPEED_MIN);
            const colorIdx = Math.floor(Math.random() * C.COLOR.CAR.length);

            if (lane.axis === 'h') {
                const startX = Math.random() * WS;
                cars.push({
                    axis: 'h',
                    x: startX,
                    y: lane.y,
                    spd: spd * lane.dir,
                    w:   C.CAR_W,
                    h:   C.CAR_H,
                    colorIdx
                });
            } else {
                const startY = Math.random() * WS;
                cars.push({
                    axis: 'v',
                    x: lane.x,
                    y: startY,
                    spd: spd * lane.dir,
                    w:   C.CAR_H,   // rotated: thinner dimension along x
                    h:   C.CAR_W,
                    colorIdx
                });
            }
        }
    }

    // ── Police spawning ──────────────────────────────────────

    function spawnPolice(world, count) {
        for (let i = 0; i < count; i++) {
            const pt = world.getRandomSpawnPoint();
            if (!pt) continue;
            police.push({
                x:     pt.x,
                y:     pt.y,
                vx:    0,
                vy:    0,
                state: 'patrol',    // 'patrol' | 'chase' | 'search'
                patrolAngle: Math.random() * Math.PI * 2,
                patrolTimer: 0,
                searchTimer: 0,
                lastSeenX:   0,
                lastSeenY:   0,
                alertFlash:  0,
            });
        }
    }

    // ══════════════════════════════════════════════════════════
    //  Update
    // ══════════════════════════════════════════════════════════

    function update(dt, drone, world) {
        updateCars(dt, drone);
        updatePolice(dt, drone, world);
        updateJobs(dt, drone, world);
    }

    // ── Cars ─────────────────────────────────────────────────

    function updateCars(dt, drone) {
        const WS = C.WORLD_SIZE;
        const DR = C.DRONE_RADIUS + 10;

        for (const car of cars) {
            if (car.axis === 'h') {
                car.x += car.spd;
                if (car.x >  WS + 50) car.x = -50;
                if (car.x < -50)      car.x =  WS + 50;
            } else {
                car.y += car.spd;
                if (car.y >  WS + 50) car.y = -50;
                if (car.y < -50)      car.y =  WS + 50;
            }

            // Collision with drone
            const hw = car.w / 2 + DR;
            const hh = car.h / 2 + DR;
            if (Math.abs(drone.x - car.x) < hw &&
                Math.abs(drone.y - car.y) < hh) {
                if (drone.takeDamage()) {
                    NeonDelivery.Game.triggerGameOver();
                }
            }
        }
    }

    // ── Police AI ────────────────────────────────────────────

    function updatePolice(dt, drone, world) {
        const DR = C.DRONE_RADIUS + C.POLICE_RADIUS;

        for (const p of police) {
            const dx = drone.x - p.x;
            const dy = drone.y - p.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (p.alertFlash > 0) p.alertFlash -= dt;

            switch (p.state) {
                case 'patrol': {
                    // Circle patrol
                    p.patrolTimer += dt;
                    const orbitR = 80 + Math.sin(p.patrolTimer * 0.001) * 40;
                    const targetX = p.lastSeenX + Math.cos(p.patrolAngle) * orbitR;
                    const targetY = p.lastSeenY + Math.sin(p.patrolAngle) * orbitR;
                    if (p.lastSeenX === 0 && p.lastSeenY === 0) {
                        p.lastSeenX = p.x;
                        p.lastSeenY = p.y;
                    }
                    steerTowards(p, targetX, targetY, C.POLICE_SPEED * 0.5);
                    p.patrolAngle += 0.008;

                    if (dist < C.POLICE_DETECT_RANGE) {
                        p.state = 'chase';
                        p.alertFlash = 500;
                        NeonDelivery.Audio.warning();
                    }
                    break;
                }
                case 'chase': {
                    steerTowards(p, drone.x, drone.y, C.POLICE_SPEED);
                    p.lastSeenX = drone.x;
                    p.lastSeenY = drone.y;

                    if (dist > C.POLICE_LOSE_RANGE) {
                        p.state = 'search';
                        p.searchTimer = 4000;
                    }
                    // Catch
                    if (dist < DR) {
                        if (drone.takeDamage()) {
                            NeonDelivery.Game.triggerGameOver();
                        } else {
                            p.state = 'search';
                            p.searchTimer = 3000;
                        }
                    }
                    break;
                }
                case 'search': {
                    p.searchTimer -= dt;
                    steerTowards(p, p.lastSeenX, p.lastSeenY, C.POLICE_SPEED * 0.65);
                    if (dist < C.POLICE_DETECT_RANGE) {
                        p.state = 'chase';
                        p.alertFlash = 300;
                    }
                    if (p.searchTimer <= 0) {
                        p.state = 'patrol';
                        p.patrolTimer = 0;
                    }
                    break;
                }
            }
        }
    }

    function steerTowards(agent, tx, ty, speed) {
        const dx = tx - agent.x;
        const dy = ty - agent.y;
        const dist = Math.sqrt(dx*dx+dy*dy) || 1;
        agent.vx = (dx/dist) * speed;
        agent.vy = (dy/dist) * speed;
        agent.x += agent.vx;
        agent.y += agent.vy;
    }

    // ── Job interactions ─────────────────────────────────────

    function updateJobs(dt, drone, world) {
        const PICKUP_R   = 28;
        const DELIVER_R  = 36;
        const MAGNET_R   = drone.magnetRange || 0;

        for (const job of jobs) {
            if (job.state === 'delivered' || job.state === 'failed') continue;

            if (job.state === 'available') {
                const dpx = drone.x - job.pkg.x;
                const dpy = drone.y - job.pkg.y;
                const d   = Math.sqrt(dpx*dpx + dpy*dpy);
                const r   = MAGNET_R > 0 ? Math.max(PICKUP_R, MAGNET_R) : PICKUP_R;

                if (d < r && drone.carrying.length < drone.maxCarry) {
                    drone.pickupJob(job);
                    job.state = 'carrying';
                }
            }

            if (job.state === 'carrying') {
                // Count down express timer
                if (job.timeLimit !== null) {
                    job.expressTimer -= dt;
                    if (job.expressTimer <= 0) {
                        // Express failed
                        drone.dropPackage(job);
                        job.state = 'failed';
                        NeonDelivery.Audio.explosion();
                        NeonDelivery.Particles.emit('explosion', job.delivery.x, job.delivery.y, 10);
                        continue;
                    }
                }

                const ddx = drone.x - job.delivery.x;
                const ddy = drone.y - job.delivery.y;
                const d   = Math.sqrt(ddx*ddx + ddy*ddy);

                if (d < DELIVER_R) {
                    // Successful delivery
                    drone.deliverJob(job);
                    job.state = 'delivered';
                    deliveriesCompleted++;
                    NeonDelivery.Audio.coin();
                    NeonDelivery.Particles.emit('coin', drone.x, drone.y, 5);

                    // Notify game of delivery for scoring
                    NeonDelivery.Game.onDelivery(job);

                    // Respawn a new job after short delay
                    const w = world;
                    setTimeout(() => {
                        if (NeonDelivery.Game.getState() === C.GameState.PLAYING) {
                            spawnJob(w, randomJobType());
                        }
                    }, 1500);
                }
            }
        }

        // Clean up old delivered/failed jobs (keep array manageable)
        while (jobs.filter(j => j.state === 'delivered' || j.state === 'failed').length > 5) {
            const idx = jobs.findIndex(j => j.state === 'delivered' || j.state === 'failed');
            if (idx !== -1) jobs.splice(idx, 1);
        }
    }

    function randomJobType() {
        const r = Math.random();
        if (r < 0.55) return JT.STANDARD;
        if (r < 0.82) return JT.EXPRESS;
        return JT.VIP;
    }

    // ── Public ───────────────────────────────────────────────
    return {
        init, update,
        get jobs()                  { return jobs;                  },
        get cars()                  { return cars;                  },
        get police()                { return police;                },
        get deliveriesCompleted()   { return deliveriesCompleted;   },
        get deliveriesRequired()    { return deliveriesRequired;    },
    };
})();
