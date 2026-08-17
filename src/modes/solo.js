// ============================================================
//  NEON DELIVERY — solo.js
//  Game loop, state machine, scoring, and orchestration for solo.
// ============================================================
NeonDelivery.Solo = (function () {
    const C  = NeonDelivery.Config;
    const GS = C.GameState;

    // ── State ────────────────────────────────────────────────
    let state        = GS.MENU;
    let level        = 1;
    let score        = 0;
    let sessionCoins = 0;
    let combo        = 1;
    let maxCombo     = 1;
    let levelTimer   = 60000;   // ms remaining
    let deliveriesThisLevel = 0;
    let saveData     = null;

    // ── Last frame time ──────────────────────────────────────
    let lastTime    = 0;
    let rafId       = null;
    let timerWarned = false;

    function initMode(sd) {
        saveData = sd;
        state = GS.MENU;
    }

    // ══════════════════════════════════════════════════════════
    //  Game flow
    // ══════════════════════════════════════════════════════════
    function startGame(lvl) {
        // Immediately dismiss any active overlay
        NeonDelivery.UI.hideAll();
        document.body.classList.add('solo-mode');
        document.body.classList.remove('mp-mode');

        level        = lvl;
        score        = 0;
        sessionCoins = 0;
        combo        = 1;
        maxCombo     = 1;
        timerWarned  = false;
        deliveriesThisLevel = 0;

        const lcfg = C.getLevelConfig(level);
        levelTimer = lcfg.timer * 1000;

        // Generate world
        const worldData = NeonDelivery.World.generate(level);
        NeonDelivery.Renderer.prerenderWorld(NeonDelivery.World);

        // Pick drone start on a road spawn point
        const start = NeonDelivery.World.getRandomSpawnPoint() ||
                      { x: C.WORLD_SIZE/2, y: C.WORLD_SIZE/2 };

        NeonDelivery.Drone.init(start.x, start.y, saveData.ownedUpgrades);
        NeonDelivery.Camera.init(start.x, start.y);
        NeonDelivery.Particles.clear();
        NeonDelivery.Entities.init(NeonDelivery.World, lcfg);
        NeonDelivery.Events.init(level);

        setState(GS.PLAYING);
        NeonDelivery.UI.hidePause();
        
        if (!rafId) {
            startLoop();
        }
    }

    // ── State machine ────────────────────────────────────────
    function setState(newState) {
        state = newState;
        if (newState === GS.PAUSED) {
            NeonDelivery.UI.showPause();
        } else {
            NeonDelivery.UI.hidePause();
        }
    }

    function getState() { return state; }

    // ══════════════════════════════════════════════════════════
    //  Game loop
    // ══════════════════════════════════════════════════════════
    function startLoop() {
        lastTime = performance.now();
        rafId    = requestAnimationFrame(loop);
    }

    function stopLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
    }

    function loop(now) {
        rafId = requestAnimationFrame(loop);
        const rawDt = now - lastTime;
        lastTime    = now;
        // Cap dt to avoid huge jumps after tab blur
        const dt = Math.min(rawDt, 50);

        try {
            update(dt);
            render(dt);
        } catch (err) {
            console.error('[NeonDelivery] frame error:', err);
        }
    }

    // ── Update ───────────────────────────────────────────────
    function update(dt) {
        // Pause toggle (always check)
        if (state === GS.PLAYING && NeonDelivery.Input.isPause()) {
            setState(GS.PAUSED);
            return;
        }
        if (state === GS.PAUSED && NeonDelivery.Input.isPause()) {
            setState(GS.PLAYING);
            return;
        }

        if (state !== GS.PLAYING) return;

        // Level timer
        levelTimer -= dt;

        // 10-second warning
        if (!timerWarned && levelTimer <= 10000) {
            timerWarned = true;
            NeonDelivery.Audio.warning();
        }

        if (levelTimer <= 0) {
            triggerGameOver();
            return;
        }

        // Subsystems
        const eventState = NeonDelivery.Events.getState();
        NeonDelivery.Drone.update(dt, NeonDelivery.Input, NeonDelivery.World, eventState, NeonDelivery.Camera);
        NeonDelivery.Camera.update(NeonDelivery.Drone.x, NeonDelivery.Drone.y, dt);
        NeonDelivery.Entities.update(dt, NeonDelivery.Drone, NeonDelivery.World);
        NeonDelivery.Particles.update(dt);
        NeonDelivery.Events.update(dt);

        // Check level completion
        if (NeonDelivery.Entities.deliveriesCompleted >= NeonDelivery.Entities.deliveriesRequired) {
            onLevelComplete();
        }

        // Update HUD
        NeonDelivery.UI.updateHUD(score, combo, levelTimer, level);
    }

    // ── Render ───────────────────────────────────────────────
    function render(dt) {
        NeonDelivery.Renderer.render(dt, {
            world:      NeonDelivery.World,
            drone:      NeonDelivery.Drone,
            entities:   NeonDelivery.Entities,
            camera:     NeonDelivery.Camera,
            eventState: NeonDelivery.Events.getState(),
            gameState:  state,
            uiData:     NeonDelivery.UI.hudData
        });
    }

    // ══════════════════════════════════════════════════════════
    //  Delivery / scoring
    // ══════════════════════════════════════════════════════════
    function onDelivery(job) {
        deliveriesThisLevel++;

        const secsLeft  = levelTimer / 1000;
        const timeBonus = Math.round(secsLeft * C.SCORE_TIME_BONUS);

        const cleanBonus = NeonDelivery.Drone.cleanRun ? C.SCORE_CLEAN_BONUS : 0;
        NeonDelivery.Drone.resetCleanRun && NeonDelivery.Drone.resetCleanRun();

        const typeMultiplier =
            job.type === C.JOB_TYPE.VIP     ? C.VIP_MULTIPLIER :
            job.type === C.JOB_TYPE.EXPRESS  ? C.EXPRESS_MULTIPLIER : 1;

        combo = Math.min(combo + 1, C.MAX_COMBO);
        if (combo > maxCombo) maxCombo = combo;

        if (combo === C.MAX_COMBO) {
            NeonDelivery.Audio.overdrive();
            NeonDelivery.UI.flashOverdrive();
        } else {
            NeonDelivery.Audio.comboUp();
        }

        const delivery = (C.SCORE_BASE + timeBonus + cleanBonus) * typeMultiplier * combo;
        score        += delivery;
        sessionCoins += Math.round(job.baseCoins * combo * 0.5);

        levelTimer +=5000;

        if (NeonDelivery.Drone.extraDeliveryTime > 0) {
            levelTimer += NeonDelivery.Drone.extraDeliveryTime * 1000;
        }

        NeonDelivery.Particles.emit('coin', NeonDelivery.Drone.x, NeonDelivery.Drone.y, 3);
        timerWarned = false; 
    }

    // ── Level complete ───────────────────────────────────────
    function onLevelComplete() {
        setState(GS.LEVEL_COMPLETE);

        const coinsEarned = sessionCoins;
        saveData.totalCoins += coinsEarned;
        if (score > saveData.highScore) saveData.highScore = Math.round(score);
        if (level > saveData.bestLevel)  saveData.bestLevel  = level;
        NeonDelivery.Storage.save(saveData);

        NeonDelivery.UI.showLevelComplete({
            level,
            deliveries: NeonDelivery.Entities.deliveriesCompleted,
            score:      Math.round(score),
            coins:      coinsEarned
        });
    }

    // ── Game over ────────────────────────────────────────────
    function triggerGameOver() {
        if (state === GS.GAMEOVER) return;
        setState(GS.GAMEOVER);

        if (score > saveData.highScore) saveData.highScore = Math.round(score);
        NeonDelivery.Storage.save(saveData);

        NeonDelivery.Particles.emit('explosion', NeonDelivery.Drone.x, NeonDelivery.Drone.y, 24);

        NeonDelivery.UI.showGameOver({
            score:    Math.round(score),
            highScore: saveData.highScore,
            level,
            maxCombo
        });
    }

    function onCollision() {
        combo = 1;
    }
    
    function quitToMenu() {
        stopLoop();
        NeonDelivery.UI.showMenu(saveData);
    }

    return { 
        initMode, startGame, setState, getState, 
        onDelivery, triggerGameOver, onCollision, quitToMenu, stopLoop,
        get level() { return level; }
    };
})();
