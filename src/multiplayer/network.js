NeonDelivery.Network = (function() {
    let socket = null;
    let localPlayerId = null;
    let isConnecting = false;

    function getBackendUrl() {
        if (window.SMASHGO_SERVER_URL) return window.SMASHGO_SERVER_URL;
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host.includes('onrender.com')) {
            return undefined; // Same origin
        }
        return 'https://smashgo.onrender.com';
    }

    function init() {
        if (typeof io === 'undefined' || socket) return;

        const serverUrl = getBackendUrl();
        const socketOptions = {
            transports: ['websocket', 'polling'],
            timeout: 20000,
            reconnectionAttempts: 15,
            reconnectionDelay: 1000
        };

        isConnecting = true;
        socket = serverUrl ? io(serverUrl, socketOptions) : io(socketOptions);

        socket.on('connect', () => {
            isConnecting = false;
            localPlayerId = socket.id;
            console.log('[SmashGo] Connected to backend! ID:', socket.id);
        });

        socket.on('connect_error', (err) => {
            isConnecting = false;
            console.warn('[SmashGo] Backend connection:', err.message);
        });

        socket.on('roomStateUpdate', (state) => {
            NeonDelivery.Multiplayer.onRoomStateUpdate(state);
        });
        socket.on('combatFx', (ev) => {
            if (NeonDelivery.CombatVisuals) NeonDelivery.CombatVisuals.onCombatFx(ev);
        });
        socket.on('combatConfirm', (data) => {
            if (NeonDelivery.CombatVisuals) NeonDelivery.CombatVisuals.onCombatConfirm(data);
        });
        socket.on('killFeed', (data) => {
            if (NeonDelivery.Multiplayer && NeonDelivery.Multiplayer.onKillFeed) {
                NeonDelivery.Multiplayer.onKillFeed(data);
            }
        });
    }

    function ensureConnected(actionFn, callback) {
        if (!socket) {
            init();
        }
        if (!socket) {
            return callback({ success: false, message: 'Socket library failed to load.' });
        }
        if (socket.connected) {
            return actionFn();
        }

        // Server might be waking up on Render (free tier takes ~20-30s on first ping)
        let handled = false;
        const timer = setTimeout(() => {
            if (!handled) {
                handled = true;
                callback({ success: false, message: 'Server is starting up (Render free tier). Please try clicking again in 10 seconds!' });
            }
        }, 12000);

        socket.once('connect', () => {
            if (!handled) {
                handled = true;
                clearTimeout(timer);
                actionFn();
            }
        });
    }

    function createRoom(username, callback) {
        ensureConnected(() => {
            socket.emit('createRoom', { username }, callback);
        }, callback);
    }

    function joinRoom(username, roomCode, callback) {
        ensureConnected(() => {
            socket.emit('joinRoom', { username, roomCode }, callback);
        }, callback);
    }

    function setReady(isReady) {
        if (socket && socket.connected) socket.emit('setReady', isReady);
    }

    function setMatchDuration(minutes) {
        if (socket && socket.connected) socket.emit('setMatchDuration', minutes);
    }

    function startMatch() {
        if (socket && socket.connected) socket.emit('startMatch');
    }

    function sendInputs(inputs) {
        if (socket && socket.connected) socket.emit('inputs', inputs);
    }

    function leaveRoom() {
        if (socket && socket.connected) socket.emit('leaveRoom');
    }

    return {
        init,
        createRoom,
        joinRoom,
        setReady,
        setMatchDuration,
        startMatch,
        sendInputs,
        leaveRoom,
        get localId() { return localPlayerId; },
        get isConnected() { return Boolean(socket && socket.connected); }
    };
})();
