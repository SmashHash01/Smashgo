// ============================================================
//  NEON DELIVERY — renderer.js
//  All canvas drawing: world, entities, drone, particles, HUD.
//  Strategy: pre-render static world to offscreen canvas once,
//  blit the visible region each frame, draw dynamic content on top.
// ============================================================
NeonDelivery.Renderer = (function () {
    const C  = NeonDelivery.Config;
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
        ctx = canvas.getContext('2d', { alpha: false });
        
        // Performance fix: High shadowBlur values cause exponential frame drops.
        // Cap it globally to a reasonable max without breaking the neon glow.
        const originalShadowBlurSet = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur').set;
        if (originalShadowBlurSet) {
            Object.defineProperty(ctx, 'shadowBlur', {
                set: function(val) {
                    originalShadowBlurSet.call(this, Math.min(val, 12));
                }
            });
        }

        worldCvs = document.createElement('canvas');
        worldCvs.width  = WS;
        worldCvs.height = WS;
        worldCtx = worldCvs.getContext('2d', { alpha: false });
        if (originalShadowBlurSet) {
            Object.defineProperty(worldCtx, 'shadowBlur', {
                set: function(val) {
                    originalShadowBlurSet.call(this, Math.min(val, 12));
                }
            });
        }
    }

    // ── Pre-render world ─────────────────────────────────────
    function prerenderWorld(world) {
        worldRef = world;
        const wc = worldCtx;
        wc.clearRect(0, 0, WS, WS);

        // Background
        wc.fillStyle = C.COLOR.BG;
        wc.fillRect(0, 0, WS, WS);

        // 1. Base road/grass/building tile colors
        drawBaseTiles(wc, world);

        // 2. Grass texture
        drawGrassTexture(wc, world);

        // 3. Asphalt grain
        drawAsphaltTexture(wc, world);

        // 4. Curbs
        drawCurbs(wc);

        // 5. Road edge + lane markings
        drawRoadMarkings(wc);

        // 6. Buildings
        for (const building of world.buildingRecs) {
            drawBuilding(wc, building);
        }

        worldDirty = false;
    }

    function drawBaseTiles(wc, world) {
        const TS = C.TILE_SIZE;
        for (let ty = 0; ty < C.WORLD_TILES; ty++) {
            for (let tx = 0; tx < C.WORLD_TILES; tx++) {
                const px = tx * TS;
                const py = ty * TS;
                const tile = world.getTileAt(px + 1, py + 1);

                switch (tile) {
                    case TT.ROAD:
                        wc.fillStyle = C.COLOR.ROAD;
                        wc.fillRect(px, py, TS, TS);
                        break;
                    case TT.INTERSECTION:
                        wc.fillStyle = C.COLOR.INTERSECTION;
                        wc.fillRect(px, py, TS, TS);
                        break;
                    case TT.GRASS:
                        wc.fillStyle = C.COLOR.GRASS;
                        wc.fillRect(px, py, TS, TS);
                        break;
                    case TT.SIDEWALK:
                        wc.fillStyle = C.COLOR.SIDEWALK;
                        wc.fillRect(px, py, TS, TS);
                        break;
                    case TT.ALLEY:
                        wc.fillStyle = C.COLOR.ALLEY;
                        wc.fillRect(px, py, TS, TS);
                        break;
                    case TT.BUILDING:
                        wc.fillStyle = '#0c121c';
                        wc.fillRect(px, py, TS, TS);
                        break;
                }
            }
        }
    }

    function drawGrassTexture(wc, world) {
        const TS = C.TILE_SIZE;
        wc.save();
        for (let ty = 0; ty < C.WORLD_TILES; ty++) {
            for (let tx = 0; tx < C.WORLD_TILES; tx++) {
                const px = tx * TS;
                const py = ty * TS;
                const tile = world.getTileAt(px + 1, py + 1);

                if (tile !== TT.GRASS) continue;

                // deterministic-looking texture
                for (let i = 0; i < 7; i++) {
                    const seed = (tx * 374761393 + ty * 668265263 + i * 1274126177) >>> 0;
                    const rx = ((seed ^ (seed >>> 16)) * 0x45d9f3b >>> 0) / 0xffffffff;
                    const ry = ((seed ^ (seed >>> 13)) * 0xb78e3b5d >>> 0) / 0xffffffff;

                    if (i % 3 === 0) {
                        wc.fillStyle = 'rgba(150,200,70,0.12)';
                    } else {
                        wc.fillStyle = 'rgba(15,50,10,0.16)';
                    }
                    wc.fillRect(px + rx * TS, py + ry * TS, 1, 2 + ry * 2);
                }
            }
        }
        wc.restore();
    }

    function drawAsphaltTexture(wc, world) {
        const TS = C.TILE_SIZE;
        for (let ty = 0; ty < C.WORLD_TILES; ty++) {
            for (let tx = 0; tx < C.WORLD_TILES; tx++) {
                const px = tx * TS;
                const py = ty * TS;
                const tile = world.getTileAt(px + 1, py + 1);

                if (tile !== TT.ROAD && tile !== TT.INTERSECTION) continue;

                for (let i = 0; i < 5; i++) {
                    const seed = (tx * 123456789 + ty * 987654321 + i * 555555555) >>> 0;
                    const rx = ((seed ^ (seed >>> 16)) * 0x45d9f3b >>> 0) / 0xffffffff;
                    const ry = ((seed ^ (seed >>> 13)) * 0xb78e3b5d >>> 0) / 0xffffffff;

                    wc.fillStyle = (i % 2 === 0) ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.07)';
                    wc.fillRect(px + rx * TS, py + ry * TS, 1, 1);
                }
            }
        }
    }

    function drawCurbs(wc) {
        const RC = C.ROAD_CENTERS;
        const TS = C.TILE_SIZE;
        const _WS = C.WORLD_SIZE;
        const HALF = C.ROAD_HALF_TILES * TS;

        wc.save();

        // dark curb shadow
        wc.strokeStyle = 'rgba(0,0,0,0.45)';
        wc.lineWidth = 6;
        for (const rc of RC) {
            const c = rc * TS + TS / 2;
            wc.beginPath(); wc.moveTo(0, c - HALF - 2); wc.lineTo(_WS, c - HALF - 2); wc.stroke();
            wc.beginPath(); wc.moveTo(0, c + HALF + 2); wc.lineTo(_WS, c + HALF + 2); wc.stroke();
            wc.beginPath(); wc.moveTo(c - HALF - 2, 0); wc.lineTo(c - HALF - 2, _WS); wc.stroke();
            wc.beginPath(); wc.moveTo(c + HALF + 2, 0); wc.lineTo(c + HALF + 2, _WS); wc.stroke();
        }

        // bright curb edge
        wc.strokeStyle = 'rgba(215,220,220,0.78)';
        wc.lineWidth = 2;
        for (const rc of RC) {
            const c = rc * TS + TS / 2;
            wc.beginPath(); wc.moveTo(0, c - HALF); wc.lineTo(_WS, c - HALF); wc.stroke();
            wc.beginPath(); wc.moveTo(0, c + HALF); wc.lineTo(_WS, c + HALF); wc.stroke();
            wc.beginPath(); wc.moveTo(c - HALF, 0); wc.lineTo(c - HALF, _WS); wc.stroke();
            wc.beginPath(); wc.moveTo(c + HALF, 0); wc.lineTo(c + HALF, _WS); wc.stroke();
        }
        wc.restore();
    }

    function drawRoadMarkings(wc) {
        const RC = C.ROAD_CENTERS;
        const TS = C.TILE_SIZE;
        const _WS = C.WORLD_SIZE;
        const HALF = C.ROAD_HALF_TILES * TS;

        wc.save();
        wc.lineCap = 'butt';

        // ==========================================
        // BRIGHT WHITE ROAD BOUNDARIES
        // ==========================================
        wc.strokeStyle = '#e4e6e3';
        wc.lineWidth = 3;
        wc.globalAlpha = 0.90;
        wc.setLineDash([]);

        for (const rc of RC) {
            const center = rc * TS + TS / 2;

            wc.beginPath(); wc.moveTo(0, center - HALF); wc.lineTo(_WS, center - HALF); wc.stroke();
            wc.beginPath(); wc.moveTo(0, center + HALF); wc.lineTo(_WS, center + HALF); wc.stroke();
            wc.beginPath(); wc.moveTo(center - HALF, 0); wc.lineTo(center - HALF, _WS); wc.stroke();
            wc.beginPath(); wc.moveTo(center + HALF, 0); wc.lineTo(center + HALF, _WS); wc.stroke();
        }

        // ==========================================
        // CENTER DASHES
        // ==========================================
        wc.strokeStyle = '#f4f4f2';
        wc.lineWidth = 3;
        wc.globalAlpha = 0.95;
        wc.setLineDash([20, 19]);

        for (const rc of RC) {
            const center = rc * TS + TS / 2;
            drawHorizontalCenterLine(wc, center, RC, HALF, TS, _WS);
            drawVerticalCenterLine(wc, center, RC, HALF, TS, _WS);
        }
        wc.restore();
    }

    function drawHorizontalCenterLine(ctx, y, roads, half, TS, WS) {
        let x1 = 0;
        for (const road of roads) {
            const cx = road * TS + TS / 2;
            const left = cx - half;
            const right = cx + half;
            if (left > x1) {
                ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(left, y); ctx.stroke();
            }
            x1 = right;
        }
        if (x1 < WS) {
            ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(WS, y); ctx.stroke();
        }
    }

    function drawVerticalCenterLine(ctx, x, roads, half, TS, WS) {
        let y1 = 0;
        for (const road of roads) {
            const cy = road * TS + TS / 2;
            const top = cy - half;
            const bottom = cy + half;
            if (top > y1) {
                ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, top); ctx.stroke();
            }
            y1 = bottom;
        }
        if (y1 < WS) {
            ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, WS); ctx.stroke();
        }
    }

    function drawBuilding(wc, b) {
        const base = C.COLOR.BUILDING[b.colorIdx];

        // BUILDING SHADOW
        wc.fillStyle = 'rgba(0,0,0,0.50)';
        wc.fillRect(b.x + 5, b.y + 6, b.w, b.h);

        // BUILDING EXTERIOR
        wc.fillStyle = '#060c15';
        wc.fillRect(b.x, b.y, b.w, b.h);

        // border
        wc.strokeStyle = '#172538';
        wc.lineWidth = 3;
        wc.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);

        // ROOF INSET
        const inset = 8;
        wc.fillStyle = base;
        wc.fillRect(b.x + inset, b.y + inset, b.w - inset * 2, b.h - inset * 2);

        // INNER ROOF BORDER
        wc.strokeStyle = 'rgba(20,60,90,0.30)';
        wc.lineWidth = 2;
        wc.strokeRect(b.x + inset + 3, b.y + inset + 3, b.w - inset * 2 - 6, b.h - inset * 2 - 6);
        
        // ROOF PROPS (vents/AC)
        for (const p of b.roofProps || []) {
            wc.fillStyle = '#070d16';
            wc.fillRect(p.x, p.y, p.w, p.h);

            wc.strokeStyle = '#142031';
            wc.lineWidth = 1;
            wc.strokeRect(p.x, p.y, p.w, p.h);
        }

        // WINDOWS
        for (const w of b.windows) {
            if (w.destroyed || !w.lit) continue;

            if (w.mag) {
                wc.shadowColor = '#ff1dcc';
                wc.fillStyle = '#ff38d1';
            } else if (w.warm) {
                wc.shadowColor = '#ffc52f';
                wc.fillStyle = '#ffc83d';
            } else {
                wc.shadowColor = '#00f2ff';
                wc.fillStyle = '#00eaff';
            }

            wc.shadowBlur = 5;
            wc.fillRect(w.x, w.y, 5, 5);
            wc.shadowBlur = 0;
        }

        // NEON TRIM
        if (b.neon) {
            wc.save();
            wc.shadowBlur = 12;
            wc.shadowColor = b.neonColor;
            wc.strokeStyle = b.neonColor;
            wc.lineWidth = 3;

            wc.beginPath();
            wc.moveTo(b.x + 10, b.y + 7);
            wc.lineTo(b.x + b.w - 10, b.y + 7);
            wc.stroke();
            wc.restore();
        }
    }

    // ══════════════════════════════════════════════════════════
    //  Main render
    // ══════════════════════════════════════════════════════════

    function render(dt, gameData) {
        t += dt;
        const { world, drone, entities, camera, eventState, gameState, uiData } = gameData;

        // Clear
        ctx.clearRect(0, 0, C.CANVAS_W, C.CANVAS_H);

        if (gameState === C.GameState.MENU ||
            gameState === C.GameState.GAMEOVER) {
            drawMenuBg();
            return;
        }

        // ── World ─────────────────────────────────────────────
        // Blit visible region of the pre-rendered world
        ctx.drawImage(
            worldCvs,
            Math.floor(camera.x), Math.floor(camera.y), C.CANVAS_W, C.CANVAS_H,
            0, 0, C.CANVAS_W, C.CANVAS_H
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
        drawMinimap(ctx, camera, drone, entities, gameData);

        // ── Blackout overlay ─────────────────────────────────
        if (eventState && eventState.type === 'blackout') {
            drawBlackout(ctx, camera, drone, eventState);
        }
    }

    // ── Menu background ──────────────────────────────────────

    function drawMenuBg() {
        ctx.fillStyle = C.COLOR.BG;
        ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);
        // Animated grid lines
        ctx.strokeStyle = 'rgba(0,245,255,0.06)';
        ctx.lineWidth = 1;
        const grid = 48;
        const off  = (t * 0.02) % grid;
        for (let x = -grid + off; x < C.CANVAS_W + grid; x += grid) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, C.CANVAS_H); ctx.stroke();
        }
        for (let y = -grid + off; y < C.CANVAS_H + grid; y += grid) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(C.CANVAS_W, y); ctx.stroke();
        }
        // Horizon glow
        const grad = ctx.createLinearGradient(0, 0, 0, C.CANVAS_H);
        grad.addColorStop(0,   'rgba(255,0,204,0.0)');
        grad.addColorStop(0.5, 'rgba(0,245,255,0.04)');
        grad.addColorStop(1,   'rgba(255,0,204,0.12)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);
    }

    // ── Package icon ─────────────────────────────────────────

    function drawPackageIcon(ctx, camera, job) {
        const s    = camera.worldToScreen(job.pkg.x, job.pkg.y);
        if (s.x < -40 || s.x > C.CANVAS_W+40 || s.y < -40 || s.y > C.CANVAS_H+40) return;

        const pulse = 0.8 + 0.2 * Math.sin(t * 0.004);
        const r     = 14 * pulse;

        ctx.save();
        ctx.shadowBlur = 18; if (ctx.shadowBlur > 15) ctx.shadowBlur = 15;
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
        if (s.x < -60 || s.x > C.CANVAS_W+60 || s.y < -60 || s.y > C.CANVAS_H+60) return;

        const pulse  = 0.75 + 0.25 * Math.sin(t * 0.006);
        const outerR = 28 * pulse;

        ctx.save();
        ctx.shadowBlur = 30; if (ctx.shadowBlur > 15) ctx.shadowBlur = 15;
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
    // Detailed top-down silhouette: shadow, wheels, body, cabin,
    // windshield, roof, rear window, headlights, tail lights, bumpers, mirrors.

    function drawCar(ctx, camera, car) {
        const s = camera.worldToScreen(car.x, car.y);
        if (s.x < -80 || s.x > C.CANVAS_W + 80 || s.y < -80 || s.y > C.CANVAS_H + 80) return;

        const color = (car.color != null) ? car.color : (car.colorIdx != null && C.COLOR.CAR[car.colorIdx] ? C.COLOR.CAR[car.colorIdx] : '#00f5ff');
        const z = camera.zoom != null ? camera.zoom : 1;
        const W = 24 * z;
        const H = 42 * z;

        ctx.save();
        ctx.translate(s.x, s.y);
        
        // Face correct direction based on angle or axis
        if (car.angle != null) {
            ctx.rotate(car.angle + Math.PI / 2);
        } else if (car.axis === 'h') {
            ctx.rotate(car.spd > 0 ? Math.PI / 2 : -Math.PI / 2);
        } else {
            ctx.rotate(car.spd > 0 ? Math.PI : 0);
        }

        // ── Shadow ─────────────────────────────────────────────
        ctx.save();
        ctx.translate(3 * z, 4 * z);
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath();
        ctx.moveTo(-W*0.30,-H*0.50);
        ctx.quadraticCurveTo(-W*0.48,-H*0.44,-W*0.50,-H*0.25);
        ctx.lineTo(-W*0.50, H*0.30);
        ctx.quadraticCurveTo(-W*0.47, H*0.48,-W*0.30, H*0.50);
        ctx.lineTo( W*0.30, H*0.50);
        ctx.quadraticCurveTo( W*0.47, H*0.48, W*0.50, H*0.30);
        ctx.lineTo( W*0.50,-H*0.25);
        ctx.quadraticCurveTo( W*0.48,-H*0.44, W*0.30,-H*0.50);
        ctx.closePath(); ctx.fill();
        ctx.restore();

        // ── Wheels ─────────────────────────────────────────────
        ctx.fillStyle = '#090a0c';
        const wW = W * 0.18, wH = H * 0.22;
        ctx.fillRect(-W*0.58, -H*0.31, wW, wH);  // front-left
        ctx.fillRect( W*0.40, -H*0.31, wW, wH);  // front-right
        ctx.fillRect(-W*0.58,  H*0.15, wW, wH);  // rear-left
        ctx.fillRect( W*0.40,  H*0.15, wW, wH);  // rear-right

        // ── Body silhouette ────────────────────────────────────
        ctx.fillStyle   = color;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth   = 1.5 * z;
        ctx.beginPath();
        ctx.moveTo(-W*0.28,-H*0.50);
        ctx.quadraticCurveTo(-W*0.44,-H*0.47,-W*0.48,-H*0.34);
        ctx.lineTo(-W*0.50, H*0.27);
        ctx.quadraticCurveTo(-W*0.47, H*0.45,-W*0.30, H*0.49);
        ctx.lineTo( W*0.30, H*0.49);
        ctx.quadraticCurveTo( W*0.47, H*0.45, W*0.50, H*0.27);
        ctx.lineTo( W*0.48,-H*0.34);
        ctx.quadraticCurveTo( W*0.44,-H*0.47, W*0.28,-H*0.50);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ── Side shading ──────────────────────────────────────
        ctx.fillStyle = 'rgba(0,0,0,0.17)';
        ctx.beginPath();
        ctx.moveTo(-W*0.50,-H*0.22); ctx.lineTo(-W*0.40,-H*0.18);
        ctx.lineTo(-W*0.39, H*0.32); ctx.lineTo(-W*0.48, H*0.28);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo( W*0.50,-H*0.22); ctx.lineTo( W*0.40,-H*0.18);
        ctx.lineTo( W*0.39, H*0.32); ctx.lineTo( W*0.48, H*0.28);
        ctx.closePath(); ctx.fill();

        // ── Hood highlight ────────────────────────────────────
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.beginPath();
        ctx.moveTo(-W*0.31,-H*0.43); ctx.lineTo( W*0.31,-H*0.43);
        ctx.lineTo( W*0.36,-H*0.24); ctx.lineTo(-W*0.36,-H*0.24);
        ctx.closePath(); ctx.fill();

        // ── Cabin ───────────────────────────────────────────
        ctx.fillStyle = '#101820';
        ctx.beginPath();
        ctx.moveTo(-W*0.34,-H*0.22); ctx.lineTo( W*0.34,-H*0.22);
        ctx.lineTo( W*0.38, H*0.25); ctx.lineTo(-W*0.38, H*0.25);
        ctx.closePath(); ctx.fill();

        // ── Windshield ─────────────────────────────────────
        const glassGrad = ctx.createLinearGradient(0, -H*0.20, 0, H*0.05);
        glassGrad.addColorStop(0, 'rgba(140,235,255,0.95)');
        glassGrad.addColorStop(1, 'rgba(25,110,145,0.90)');
        ctx.fillStyle = glassGrad;
        ctx.beginPath();
        ctx.moveTo(-W*0.30,-H*0.19); ctx.lineTo( W*0.30,-H*0.19);
        ctx.lineTo( W*0.34,-H*0.02); ctx.lineTo(-W*0.34,-H*0.02);
        ctx.closePath(); ctx.fill();
        // Glass reflection
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.moveTo(-W*0.22,-H*0.17); ctx.lineTo(-W*0.06,-H*0.17);
        ctx.lineTo(-W*0.17,-H*0.04); ctx.lineTo(-W*0.30,-H*0.04);
        ctx.closePath(); ctx.fill();

        // ── Roof ──────────────────────────────────────────────
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-W*0.34, H*0.02); ctx.lineTo( W*0.34, H*0.02);
        ctx.lineTo( W*0.35, H*0.19); ctx.lineTo(-W*0.35, H*0.19);
        ctx.closePath(); ctx.fill();
        // Roof sheen
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(-W*0.25, H*0.045, W*0.50, H*0.035);

        // ── Rear window ──────────────────────────────────────
        ctx.fillStyle = 'rgba(25,65,85,0.93)';
        ctx.beginPath();
        ctx.moveTo(-W*0.32, H*0.20); ctx.lineTo( W*0.32, H*0.20);
        ctx.lineTo( W*0.29, H*0.32); ctx.lineTo(-W*0.29, H*0.32);
        ctx.closePath(); ctx.fill();

        // ── Headlights ──────────────────────────────────────
        ctx.shadowBlur  = 8 * z;
        ctx.shadowColor = '#fff6aa';
        ctx.fillStyle   = '#fff3a3';
        ctx.beginPath();
        ctx.roundRect(-W*0.38, -H*0.46, W*0.20, H*0.07, 2*z);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect( W*0.18, -H*0.46, W*0.20, H*0.07, 2*z);
        ctx.fill();
        ctx.shadowBlur = 0;

        // ── Tail lights ──────────────────────────────────────
        ctx.fillStyle   = '#ff2a22';
        ctx.shadowBlur  = 4 * z;
        ctx.shadowColor = '#ff2200';
        ctx.fillRect(-W*0.39, H*0.42, W*0.18, H*0.055);
        ctx.fillRect( W*0.21, H*0.42, W*0.18, H*0.055);
        ctx.shadowBlur = 0;

        // ── Bumpers ───────────────────────────────────────────
        ctx.strokeStyle = 'rgba(15,15,18,0.9)';
        ctx.lineWidth   = 2 * z;
        ctx.beginPath(); ctx.moveTo(-W*0.25,-H*0.49); ctx.lineTo( W*0.25,-H*0.49); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-W*0.26, H*0.48); ctx.lineTo( W*0.26, H*0.48); ctx.stroke();

        // ── Mirrors ───────────────────────────────────────────
        ctx.fillStyle = '#11151a';
        ctx.fillRect(-W*0.56, -H*0.10, W*0.12, H*0.07);
        ctx.fillRect( W*0.44, -H*0.10, W*0.12, H*0.07);

        // ── Boost Flame ────────────────────────────────────────
        if (car.boosting) {
            const flameLen = 12 + Math.random() * 8;
            const grad = ctx.createLinearGradient(0, H * 0.45, 0, H * 0.45 + flameLen);
            grad.addColorStop(0, '#00ffcc');
            grad.addColorStop(1, 'rgba(0,255,200,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(-W * 0.25, H * 0.45);
            ctx.lineTo(W * 0.25, H * 0.45);
            ctx.lineTo(0, H * 0.45 + flameLen);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }

    // ── Police car ───────────────────────────────────────────
    // ── Police car ───────────────────────────────────────────
    function drawPolice(ctx, camera, p) {
        const s = camera.worldToScreen(p.x, p.y);
        if (s.x < -80 || s.x > C.CANVAS_W + 80 || s.y < -80 || s.y > C.CANVAS_H + 80) return;

        const chasing = p.state === 'chase';
        const z = camera.zoom != null ? camera.zoom : 1;
        const W = 24 * z;
        const H = 42 * z;
        
        // Flash alternates between red and blue every 200ms
        const flashRed  = chasing && (Math.floor(t / 200) % 2 === 0);
        const flashBlue = chasing && !flashRed;

        ctx.save();
        ctx.translate(s.x, s.y);
        
        if (p.vx !== 0 || p.vy !== 0) {
            ctx.rotate(Math.atan2(p.vy, p.vx) + Math.PI/2);
        }

        // ── Chase searchlight glow ────────────────────────────
        if (chasing) {
            const glowColor = flashRed ? 'rgba(255,40,40,' : 'rgba(40,80,255,';
            ctx.globalAlpha = 0.13;
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 110*z);
            grad.addColorStop(0, glowColor + '1)');
            grad.addColorStop(1, glowColor + '0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(0, 0, 110*z, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        }

        // ── Drop shadow ───────────────────────────────────────
        ctx.save();
        ctx.translate(3 * z, 4 * z);
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath();
        ctx.moveTo(-W*0.30,-H*0.50);
        ctx.quadraticCurveTo(-W*0.48,-H*0.44,-W*0.50,-H*0.25);
        ctx.lineTo(-W*0.50, H*0.30);
        ctx.quadraticCurveTo(-W*0.47, H*0.48,-W*0.30, H*0.50);
        ctx.lineTo( W*0.30, H*0.50);
        ctx.quadraticCurveTo( W*0.47, H*0.48, W*0.50, H*0.30);
        ctx.lineTo( W*0.50,-H*0.25);
        ctx.quadraticCurveTo( W*0.48,-H*0.44, W*0.30,-H*0.50);
        ctx.closePath(); ctx.fill();
        ctx.restore();

        // ── Wheels ─────────────────────────────────────────────
        ctx.fillStyle = '#090a0c';
        const wW = W * 0.18, wH = H * 0.22;
        ctx.fillRect(-W*0.58, -H*0.31, wW, wH);  
        ctx.fillRect( W*0.40, -H*0.31, wW, wH);  
        ctx.fillRect(-W*0.58,  H*0.15, wW, wH);  
        ctx.fillRect( W*0.40,  H*0.15, wW, wH);  

        // ── Body silhouette (White) ────────────────────────────────────
        ctx.fillStyle   = '#f0f0f0';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth   = 1.5 * z;
        ctx.beginPath();
        ctx.moveTo(-W*0.28,-H*0.50);
        ctx.quadraticCurveTo(-W*0.44,-H*0.47,-W*0.48,-H*0.34);
        ctx.lineTo(-W*0.50, H*0.27);
        ctx.quadraticCurveTo(-W*0.47, H*0.45,-W*0.30, H*0.49);
        ctx.lineTo( W*0.30, H*0.49);
        ctx.quadraticCurveTo( W*0.47, H*0.45, W*0.50, H*0.27);
        ctx.lineTo( W*0.48,-H*0.34);
        ctx.quadraticCurveTo( W*0.44,-H*0.47, W*0.28,-H*0.50);
        ctx.closePath();
        ctx.fill(); 
        
        // ── Black diagonal stripes ───────────────────────────
        ctx.save();
        ctx.clip(); // clip to the body shape
        ctx.strokeStyle = '#111111';
        ctx.lineWidth   = 3.5 * z;
        ctx.globalAlpha = 0.85;
        for (let i = -H*1.5; i < H*1.5; i += 10*z) {
            ctx.beginPath();
            ctx.moveTo(-W + i,        -H);
            ctx.lineTo(-W + i + H,   H);
            ctx.stroke();
        }
        ctx.restore();
        
        ctx.stroke(); // stroke the body outline after clipping is done

        // ── Side shading ──────────────────────────────────────
        ctx.fillStyle = 'rgba(0,0,0,0.17)';
        ctx.beginPath();
        ctx.moveTo(-W*0.50,-H*0.22); ctx.lineTo(-W*0.40,-H*0.18);
        ctx.lineTo(-W*0.39, H*0.32); ctx.lineTo(-W*0.48, H*0.28);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo( W*0.50,-H*0.22); ctx.lineTo( W*0.40,-H*0.18);
        ctx.lineTo( W*0.39, H*0.32); ctx.lineTo( W*0.48, H*0.28);
        ctx.closePath(); ctx.fill();

        // ── Hood highlight ────────────────────────────────────
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.beginPath();
        ctx.moveTo(-W*0.31,-H*0.43); ctx.lineTo( W*0.31,-H*0.43);
        ctx.lineTo( W*0.36,-H*0.24); ctx.lineTo(-W*0.36,-H*0.24);
        ctx.closePath(); ctx.fill();

        // ── Cabin ───────────────────────────────────────────
        ctx.fillStyle = '#101820';
        ctx.beginPath();
        ctx.moveTo(-W*0.34,-H*0.22); ctx.lineTo( W*0.34,-H*0.22);
        ctx.lineTo( W*0.38, H*0.25); ctx.lineTo(-W*0.38, H*0.25);
        ctx.closePath(); ctx.fill();

        // ── Windshield ─────────────────────────────────────
        const glassGrad = ctx.createLinearGradient(0, -H*0.20, 0, H*0.05);
        glassGrad.addColorStop(0, 'rgba(140,235,255,0.95)');
        glassGrad.addColorStop(1, 'rgba(25,110,145,0.90)');
        ctx.fillStyle = glassGrad;
        ctx.beginPath();
        ctx.moveTo(-W*0.30,-H*0.19); ctx.lineTo( W*0.30,-H*0.19);
        ctx.lineTo( W*0.34,-H*0.02); ctx.lineTo(-W*0.34,-H*0.02);
        ctx.closePath(); ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.moveTo(-W*0.22,-H*0.17); ctx.lineTo(-W*0.06,-H*0.17);
        ctx.lineTo(-W*0.17,-H*0.04); ctx.lineTo(-W*0.30,-H*0.04);
        ctx.closePath(); ctx.fill();

        // ── Roof ──────────────────────────────────────────────
        ctx.fillStyle = '#f0f0f0'; // roof is white
        ctx.beginPath();
        ctx.moveTo(-W*0.34, H*0.02); ctx.lineTo( W*0.34, H*0.02);
        ctx.lineTo( W*0.35, H*0.19); ctx.lineTo(-W*0.35, H*0.19);
        ctx.closePath(); ctx.fill();
        
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(-W*0.25, H*0.045, W*0.50, H*0.035);

        // ── Rear window ──────────────────────────────────────
        ctx.fillStyle = 'rgba(25,65,85,0.93)';
        ctx.beginPath();
        ctx.moveTo(-W*0.32, H*0.20); ctx.lineTo( W*0.32, H*0.20);
        ctx.lineTo( W*0.29, H*0.32); ctx.lineTo(-W*0.29, H*0.32);
        ctx.closePath(); ctx.fill();

        // ── Headlights ──────────────────────────────────────
        ctx.shadowBlur  = 8 * z;
        ctx.shadowColor = '#ffffcc';
        ctx.fillStyle   = '#fff3a3';
        ctx.fillRect(-W*0.38, -H*0.46, W*0.20, H*0.07);
        ctx.fillRect( W*0.18, -H*0.46, W*0.20, H*0.07);
        ctx.shadowBlur = 0;

        // ── Tail lights ──────────────────────────────────────
        ctx.fillStyle   = '#ff2a22';
        ctx.shadowBlur  = 4 * z;
        ctx.shadowColor = '#ff2200';
        ctx.fillRect(-W*0.39, H*0.42, W*0.18, H*0.055);
        ctx.fillRect( W*0.21, H*0.42, W*0.18, H*0.055);
        ctx.shadowBlur = 0;
        
        // ── Roof light bar ────────────────────────────────────
        const barW = W * 0.6, barH = H * 0.10;
        const barX = -barW / 2, barY = -H * 0.12;

        if (chasing) {
            const leftCol  = flashRed  ? '#ff2020' : '#2040ff';
            const rightCol = flashRed  ? '#2040ff' : '#ff2020';
            ctx.shadowBlur = 16; if (ctx.shadowBlur > 15) ctx.shadowBlur = 15 * z;

            ctx.shadowColor = leftCol;
            ctx.fillStyle   = leftCol;
            ctx.fillRect(barX, barY, barW / 2, barH);

            ctx.shadowColor = rightCol;
            ctx.fillStyle   = rightCol;
            ctx.fillRect(barX + barW / 2, barY, barW / 2, barH);
        } else {
            ctx.fillStyle = '#333344';
            ctx.fillRect(barX, barY, barW, barH);
        }
        ctx.shadowBlur = 0;

        // ── Bumpers ───────────────────────────────────────────
        ctx.strokeStyle = 'rgba(15,15,18,0.9)';
        ctx.lineWidth   = 2 * z;
        ctx.beginPath(); ctx.moveTo(-W*0.25,-H*0.49); ctx.lineTo( W*0.25,-H*0.49); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-W*0.26, H*0.48); ctx.lineTo( W*0.26, H*0.48); ctx.stroke();

        // ── Mirrors ───────────────────────────────────────────
        ctx.fillStyle = '#11151a';
        ctx.fillRect(-W*0.56, -H*0.10, W*0.12, H*0.07);
        ctx.fillRect( W*0.44, -H*0.10, W*0.12, H*0.07);

        ctx.restore();
    }

    // ── Drone ────────────────────────────────────────────────

    function drawDrone(ctx, camera, drone) {
        if (!drone || drone.visible === false) return;
        const s = camera.worldToScreen(drone.x, drone.y);

        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(drone.angle + Math.PI / 2); // nose pointing in movement dir

        const hit   = drone.hitFlash > 0;
        const color = hit            ? C.COLOR.RED
                    : drone.dashing  ? '#ff00cc'
                    : drone.boosting ? C.COLOR.DRONE_BOOST
                    : C.COLOR.DRONE;

        // Glow — dash gets extra wide magenta glow
        ctx.shadowBlur  = drone.dashing ? 40 : drone.boosting ? 30 : 18;
        ctx.shadowColor = color;

        // Flame — dash gets a wider magenta flame
        if (drone.dashing) {
            const flameLen = 16 + Math.random() * 12;
            const grad = ctx.createLinearGradient(0, 6, 0, 6 + flameLen);
            grad.addColorStop(0, '#ff00cc');
            grad.addColorStop(0.5, '#cc00ff');
            grad.addColorStop(1, 'rgba(255,0,200,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(-8, 6);
            ctx.lineTo(8, 6);
            ctx.lineTo(0, 6 + flameLen);
            ctx.closePath();
            ctx.fill();
        } else if (drone.boosting) {
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

        // Shield ring (upgrade)
        if (drone.shields > 0) {
            ctx.globalAlpha  = 0.45 + 0.2 * Math.sin(t * 0.005);
            ctx.strokeStyle  = '#4466ff';
            ctx.lineWidth    = 2.5;
            ctx.shadowBlur = 20; if (ctx.shadowBlur > 15) ctx.shadowBlur = 15;
            ctx.shadowColor  = '#4466ff';
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Spawn protection ring — green shrinking arc + countdown
        if (drone.spawnProtection > 0) {
            const sp      = drone.spawnProtection;
            const spMax   = drone.spawnProtectMax;
            const spFrac  = sp / spMax;
            const secs    = Math.ceil(sp / 1000);
            const flicker = sp < 1200 && Math.floor(t / 120) % 2 === 0;

            if (!flicker) {
                // Outer glow ring (full circle, fades as timer runs out)
                ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 0.006);
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth   = 6;
                ctx.shadowBlur = 28; if (ctx.shadowBlur > 15) ctx.shadowBlur = 15;
                ctx.shadowColor = '#00ff88';
                ctx.beginPath();
                ctx.arc(0, 0, 28, 0, Math.PI * 2);
                ctx.stroke();

                // Countdown arc (shrinks as timer depletes)
                ctx.globalAlpha = 0.85;
                ctx.lineWidth   = 3;
                ctx.shadowBlur = 14; if (ctx.shadowBlur > 15) ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(0, 0, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * spFrac);
                ctx.stroke();

                // Countdown number
                ctx.globalAlpha  = 1;
                ctx.shadowBlur = 10; if (ctx.shadowBlur > 15) ctx.shadowBlur = 15;
                ctx.font         = 'bold 12px Orbitron';
                ctx.fillStyle    = '#00ff88';
                ctx.textAlign    = 'center';
                ctx.fillText(secs, 0, -36);
            }
        }

        ctx.restore();
    }

    // ── HUD ──────────────────────────────────────────────────

    function drawHUD(ctx, uiData, entities, drone) {
        if (!uiData) return;
        const { score, combo, levelTimer, level, comboColor } = uiData;

        // ── Top bar ──────────────────────────────────────────
        const topY = 12; // Mobile notch padding
        // Background strip with gradient fade
        ctx.fillStyle = 'rgba(2,8,16,0.85)';
        ctx.fillRect(0, 0, C.CANVAS_W, 36 + topY);
        
        const grad = ctx.createLinearGradient(0, 36 + topY, 0, 36 + topY + 24);
        grad.addColorStop(0, 'rgba(2,8,16,0.85)');
        grad.addColorStop(1, 'rgba(2,8,16,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 36 + topY, C.CANVAS_W, 24);

        ctx.strokeStyle = 'rgba(0,245,255,0.2)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(0, 36 + topY);
        ctx.lineTo(C.CANVAS_W, 36 + topY);
        ctx.stroke();

        // Score
        ctx.font      = 'bold 16px Orbitron';
        ctx.fillStyle = C.COLOR.CYAN;
        ctx.textAlign = 'left';
        ctx.shadowBlur  = 8;
        ctx.shadowColor = C.COLOR.CYAN;
        ctx.fillText('SCORE ' + score.toLocaleString(), 14, 24 + topY);

        // Combo
        ctx.textAlign = 'center';
        if (combo > 1) {
            const cc     = comboColor || C.COLOR.CYAN;
            ctx.font     = 'bold 18px Orbitron';
            ctx.fillStyle    = cc;
            ctx.shadowColor  = cc;
            ctx.shadowBlur   = combo >= 5 ? 20 : 10;
            ctx.fillText('⚡ x' + combo, C.CANVAS_W / 2, 24 + topY);
        } else {
            ctx.font         = '12px Rajdhani';
            ctx.fillStyle    = 'rgba(0,245,255,0.4)';
            ctx.shadowBlur   = 0;
            ctx.fillText('COMBO x1', C.CANVAS_W / 2, 24 + topY);
        }

        // Level
        ctx.textAlign    = 'right';
        ctx.font         = '12px Rajdhani';
        ctx.fillStyle    = 'rgba(0,245,255,0.6)';
        ctx.shadowBlur   = 0;
        ctx.fillText('LVL ' + level, C.CANVAS_W - 100, 20 + topY);

        // Timer
        const secs     = Math.ceil(levelTimer / 1000);
        const timerClr = secs <= 10 ? C.COLOR.RED : C.COLOR.YELLOW;
        ctx.font         = 'bold 18px Orbitron';
        ctx.fillStyle    = timerClr;
        ctx.shadowBlur   = secs <= 10 ? 15 : 6;
        ctx.shadowColor  = timerClr;
        ctx.fillText(String(secs).padStart(2,'0') + 's', C.CANVAS_W - 14, 26 + topY);

        // ── Deliveries progress ──────────────────────────────
        const dComp = entities.deliveriesCompleted;
        const dReq  = entities.deliveriesRequired;
        const bx    = 14;
        const by    = 44 + topY;
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
        const bBarY  = C.CANVAS_H - 28;
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
            ctx.shadowBlur = 10; if (ctx.shadowBlur > 15) ctx.shadowBlur = 15;
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

        // ── Dash bar ───────────────────────────────────────────
        const dBarX = bBarX + bBarW + 14;
        const dBarY = bBarY;
        const dBarW = 90;
        const dBarH = bBarH;
        const dCoolPct = drone.dashCoolTimer > 0
            ? 1 - drone.dashCoolTimer / drone.dashCooldown
            : 1;
        const dActivePct = drone.dashing
            ? drone.dashTimer / drone.dashDuration
            : 0;
        const dashReady = !drone.dashing && dCoolPct >= 1;

        ctx.fillStyle = 'rgba(2,8,16,0.7)';
        ctx.fillRect(dBarX - 2, dBarY - 2, dBarW + 4, dBarH + 4);
        ctx.fillStyle = 'rgba(255,0,204,0.12)';
        ctx.fillRect(dBarX, dBarY, dBarW, dBarH);

        if (drone.dashing) {
            ctx.fillStyle   = '#ff00cc';
            ctx.shadowBlur = 14; if (ctx.shadowBlur > 15) ctx.shadowBlur = 15;
            ctx.shadowColor = '#ff00cc';
            ctx.fillRect(dBarX, dBarY, dBarW * dActivePct, dBarH);
        } else {
            ctx.fillStyle   = dashReady ? '#ff00cc' : 'rgba(255,0,204,0.4)';
            ctx.shadowBlur  = dashReady ? 8 : 0;
            ctx.shadowColor = '#ff00cc';
            ctx.fillRect(dBarX, dBarY, dBarW * dCoolPct, dBarH);
        }

        ctx.font      = '9px Rajdhani';
        ctx.fillStyle = dashReady ? '#ff00cc' : 'rgba(255,0,204,0.5)';
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
        ctx.fillText('DASH  ▶▶', dBarX, dBarY - 4);

        // ── Delivery arrow ────────────────────────────────────────
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
        const cx   = C.CANVAS_W / 2;
        const cy   = C.CANVAS_H / 2;
        const aLen = 55; // distance from centre to arrow tip
        const ax   = cx + Math.cos(ang) * aLen;
        const ay   = cy + Math.sin(ang) * aLen;

        const pulse = 0.7 + 0.3 * Math.sin(t * 0.006);
        ctx.save();
        ctx.globalAlpha  = 0.85 * pulse;
        ctx.shadowBlur = 12; if (ctx.shadowBlur > 15) ctx.shadowBlur = 15;
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

    function drawMinimap(ctx, camera, drone, entities, gameData) {
        const MW = C.MINIMAP_W;
        const MH = C.MINIMAP_H;
        const MX = C.CANVAS_W - MW - C.MINIMAP_X;
        const MY = C.CANVAS_H - MH - C.MINIMAP_Y;
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
        const centers = (worldRef && worldRef.roadCenters) ? worldRef.roadCenters : C.ROAD_CENTERS;
        for (const rc of centers) {
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

        // Multiplayer dots
        if (gameData && gameData.players) {
            for (const p of gameData.players) {
                if (!p.alive) continue;
                const isMe = (p.id === NeonDelivery.Network.localId);
                const dotColor = p.color || (isMe ? '#00f5ff' : '#ff3366');
                ctx.fillStyle   = dotColor;
                ctx.shadowBlur  = isMe ? 8 : 4;
                ctx.shadowColor = dotColor;
                ctx.beginPath();
                const px = MX + (p.renderX || p.x) * scale;
                const py = MY + (p.renderY || p.y) * scale;
                ctx.arc(px, py, isMe ? 3.5 : 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (drone) {
            // Drone dot (Solo mode)
            ctx.fillStyle   = C.COLOR.DRONE;
            ctx.shadowBlur  = 8;
            ctx.shadowColor = C.COLOR.DRONE;
            ctx.beginPath();
            ctx.arc(MX + drone.x * scale, MY + drone.y * scale, 3, 0, Math.PI * 2);
            ctx.fill();
        }
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
            ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);

            // Lightning
            if (eventState.data && eventState.data.lightning > 0) {
                const frac = eventState.data.lightning / 180;
                ctx.fillStyle = `rgba(200,220,255,${0.35 * frac})`;
                ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);
            }
        }

        if (eventState.type === 'wind') {
            // Subtle blue tint
            ctx.fillStyle = 'rgba(0,80,200,0.06)';
            ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);
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
        ctx.fillRect(0, 0, C.CANVAS_W, C.CANVAS_H);

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

                // Erase window and its glow
                worldCtx.save();
                worldCtx.shadowBlur = 0;
                worldCtx.fillStyle = C.COLOR.BUILDING[b.colorIdx];
                worldCtx.fillRect(w.x - 2, w.y - 2, 9, 9);
                worldCtx.restore();

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
    return { init, prerenderWorld, render, damageAt, drawDrone, drawCar };
})();
