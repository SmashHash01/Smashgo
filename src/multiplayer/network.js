NeonDelivery.Network = (function() {
    let socket = null;
    let localPlayerId = null;

    function init() {
        if (typeof io === 'undefined' || socket) return;

        // Connect to same origin if self-hosted (e.g. on Render or localhost), or to configured Render backend if on GitHub Pages
        const serverUrl = window.SMASHGO_SERVER_URL || (
            window.location.hostname.includes('github.io')
                ? 'https://smashgo.onrender.com'
                : undefined
        );

        socket = serverUrl ? io(serverUrl) : io();
        socket.on('connect', () => {
            localPlayerId = socket.id;
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
    }

    function createRoom(username, callback) {
        if (socket) socket.emit('createRoom', { username }, callback);
    }

    function joinRoom(username, roomCode, callback) {
        if (socket) socket.emit('joinRoom', { username, roomCode }, callback);
    }

    function setReady(isReady) {
        if (socket) socket.emit('setReady', isReady);
    }

    function setMatchDuration(minutes) {
        if (socket) socket.emit('setMatchDuration', minutes);
    }

    function startMatch() {
        if (socket) socket.emit('startMatch');
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
        get localId() { return localPlayerId; }
    };
})();
