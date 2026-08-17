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
            createRoomOverlay:  document.getElementById('create-room-overlay'),
            joinRoomOverlay:    document.getElementById('join-room-overlay'),
            lobbyOverlay:       document.getElementById('lobby-overlay'),
            mpResultsOverlay:   document.getElementById('mp-results-overlay'),
            pauseOverlay:       document.getElementById('pause-overlay'),
            levelComplOverlay:  document.getElementById('levelcomplete-overlay'),
            gameoverOverlay:    document.getElementById('gameover-overlay'),
            overdriveOverlay:   document.getElementById('overdrive-overlay'),
            
            menuHighScore:      document.getElementById('menu-high-score'),
            menuBestLevel:      document.getElementById('menu-best-level'),
            
            // Multiplayer Inputs
            crUsername:         document.getElementById('cr-username'),
            jrUsername:         document.getElementById('jr-username'),
            jrRoomcode:         document.getElementById('jr-roomcode'),
            
            // Lobby Elements
            lobbyRoomCode:      document.getElementById('lobby-room-code'),
            lobbyPlayerCount:   document.getElementById('lobby-player-count'),
            lobbyPlayerList:    document.getElementById('lobby-player-list'),
            btnLobbyStart:      document.getElementById('btn-lobby-start'),
            btnLobbyReady:      document.getElementById('btn-lobby-ready'),
            matchLengthBtns:    document.getElementById('match-length-btns'),
            lobbySettingsPanel: document.getElementById('lobby-settings-panel'),
            
            // Results Elements
            mpResultsTimer:     document.getElementById('mp-results-timer'),
            mpRankingsList:     document.getElementById('mp-rankings-list'),

            lcLevel:            document.getElementById('lc-level'),
            lcDeliveries:       document.getElementById('lc-deliveries'),
            lcScore:            document.getElementById('lc-score'),
            lcCoins:            document.getElementById('lc-coins'),
            goScore:            document.getElementById('go-score'),
            goHighScore:        document.getElementById('go-high-score'),
            goLevel:            document.getElementById('go-level'),
            goCombo:            document.getElementById('go-combo'),
            
            // Main Buttons
            btnPlaySolo:        document.getElementById('btn-play-solo'),
            btnShowCreateRoom:  document.getElementById('btn-show-create-room'),
            btnShowJoinRoom:    document.getElementById('btn-show-join-room'),
            
            // Create/Join Buttons
            btnCreateRoom:      document.getElementById('btn-create-room'),
            btnCancelCreate:    document.getElementById('btn-cancel-create'),
            btnJoinRoom:        document.getElementById('btn-join-room'),
            btnCancelJoin:      document.getElementById('btn-cancel-join'),
            
            // Lobby/Results Buttons
            btnLobbyLeave:      document.getElementById('btn-lobby-leave'),
            btnMpRematch:       document.getElementById('btn-mp-rematch'),
            btnMpLeave:         document.getElementById('btn-mp-leave'),

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
        ['menuOverlay','createRoomOverlay','joinRoomOverlay','lobbyOverlay','mpResultsOverlay','pauseOverlay','levelComplOverlay','gameoverOverlay']
            .forEach(k => els[k] && els[k].classList.remove('active'));
    }

    function showMenu(saveData) {
        hideAll();
        if (els.menuHighScore && saveData) els.menuHighScore.textContent = saveData.highScore.toLocaleString();
        if (els.menuBestLevel && saveData) els.menuBestLevel.textContent = saveData.bestLevel;
        els.menuOverlay && els.menuOverlay.classList.add('active');
    }

    function showCreateRoom() {
        hideAll();
        if (els.crUsername) els.crUsername.value = '';
        els.createRoomOverlay && els.createRoomOverlay.classList.add('active');
    }

    function showJoinRoom() {
        hideAll();
        if (els.jrUsername) els.jrUsername.value = '';
        if (els.jrRoomcode) els.jrRoomcode.value = '';
        els.joinRoomOverlay && els.joinRoomOverlay.classList.add('active');
    }

    function showLobby(roomState, isHost, localSocketId) {
        hideAll();
        if (els.lobbyRoomCode) els.lobbyRoomCode.textContent = roomState.roomCode;
        if (els.lobbyPlayerCount) els.lobbyPlayerCount.textContent = roomState.players.length;
        
        if (els.lobbyPlayerList) {
            els.lobbyPlayerList.innerHTML = roomState.players.map(p => {
                const isMe = p.id === localSocketId;
                const status = p.isReady ? '<span style="color:#0f0;">READY</span>' : '<span style="color:#888;">NOT READY</span>';
                return `<li>${p.username} ${isMe ? '(You)' : ''} <span style="float:right;">${status}</span></li>`;
            }).join('');
        }

        if (els.lobbySettingsPanel) {
            els.lobbySettingsPanel.style.display = isHost ? 'block' : 'none';
        }

        if (els.btnLobbyStart) {
            els.btnLobbyStart.style.display = isHost ? 'inline-block' : 'none';
            // Enable start if everyone is ready
            const allReady = roomState.players.length > 0 && roomState.players.every(p => p.isReady);
            els.btnLobbyStart.disabled = !allReady;
        }
        
        // Update setting buttons visually
        if (els.matchLengthBtns) {
            Array.from(els.matchLengthBtns.children).forEach(btn => {
                btn.classList.remove('active');
                if (parseInt(btn.dataset.min) === roomState.matchMinutes) {
                    btn.classList.add('active');
                }
            });
        }

        const me = roomState.players.find(p => p.id === localSocketId);
        if (els.btnLobbyReady) {
            els.btnLobbyReady.textContent = me && me.isReady ? 'UNREADY' : 'READY';
        }

        els.lobbyOverlay && els.lobbyOverlay.classList.add('active');
    }

    function showMpResults(results) {
        hideAll();
        els.mpResultsOverlay && els.mpResultsOverlay.classList.add('active');
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
        const bind = (key, ev) => {
            if (els[key] && ev) {
                // Remove old listeners by replacing clone
                const newEl = els[key].cloneNode(true);
                els[key].parentNode.replaceChild(newEl, els[key]);
                els[key] = newEl;
                
                els[key].addEventListener('click', () => {
                    NeonDelivery.Audio.uiClick();
                    ev();
                });
            }
        };

        // Solo Buttons
        bind('btnPlaySolo',  handlers.onPlaySolo);
        bind('btnResume',    handlers.onResume);
        bind('btnQuit',      handlers.onQuit);
        bind('btnNextLevel', handlers.onNextLevel);
        bind('btnRetry',     handlers.onRetry);
        bind('btnMenu',      handlers.onMenu);

        // Multiplayer Nav
        bind('btnShowCreateRoom', handlers.onShowCreateRoom);
        bind('btnShowJoinRoom',   handlers.onShowJoinRoom);
        bind('btnCancelCreate',   handlers.onCancelCreate);
        bind('btnCancelJoin',     handlers.onCancelJoin);

        // Create / Join
        bind('btnCreateRoom', () => handlers.onCreateRoom(els.crUsername.value));
        bind('btnJoinRoom',   () => handlers.onJoinRoom(els.jrUsername.value, els.jrRoomcode.value));

        // Lobby / Results
        bind('btnLobbyReady', handlers.onLobbyReady);
        bind('btnLobbyStart', handlers.onLobbyStart);
        bind('btnLobbyLeave', handlers.onLobbyLeave);
        bind('btnMpRematch',  handlers.onMpRematch);
        bind('btnMpLeave',    handlers.onMpLeave);

        if (els.matchLengthBtns) {
            Array.from(els.matchLengthBtns.children).forEach(btn => {
                btn.addEventListener('click', () => {
                    NeonDelivery.Audio.uiClick();
                    if (handlers.onMatchLengthChange) {
                        handlers.onMatchLengthChange(parseInt(btn.dataset.min));
                    }
                });
            });
        }

        if (els.muteBtn) {
            els.muteBtn.addEventListener('click', () => {
                if(handlers.onMute) handlers.onMute();
            });
        }
    }

    return {
        init, showMenu, showPause, hidePause, hideAll,
        showLevelComplete, showGameOver, flashOverdrive,
        showCreateRoom, showJoinRoom, showLobby, showMpResults,
        updateHUD, updateMuteBtn, bindButtons,
        get hudData() { return hudData; }
    };
})();
