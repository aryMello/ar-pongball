// AR PongBall - Node.js Server Implementation
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Game rooms storage (in production, use Redis or database)
const gameRooms = new Map();
const playerSessions = new Map();

// Room management
class GameRoom {
    constructor(roomId) {
        this.id = roomId;
        this.players = new Map();
        this.gameState = {
            ball: {
                position: { x: 0, y: 1, z: 0 },
                velocity: { x: 0, y: 0, z: 0.03 }
            },
            scores: { player1: 0, player2: 0 },
            isActive: false,
            lastUpdate: Date.now()
        };
        this.settings = {
            maxPlayers: 2,
            gameMode: 'pong',
            roomDimensions: { width: 4, depth: 6, height: 3 }
        };
        this.createdAt = Date.now();
    }
    
    addPlayer(playerId, socketId, playerInfo) {
        if (this.players.size >= this.settings.maxPlayers) {
            return false;
        }
        
        this.players.set(playerId, {
            id: playerId,
            socketId: socketId,
            name: playerInfo.name || `Player ${this.players.size + 1}`,
            position: { x: 0, y: 1.6, z: this.players.size === 0 ? 2.5 : -2.5 },
            isReady: false,
            lastSeen: Date.now(),
            stats: {
                hits: 0,
                misses: 0,
                gameTime: 0
            }
        });
        
        return true;
    }
    
    removePlayer(playerId) {
        return this.players.delete(playerId);
    }
    
    getPlayer(playerId) {
        return this.players.get(playerId);
    }
    
    getAllPlayers() {
        return Array.from(this.players.values());
    }
    
    isReady() {
        return this.players.size === 2 && 
               Array.from(this.players.values()).every(player => player.isReady);
    }
    
    updateGameState(newState) {
        this.gameState = { ...this.gameState, ...newState };
        this.gameState.lastUpdate = Date.now();
    }
    
    broadcastToRoom(eventName, data, excludePlayerId = null) {
        this.players.forEach((player, playerId) => {
            if (playerId !== excludePlayerId) {
                const socket = io.sockets.sockets.get(player.socketId);
                if (socket) {
                    socket.emit(eventName, data);
                }
            }
        });
    }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Handle room joining with persistent playerId
    socket.on('join-room', (data) => {
        const { roomId, playerInfo } = data;
        let playerId = data.playerId || generatePlayerId();

        // Create room if it doesn't exist
        if (!gameRooms.has(roomId)) {
            gameRooms.set(roomId, new GameRoom(roomId));
            console.log(`Created new room: ${roomId}`);
        }

        const room = gameRooms.get(roomId);

        // Prevent duplicate player entry
        if (room.getPlayer(playerId)) {
            console.log(`Player ${playerId} already in room ${roomId}, replacing old entry`);
            room.removePlayer(playerId);
        }

        // Add player to room
        if (room.addPlayer(playerId, socket.id, playerInfo)) {
            socket.join(roomId);
            playerSessions.set(socket.id, { playerId, roomId });

            socket.emit('room-joined', {
                success: true,
                playerId,
                roomId,
                players: room.getAllPlayers(),
                gameState: room.gameState
            });

            room.broadcastToRoom('player-joined', {
                player: room.getPlayer(playerId),
                totalPlayers: room.players.size
            }, playerId);

            console.log(`Player ${playerId} joined room ${roomId}`);

            // Start game if both players are ready
            if (room.isReady()) {
                startGameInRoom(roomId);
            }
        } else {
            socket.emit('room-join-failed', {
                error: 'Room is full or unavailable'
            });
        }
    });

    // Handle player ready status
    socket.on('player-ready', (data) => {
        const session = playerSessions.get(socket.id);
        if (!session) return;

        const room = gameRooms.get(session.roomId);
        const player = room.getPlayer(session.playerId);

        if (player) {
            player.isReady = true;
            room.broadcastToRoom('player-ready', {
                playerId: session.playerId,
                allReady: room.isReady()
            });

            if (room.isReady()) {
                startGameInRoom(session.roomId);
            }
        }
    });

