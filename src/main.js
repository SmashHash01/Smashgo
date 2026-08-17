// ============================================================
//  NEON DELIVERY — main.js
//  Bootstraps the application, manages global UI routing,
//  and acts as a facade for the active game mode.
// ============================================================
NeonDelivery.Game = (function () {
    const C = NeonDelivery.Config;
    const GS = C.GameState;
    let saveData = null;

    let activeMode = null; // 'solo' or 'multiplayer'

    function init() {
        const canvas = document.getElementById('game-canvas');
        canvas.width  = C.CANVAS_W;
        canvas.height = C.CANVAS_H;

        applyCanvasScale();
        window.addEventListener('resize', applyCanvasScale);

        saveData = NeonDelivery.Storage.load();
        NeonDelivery.Audio.init(saveData.settings.muted);
        NeonDelivery.Input.init();
        NeonDelivery.Renderer.init(canvas);
        NeonDelivery.UI.init();
        NeonDelivery.UI.updateMuteBtn(NeonDelivery.Audio.isMuted());
        NeonDelivery.Network.init();

        bindUI();

        document.addEventListener('click',     () => NeonDelivery.Audio.resume(), { once: true });
        
        // Ensure fullscreen is captured when interacting (especially after rotating phone)
        document.addEventListener('touchstart', () => {
            NeonDelivery.Audio.resume();
            if (window.innerWidth > window.innerHeight) {
                tryEnterMobileLandscape();
            }
        }, { passive: true });

        NeonDelivery.UI.showMenu(saveData);
    }

    function applyCanvasScale() {
        const winW = Math.max(1, window.innerWidth);
        const winH = Math.max(1, window.innerHeight);

        // Keep the viewport aspect ratio but cap the internal pixel count.
        // The old `640 * (winW / winH)` rule could create absurdly wide
        // canvases when browser chrome/devtools made winH temporarily tiny.
        const MAX_RENDER_PIXELS = 1280 * 720;
        const scale = Math.min(1, Math.sqrt(MAX_RENDER_PIXELS / (winW * winH)));
        C.CANVAS_W = Math.max(320, Math.round(winW * scale));
        C.CANVAS_H = Math.max(240, Math.round(winH * scale));

        const canvas = document.getElementById('game-canvas');
        if (canvas.width !== C.CANVAS_W) canvas.width = C.CANVAS_W;
        if (canvas.height !== C.CANVAS_H) canvas.height = C.CANVAS_H;
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
    }

    function tryEnterMobileLandscape() {
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            try {
                if (document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen().catch(()=>{});
                } else if (document.documentElement.webkitRequestFullscreen) {
                    document.documentElement.webkitRequestFullscreen();
                }
            } catch (e) {}
            
            try {
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(()=>{});
                }
            } catch (e) {}
        }
    }

    function bindUI() {
        NeonDelivery.UI.bindButtons({
            // Solo Flow
            onPlaySolo: () => {
                tryEnterMobileLandscape();
                activeMode = 'solo';
                NeonDelivery.Solo.initMode(saveData);
                NeonDelivery.Solo.startGame(1);
            },
            onResume:    () => { if (activeMode === 'solo') NeonDelivery.Solo.setState(GS.PLAYING); },
            onQuit:      () => { if (activeMode === 'solo') NeonDelivery.Solo.quitToMenu(); },
            onNextLevel: () => { if (activeMode === 'solo') NeonDelivery.Solo.startGame(NeonDelivery.Solo.level + 1); },
            onRetry:     () => { if (activeMode === 'solo') NeonDelivery.Solo.startGame(NeonDelivery.Solo.level); },
            onMenu:      () => { if (activeMode === 'solo') NeonDelivery.Solo.quitToMenu(); },
            onMute:      () => {
                const newVal = !NeonDelivery.Audio.isMuted();
                NeonDelivery.Audio.setMuted(newVal);
                saveData.settings.muted = newVal;
                NeonDelivery.Storage.save(saveData);
                NeonDelivery.UI.updateMuteBtn(newVal);
            },

            // Multiplayer Nav
            onShowCreateRoom: () => NeonDelivery.UI.showCreateRoom(),
            onShowJoinRoom:   () => NeonDelivery.UI.showJoinRoom(),
            onCancelCreate:   () => NeonDelivery.UI.showMenu(saveData),
            onCancelJoin:     () => NeonDelivery.UI.showMenu(saveData),
            
            // Multiplayer Actions
            onCreateRoom: (username) => {
                if (!username.trim()) return alert("Enter a username");
                NeonDelivery.Network.createRoom(username, (res) => {
                    if (res.success) {
                        activeMode = 'multiplayer';
                        NeonDelivery.Multiplayer.onRoomStateUpdate(res.roomState);
                    }
                });
            },
            onJoinRoom: (username, roomCode) => {
                if (!username.trim() || !roomCode.trim()) return alert("Enter username and room code");
                NeonDelivery.Network.joinRoom(username, roomCode, (res) => {
                    if (res.success) {
                        activeMode = 'multiplayer';
                        NeonDelivery.Multiplayer.onRoomStateUpdate(res.roomState);
                    } else {
                        alert(res.message);
                    }
                });
            },
            onLobbyReady: () => NeonDelivery.Multiplayer.toggleReady(),
            onMatchLengthChange: (mins) => NeonDelivery.Multiplayer.setMatchLength(mins),
            onLobbyStart: () => {
                tryEnterMobileLandscape();
                NeonDelivery.Multiplayer.startMatch();
            },
            onLobbyLeave: () => NeonDelivery.Multiplayer.leaveRoom(),
            onMpRematch: () => NeonDelivery.Multiplayer.leaveRoom(),
            onMpLeave: () => NeonDelivery.Multiplayer.leaveRoom()
        });
    }

    // ── Facade API for other systems (Drone, Entities, Events) ──
    function onDelivery(job) {
        if (activeMode === 'solo') NeonDelivery.Solo.onDelivery(job);
    }
    
    function triggerGameOver() {
        if (activeMode === 'solo') NeonDelivery.Solo.triggerGameOver();
    }
    
    function onCollision() {
        if (activeMode === 'solo') NeonDelivery.Solo.onCollision();
    }

    function getState() {
        if (activeMode === 'solo') return NeonDelivery.Solo.getState();
        return GS.PLAYING; // Default stub for MP
    }

    return { init, onDelivery, triggerGameOver, onCollision, getState };
})();

// ── Boot ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    NeonDelivery.Game.init();
});
