// ============================================================
//  NEON DELIVERY — particles.js
//  Particle system: boost exhaust, pickups, deliveries,
//  explosions, sparks, and rain.
// ============================================================
NeonDelivery.Particles = (function () {
    const pool      = [];   // all live particles
    const MAX_PARTS = 600;

    // ── Particle factory ─────────────────────────────────────
    function spawn(opts) {
        if (pool.length >= MAX_PARTS) return;
        const life = opts.life || 800;
        pool.push({
            x:       opts.x     || 0,
            y:       opts.y     || 0,
            vx:      opts.vx    || 0,
            vy:      opts.vy    || 0,
            life:    life,
            maxLife: opts.maxLife || life,
            r:       opts.r     || 3,
            color:   opts.color || '#00f5ff',
            alpha:   opts.alpha !== undefined ? opts.alpha : 1,
            glow:    opts.glow  || false,
            gravity: opts.gravity || 0,
            shrink:  opts.shrink !== undefined ? opts.shrink : true,
            square:  opts.square || false,
        });
    }

    // ── Named emitters ───────────────────────────────────────

    function emit(type, x, y, count) {
        switch (type) {
            case 'boost':      emitBoost(x, y, count); break;
            case 'pickup':     emitPickup(x, y, count); break;
            case 'delivery':   emitDelivery(x, y, count); break;
            case 'explosion':  emitExplosion(x, y, count); break;
            case 'spark':      emitSpark(x, y, count); break;
            case 'coin':       emitCoin(x, y, count); break;
            case 'rain':       emitRain(x, y, count); break;
            case 'shatter':    emitShatter(x, y, count); break;
        }
    }

    function emitBoost(x, y, count) {
        for (let i = 0; i < count; i++) {
            const ang = Math.PI + (Math.random() - 0.5) * 1.0;
            const spd = 1.0 + Math.random() * 2.5;
            spawn({
                x, y,
                vx:    Math.cos(ang) * spd,
                vy:    Math.sin(ang) * spd,
                life:  250 + Math.random() * 180,
                r:     2 + Math.random() * 2,
                color: Math.random() < 0.5 ? '#00f5ff' : '#00ffcc',
                glow:  false,
                shrink: true
            });
        }
    }

    function emitPickup(x, y, count) {
        for (let i = 0; i < count; i++) {
            const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
            const spd = 1.5 + Math.random() * 3;
            spawn({
                x, y,
                vx:    Math.cos(ang) * spd,
                vy:    Math.sin(ang) * spd,
                life:  500 + Math.random() * 300,
                r:     2.5 + Math.random() * 2,
                color: '#00ff88',
                glow:  true,
                shrink: true
            });
        }
    }

    function emitDelivery(x, y, count) {
        for (let i = 0; i < count; i++) {
            const ang = (Math.PI * 2 * i) / count;
            const spd = 2 + Math.random() * 4;
            spawn({
                x, y,
                vx:    Math.cos(ang) * spd,
                vy:    Math.sin(ang) * spd,
                life:  700 + Math.random() * 400,
                r:     3 + Math.random() * 3,
                color: i % 2 === 0 ? '#ff00cc' : '#ffe600',
                glow:  true,
                shrink: true
            });
        }
        // Upward star burst
        for (let i = 0; i < 6; i++) {
            spawn({
                x, y,
                vx:    (Math.random() - 0.5) * 3,
                vy:    -2 - Math.random() * 4,
                life:  900,
                r:     4,
                color: '#ffffff',
                glow:  true,
                gravity: 0.06,
                shrink: true
            });
        }
    }

    function emitExplosion(x, y, count) {
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 1 + Math.random() * 5;
            spawn({
                x, y,
                vx:    Math.cos(ang) * spd,
                vy:    Math.sin(ang) * spd,
                life:  400 + Math.random() * 600,
                r:     2 + Math.random() * 5,
                color: ['#ff3366', '#ffaa00', '#ff6600', '#ffcc00'][Math.floor(Math.random() * 4)],
                glow:  true,
                gravity: 0.04,
                shrink: true
            });
        }
    }

    function emitSpark(x, y, count) {
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 1.5 + Math.random() * 3.5;
            spawn({
                x, y,
                vx:    Math.cos(ang) * spd,
                vy:    Math.sin(ang) * spd,
                life:  250 + Math.random() * 200,
                r:     1.5 + Math.random() * 2,
                color: '#ffee44',
                glow:  false,
                shrink: true
            });
        }
    }

    function emitCoin(x, y, count) {
        for (let i = 0; i < count; i++) {
            spawn({
                x,
                y:     y - 5,
                vx:    (Math.random() - 0.5) * 2,
                vy:    -1.5 - Math.random() * 2,
                life:  800,
                r:     4,
                color: '#ffe600',
                glow:  true,
                gravity: 0.05,
                shrink: false
            });
        }
    }

    function emitRain(x, y, count) {
        for (let i = 0; i < count; i++) {
            spawn({
                x:     x + (Math.random() - 0.5) * 900,
                y:     y - 350,
                vx:    1 + Math.random() * 0.5,
                vy:    6 + Math.random() * 4,
                life:  300 + Math.random() * 200,
                r:     1,
                color: '#4466cc',
                glow:  false,
                shrink: false
            });
        }
    }

    // ── Shatter — neon pixel debris on collision ───────────────
    // Square-shaped fragments in building-window colours fly outward
    // and drizzle down under gravity, then fade.
    function emitShatter(x, y, count) {
        const COLORS = [
            '#00f5ff', '#00f5ff',   // cyan (most common — window glass)
            '#ffcc44', '#ffcc44',   // warm yellow windows
            '#ff44cc',              // magenta accent
            '#ffffff',              // bright core chip
            '#4488ff',              // blue shard
        ];
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 1.2 + Math.random() * 5.5;
            // square size 2–6 px
            const sz  = 2 + Math.random() * 4;
            spawn({
                x:       x + (Math.random() - 0.5) * 16,
                y:       y + (Math.random() - 0.5) * 16,
                vx:      Math.cos(ang) * spd,
                vy:      Math.sin(ang) * spd - 1.5, // slight upward bias
                life:    350 + Math.random() * 500,
                maxLife: 850,
                r:       sz,
                color:   COLORS[Math.floor(Math.random() * COLORS.length)],
                glow:    Math.random() < 0.4,
                gravity: 0.10 + Math.random() * 0.06,
                shrink:  false,   // keep size, fade only
                square:  true,    // flag for square draw
            });
        }
        // Extra bright core flash
        for (let i = 0; i < 4; i++) {
            spawn({
                x, y,
                vx:      (Math.random() - 0.5) * 2,
                vy:      (Math.random() - 0.5) * 2,
                life:    120,
                maxLife: 120,
                r:       6 + Math.random() * 4,
                color:   '#ffffff',
                glow:    true,
                gravity: 0,
                shrink:  true,
                square:  false,
            });
        }
    }

    // ── Update & Draw ────────────────────────────────────────

    function update(dt) {
        for (let i = pool.length - 1; i >= 0; i--) {
            const p = pool[i];
            p.life -= dt;
            if (p.life <= 0) { pool.splice(i, 1); continue; }

            p.x  += p.vx;
            p.y  += p.vy;
            p.vy += p.gravity || 0;

            // Slight drag
            p.vx *= 0.96;
            p.vy *= 0.96;
        }
    }

    function draw(ctx, camera) {
        for (const p of pool) {
            const s = camera.worldToScreen(p.x, p.y);
            const t = p.life / p.maxLife;
            const alpha = t;
            const r = p.shrink ? p.r * t : p.r;

            if (r < 0.3 || alpha < 0.01) continue;

            ctx.save();
            ctx.globalAlpha = alpha;
            if (p.glow) {
                ctx.shadowBlur  = 8;
                ctx.shadowColor = p.color;
            }
            ctx.fillStyle = p.color;

            if (p.square) {
                // Shatter debris — tiny rotating square pixel
                const rot = (p.x + p.y) * 0.05 + (1 - t) * Math.PI;
                ctx.translate(s.x, s.y);
                ctx.rotate(rot);
                ctx.fillRect(-r, -r, r * 2, r * 2);
            } else {
                ctx.beginPath();
                ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }

    function clear() { pool.length = 0; }

    return { emit, update, draw, clear };
})();
