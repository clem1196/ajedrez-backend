"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = void 0;
const socket_io_1 = require("socket.io");
const roomManager_1 = require("./roomManager");
const gameHandler_1 = require("./gameHandler");
const roomManager = new roomManager_1.RoomManager();
const initSocketServer = (httpServer) => {
    const io = new socket_io_1.Server(httpServer, {
        cors: { origin: "*", methods: ["GET", "POST"] }
    });
    io.on('connection', (socket) => {
        console.log(`Usuario conectado: ${socket.id}`);
        // --- ESCUCHA: INGRESO A COLA GENERAL ---
        socket.on('join_game', ({ nick }) => {
            const finalNick = (nick && typeof nick === 'string' && nick.trim() !== '')
                ? nick.trim()
                : `Invitado_${socket.id.substring(0, 5)}`;
            console.log(`${finalNick} está buscando partida...`);
            const room = roomManager.addToGuestQueue(socket.id, finalNick);
            if (room) {
                setupRoomSocketsAndStart(io, socket, room);
                room.initialMoveTimer = setTimeout(() => {
                    console.log(`⏱️ Tiempo límite superado. El jugador blanco no movió en la sala: ${room.roomId}`);
                    const message = `Partida Abortada: El jugador de Blancas (${room.playerWhite.nick}) no inició el juego a tiempo.`;
                    // Enviamos el fin de juego reglamentario a la sala
                    io.to(room.roomId).emit('game_over', {
                        reason: 'abort_by_inactivity',
                        message: message
                    });
                    // 🎁 AQUÍ FUTURO PROCESO DE BASE DE DATOS: 
                    // room.playerBlack.nick gana un punto por la espera.
                    // Limpieza de sockets y eliminación de la sala
                    roomManager.removeRoom(room.roomId);
                }, 1 * 60 * 1000); // Cambia el 1 por los minutos que prefieras
            }
            else {
                socket.emit('waiting_for_opponent', { message: 'Buscando un oponente disponible...' });
            }
        });
        // --- ESCUCHAS: SISTEMA DE REVANCHAS DIRECTAS ---
        socket.on('propose_rematch', ({ roomId }) => {
            const room = roomManager.getRoom(roomId);
            if (room) {
                const opponentId = room.playerWhite.socketId === socket.id ? room.playerBlack.socketId : room.playerWhite.socketId;
                io.to(opponentId).emit('rematch_requested');
            }
        });
        socket.on('cancel_rematch_proposal', ({ roomId }) => {
            const room = roomManager.getRoom(roomId);
            if (room) {
                const opponentId = room.playerWhite.socketId === socket.id ? room.playerBlack.socketId : room.playerWhite.socketId;
                io.to(opponentId).emit('rematch_declined');
            }
        });
        socket.on('decline_rematch', ({ roomId }) => {
            const room = roomManager.getRoom(roomId);
            if (room) {
                const opponentId = room.playerWhite.socketId === socket.id ? room.playerBlack.socketId : room.playerWhite.socketId;
                io.to(opponentId).emit('rematch_declined');
            }
        });
        socket.on('accept_rematch', ({ roomId }) => {
            // Delegamos la lógica pesada de inversión de bando al manager
            const newRoom = roomManager.createRematchRoom(roomId);
            if (newRoom) {
                setupRoomSocketsAndStart(io, socket, newRoom);
                console.log(`🔄 Revancha creada con éxito. Nueva sala: ${newRoom.roomId}`);
            }
        });
        // --- MANEJADORES EXTERNOS ---
        (0, gameHandler_1.registerGameHandlers)(io, socket, roomManager);
        // --- GESTIÓN DE DESCONEXIONES ---
        socket.on('disconnect', () => {
            roomManager.removeFromQueue(socket.id);
            console.log(`Usuario desconectado: ${socket.id}`);
            const activeRoom = roomManager.getRoomByPlayerId(socket.id);
            if (activeRoom) {
                if (activeRoom.timerInterval)
                    clearInterval(activeRoom.timerInterval);
                io.to(activeRoom.roomId).emit('game_over', {
                    reason: 'surrender',
                    loserSocketId: socket.id,
                    message: 'Tu oponente se ha desconectado. Victoria por abandono.'
                });
                roomManager.removeRoom(activeRoom.roomId);
            }
        });
    });
};
exports.initSocketServer = initSocketServer;
/**
 * ⚡ FUNCIÓN AUXILIAR: Enlaza los sockets a la sala, emite eventos y arranca el cronómetro unificado
 */
const setupRoomSocketsAndStart = (io, currentSocket, room) => {
    // Unir al socket actual
    currentSocket.join(room.roomId);
    // Unir al oponente
    const opponentId = room.playerWhite.socketId === currentSocket.id ? room.playerBlack.socketId : room.playerWhite.socketId;
    const opponentSocket = io.sockets.sockets.get(opponentId);
    if (opponentSocket)
        opponentSocket.join(room.roomId);
    // Notificar el inicio a ambos navegadores
    io.to(room.roomId).emit('game_started', {
        roomId: room.roomId,
        white: { id: room.playerWhite.socketId, nick: room.playerWhite.nick },
        black: { id: room.playerBlack.socketId, nick: room.playerBlack.nick },
        fen: room.chessInstance.fen()
    });
    // Arrancar el reloj oficial sin duplicar código
    startRoomTimer(io, room);
};
/**
 * ⏱️ MOTOR UNIFICADO DEL RELOJ DE JUEGO (Se ejecuta de fondo por sala)
 */
const startRoomTimer = (io, room) => {
    room.timerInterval = setInterval(() => {
        if (!room.gameStarted)
            return;
        const turn = room.chessInstance.turn();
        if (turn === 'w') {
            if (room.whiteTime > 0)
                room.whiteTime--;
        }
        else {
            if (room.blackTime > 0)
                room.blackTime--;
        }
        room.moveInactivitySeconds++;
        // Advertencia de inactividad
        if (room.moveInactivitySeconds >= 220 && room.moveInactivitySeconds < 240) {
            const inactivePlayerSocketId = turn === 'w' ? room.playerWhite.socketId : room.playerBlack.socketId;
            io.to(inactivePlayerSocketId).emit('inactivity_warning', {
                secondsLeft: 240 - room.moveInactivitySeconds
            });
        }
        // Expulsión por inactividad (4 minutos)
        if (room.moveInactivitySeconds >= 240) {
            clearInterval(room.timerInterval);
            const loserSocketId = turn === 'w' ? room.playerWhite.socketId : room.playerBlack.socketId;
            io.to(room.roomId).emit('game_over', {
                reason: 'inactivity_kick',
                loserSocketId,
                message: turn === 'w' ? 'Las Blancas fueron descalificadas por inactividad.' : 'Las Negras fueron descalificadas por inactividad.'
            });
            return;
        }
        // Sincronizar relojes con el cliente
        io.to(room.roomId).emit('clock_update', {
            whiteTime: room.whiteTime,
            blackTime: room.blackTime
        });
        // Fin por tiempo
        if (room.whiteTime === 0 || room.blackTime === 0) {
            clearInterval(room.timerInterval);
            io.to(room.roomId).emit('game_over', {
                reason: 'timeout',
                message: room.whiteTime === 0 ? 'Las Blancas perdieron por tiempo.' : 'Las Negras perdieron por tiempo.'
            });
        }
    }, 1000);
};