    // Handle game updates from player
    socket.on('game-update', (data) => {
        const session = playerSessions.get(socket.id);
        if (!session) return;

        const room = gameRooms.get(session.roomId);
        if (!room) return;

        const player = room.getPlayer(session.playerId);
        if (player && data.playerPosition) {
            player.position = data.playerPosition;
            player.lastSeen = Date.now();
        }

        // Ball hit event
        if (data.type === 'ball-hit') {
            room.updateGameState({
                ball: {
                    position: data.ballPosition,
                    velocity: data.ballVelocity
                }
            });

            if (player) player.stats.hits++;

            room.broadcastToRoom('ball-update', {
                ball: room.gameState.ball,
                hitBy: session.playerId,
                timestamp: Date.now()
            }, session.playerId);
        }

        // Score update
        if (data.type === 'score-update') {
            room.updateGameState({
                scores: data.scores
            });

            room.broadcastToRoom('score-update', {
                scores: room.gameState.scores,
                scoredBy: session.playerId
            }, session.playerId);

            const maxScore = 11;
            if (Math.max(data.scores.player1, data.scores.player2) >= maxScore) {
                endGameInRoom(session.roomId, data.scores);
            }
        }
    });

    // Handle player disconnection
    socket.on('disconnect', () => {
        const session = playerSessions.get(socket.id);
        if (session) {
            const room = gameRooms.get(session.roomId);
            if (room) {
                room.removePlayer(session.playerId);
                room.broadcastToRoom('player-left', {
                    playerId: session.playerId,
                    remainingPlayers: room.getAllPlayers()
                });

                console.log(`Player ${session.playerId} left room ${session.roomId}`);

                if (room.players.size === 0) {
                    gameRooms.delete(session.roomId);
                    console.log(`Deleted empty room: ${session.roomId}`);
                }
            }

            playerSessions.delete(socket.id);
        }

        console.log(`Player disconnected: ${socket.id}`);
    });

    // Handle list-rooms request
    socket.on('list-rooms', () => {
        const publicRooms = Array.from(gameRooms.values())
            .filter(room => room.players.size < room.settings.maxPlayers)
            .map(room => ({
                id: room.id,
                playerCount: room.players.size,
                maxPlayers: room.settings.maxPlayers,
                gameMode: room.settings.gameMode,
                createdAt: room.createdAt
            }));

        socket.emit('room-list', publicRooms);
    });

    // Latency ping-pong
    socket.on('ping', (timestamp) => {
        socket.emit('pong', timestamp);
    });
});


// Game management functions
function startGameInRoom(roomId) {
    const room = gameRooms.get(roomId);
    if (!room) return;
    
    room.gameState.isActive = true;
    room.gameState.startTime = Date.now();
    
    // Reset ball position
    room.gameState.ball = {
        position: { x: 0, y: 1, z: 0 },
        velocity: { 
            x: (Math.random() - 0.5) * 0.02,
            y: 0,
            z: Math.random() > 0.5 ? 0.03 : -0.03
        }
    };
    
    room.broadcastToRoom('game-started', {
        gameState: room.gameState,
        players: room.getAllPlayers()
    });
    
    console.log(`Game started in room: ${roomId}`);
}

function endGameInRoom(roomId, finalScores) {
    const room = gameRooms.get(roomId);
    if (!room) return;
    
    room.gameState.isActive = false;
    room.gameState.endTime = Date.now();
    room.gameState.duration = room.gameState.endTime - room.gameState.startTime;
    
    // Determine winner
    const winner = finalScores.player1 > finalScores.player2 ? 'player1' : 'player2';
    
    room.broadcastToRoom('game-ended', {
        finalScores: finalScores,
        winner: winner,
        gameStats: {
            duration: room.gameState.duration,
            totalHits: Array.from(room.players.values()).reduce((sum, p) => sum + p.stats.hits, 0)
        }
    });
    
    // Store game statistics
    storeGameStatistics(room);
    
    console.log(`Game ended in room: ${roomId}, winner: ${winner}`);
}

// REST API endpoints
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: Date.now(),
        activeRooms: gameRooms.size,
        connectedPlayers: playerSessions.size
    });
});

app.get('/api/rooms', (req, res) => {
    const rooms = Array.from(gameRooms.values()).map(room => ({
        id: room.id,
        playerCount: room.players.size,
        maxPlayers: room.settings.maxPlayers,
        isActive: room.gameState.isActive,
        createdAt: room.createdAt
    }));
    
    res.json(rooms);
});

app.post('/api/create-room', (req, res) => {
    const roomId = generateRoomCode();
    const room = new GameRoom(roomId);
    
    if (req.body.settings) {
        room.settings = { ...room.settings, ...req.body.settings };
    }
    
    gameRooms.set(roomId, room);
    
    res.json({
        success: true,
        roomId: roomId,
        room: {
            id: room.id,
            settings: room.settings,
            createdAt: room.createdAt
        }
    });
});

