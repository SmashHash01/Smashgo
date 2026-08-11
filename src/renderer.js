// ============================================================
//  NEON DELIVERY — renderer.js
//  All canvas drawing: world, entities, drone, particles, HUD.
//  Strategy: pre-render static world to offscreen canvas once,
//  blit the visible region each frame, draw dynamic content on top.
// ============================================================
NeonDelivery.Renderer = (function () {
    const C  = NeonDelivery.Config;
    const CW = C.CANVAS_W;
    const CH = C.CANVAS_H;
    const TS = C.TILE_SIZE;
    const WS = C.WORLD_SIZE;
    const TT = C.TILE;

    let canvas    = null;
    let ctx       = null;
    let worldCvs  = null;  // offscreen canvas for static world
    let worldCtx  = null;
    let worldDirty = true;
    let worldRef   = null;  // saved reference for runtime damage

    // Animation time
    let t = 0;

    // ── Init ─────────────────────────────────────────────────
    function init(canvasEl) {
        canvas = canvasEl;
        ctx    = canvas.getContext('2d');
        worldCvs = document.createElement('canvas');
        worldCvs.width  = WS;
        worldCvs.height = WS;
        worldCtx = worldCvs.getContext('2d');
    }

    // ── Pre-render world ─────────────────────────────────────
    function prerenderWorld(world) {
        worldRef = world;   // save for damageAt()
        const wc = worldCtx;
        wc.clearRect(0, 0, WS, WS);

        // Background
        wc.fillStyle = C.COLOR.BG;
        wc.fillRect(0, 0, WS, WS);

        // Tiles
        for (let ty = 0; ty < C.WORLD_TILES; ty++) {
            for (let tx = 0; tx < C.WORLD_TILES; tx++) {
                const tile = world.getTileAt(tx * TS + 1, ty * TS + 1);
                const px   = tx * TS;
                const py   = ty * TS;

                switch (tile) {
                    case TT.ROAD:
                        wc.fillStyle = C.COLOR.ROAD;
                        wc.fillRect(px, py, TS, TS);
                        break;
                    case TT.INTERSECTION:
                        wc.fillStyle = C.COLOR.INTERSECTION;
                        wc.fillRect(px, py, TS, TS);
                        break;
                    case TT.ALLEY:
                        wc.fillStyle = C.COLOR.ALLEY;
                        wc.fillRect(px, py, TS, TS);
                        break;
                    // BUILDING drawn below
                }
            }
        }

        // Road centre dashes
        drawRoadMarkings(wc);

        // Buildings (sorted back-to-front, but all same z so order doesn't matter)
        for (const b of world.buildingRecs) {
            drawBuilding(wc, b);
        }

        worldDirty = false;
    }

    function drawRoadMarkings(wc) {
        const RC = C.ROAD_CENTERS;
        wc.strokeStyle = C.COLOR.ROAD_LINE;
        wc.globalAlpha = 0.45;
        wc.lineWidth   = 1.5;
        wc.setLineDash([10, 14]);

        for (const rc of RC) {
            // Horizontal centre line
            const cy = rc * TS + TS / 2;
            wc.beginPath();
            wc.moveTo(0, cy);
            wc.lineTo(WS, cy);
            wc.stroke();
            // Vertical centre line
            const cx = rc * TS + TS / 2;
            wc.beginPath();
            wc.moveTo(cx, 0);
            wc.lineTo(cx, WS);
            wc.stroke();
        }

        wc.setLineDash([]);
        wc.globalAlpha = 1;
    }

    function drawBuilding(wc, b) {
        // Base fill
        wc.fillStyle = C.COLOR.BUILDING[b.colorIdx];
        wc.fillRect(b.x, b.y, b.w, b.h);

        // Subtle top-edge highlight (neon ledge)
        wc.fillStyle = 'rgba(0,200,255,0.07)';
        wc.fillRect(b.x, b.y, b.w, 2);
        wc.fillStyle = 'rgba(0,200,255,0.04)';
        wc.fillRect(b.x, b.y, 2, b.h);

        // Windows — no shadow blur on these for performance
        for (const w of b.windows) {
            if (w.lit) {
                if (w.mag)        wc.fillStyle = C.COLOR.WIN_MAGENTA;
                else if (w.warm)  wc.fillStyle = C.COLOR.WIN_WARM;
                else              wc.fillStyle = C.COLOR.WIN_CYAN;
            } else {
                wc.fillStyle = C.COLOR.WIN_OFF;
            }
            wc.fillRect(w.x, w.y, 5, 5);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  Main render
    // ══════════════════════════════════════════════════════════

    function render(dt, gameData) {
        t += dt;
        const { world, drone, entities, camera, eventState, gameState, uiData } = gameData;

        // Clear
        ctx.clearRect(0, 0, CW, CH);

        if (gameState === C.GameState.MENU ||
            gameState === C.GameState.GAMEOVER) {
            drawMenuBg();
            return;
        }

        // ── World ─────────────────────────────────────────────
        // Blit visible region of the pre-rendered world
        ctx.drawImage(
            worldCvs,
            Math.floor(camera.x), Math.floor(camera.y), CW, CH,
            0, 0, CW, CH
        );

        // ── Event overlays ───────────────────────────────────
        applyEventOverlay(ctx, eventState);

        // ── Delivery zones ───────────────────────────────────
        for (const job of entities.jobs) {
            if (job.state === 'available') {
                drawPackageIcon(ctx, camera, job);
            }
            if (job.state === 'carrying') {
                drawDeliveryZone(ctx, camera, job);
            }
        }

        // ── Cars ─────────────────────────────────────────────
        for (const car of entities.cars) {
            drawCar(ctx, camera, car);
        }

        // ── Police ───────────────────────────────────────────
        for (const p of entities.police) {
            drawPolice(ctx, camera, p);
        }

        // ── Particles ────────────────────────────────────────
        NeonDelivery.Particles.draw(ctx, camera);

        // ── Drone ────────────────────────────────────────────
        drawDrone(ctx, camera, drone);

        // ── HUD ──────────────────────────────────────────────
        drawHUD(ctx, uiData, entities, drone);

        // ── Minimap ──────────────────────────────────────────
        drawMinimap(ctx, camera, drone, entities);

        // ── Blackout overlay ─────────────────────────────────
        if (eventState && eventState.type === 'blackout') {
            drawBlackout(ctx, camera, drone, eventState);
        }
    }

    // ── Menu background ──────────────────────────────────────

    function drawMenuBg() {
        ctx.fillStyle = C.COLOR.BG;
        ctx.fillRect(0, 0, CW, CH);
        // Animated grid lines
        ctx.strokeStyle = 'rgba(0,245,255,0.06)';
        ctx.lineWidth = 1;
        const grid = 48;
        const off  = (t * 0.02) % grid;
        for (let x = -grid + off; x < CW + grid; x += grid) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke();
        }
        for (let y = -grid + off; y < CH + grid; y += grid) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
        }
        // Horizon glow
        const grad = ctx.createLinearGradient(0, 0, 0, CH);
        grad.addColorStop(0,   'rgba(255,0,204,0.0)');
        grad.addColorStop(0.5, 'rgba(0,245,255,0.04)');
        grad.addColorStop(1,   'rgba(255,0,204,0.12)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CW, CH);
    }

    // ── Package icon ─────────────────────────────────────────

    function drawPackageIcon(ctx, camera, job) {
        const s    = camera.worldToScreen(job.pkg.x, job.pkg.y);
        if (s.x < -40 || s.x > CW+40 || s.y < -40 || s.y > CH+40) return;

        const pulse = 0.8 + 0.2 * Math.sin(t * 0.004);
        const r     = 14 * pulse;

        ctx.save();
        ctx.shadowBlur  = 18;
        ctx.shadowColor = C.COLOR.PACKAGE;
        ctx.strokeStyle = C.COLOR.PACKAGE;
        ctx.lineWidth   = 2;
        ctx.globalAlpha = 0.9;

        // Pulsing circle
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.stroke();

        // Box icon
        ctx.fillStyle = C.COLOR.PACKAGE;
        ctx.globalAlpha = 1;
        const bs = 8;
        ctx.fillRect(s.x - bs/2, s.y - bs/2, bs, bs);

        // Job type badge
        ctx.font         = 'bold 9px Rajdhani';
        ctx.textAlign    = 'center';
        ctx.fillStyle    = '#ffffff';
        ctx.shadowBlur   = 0;
        ctx.globalAlpha  = 1;
        const label = job.type === 'vip' ? 'VIP' : job.type === 'express' ? 'EXP' : 'PKG';
        ctx.fillText(label, s.x, s.y + 22);

        // Reward
        ctx.font      = '8px Rajdhani';
        ctx.fillStyle = C.COLOR.YELLOW;
        ctx.fillText('¢' + job.baseCoins, s.x, s.y + 32);

        ctx.restore();
    }

    // ── Delivery zone ────────────────────────────────────────

    function drawDeliveryZone(ctx, camera, job) {
        const s    = camera.worldToScreen(job.delivery.x, job.delivery.y);
        if (s.x < -60 || s.x > CW+60 || s.y < -60 || s.y > CH+60) return;

        const pulse  = 0.75 + 0.25 * Math.sin(t * 0.006);
        const outerR = 28 * pulse;

        ctx.save();
        ctx.shadowBlur  = 30;
        ctx.shadowColor = C.COLOR.DELIVERY;

        // Outer pulsing ring
        ctx.strokeStyle  = C.COLOR.DELIVERY;
        ctx.lineWidth    = 2.5;
        ctx.globalAlpha  = 0.7 * pulse;
        ctx.beginPath();
        ctx.arc(s.x, s.y, outerR, 0, Math.PI * 2);
        ctx.stroke();

        // Inner static ring
        ctx.globalAlpha  = 0.9;
        ctx.lineWidth    = 1.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 12, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshair
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(s.x - 18, s.y); ctx.lineTo(s.x + 18, s.y);
        ctx.moveTo(s.x, s.y - 18); ctx.lineTo(s.x, s.y + 18);
        ctx.stroke();

        // Label
        ctx.font         = 'bold 9px Rajdhani';
        ctx.textAlign    = 'center';
        ctx.fillStyle    = C.COLOR.DELIVERY;
        ctx.shadowBlur   = 8;
        ctx.globalAlpha  = 1;
        ctx.fillText('DELIVER', s.x, s.y + 38);

        // Express countdown
        if (job.timeLimit !== null) {
            const secs = Math.ceil(job.expressTimer / 1000);
            ctx.fillStyle = secs <= 5 ? C.COLOR.RED : C.COLOR.YELLOW;
            ctx.font      = 'bold 11px Orbitron';
            ctx.fillText(secs + 's', s.x, s.y - 36);
        }

        ctx.restore();
    }

    // ── Car ──────────────────────────────────────────────────

    function drawCar(ctx, camera, car) {
        const s = camera.worldToScreen(car.x, car.y);
        if (s.x < -40 || s.x > CW+40 || s.y < -40 || s.y > CH+40) return;

        const color = C.COLOR.CAR[car.colorIdx];
        ctx.save();
        ctx.translate(s.x, s.y);
        if (car.axis === 'v') ctx.rotate(Math.PI / 2);

        // Body
        ctx.fillStyle = color;
        ctx.fillRect(-car.w/2, -car.h/2, car.w, car.h);

        // Windshield
        ctx.fillStyle = 'rgba(0,220,255,0.5)';
        ctx.fillRect(-car.w/2 + 3, -car.h/2 + 2, car.w - 6, car.h * 0.4);

        // Headlights
        ctx.shadowBlur  = 6;
        ctx.shadowColor = '#ffeeaa';
        ctx.fillStyle   = '#ffeeaa';
        const hDir = car.spd > 0 ? 1 : -1;
        ctx.fillRect(hDir * (car.w/2 - 3), -car.h/2 + 1, 2, 4);
        ctx.fillRect(hDir * (car.w/2 - 3), car.h/2 - 5,  2, 4);

        ctx.restore();
    }

    // ── Police ───────────────────────────────────────────────

    function drawPolice(ctx, camera, p) {
        const s = camera.worldToScreen(p.x, p.y);
        if (s.x < -50 || s.x > CW+50 || s.y < -50 || s.y > CH+50) return;

        const chasing = p.state === 'chase';
        const flash   = chasing && (Math.floor(t / 200) % 2 === 0);
        const r       = C.POLICE_RADIUS;

        ctx.save();

        // Searchlight cone
        if (chasing) {
            ctx.globalAlpha = 0.12;
            const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 100);
            grad.addColorStop(0,   flash ? 'rgba(255,50,50,1)'   : 'rgba(255,50,50,0.5)');
            grad.addColorStop(1,   'rgba(255,50,50,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 100, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Body
        ctx.shadowBlur  = chasing ? 20 : 8;
        ctx.shadowColor = C.COLOR.POLICE;
        ctx.fillStyle   = chasing ? C.COLOR.POLICE : '#cc2244';
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Warning light bar
        if (chasing && p.alertFlash > 0) {
            ctx.fillStyle   = '#ffffff';
            ctx.shadowBlur  = 30;
            ctx.shadowColor = '#ff0000';
            ctx.beginPath();
            ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Badge
        ctx.font         = 'bold 8px Rajdhani';
        ctx.textAlign    = 'center';
        ctx.fillStyle    = '#ffffff';
        ctx.shadowBlur   = 0;
        ctx.fillText('🚨', s.x, s.y + 3);

        ctx.restore();
    }

    // ── Drone ────────────────────────────────────────────────

    function drawDrone(ctx, camera, drone) {
        const s = camera.worldToScreen(drone.x, drone.y);

        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(drone.angle + Math.PI / 2); // nose pointing in movement dir

        const hit   = drone.hitFlash > 0;
        const color = hit ? C.COLOR.RED
                    : drone.boosting ? C.COLOR.DRONE_BOOST
                    : C.COLOR.DRONE;

        // Glow
        ctx.shadowBlur  = drone.boosting ? 30 : 18;
        ctx.shadowColor = color;

        // Boost flame
        if (drone.boosting) {
            const flameLen = 10 + Math.random() * 8;
            const grad = ctx.createLinearGradient(0, 6, 0, 6 + flameLen);
            grad.addColorStop(0, '#00ffcc');
            grad.addColorStop(1, 'rgba(0,255,200,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(-5, 6);
            ctx.lineTo(5, 6);
            ctx.lineTo(0, 6 + flameLen);
            ctx.closePath();
            ctx.fill();
        }

        // Body — triangle (drone nose up)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -14);    // nose
        ctx.lineTo(-10, 8);    // left
        ctx.lineTo(10, 8);     // right
        ctx.closePath();
        ctx.fill();

        // Core white dot
        ctx.shadowBlur  = 0;
        ctx.fillStyle   = C.COLOR.DRONE_CORE;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();

        // Rotors (small circles at tips)
        const rotorSpin = (t * 0.02) % (Math.PI * 2);
        [[-10, 8], [10, 8], [0, -14]].forEach(([rx, ry]) => {
            ctx.strokeStyle = color;
            ctx.lineWidth   = 1.5;
            ctx.globalAlpha = 0.6;
            ctx.shadowBlur  = 4;
            ctx.shadowColor = color;
            ctx.beginPath();
            ctx.arc(rx, ry, 5 + Math.sin(rotorSpin) * 1, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Shield ring
        if (drone.shields > 0) {
            ctx.globalAlpha  = 0.45 + 0.2 * Math.sin(t * 0.005);
            ctx.strokeStyle  = '#4466ff';
            ctx.lineWidth    = 2.5;
            ctx.shadowBlur   = 20;
            ctx.shadowColor  = '#4466ff';
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    // ── HUD ──────────────────────────────────────────────────

    function drawHUD(ctx, uiData, entities, drone) {
        if (!uiData) return;
        const { score, combo, levelTimer, level, comboColor } = uiData;

        // ── Top bar ──────────────────────────────────────────
        // Background strip
        ctx.fillStyle = 'rgba(2,8,16,0.82)';
        ctx.fillRect(0, 0, CW, 36);
        ctx.strokeStyle = 'rgba(0,245,255,0.2)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(0, 0, CW, 36);

        // Score
        ctx.font      = 'bold 16px Orbitron';
        ctx.fillStyle = C.COLOR.CYAN;
        ctx.textAlign = 'left';
        ctx.shadowBlur  = 8;
        ctx.shadowColor = C.COLOR.CYAN;
        ctx.fillText('SCORE ' + score.toLocaleString(), 14, 24);

        // Combo
        ctx.textAlign = 'center';
        if (combo > 1) {
            const cc     = comboColor || C.COLOR.CYAN;
            ctx.font     = 'bold 18px Orbitron';
            ctx.fillStyle    = cc;
            ctx.shadowColor  = cc;
            ctx.shadowBlur   = combo >= 5 ? 20 : 10;
            ctx.fillText('⚡ x' + combo, CW / 2, 24);
        } else {
            ctx.font         = '12px Rajdhani';
            ctx.fillStyle    = 'rgba(0,245,255,0.4)';
            ctx.shadowBlur   = 0;
            ctx.fillText('COMBO x1', CW / 2, 24);
        }

        // Level
        ctx.textAlign    = 'right';
        ctx.font         = '12px Rajdhani';
        ctx.fillStyle    = 'rgba(0,245,255,0.6)';
        ctx.shadowBlur   = 0;
        ctx.fillText('LVL ' + level, CW - 100, 20);

        // Timer
        const secs     = Math.ceil(levelTimer / 1000);
        const timerClr = secs <= 10 ? C.COLOR.RED : C.COLOR.YELLOW;
        ctx.font         = 'bold 18px Orbitron';
        ctx.fillStyle    = timerClr;
        ctx.shadowBlur   = secs <= 10 ? 15 : 6;
        ctx.shadowColor  = timerClr;
        ctx.fillText(String(secs).padStart(2,'0') + 's', CW - 14, 26);

        // ── Deliveries progress ──────────────────────────────
        const dComp = entities.deliveriesCompleted;
        const dReq  = entities.deliveriesRequired;
        const bx    = 14;
        const by    = 44;
        ctx.font      = '10px Rajdhani';
        ctx.fillStyle = 'rgba(0,245,255,0.5)';
        ctx.textAlign = 'left';
        ctx.shadowBlur = 0;
        ctx.fillText('DELIVERIES', bx, by + 9);
        // Pip icons
        for (let i = 0; i < dReq; i++) {
            const px2 = bx + 68 + i * 14;
            ctx.fillStyle = i < dComp ? C.COLOR.GREEN : 'rgba(0,255,136,0.2)';
            ctx.shadowBlur = i < dComp ? 6 : 0;
            ctx.shadowColor = C.COLOR.GREEN;
            ctx.fillRect(px2, by + 1, 10, 10);
        }

        // ── Boost bar ────────────────────────────────────────
        const bBarX  = 14;
        const bBarY  = CH - 28;
        const bBarW  = 120;
        const bBarH  = 8;
        const coolPct = drone.boostCoolTimer > 0
            ? 1 - drone.boostCoolTimer / drone.boostCooldown
            : 1;
        const activePct = drone.boosting
            ? drone.boostTimer / drone.boostDuration
            : 0;

        ctx.fillStyle = 'rgba(2,8,16,0.7)';
        ctx.fillRect(bBarX - 2, bBarY - 2, bBarW + 4, bBarH + 4);

        ctx.fillStyle = 'rgba(0,245,255,0.15)';
        ctx.fillRect(bBarX, bBarY, bBarW, bBarH);

        if (drone.boosting) {
            ctx.fillStyle   = C.COLOR.DRONE_BOOST;
            ctx.shadowBlur  = 10;
            ctx.shadowColor = C.COLOR.DRONE_BOOST;
            ctx.fillRect(bBarX, bBarY, bBarW * activePct, bBarH);
        } else {
            ctx.fillStyle   = coolPct >= 1 ? C.COLOR.CYAN : 'rgba(0,245,255,0.5)';
            ctx.shadowBlur  = coolPct >= 1 ? 8 : 0;
            ctx.shadowColor = C.COLOR.CYAN;
            ctx.fillRect(bBarX, bBarY, bBarW * coolPct, bBarH);
        }

        ctx.font         = '9px Rajdhani';
        ctx.fillStyle    = 'rgba(0,245,255,0.5)';
        ctx.shadowBlur   = 0;
        ctx.textAlign    = 'left';
        ctx.fillText('BOOST', bBarX, bBarY - 4);

        // ── Delivery arrow ───────────────────────────────────
        drawDeliveryArrow(ctx, drone, entities);

        ctx.shadowBlur = 0;
    }

    function drawDeliveryArrow(ctx, drone, entities) {
        // Find first carrying job
        const job = entities.jobs.find(j => j.state === 'carrying');
        if (!job) return;

        const dx  = job.delivery.x - drone.x;
        const dy  = job.delivery.y - drone.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 50) return; // close enough — delivery zone is visible

        const ang  = Math.atan2(dy, dx);
        const cx   = CW / 2;
        const cy   = CH / 2;
        const aLen = 55; // distance from centre to arrow tip
        const ax   = cx + Math.cos(ang) * aLen;
        const ay   = cy + Math.sin(ang) * aLen;

        const pulse = 0.7 + 0.3 * Math.sin(t * 0.006);
        ctx.save();
        ctx.globalAlpha  = 0.85 * pulse;
        ctx.shadowBlur   = 12;
        ctx.shadowColor  = C.COLOR.DELIVERY;
        ctx.strokeStyle  = C.COLOR.DELIVERY;
        ctx.fillStyle    = C.COLOR.DELIVERY;
        ctx.lineWidth    = 2;

        ctx.translate(ax, ay);
        ctx.rotate(ang);
        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-5, -6);
        ctx.lineTo(-5,  6);
        ctx.closePath();
        ctx.fill();
        // Stem
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(-14, 0);
        ctx.stroke();

        ctx.restore();

        // Distance label
        ctx.font         = '9px Rajdhani';
        ctx.fillStyle    = C.COLOR.DELIVERY;
        ctx.textAlign    = 'center';
        ctx.shadowBlur   = 6;
        ctx.shadowColor  = C.COLOR.DELIVERY;
        ctx.globalAlpha  = 0.8;
        ctx.fillText(Math.round(dist) + 'm', ax + Math.cos(ang + Math.PI/2) * 14,
                                              ay + Math.sin(ang + Math.PI/2) * 14);
        ctx.globalAlpha = 1;
    }

    // ── Minimap ──────────────────────────────────────────────

    function drawMinimap(ctx, camera, drone, entities) {
        const MW = C.MINIMAP_W;
        const MH = C.MINIMAP_H;
        const MX = CW - MW - C.MINIMAP_X;
        const MY = CH - MH - C.MINIMAP_Y;
        const scale = MW / WS;

        // BG
        ctx.fillStyle = 'rgba(2,8,20,0.85)';
        ctx.strokeStyle = 'rgba(0,245,255,0.3)';
        ctx.lineWidth   = 1;
        ctx.fillRect(MX, MY, MW, MH);
        ctx.strokeRect(MX, MY, MW, MH);

        // Roads (horizontal + vertical lines)
        ctx.strokeStyle = 'rgba(0,245,255,0.12)';
        ctx.lineWidth   = 2;
        for (const rc of C.ROAD_CENTERS) {
            const px2 = MX + rc * C.TILE_SIZE * scale;
            const py2 = MY + rc * C.TILE_SIZE * scale;
            ctx.beginPath();
            ctx.moveTo(px2, MY); ctx.lineTo(px2, MY + MH); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(MX, py2); ctx.lineTo(MX + MW, py2); ctx.stroke();
        }

        // Viewport rect
        ctx.strokeStyle = 'rgba(0,245,255,0.25)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(
            MX + camera.x * scale,
            MY + camera.y * scale,
            C.CANVAS_W * scale,
            C.CANVAS_H * scale
        );

        // Job markers
        for (const job of entities.jobs) {
            if (job.state === 'available') {
                ctx.fillStyle = C.COLOR.PACKAGE;
                ctx.fillRect(MX + job.pkg.x * scale - 2, MY + job.pkg.y * scale - 2, 4, 4);
            }
            if (job.state === 'carrying') {
                ctx.fillStyle = C.COLOR.DELIVERY;
                ctx.shadowBlur  = 4;
                ctx.shadowColor = C.COLOR.DELIVERY;
                ctx.fillRect(MX + job.delivery.x * scale - 2, MY + job.delivery.y * scale - 2, 4, 4);
                ctx.shadowBlur = 0;
            }
        }

        // Police blips
        for (const p of entities.police) {
            ctx.fillStyle = C.COLOR.POLICE;
            ctx.beginPath();
            ctx.arc(MX + p.x * scale, MY + p.y * scale, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Drone dot
        ctx.fillStyle   = C.COLOR.DRONE;
        ctx.shadowBlur  = 8;
        ctx.shadowColor = C.COLOR.DRONE;
        ctx.beginPath();
        ctx.arc(MX + drone.x * scale, MY + drone.y * scale, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label
        ctx.font         = '7px Rajdhani';
        ctx.fillStyle    = 'rgba(0,245,255,0.35)';
        ctx.textAlign    = 'left';
        ctx.fillText('MAP', MX + 3, MY + 9);
    }

    // ── Event overlays ───────────────────────────────────────

    function applyEventOverlay(ctx, eventState) {
        if (!eventState) return;

        if (eventState.type === 'thunderstorm') {
            // Rain tint
            ctx.fillStyle = 'rgba(30,50,120,0.15)';
            ctx.fillRect(0, 0, CW, CH);

            // Lightning
            if (eventState.data && eventState.data.lightning > 0) {
                const frac = eventState.data.lightning / 180;
                ctx.fillStyle = `rgba(200,220,255,${0.35 * frac})`;
                ctx.fillRect(0, 0, CW, CH);
            }
        }

        if (eventState.type === 'wind') {
            // Subtle blue tint
            ctx.fillStyle = 'rgba(0,80,200,0.06)';
            ctx.fillRect(0, 0, CW, CH);
        }
    }

    function drawBlackout(ctx, camera, drone, eventState) {
        const progress = eventState.progress;
        // Full dark overlay with a spotlight around the drone
        const s = camera.worldToScreen(drone.x, drone.y);
        const spotR = 90;

        ctx.save();

        // Dark mask
        ctx.fillStyle = `rgba(0,0,0,${0.88 + 0.08 * progress})`;
        ctx.fillRect(0, 0, CW, CH);

        // Cut out spotlight using composite
        ctx.globalCompositeOperation = 'destination-out';
        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, spotR);
        grad.addColorStop(0,   'rgba(0,0,0,1)');
        grad.addColorStop(0.7, 'rgba(0,0,0,0.6)');
        grad.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(s.x, s.y, spotR, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // ── World damage (called on collision) ──────────────────
    //  Permanently erases window pixels near the impact point
    //  by overpainting them on worldCtx.  Cost: O(windows near
    //  impact) at collision time only — zero every-frame cost.
    function damageAt(wx, wy, radius) {
        if (!worldCtx || !worldRef) return;

        const r2 = radius * radius;
        let   hit = false;

        for (const b of worldRef.buildingRecs) {
            // Broad-phase AABB skip
            if (wx + radius < b.x || wx - radius > b.x + b.w ||
                wy + radius < b.y || wy - radius > b.y + b.h) continue;

            for (const w of b.windows) {
                if (w.destroyed) continue;
                // Centre of this 5×5 window pixel
                const dx = (w.x + 2.5) - wx;
                const dy = (w.y + 2.5) - wy;
                if (dx * dx + dy * dy > r2) continue;

                // Erase window — paint building base colour over it
                worldCtx.fillStyle = C.COLOR.BUILDING[b.colorIdx];
                worldCtx.fillRect(w.x, w.y, 5, 5);
                w.lit       = false;
                w.destroyed = true;
                hit = true;
            }
        }

        // Scorch mark — dark semi-transparent smear at the impact crater
        if (hit) {
            worldCtx.save();
            const grad = worldCtx.createRadialGradient(
                wx, wy, 0,
                wx, wy, radius * 0.9
            );
            grad.addColorStop(0,   'rgba(0,0,0,0.55)');
            grad.addColorStop(0.5, 'rgba(0,0,0,0.25)');
            grad.addColorStop(1,   'rgba(0,0,0,0)');
            worldCtx.fillStyle = grad;
            worldCtx.beginPath();
            worldCtx.arc(wx, wy, radius * 0.9, 0, Math.PI * 2);
            worldCtx.fill();

            // Thin neon crack ring
            worldCtx.strokeStyle = 'rgba(0,245,255,0.18)';
            worldCtx.lineWidth   = 1;
            worldCtx.beginPath();
            worldCtx.arc(wx, wy, radius * 0.6, 0, Math.PI * 2);
            worldCtx.stroke();
            worldCtx.restore();
        }
    }

    // ── Public ───────────────────────────────────────────────
    return { init, prerenderWorld, render, damageAt };
})();
