NeonDelivery.Multiplayer = (function() {
    const Gameplay = NeonDelivery.Gameplay;
    const Physics = Gameplay.PHYSICS;
    const Net = Gameplay.NET;

    // 8 distinct neon player colors (index 0 reserved for self = cyan)
    const PLAYER_COLORS = [
        '#00f5ff', // self — neon cyan
        '#ff3366', // hot pink
        '#ff9f1c', // neon orange
        '#39ff14', // neon green
        '#bf00ff', // electric violet
        '#ffff00', // electric yellow
        '#ff6ec7', // hot magenta
        '#00bfff'  // deep sky blue
    ];
    let colorIndex = 1; // cycles for remote players

    let currentRoomState = null;
    let isReady = false;
    let rafId = null;
    let lastTime = 0;
    let displayMatchTimer = 0;
    let scoreboardTop = [];

    // Kill feed: array of { text, life, maxLife }
    const killFeedEntries = [];

    // Respawn flashes: { x, y, life, maxLife }
    const spawnFlashes = [];

    // Hit vignette: flash amount 0-1
    let hitVignetteAmt = 0;

    const playerVisuals = new Map();
    const visualList = [];
    const emptyEntities = { jobs: [], cars: [], police: [] };
    const hiddenDrone = { x: -1000, y: -1000, angle: 0, visible: false };
    const renderData = {
        world: null,
        drone: hiddenDrone,
        entities: emptyEntities,
        camera: null,
        eventState: null,
        gameState: 'playing',
        uiData: null,
        players: visualList
    };

    const inputState = { dx: 0, dy: 0, boost: false, shoot: false, shootHeld: false, fireSeq: 0 };
    const lastSentInput = { dx: 99, dy: 99, boost: false, shoot: false, shootHeld: false, fireSeq: -1 };
    let lastInputSendAt = 0;
    let localBoostActive = false;
    let localBoostTimer = 0;
    let localBoostCoolTimer = 0;

    function rebuildVisualList() {
        visualList.length = 0;
        for (const v of playerVisuals.values()) visualList.push(v);
    }

    function onRoomStateUpdate(state) {
        const wasLobby = !currentRoomState || currentRoomState.state === 'lobby';
        currentRoomState = state;
        displayMatchTimer = state.matchTimer || 0;

        const localId = NeonDelivery.Network.localId;
        const isHost = state.hostId === localId;
        let listChanged = false;

        if (state.players) {
            const activeIds = new Set();
            for (const p of state.players) {
                activeIds.add(p.id);
                const isLocal = p.id === localId;
                let v = playerVisuals.get(p.id);
                if (!v) {
                    // Assign a persistent neon color
                    const assignedColor = isLocal ? PLAYER_COLORS[0] : PLAYER_COLORS[colorIndex++ % PLAYER_COLORS.length] || '#ff3366';
                    v = {
                        id: p.id,
                        x: p.x,
                        y: p.y,
                        renderX: p.x,
                        renderY: p.y,
                        renderAngle: p.angle,
                        targetX: p.x,
                        targetY: p.y,
                        targetAngle: p.angle,
                        vx: p.vx || 0,
                        vy: p.vy || 0,
                        health: p.health,
                        alive: p.alive,
                        username: p.username,
                        kills: p.kills,
                        boosting: p.boosting,
                        hitFlash: p.hitFlash || 0,
                        shootCooldown: p.shootCooldown || 0,
                        power: p.power,
                        shieldTimer: p.shieldTimer || 0,
                        maceTimer: p.maceTimer || 0,
                        spawnProtection: p.spawnProtection || 0,
                        respawnTimer: p.respawnTimer || 0,
                        color: assignedColor
                    };
                    playerVisuals.set(p.id, v);
                    listChanged = true;
                } else {
                    // Detect power pickup (null → something)
                    if (isLocal && !v.power && p.power) {
                        if (NeonDelivery.Audio && NeonDelivery.Audio.powerPickup) NeonDelivery.Audio.powerPickup();
                        NeonDelivery.Particles.emit('pickup', v.renderX, v.renderY, 10);
                    }
                    // Detect respawn (dead → alive) — spawn flash ring
                    if (!v.alive && p.alive) {
                        spawnFlashes.push({ x: p.x, y: p.y, life: 500, maxLife: 500 });
                    }
                    // Detect hit on local player → vignette
                    if (isLocal && p.hitFlash > 0 && v.hitFlash <= 0) {
                        hitVignetteAmt = 1.0;
                    }

                    v.targetX = p.x;
                    v.targetY = p.y;
                    v.targetAngle = p.angle;
                    
                    if (!isLocal) {
                        v.vx = p.vx || 0;
                        v.vy = p.vy || 0;
                    } else {
                        // For local player, only accept server velocity if we're hugely desynced (e.g. wall collision/knockback).
                        // This prevents the 66ms-old server snapshot from stuttering/locking our local steering.
                        const distErr = Math.hypot(p.x - v.renderX, p.y - v.renderY);
                        if (distErr > 120) {
                            v.vx = p.vx || 0;
                            v.vy = p.vy || 0;
                        }
                    }
                    
                    v.health = p.health;
                    v.alive = p.alive;
                    v.username = p.username;
                    v.kills = p.kills;
                    if (p.id !== localId) v.boosting = p.boosting;
                    v.hitFlash = p.hitFlash || 0;
                    v.shootCooldown = p.shootCooldown || 0;
                    v.power = p.power;
                    v.shieldTimer = p.shieldTimer || 0;
                    v.maceTimer = p.maceTimer || 0;
                    v.spawnProtection = p.spawnProtection || 0;
                    v.respawnTimer = p.respawnTimer || 0;
                }
            }

            for (const id of Array.from(playerVisuals.keys())) {
                if (!activeIds.has(id)) {
                    playerVisuals.delete(id);
                    listChanged = true;
                }
            }

            scoreboardTop = state.players
                .slice()
                .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
                .slice(0, 3);
        }

        if (listChanged) rebuildVisualList();

        if (state.state === 'lobby') {
            NeonDelivery.UI.showLobby(state, isHost, localId);
        } else if (state.state === 'playing') {
            if (wasLobby) bootstrapGame(state.mapConfig);
        } else if (state.state === 'ended') {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            NeonDelivery.UI.showMpResults(state.rankings || []);
        }
    }

    function onKillFeed(data) {
        if (!data || !data.killerName || !data.victimName) return;
        killFeedEntries.unshift({
            text: `${data.killerName} ⚡ ${data.victimName}`,
            life: 5000,
            maxLife: 5000
        });
        // Keep only 5 entries
        if (killFeedEntries.length > 5) killFeedEntries.length = 5;
    }

    function bootstrapGame(mapConfig) {
        NeonDelivery.UI.hideAll();
        document.body.classList.add('mp-mode');
        document.body.classList.remove('solo-mode');

        const safeMapConfig = mapConfig || {
            worldTiles: NeonDelivery.Config.WORLD_TILES,
            roadCenters: NeonDelivery.Config.ROAD_CENTERS,
            roadHalfTiles: NeonDelivery.Config.ROAD_HALF_TILES,
            disableAlleys: true
        };
        NeonDelivery.World.generate(1, safeMapConfig);
        NeonDelivery.Renderer.prerenderWorld(NeonDelivery.World);
        NeonDelivery.Particles.clear();

        const localId = NeonDelivery.Network.localId;
        const me = playerVisuals.get(localId);
        const startX = me ? me.renderX : NeonDelivery.World.worldSize / 2;
        const startY = me ? me.renderY : NeonDelivery.World.worldSize / 2;
        NeonDelivery.Camera.init(startX, startY);

        renderData.world = NeonDelivery.World;
        renderData.camera = NeonDelivery.Camera;
        lastTime = performance.now();
        lastInputSendAt = 0;
        localBoostActive = false;
        localBoostTimer = 0;
        localBoostCoolTimer = 0;

        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(loop);
    }

    function loop(now) {
        rafId = requestAnimationFrame(loop);
        const dt = Math.min(now - lastTime, 50);
        lastTime = now;

        try {
            update(dt, now);
            render(dt);
        } catch (err) {
            console.error('[Multiplayer] frame error:', err);
        }
    }

    function inputChanged() {
        return Math.abs(inputState.dx - lastSentInput.dx) > 0.02 ||
               Math.abs(inputState.dy - lastSentInput.dy) > 0.02 ||
               inputState.boost !== lastSentInput.boost ||
               inputState.shootHeld !== lastSentInput.shootHeld ||
               inputState.fireSeq !== lastSentInput.fireSeq;
    }

    function sendInputIfNeeded(now) {
        const minInterval = 1000 / Net.INPUT_HZ;
        const edgeChanged = inputState.boost !== lastSentInput.boost ||
                            inputState.shootHeld !== lastSentInput.shootHeld ||
                            inputState.fireSeq !== lastSentInput.fireSeq;
        const changed = inputChanged();
        const due = now - lastInputSendAt >= minInterval;
        const keepalive = now - lastInputSendAt >= Net.INPUT_KEEPALIVE_MS;

        if (!edgeChanged && !(due && changed) && !keepalive) return;

        NeonDelivery.Network.sendInputs(inputState);
        lastSentInput.dx = inputState.dx;
        lastSentInput.dy = inputState.dy;
        lastSentInput.boost = inputState.boost;
        lastSentInput.shootHeld = inputState.shootHeld;
        lastSentInput.fireSeq = inputState.fireSeq;
        lastInputSendAt = now;
    }

    function update(dt, now) {
        if (!currentRoomState) return;
        if (displayMatchTimer > 0) displayMatchTimer = Math.max(0, displayMatchTimer - dt);

        const localId = NeonDelivery.Network.localId;
        const move = NeonDelivery.Input.getMove();
        inputState.dx = Math.round(move.dx * 100) / 100;
        inputState.dy = Math.round(move.dy * 100) / 100;
        inputState.boost = NeonDelivery.Input.isBoost();
        inputState.shootHeld = NeonDelivery.Input.isShoot();
        inputState.fireSeq = NeonDelivery.Input.getFireSeq();
        inputState.shoot = inputState.shootHeld;
        sendInputIfNeeded(now);

        // Manage local boost timers for 0ms immediate nitro response
        if (inputState.boost && !localBoostActive && localBoostCoolTimer <= 0) {
            localBoostActive = true;
            localBoostTimer = Physics.BOOST_DURATION;
            localBoostCoolTimer = Physics.BOOST_COOLDOWN;
        }
        if (localBoostActive) {
            localBoostTimer -= dt;
            if (localBoostTimer <= 0) {
                localBoostActive = false;
                localBoostTimer = 0;
            }
        }
        if (localBoostCoolTimer > 0) localBoostCoolTimer -= dt;

        for (const v of visualList) {
            if (v.id === localId) {
                v.boosting = localBoostActive;
                v.x = v.renderX;
                v.y = v.renderY;
                v.angle = v.renderAngle;

                // Shared movement kernel execution (0ms latency, exact physics sync)
                Gameplay.stepVehicle(v, inputState, dt, NeonDelivery.World, Physics);

                v.renderX = v.x;
                v.renderY = v.y;
                v.renderAngle = v.angle;

                const spd = Math.hypot(v.vx, v.vy);
                const distErr = Math.hypot(v.targetX - v.renderX, v.targetY - v.renderY);
                if (distErr > 350 || !v.alive) {
                    v.renderX = v.x = v.targetX;
                    v.renderY = v.y = v.targetY;
                    v.renderAngle = v.angle = v.targetAngle;
                    v.vx = 0;
                    v.vy = 0;
                } else if (spd < 0.3 && !inputState.dx && !inputState.dy && !localBoostActive && distErr > 2) {
                    v.renderX += (v.targetX - v.renderX) * 0.15;
                    v.renderY += (v.targetY - v.renderY) * 0.15;
                    v.x = v.renderX;
                    v.y = v.renderY;
                }
            } else {
                // Remote Player Dead-Reckoning + Interpolation Smoothing
                const stepFrac = Math.min(2, dt / 16.67);
                
                // Advance the *true* target position based on server velocity
                v.targetX += (v.vx || 0) * stepFrac;
                v.targetY += (v.vy || 0) * stepFrac;

                // Lerp visual position towards the moving target
                const lerpFactor = Math.min(1, dt * 0.06);
                v.renderX += (v.targetX - v.renderX) * lerpFactor;
                v.renderY += (v.targetY - v.renderY) * lerpFactor;
                v.renderAngle += Gameplay.angleDiff(v.targetAngle, v.renderAngle) * Math.min(1, lerpFactor * 1.5);
                v.x = v.renderX;
                v.y = v.renderY;
                v.angle = v.renderAngle;
            }
        }

        const me = playerVisuals.get(localId);
        if (me) {
            NeonDelivery.Camera.update(me.renderX, me.renderY, dt);
            if (me.hitWall && Math.random() < 0.2) {
                NeonDelivery.Particles.emit('shatter', me.renderX, me.renderY, 4);
            }
        }

        NeonDelivery.Particles.update(dt);
        if (NeonDelivery.CombatVisuals) NeonDelivery.CombatVisuals.update(dt);

        // Tick hit vignette
        if (hitVignetteAmt > 0) hitVignetteAmt = Math.max(0, hitVignetteAmt - dt * 0.004);

        // Tick kill feed entries
        for (let i = killFeedEntries.length - 1; i >= 0; i--) {
            killFeedEntries[i].life -= dt;
            if (killFeedEntries[i].life <= 0) killFeedEntries.splice(i, 1);
        }

        // Tick spawn flashes
        for (let i = spawnFlashes.length - 1; i >= 0; i--) {
            spawnFlashes[i].life -= dt;
            if (spawnFlashes[i].life <= 0) spawnFlashes.splice(i, 1);
        }
    }

    function render(dt) {
        if (!currentRoomState) return;

        const localId = NeonDelivery.Network.localId;
        NeonDelivery.Renderer.render(dt, renderData);

        const canvas = document.getElementById('game-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const CW = canvas.width;
        const CH = canvas.height;

        // Apply screen shake
        const shake = NeonDelivery.CombatVisuals ? NeonDelivery.CombatVisuals.getScreenShake() : { x: 0, y: 0 };
        ctx.save();
        if (shake.x || shake.y) {
            ctx.translate(shake.x, shake.y);
        }

        // Render ground hazards, timed effects, moving rockets, and tracers
        if (NeonDelivery.CombatVisuals) {
            NeonDelivery.CombatVisuals.renderWorld(
                ctx,
                NeonDelivery.Camera,
                currentRoomState.hazards,
                currentRoomState.timedEffects,
                currentRoomState.projectiles,
                localId
            );
        }

        // Render spawn flash rings
        const now = performance.now();
        for (const sf of spawnFlashes) {
            const s = NeonDelivery.Camera.worldToScreen(sf.x, sf.y);
            const frac = 1 - sf.life / sf.maxLife;
            const r = 18 + frac * 55;
            const alpha = 1 - frac;
            ctx.save();
            ctx.strokeStyle = `rgba(0,255,136,${alpha})`;
            ctx.shadowColor = '#00ff88';
            ctx.shadowBlur = 20 * alpha;
            ctx.lineWidth = 3 * (1 - frac * 0.7);
            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Render mystery power crates, health, overdrive
        const pulse = 0.82 + 0.18 * Math.sin(now * 0.005);
        if (currentRoomState.powerups) {
            for (const pu of currentRoomState.powerups) {
                const s = NeonDelivery.Camera.worldToScreen(pu.x, pu.y);
                if (s.x < -30 || s.x > CW + 30 || s.y < -30 || s.y > CH + 30) continue;

                ctx.save();
                ctx.translate(s.x, s.y);
                ctx.scale(pulse, pulse);

                if (pu.type === 'health') {
                    ctx.fillStyle = '#00ff88';
                    ctx.shadowColor = '#00ff88';
                    ctx.shadowBlur = 12;
                    ctx.fillRect(-8, -2, 16, 4);
                    ctx.fillRect(-2, -8, 4, 16);
                } else if (pu.type === 'overdrive') {
                    ctx.fillStyle = '#ffcc00';
                    ctx.shadowColor = '#ffcc00';
                    ctx.shadowBlur = 12;
                    ctx.font = 'bold 16px Orbitron';
                    ctx.textAlign = 'center';
                    ctx.fillText('⚡', 0, 6);
                } else {
                    // Mystery Power Crate — glowing spinning border
                    const rot = (now * 0.002) % (Math.PI * 2);
                    ctx.rotate(rot * 0.5);
                    ctx.fillStyle = '#7d5cff';
                    ctx.shadowColor = '#b26cff';
                    ctx.shadowBlur = 16;
                    ctx.fillRect(-10, -10, 20, 20);
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(-10, -10, 20, 20);
                    ctx.rotate(-(rot * 0.5));
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 14px Orbitron';
                    ctx.textAlign = 'center';
                    ctx.fillText('?', 0, 6);
                }
                ctx.restore();
            }
        }

        // Render cars & car attachments (shield/halo)
        for (const p of visualList) {
            if (!p.alive) continue;
            const s = NeonDelivery.Camera.worldToScreen(p.renderX, p.renderY);
            if (s.x < -90 || s.x > CW + 90 || s.y < -90 || s.y > CH + 90) continue;

            const isMe = p.id === localId;
            const carColor = p.color || (isMe ? '#00f5ff' : '#ff3366');
            NeonDelivery.Renderer.drawCar(ctx, NeonDelivery.Camera, {
                x: p.renderX,
                y: p.renderY,
                angle: p.renderAngle,
                color: carColor,
                colorIdx: isMe ? 0 : 2,
                boosting: p.boosting
            });

            ctx.save();
            ctx.translate(s.x, s.y);

            // Car-attached visuals (shield & halo)
            if (NeonDelivery.CombatVisuals) {
                NeonDelivery.CombatVisuals.renderCarEffects(ctx, s, p);
            }

            if (p.spawnProtection > 0) {
                ctx.strokeStyle = '#00ff88';
                ctx.shadowColor = '#00ff88';
                ctx.shadowBlur = 10;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, 22, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(-16, -30, 32, 4);
            ctx.fillStyle = p.health > 50 ? '#00ff88' : (p.health > 25 ? '#ffcc00' : '#ff3366');
            ctx.fillRect(-16, -30, 32 * (Math.max(0, p.health) / 100), 4);

            // Power icon above car (visible for all players)
            let powerIcon = null;
            if (p.shieldTimer > 0) powerIcon = '🛡️';
            else if (p.maceTimer > 0) powerIcon = '⚙️';
            else if (p.power) {
                const def = Gameplay.POWERS[p.power.type];
                powerIcon = def ? def.icon : '⚡';
            }
            if (powerIcon) {
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(powerIcon, 0, -48);
            }

            ctx.font = 'bold 10px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillStyle = isMe ? '#00f5ff' : carColor;
            ctx.fillText(p.username || 'Player', 0, -35);
            ctx.restore();
        }

        ctx.restore(); // Undo screen shake

        // Hit vignette (red border flash when local player takes damage)
        if (hitVignetteAmt > 0.01) {
            const gradient = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.3, CW / 2, CH / 2, Math.max(CW, CH) * 0.75);
            gradient.addColorStop(0, 'rgba(255,0,0,0)');
            gradient.addColorStop(1, `rgba(255,0,0,${hitVignetteAmt * 0.55})`);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, CW, CH);
        }

        // Render HUD toasts
        if (NeonDelivery.CombatVisuals) {
            NeonDelivery.CombatVisuals.renderHUDToasts(ctx, CW, CH);
        }

        drawCombatHud(ctx, CW, CH, localId);
    }

    function drawCombatHud(ctx, CW, CH, localId) {
        const topY = 12;
        ctx.fillStyle = 'rgba(2,8,16,0.85)';
        ctx.fillRect(0, 0, CW, 48);
        ctx.strokeStyle = 'rgba(0,245,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(0, 48); ctx.lineTo(CW, 48); ctx.stroke();

        ctx.font = 'bold 16px Orbitron';
        ctx.fillStyle = '#00f5ff';
        ctx.textAlign = 'left';
        ctx.fillText('ARENA MATCH', 14, 24 + topY);

        // Kill feed (below header bar, top-left)
        if (killFeedEntries.length > 0) {
            ctx.font = 'bold 11px Rajdhani';
            ctx.textAlign = 'left';
            let ky = 62;
            for (const kf of killFeedEntries) {
                const alpha = Math.min(1, kf.life / 800);
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = 'rgba(2,8,16,0.7)';
                const tw = ctx.measureText(kf.text).width;
                ctx.fillRect(10, ky - 12, tw + 10, 16);
                ctx.fillStyle = '#ffe600';
                ctx.shadowColor = '#ff9f1c';
                ctx.shadowBlur = 6;
                ctx.fillText(kf.text, 14, ky);
                ctx.restore();
                ky += 19;
            }
        }

        ctx.textAlign = 'right';
        ctx.font = 'bold 12px Rajdhani';
        let yy = 20 + topY;
        for (const sp of scoreboardTop) {
            ctx.fillStyle = sp.id === localId ? '#00f5ff' : '#ff3366';
            ctx.fillText(`${sp.username} · ${sp.kills} K`, CW - 14, yy);
            yy += 15;
        }

        const totalSecs = Math.max(0, Math.ceil(displayMatchTimer / 1000));
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        ctx.textAlign = 'center';
        ctx.font = 'bold 18px Orbitron';
        ctx.fillStyle = totalSecs <= 30 ? '#ff3366' : '#ffcc00';
        ctx.fillText(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, CW / 2, 24 + topY);

        const me = playerVisuals.get(localId);
        if (!me) return;

        if (!me.alive) {
            ctx.font = 'bold 18px Orbitron';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(`RESPAWN ${Math.max(1, Math.ceil((me.respawnTimer || 0) / 1000))}`, CW / 2, CH - 42);
            return;
        }

        const barW = Math.min(240, CW * 0.35);
        const barH = 10;
        const bx = CW / 2 - barW / 2;
        const by = CH - 48;

        ctx.fillStyle = 'rgba(2,8,16,0.75)';
        ctx.fillRect(bx - 2, by - 2, barW + 4, 16);
        ctx.fillStyle = 'rgba(255,51,102,0.2)';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = '#ff3366';
        ctx.fillRect(bx, by, barW * (Math.max(0, me.health) / 100), barH);

        ctx.font = 'bold 12px Rajdhani';
        ctx.textAlign = 'center';

        if (me.shieldTimer > 0) {
            ctx.fillStyle = '#c77dff';
            ctx.shadowColor = '#9d4edd';
            ctx.shadowBlur = 10;
            ctx.fillText(`🛡️ PHASE SHIELD ACTIVE ${(me.shieldTimer / 1000).toFixed(1)}s`, CW / 2, by - 8);
            ctx.shadowBlur = 0;
        } else if (me.maceTimer > 0) {
            ctx.fillStyle = '#ff9f1c';
            ctx.shadowColor = '#ff6a00';
            ctx.shadowBlur = 10;
            ctx.fillText(`⚙️ WRECKING HALO ACTIVE ${(me.maceTimer / 1000).toFixed(1)}s`, CW / 2, by - 8);
            ctx.shadowBlur = 0;
        } else if (me.power) {
            const def = Gameplay.POWERS[me.power.type];
            const label = def ? def.label : me.power.type.toUpperCase();
            const icon = (def && def.icon) || '⚡';
            const triggerHint = def && def.trigger === 'hold' ? 'HOLD SHOOT' : 'PRESS SHOOT';
            ctx.fillStyle = '#00ffcc';
            ctx.shadowColor = '#00ffcc';
            ctx.shadowBlur = 8;
            ctx.fillText(`${icon} ${label} ×${me.power.charges} · ${triggerHint}`, CW / 2, by - 8);
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = '#ffcc00';
            ctx.fillText('📦 NO POWER — DRIVE THROUGH A MYSTERY CRATE', CW / 2, by - 8);
        }
    }

    function toggleReady() {
        if (!currentRoomState) return;
        isReady = !isReady;
        NeonDelivery.Network.setReady(isReady);
    }

    function setMatchLength(minutes) {
        if (currentRoomState && currentRoomState.hostId === NeonDelivery.Network.localId) {
            NeonDelivery.Network.setMatchDuration(minutes);
        }
    }

    function startMatch() {
        if (currentRoomState && currentRoomState.hostId === NeonDelivery.Network.localId) {
            NeonDelivery.Network.startMatch();
        }
    }

    function leaveRoom() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        NeonDelivery.Network.leaveRoom();
        window.location.reload();
    }

    return { onRoomStateUpdate, onKillFeed, toggleReady, setMatchLength, startMatch, leaveRoom };
})();