app.get('/api/room/:roomId', (req, res) => {
    const room = gameRooms.get(req.params.roomId);
    
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({
        id: room.id,
        playerCount: room.players.size,
        maxPlayers: room.settings.maxPlayers,
        isActive: room.gameState.isActive,
        players: room.getAllPlayers().map(p => ({
            id: p.id,
            name: p.name,
            isReady: p.isReady
        }))
    });
});

app.post('/api/sync-game-data', (req, res) => {
    const gameDataArray = req.body;
    
    // Process and store game data
    gameDataArray.forEach(data => {
        console.log('Storing game data:', data.type);
        // In production, save to database
    });
    
    res.json({ success: true, processed: gameDataArray.length });
});

// WebRTC signaling endpoints
app.post('/api/webrtc/offer', (req, res) => {
    const { roomId, offer, playerId } = req.body;
    const room = gameRooms.get(roomId);
    
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    
    // Forward offer to other players in room
    room.broadcastToRoom('webrtc-offer', {
        offer: offer,
        from: playerId
    }, playerId);
    
    res.json({ success: true });
});

app.post('/api/webrtc/answer', (req, res) => {
    const { roomId, answer, playerId, targetPlayerId } = req.body;
    const room = gameRooms.get(roomId);
    
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    
    const targetPlayer = room.getPlayer(targetPlayerId);
    if (targetPlayer) {
        const socket = io.sockets.sockets.get(targetPlayer.socketId);
        if (socket) {
            socket.emit('webrtc-answer', {
                answer: answer,
                from: playerId
            });
        }
    }
    
    res.json({ success: true });
});

app.post('/api/webrtc/ice-candidate', (req, res) => {
    const { roomId, candidate, playerId, targetPlayerId } = req.body;
    const room = gameRooms.get(roomId);
    
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    
    if (targetPlayerId) {
        const targetPlayer = room.getPlayer(targetPlayerId);
        if (targetPlayer) {
            const socket = io.sockets.sockets.get(targetPlayer.socketId);
            if (socket) {
                socket.emit('webrtc-ice-candidate', {
                    candidate: candidate,
                    from: playerId
                });
            }
        }
    } else {
        // Broadcast to all other players
        room.broadcastToRoom('webrtc-ice-candidate', {
            candidate: candidate,
            from: playerId
        }, playerId);
    }
    
    res.json({ success: true });
});

// Game statistics and analytics
app.get('/api/stats', (req, res) => {
    const stats = {
        totalRooms: gameRooms.size,
        activeGames: Array.from(gameRooms.values()).filter(room => room.gameState.isActive).length,
        totalPlayers: playerSessions.size,
        serverUptime: process.uptime(),
        memoryUsage: process.memoryUsage()
    };
    
    res.json(stats);
});

// Room cleanup and maintenance
setInterval(() => {
    const now = Date.now();
    const roomTimeout = 30 * 60 * 1000; // 30 minutes
    
    for (const [roomId, room] of gameRooms.entries()) {
        // Remove inactive rooms
        if (now - room.createdAt > roomTimeout && room.players.size === 0) {
            gameRooms.delete(roomId);
            console.log(`Cleaned up inactive room: ${roomId}`);
        }
        
        // Remove disconnected players
        for (const [playerId, player] of room.players.entries()) {
            if (now - player.lastSeen > 5 * 60 * 1000) { // 5 minutes
                room.removePlayer(playerId);
                console.log(`Removed inactive player: ${playerId} from room: ${roomId}`);
                
                room.broadcastToRoom('player-timeout', {
                    playerId: playerId
                });
            }
        }
    }
}, 60000); // Run every minute

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Utility functions
function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function generatePlayerId() {
    return 'player_' + Math.random().toString(36).substr(2, 9);
}

function storeGameStatistics(room) {
    const stats = {
        roomId: room.id,
        duration: room.gameState.duration,
        finalScores: room.gameState.scores,
        players: room.getAllPlayers().map(p => ({
            id: p.id,
            name: p.name,
            stats: p.stats
        })),
        timestamp: Date.now()
    };
    
    // In production, save to database
    console.log('Game statistics:', stats);
}

// Server startup
server.listen(PORT, () => {
    console.log(`🏓 AR PongBall server running on port ${PORT}`);
    console.log(`🌐 Access at: http://localhost:${PORT}`);
    console.log(`📱 For mobile: http://[your-ip]:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = { app, server, io };