// ============================================================
//  NEON DELIVERY — audio.js
//  Lightweight synthesised SFX via Web Audio API.
// ============================================================
NeonDelivery.Audio = (function () {
    let ctx   = null;
    let muted = false;

    let sirenOsc = null;
    let sirenGain = null;
    let sirenLfo = null;
    let isSirenPlaying = false;

    // ── Init ─────────────────────────────────────────────────
    function init(isMuted) {
        muted = !!isMuted;
        try {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('[Audio] Web Audio API not available.');
        }
    }

    function setMuted(val) { 
        muted = !!val; 
        if (muted && sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    }
    function isMuted()     { return muted; }

    /** Must be called after a user gesture to un-suspend the AudioContext. */
    function resume() {
        if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    // ══════════════════════════════════════════════════════════
    //  Low-level primitives
    // ══════════════════════════════════════════════════════════

    function osc(freq, type, duration, vol, endFreq, startTime) {
        if (!ctx || muted) return;
        const t   = startTime !== undefined ? startTime : ctx.currentTime;
        const o   = ctx.createOscillator();
        const g   = ctx.createGain();
        const lp  = ctx.createBiquadFilter();
        lp.type  = 'lowpass';
        lp.frequency.value = 8000;
        o.connect(lp);
        lp.connect(g);
        g.connect(ctx.destination);
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t);
        if (endFreq !== undefined) {
            o.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + duration);
        }
        g.gain.setValueAtTime(vol || 0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + duration);
        o.start(t);
        o.stop(t + duration + 0.01);
    }

    function noiseBurst(duration, vol, startTime) {
        if (!ctx || muted) return;
        const t  = startTime !== undefined ? startTime : ctx.currentTime;
        const sr = ctx.sampleRate;
        const len = Math.ceil(sr * duration);
        const buf = ctx.createBuffer(1, len, sr);
        const d   = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 80;
        src.connect(hp);
        hp.connect(g);
        g.connect(ctx.destination);
        g.gain.setValueAtTime(vol || 0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + duration);
        src.start(t);
        src.stop(t + duration + 0.01);
    }

    // ══════════════════════════════════════════════════════════
    //  Named SFX
    // ══════════════════════════════════════════════════════════

    function boost() {
        if (!ctx || muted) return;
        resume();
        osc(120, 'sawtooth', 0.35, 0.12, 240);
        osc(360, 'square',   0.20, 0.06, 480);
    }

    function pickup() {
        if (!ctx || muted) return;
        resume();
        const now = ctx.currentTime;
        osc(523, 'sine', 0.10, 0.18, undefined, now);
        osc(659, 'sine', 0.10, 0.18, undefined, now + 0.08);
        osc(784, 'sine', 0.14, 0.20, undefined, now + 0.16);
    }

    function delivery() {
        if (!ctx || muted) return;
        resume();
        const now = ctx.currentTime;
        osc(523,  'sine', 0.08, 0.15, undefined, now);
        osc(659,  'sine', 0.08, 0.15, undefined, now + 0.06);
        osc(784,  'sine', 0.08, 0.15, undefined, now + 0.12);
        osc(1047, 'sine', 0.28, 0.22, undefined, now + 0.18);
        osc(1319, 'sine', 0.22, 0.18, undefined, now + 0.28);
    }

    function collision() {
        if (!ctx || muted) return;
        resume();
        noiseBurst(0.22, 0.28);
        osc(90, 'sawtooth', 0.22, 0.18, 40);
    }

    function coin() {
        if (!ctx || muted) return;
        resume();
        const now = ctx.currentTime;
        osc(880,  'sine', 0.07, 0.12, undefined, now);
        osc(1108, 'sine', 0.09, 0.12, undefined, now + 0.05);
    }

    function laser() {
        if (!ctx || muted) return;
        resume();
        osc(900, 'square', 0.04, 0.10, 400);
        osc(400, 'square', 0.04, 0.08, 900, ctx.currentTime + 0.05);
    }

    function warning() {
        if (!ctx || muted) return;
        resume();
        const now = ctx.currentTime;
        osc(440, 'square', 0.12, 0.14, undefined, now);
        osc(440, 'square', 0.12, 0.14, undefined, now + 0.22);
        osc(440, 'square', 0.12, 0.14, undefined, now + 0.44);
    }

    function explosion() {
        if (!ctx || muted) return;
        resume();
        noiseBurst(0.55, 0.35);
        osc(60, 'sawtooth', 0.55, 0.22, 30);
    }

    function uiClick() {
        if (!ctx || muted) return;
        resume();
        osc(660, 'sine', 0.06, 0.10);
    }

    function comboUp() {
        if (!ctx || muted) return;
        resume();
        const now = ctx.currentTime;
        [523, 659, 784].forEach((f, i) => osc(f, 'sine', 0.09, 0.13, undefined, now + i * 0.055));
    }

    function overdrive() {
        if (!ctx || muted) return;
        resume();
        const now = ctx.currentTime;
        [440, 550, 660, 880, 1100, 1320].forEach((f, i) => {
            osc(f, 'sawtooth', 0.18, 0.10, undefined, now + i * 0.04);
        });
    }

    function timerWarning() {
        if (!ctx || muted) return;
        resume();
        osc(660, 'square', 0.08, 0.12);
    }

    // ── Combat SFX ──────────────────────────────────────────
    function shoot() {
        // Pulse Blaster: short laser tick
        if (!ctx || muted) return;
        resume();
        osc(1200, 'square', 0.025, 0.07, 600);
        noiseBurst(0.015, 0.04);
    }

    function rocket() {
        // Tri-Rocket: whoosh then low boom on landing
        if (!ctx || muted) return;
        resume();
        osc(180, 'sawtooth', 0.18, 0.10, 60);
        noiseBurst(0.10, 0.08, ctx.currentTime + 0.12);
    }

    function minePlace() {
        // Neon Mine placed: two quick low beeps
        if (!ctx || muted) return;
        resume();
        const now = ctx.currentTime;
        osc(220, 'sine', 0.06, 0.12, undefined, now);
        osc(330, 'sine', 0.06, 0.10, undefined, now + 0.10);
    }

    function shieldUp() {
        // Phase Shield activated: rising electronic hum
        if (!ctx || muted) return;
        resume();
        const now = ctx.currentTime;
        osc(220, 'sine', 0.30, 0.08, 660, now);
        osc(330, 'sine', 0.20, 0.06, 880, now + 0.05);
    }

    function maceActivate() {
        // Wrecking Halo: mechanical spin-up
        if (!ctx || muted) return;
        resume();
        const now = ctx.currentTime;
        osc(80, 'sawtooth', 0.25, 0.12, 200, now);
        noiseBurst(0.18, 0.06, now + 0.05);
        osc(200, 'sawtooth', 0.20, 0.08, 400, now + 0.12);
    }

    function powerPickup() {
        // Mystery crate collected: cyber-ping ascending arpeggio
        if (!ctx || muted) return;
        resume();
        const now = ctx.currentTime;
        osc(440, 'sine', 0.06, 0.14, undefined, now);
        osc(660, 'sine', 0.06, 0.16, undefined, now + 0.05);
        osc(880, 'sine', 0.06, 0.18, undefined, now + 0.10);
        osc(1320, 'sine', 0.10, 0.22, undefined, now + 0.16);
    }

    // ── Siren Loop ──────────────────────────────────────────
    function initSiren() {
        if (!ctx) return;
        
        sirenOsc = ctx.createOscillator();
        sirenGain = ctx.createGain();
        sirenLfo = ctx.createOscillator();
        
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 180; // Pitch bend range
        
        sirenLfo.frequency.value = 1.2; // Wee-woo speed
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 750; // Base freq
        
        sirenGain.gain.value = 0; // Silent by default
        
        sirenOsc.connect(sirenGain);
        sirenGain.connect(ctx.destination);
        
        sirenOsc.start();
        sirenLfo.start();
        isSirenPlaying = true;
    }

    function updateSiren(distance) {
        if (!ctx || muted) {
            if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
            return;
        }
        if (!isSirenPlaying) initSiren();
        if (!sirenGain) return;
        
        resume();

        const maxDist = NeonDelivery.Config.POLICE_DETECT_RANGE * 1.5;
        if (distance > maxDist || distance < 0) {
            sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        } else {
            const vol = 0.12 * (1 - (distance / maxDist));
            sirenGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.1);
        }
    }

    return {
        init, setMuted, isMuted, resume,
        boost, pickup, delivery, collision, coin, laser,
        warning, explosion, uiClick, comboUp, overdrive, timerWarning,
        shoot, rocket, minePlace, shieldUp, maceActivate, powerPickup,
        updateSiren
    };
})();
