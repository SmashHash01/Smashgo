// ============================================================
//  NEON DELIVERY — combatVisuals.js
//  Client-side particle, tracer, indicator, and FX renderer
//  Zero latency feedback without heavy state allocation.
// ============================================================
window.NeonDelivery = window.NeonDelivery || {};

NeonDelivery.CombatVisuals = (function () {
    const C = NeonDelivery.Config;
    const Gameplay = NeonDelivery.Gameplay;

    const tracers = [];
    const fxList = [];
    const toasts = [];
    let screenShakeAmt = 0;

    function clear() {
        tracers.length = 0;
        fxList.length = 0;
        toasts.length = 0;
        screenShakeAmt = 0;
    }

    function addScreenShake(amount) {
        screenShakeAmt = Math.min(8, screenShakeAmt + amount);
    }

    function getScreenShake() {
        if (screenShakeAmt <= 0.05) return { x: 0, y: 0 };
        return {
            x: (Math.random() - 0.5) * screenShakeAmt * 2,
            y: (Math.random() - 0.5) * screenShakeAmt * 2
        };
    }

    function onCombatFx(ev) {
        if (!ev) return;
        const CE = Gameplay.COMBAT_EVENT;

        if (ev.t === CE.BLASTER_TRACE) {
            tracers.push({
                x1: ev.x1,
                y1: ev.y1,
                x2: ev.x2,
                y2: ev.y2,
                hit: ev.hit,
                life: 90,
                maxLife: 90
            });
            if (ev.hit) {
                NeonDelivery.Particles.emit('spark', ev.x2, ev.y2, 4);
            }
        } else if (ev.t === CE.ROCKET_EXPLODE) {
            NeonDelivery.Particles.emit('shatter', ev.x, ev.y, 14);
            addScreenShake(2.5);
            fxList.push({
                kind: 'explosion',
                x: ev.x,
                y: ev.y,
                color: '#ff6a00',
                radius: 48,
                life: 220,
                maxLife: 220
            });
        } else if (ev.t === CE.MINE_EXPLODE || ev.t === CE.FAKECRATE_EXPLODE) {
            NeonDelivery.Particles.emit('shatter', ev.x, ev.y, 18);
            addScreenShake(3.5);
            fxList.push({
                kind: 'explosion',
                x: ev.x,
                y: ev.y,
                color: ev.t === CE.FAKECRATE_EXPLODE ? '#ff00cc' : '#ff3366',
                radius: 56,
                life: 250,
                maxLife: 250
            });
        } else if (ev.t === CE.CANNON_EXPLODE) {
            NeonDelivery.Particles.emit('shatter', ev.x, ev.y, 12);
            addScreenShake(2.0);
            fxList.push({
                kind: 'explosion',
                x: ev.x,
                y: ev.y,
                color: '#ffe600',
                radius: 36,
                life: 200,
                maxLife: 200
            });
        } else if (ev.t === CE.ARCBOMB_EXPLODE) {
            NeonDelivery.Particles.emit('shatter', ev.x, ev.y, 25);
            addScreenShake(6.0);
            fxList.push({
                kind: 'explosion',
                x: ev.x,
                y: ev.y,
                color: '#00f5ff',
                radius: 95,
                life: 350,
                maxLife: 350
            });
        }
    }

    function onCombatConfirm(data) {
        if (!data) return;
        if (data.type === 'hit') {
            toasts.push({
                text: `-${data.damage}`,
                color: '#00ffcc',
                life: 450,
                maxLife: 450
            });
        } else if (data.type === 'kill') {
            addScreenShake(4.0);
            toasts.push({
                text: '💥 TARGET SMASHED! +100',
                color: '#ffe600',
                life: 1400,
                maxLife: 1400,
                large: true
            });
        }
    }

    function update(dt) {
        if (screenShakeAmt > 0) {
            screenShakeAmt = Math.max(0, screenShakeAmt - dt * 0.012);
        }

        for (let i = tracers.length - 1; i >= 0; i--) {
            tracers[i].life -= dt;
            if (tracers[i].life <= 0) tracers.splice(i, 1);
        }

        for (let i = fxList.length - 1; i >= 0; i--) {
            fxList[i].life -= dt;
            if (fxList[i].life <= 0) fxList.splice(i, 1);
        }

        for (let i = toasts.length - 1; i >= 0; i--) {
            toasts[i].life -= dt;
            if (toasts[i].life <= 0) toasts.splice(i, 1);
        }
    }

    function renderWorld(ctx, camera, hazards, timedEffects, projectiles, localId) {
        const CW = C.CANVAS_W;
        const CH = C.CANVAS_H;
        const now = performance.now();

        // 1. Hazards (Ground: Mines & Mimic Crates)
        if (hazards) {
            for (const h of hazards) {
                const s = camera.worldToScreen(h.x, h.y);
                if (s.x < -40 || s.x > CW + 40 || s.y < -40 || s.y > CH + 40) continue;

                ctx.save();
                ctx.translate(s.x, s.y);

                if (h.kind === 'fakecrate') {
                    const isMine = h.ownerId === localId;
                    const pulse = 0.8 + 0.2 * Math.sin(now * 0.008);
                    ctx.shadowBlur = 12;
                    ctx.shadowColor = isMine ? '#00f5ff' : '#ff00cc';
                    ctx.fillStyle = isMine ? 'rgba(0,245,255,0.25)' : 'rgba(255,0,204,0.25)';
                    ctx.strokeStyle = isMine ? '#00f5ff' : '#ff00cc';
                    ctx.lineWidth = 2;
                    ctx.fillRect(-10, -10, 20, 20);
                    ctx.strokeRect(-10, -10, 20, 20);

                    // Glitch tell: cracked skull / question mark
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 10px Orbitron';
                    ctx.textAlign = 'center';
                    ctx.fillText('⚠', 0, 4);
                } else {
                    // Neon Mine
                    const isMine = h.ownerId === localId;
                    ctx.shadowBlur = h.armed ? 14 : 4;
                    ctx.shadowColor = h.armed ? (isMine ? '#00f5ff' : '#ff3366') : '#ffcc00';
                    ctx.fillStyle = h.armed ? (isMine ? '#00f5ff' : '#ff3366') : '#ffcc00';
                    ctx.beginPath();
                    ctx.arc(0, 0, 7, 0, Math.PI * 2);
                    ctx.fill();

                    if (h.armed) {
                        ctx.strokeStyle = ctx.fillStyle;
                        ctx.lineWidth = 1.5;
                        const pulseR = 10 + 4 * Math.sin(now * 0.01);
                        ctx.beginPath();
                        ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
                ctx.restore();
            }
        }

        // 2. Timed Effects (Mortar Burst & Arc Bomb)
        if (timedEffects) {
            for (const t of timedEffects) {
                const s = camera.worldToScreen(t.x, t.y);
                if (s.x < -120 || s.x > CW + 120 || s.y < -120 || s.y > CH + 120) continue;

                ctx.save();
                ctx.translate(s.x, s.y);

                if (t.kind === 'arcbomb') {
                    const frac = 1 - Math.max(0, t.remainingMs) / (t.totalMs || 950);
                    const inWarning = (t.remainingMs || 0) <= (t.warningMs || 300);

                    // Danger warning circle
                    ctx.strokeStyle = inWarning ? '#ff3366' : 'rgba(0,245,255,0.4)';
                    ctx.lineWidth = inWarning ? 3 : 1.5;
                    ctx.shadowBlur = inWarning ? 20 : 8;
                    ctx.shadowColor = ctx.strokeStyle;
                    ctx.beginPath();
                    ctx.arc(0, 0, (t.radius || 90) * Math.min(1, 0.4 + frac * 0.6), 0, Math.PI * 2);
                    ctx.stroke();

                    // Bomb orb
                    ctx.fillStyle = inWarning ? '#ff3366' : '#00f5ff';
                    ctx.beginPath();
                    ctx.arc(0, 0, 10, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 9px Orbitron';
                    ctx.textAlign = 'center';
                    ctx.fillText('💣', 0, 4);
                } else if (t.kind === 'cannon') {
                    const frac = 1 - Math.max(0, t.remainingMs) / (t.totalMs || 600);
                    // Landing target circle
                    ctx.strokeStyle = '#ffe600';
                    ctx.lineWidth = 1.5;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#ffe600';
                    ctx.beginPath();
                    ctx.arc(0, 0, t.radius || 34, 0, Math.PI * 2);
                    ctx.stroke();

                    // Fake lobbed height
                    const height = Math.sin(Math.PI * frac) * 45;
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(0, -height, 7, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }

        // 3. Moving Projectiles (Tri-Rockets)
        if (projectiles) {
            for (const p of projectiles) {
                const s = camera.worldToScreen(p.x, p.y);
                if (s.x < -50 || s.x > CW + 50 || s.y < -50 || s.y > CH + 50) continue;

                ctx.save();
                ctx.translate(s.x, s.y);
                ctx.rotate(p.angle || 0);

                ctx.strokeStyle = '#ff9f1c';
                ctx.shadowColor = '#ff6a00';
                ctx.shadowBlur = 14;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(-10, 0);
                ctx.lineTo(8, 0);
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(8, 0, 2.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }
        }

        // 4. Tracers (Pulse Blaster Hitscan)
        for (const tr of tracers) {
            const s1 = camera.worldToScreen(tr.x1, tr.y1);
            const s2 = camera.worldToScreen(tr.x2, tr.y2);
            const alpha = tr.life / tr.maxLife;

            ctx.save();
            ctx.strokeStyle = tr.hit ? `rgba(255,51,102,${alpha})` : `rgba(0,245,255,${alpha})`;
            ctx.shadowColor = tr.hit ? '#ff3366' : '#00f5ff';
            ctx.shadowBlur = 10;
            ctx.lineWidth = tr.hit ? 3 : 2;
            ctx.beginPath();
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.stroke();
            ctx.restore();
        }

        // 5. Explosions FX
        for (const fx of fxList) {
            const s = camera.worldToScreen(fx.x, fx.y);
            const frac = 1 - fx.life / fx.maxLife;
            const r = fx.radius * frac;
            const alpha = 1 - frac;

            ctx.save();
            ctx.strokeStyle = fx.color;
            ctx.globalAlpha = alpha;
            ctx.shadowColor = fx.color;
            ctx.shadowBlur = 20;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(s.x, s.y, Math.max(1, r), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    function renderCarEffects(ctx, s, p) {
        const now = performance.now();

        // Phase Shield (Rotating Arc Ring)
        if (p.shieldTimer > 0) {
            ctx.save();
            ctx.strokeStyle = '#9d4edd';
            ctx.shadowColor = '#c77dff';
            ctx.shadowBlur = 18;
            ctx.lineWidth = 3;
            const rot = (now * 0.005) % (Math.PI * 2);
            ctx.beginPath();
            ctx.arc(0, 0, 26, rot, rot + Math.PI * 1.5);
            ctx.stroke();
            ctx.restore();
        }

        // Wrecking Halo (Spinning Spikes)
        if (p.maceTimer > 0) {
            ctx.save();
            ctx.strokeStyle = '#ff9f1c';
            ctx.shadowColor = '#ff6a00';
            ctx.shadowBlur = 16;
            ctx.lineWidth = 3;
            const rot = (now * 0.008) % (Math.PI * 2);
            for (let i = 0; i < 4; i++) {
                const ang = rot + (i * Math.PI) / 2;
                const sx = Math.cos(ang) * 28;
                const sy = Math.sin(ang) * 28;
                ctx.fillStyle = '#ff6a00';
                ctx.beginPath();
                ctx.arc(sx, sy, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    function renderHUDToasts(ctx, CW, CH) {
        let yy = CH / 2 - 40;
        for (const t of toasts) {
            const alpha = Math.min(1, t.life / 200);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = t.large ? 'bold 20px Orbitron' : 'bold 14px Orbitron';
            ctx.fillStyle = t.color;
            ctx.textAlign = 'center';
            ctx.shadowBlur = 12;
            ctx.shadowColor = t.color;
            ctx.fillText(t.text, CW / 2, yy);
            ctx.restore();
            yy -= 24;
        }
    }

    return {
        clear,
        onCombatFx,
        onCombatConfirm,
        update,
        renderWorld,
        renderCarEffects,
        renderHUDToasts,
        getScreenShake
    };
})();
