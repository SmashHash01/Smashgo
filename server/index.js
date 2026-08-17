const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const ArenaRoom = require('./rooms/ArenaRoom');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '../')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    // Fast realtime packets are already small after snapshot packing.
    perMessageDeflate: false
});

const rooms = new Map();

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

function cleanUsername(value) {
    const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    return name.slice(0, 20) || 'Player';
}

function cleanRoomCode(value) {
    return typeof value === 'string' ? value.trim().toUpperCase().slice(0, 6) : '';
}

function detachFromCurrentRoom(socket) {
    if (!socket.roomId) return;
    const roomCode = socket.roomId;
    const room = rooms.get(roomCode);
    socket.leave(roomCode);
    socket.roomId = null;

    if (!room) return;
    room.removePlayer(socket.id);
    if (room.players.size === 0) {
        room.destroy(); // critical: stop abandoned simulation/spawner intervals
        rooms.delete(roomCode);
    }
}

io.on('connection', (socket) => {
    socket.on('createRoom', (data = {}, callback = () => {}) => {
        detachFromCurrentRoom(socket);
        const username = cleanUsername(data.username);

        let roomCode = generateRoomCode();
        while (rooms.has(roomCode)) roomCode = generateRoomCode();

        const room = new ArenaRoom(roomCode, socket.id, io);
        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.roomId = roomCode;
        socket.username = username;

        const player = room.addPlayer(socket.id, username);
        callback({ success: true, roomCode, roomState: room.getState(), player });
    });

    socket.on('joinRoom', (data = {}, callback = () => {}) => {
        const username = cleanUsername(data.username);
        const code = cleanRoomCode(data.roomCode);
        const room = rooms.get(code);

        if (!room) return callback({ success: false, message: 'Room not found.' });
        if (room.state !== 'lobby') return callback({ success: false, message: 'Match already in progress.' });
        if (room.players.size >= room.maxPlayers) return callback({ success: false, message: 'Room is full.' });

        detachFromCurrentRoom(socket);
        socket.join(code);
        socket.roomId = code;
        socket.username = username;
        const player = room.addPlayer(socket.id, username);
        callback({ success: true, roomCode: code, roomState: room.getState(), player });
    });

    socket.on('setReady', (isReady) => {
        const room = socket.roomId && rooms.get(socket.roomId);
        if (room) room.setPlayerReady(socket.id, isReady);
    });

    socket.on('setMatchDuration', (minutes) => {
        const room = socket.roomId && rooms.get(socket.roomId);
        if (room && room.hostId === socket.id) room.setMatchDuration(minutes);
    });

    socket.on('startMatch', () => {
        const room = socket.roomId && rooms.get(socket.roomId);
        if (room && room.hostId === socket.id) room.startMatch();
    });

    socket.on('inputs', (inputs) => {
        const room = socket.roomId && rooms.get(socket.roomId);
        if (room && room.state === 'playing') room.setPlayerInputs(socket.id, inputs);
    });

    socket.on('leaveRoom', () => detachFromCurrentRoom(socket));
    socket.on('disconnect', () => detachFromCurrentRoom(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`SmashGo Arena server listening on port ${PORT}`);
});
