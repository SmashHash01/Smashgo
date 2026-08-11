// ============================================================
//  NEON DELIVERY — ui.js
//  DOM overlay management: menu, pause, level-complete,
//  game-over, and the OVERDRIVE notification.
//  Canvas HUD data is computed here and passed to renderer.
// ============================================================
NeonDelivery.UI = (function () {
    const C  = NeonDelivery.Config;
    const GS = C.GameState;

    // ── Element refs ─────────────────────────────────────────
    let els = {};

    // ── Combo visual state ───────────────────────────────────
    let comboScale     = 1;
    let overdriveBlink = 0;

    // ── HUD data (updated each frame) ───────────────────────
    let hudData = {
        score:       0,
        combo:       1,
        comboColor:  C.COLOR.CYAN,
        levelTimer:  60000,
        level:       1
    };

    // ── Init ─────────────────────────────────────────────────
    function init() {
        els = {
            menuOverlay:        document.getElementById('menu-overlay'),
            pauseOverlay:       document.getElementById('pause-overlay'),
            levelComplOverlay:  document.getElementById('levelcomplete-overlay'),
            gameoverOverlay:    document.getElementById('gameover-overlay'),
            overdriveOverlay:   document.getElementById('overdrive-overlay'),
            menuHighScore:      document.getElementById('menu-high-score'),
            menuBestLevel:      document.getElementById('menu-best-level'),
            lcLevel:            document.getElementById('lc-level'),
            lcDeliveries:       document.getElementById('lc-deliveries'),
            lcScore:            document.getElementById('lc-score'),
            lcCoins:            document.getElementById('lc-coins'),
            goScore:            document.getElementById('go-score'),
            goHighScore:        document.getElementById('go-high-score'),
            goLevel:            document.getElementById('go-level'),
            goCombo:            document.getElementById('go-combo'),
            btnStart:           document.getElementById('btn-start'),
            btnResume:          document.getElementById('btn-resume'),
            btnQuit:            document.getElementById('btn-quit'),
            btnNextLevel:       document.getElementById('btn-next-level'),
            btnRetry:           document.getElementById('btn-retry'),
            btnMenu:            document.getElementById('btn-menu'),
            muteBtn:            document.getElementById('mute-btn'),
            touchControls:      document.getElementById('touch-controls'),
        };

        // Touch controls visibility
        if (isTouchDevice()) {
            els.touchControls && (els.touchControls.style.display = 'flex');
        }
    }

    function isTouchDevice() {
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }

    // ── Show / hide helpers ──────────────────────────────────

    function hideAll() {
        ['menuOverlay','pauseOverlay','levelComplOverlay','gameoverOverlay']
            .forEach(k => els[k] && els[k].classList.remove('active'));
    }

    function showMenu(saveData) {
        hideAll();
        if (els.menuHighScore) els.menuHighScore.textContent = saveData.highScore.toLocaleString();
        if (els.menuBestLevel) els.menuBestLevel.textContent = saveData.bestLevel;
        els.menuOverlay && els.menuOverlay.classList.add('active');
    }

    function showPause() {
        els.pauseOverlay && els.pauseOverlay.classList.add('active');
    }

    function hidePause() {
        els.pauseOverlay && els.pauseOverlay.classList.remove('active');
    }

    function showLevelComplete(data) {
        // data: { level, deliveries, score, coins }
        hideAll();
        if (els.lcLevel)      els.lcLevel.textContent      = data.level;
        if (els.lcDeliveries) els.lcDeliveries.textContent  = data.deliveries;
        if (els.lcScore)      els.lcScore.textContent       = data.score.toLocaleString();
        if (els.lcCoins)      els.lcCoins.textContent       = '+' + data.coins;
        els.levelComplOverlay && els.levelComplOverlay.classList.add('active');
    }

    function showGameOver(data) {
        // data: { score, highScore, level, maxCombo }
        hideAll();
        if (els.goScore)     els.goScore.textContent     = data.score.toLocaleString();
        if (els.goHighScore) els.goHighScore.textContent = data.highScore.toLocaleString();
        if (els.goLevel)     els.goLevel.textContent     = data.level;
        if (els.goCombo)     els.goCombo.textContent     = 'x' + data.maxCombo;
        els.gameoverOverlay && els.gameoverOverlay.classList.add('active');
    }

    // ── Overdrive notification ───────────────────────────────

    function flashOverdrive() {
        if (!els.overdriveOverlay) return;
        els.overdriveOverlay.classList.add('visible');
        setTimeout(() => {
            els.overdriveOverlay && els.overdriveOverlay.classList.remove('visible');
        }, 3000);
    }

    // ── Update HUD data from game state ─────────────────────

    function updateHUD(score, combo, levelTimer, level) {
        hudData.score      = Math.round(score);
        hudData.combo      = combo;
        hudData.levelTimer = levelTimer;
        hudData.level      = level;
        hudData.comboColor = C.COMBO_COLORS[Math.min(combo - 1, C.COMBO_COLORS.length - 1)];
    }

    // ── Mute button ──────────────────────────────────────────

    function updateMuteBtn(muted) {
        if (els.muteBtn) els.muteBtn.textContent = muted ? '🔇' : '🔊';
    }

    // ── Button event binding (called by main.js) ─────────────

    function bindButtons(handlers) {
        // handlers: { onStart, onResume, onQuit, onNextLevel, onRetry, onMenu, onMute }
        const bind = (key, ev) => {
            if (els[key]) els[key].addEventListener('click', () => {
                NeonDelivery.Audio.uiClick();
                ev();
            });
        };
        bind('btnStart',     handlers.onStart);
        bind('btnResume',    handlers.onResume);
        bind('btnQuit',      handlers.onQuit);
        bind('btnNextLevel', handlers.onNextLevel);
        bind('btnRetry',     handlers.onRetry);
        bind('btnMenu',      handlers.onMenu);
        if (els.muteBtn) {
            els.muteBtn.addEventListener('click', () => {
                handlers.onMute();
            });
        }
    }

    return {
        init, showMenu, showPause, hidePause, hideAll,
        showLevelComplete, showGameOver, flashOverdrive,
        updateHUD, updateMuteBtn, bindButtons,
        get hudData() { return hudData; }
    };
})();
