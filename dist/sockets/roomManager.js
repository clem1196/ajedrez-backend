"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = exports.TIME_CONSTANTS = void 0;
// src/sockets/roomManager.ts
const chess_js_1 = require("chess.js");
// ⏱️ CONSTANTES DE TIEMPO (TODAS EN SEGUNDOS)
exports.TIME_CONSTANTS = {
    COURTESY_SECONDS: 60,
    TURN_SECONDS: 90,
    AFK_SECONDS: 70,
    INACTIVITY_KICK_SECONDS: 240,
    RECONNECTION_TIMEOUT: 45, // ✅ Nuevo: Tiempo de espera para reconexión en segundos
};
class RoomManager {
    guestQueues = new Map();
    activeRooms = new Map();
    addToGuestQueue(socketId, nick, minutes, elo = 1200) {
        const newPlayer = { socketId, nick, isBot: false, elo };
        if (!this.guestQueues.has(minutes)) {
            this.guestQueues.set(minutes, []);
        }
        const queue = this.guestQueues.get(minutes);
        if (queue.some((p) => p.socketId === socketId)) {
            console.log(`⚠️ ${nick} ya está en la cola de ${minutes} min`);
            return null;
        }
        if (queue.length === 0) {
            queue.push(newPlayer);
            console.log(`📌 ${nick} agregado a la cola de ${minutes} min (esperando oponente)`);
            return null;
        }
        if (queue[0].socketId === socketId) {
            return null;
        }
        const opponent = queue.shift();
        const isWhite = Math.random() > 0.5;
        newPlayer.color = isWhite ? "w" : "b";
        opponent.color = isWhite ? "b" : "w";
        const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const timeInSeconds = minutes * 60;
        console.log(`🎯 Emparejamiento creado: ${newPlayer.nick} vs ${opponent.nick} (${minutes} min)`);
        const newRoom = {
            roomId,
            playerWhite: {
                ...(newPlayer.color === "w" ? newPlayer : opponent),
                isBot: false, // ✅ Los humanos no son bots
            },
            playerBlack: {
                ...(newPlayer.color === "b" ? newPlayer : opponent),
                isBot: false,
            },
            chessInstance: new chess_js_1.Chess(),
            whiteTime: timeInSeconds,
            blackTime: timeInSeconds,
            initialTimeAllocated: timeInSeconds,
            gameStarted: false,
            gameEnded: false,
            moveInactivitySeconds: 0,
            moveCount: 0,
            isProcessingEnd: false,
            afkCountdownStarted: false,
            lastMoveTimestamp: Date.now(),
            // ✅ Inicializar nuevas propiedades
            isPaused: false,
            playerDisconnected: undefined,
            _reconnectionTimer: undefined,
        };
        this.activeRooms.set(roomId, newRoom);
        console.log(`🏠 Sala ${roomId} creada con éxito`);
        return newRoom;
    }
    createRematchRoom(oldRoomId) {
        const oldRoom = this.activeRooms.get(oldRoomId);
        if (!oldRoom)
            return null;
        this.clearRoomTimers(oldRoom);
        const nextPlayerWhite = {
            socketId: oldRoom.playerBlack.socketId,
            nick: oldRoom.playerBlack.nick,
            color: "w",
            isBot: oldRoom.playerBlack.isBot,
            elo: oldRoom.playerBlack.elo,
        };
        const nextPlayerBlack = {
            socketId: oldRoom.playerWhite.socketId,
            nick: oldRoom.playerWhite.nick,
            color: "b",
            isBot: oldRoom.playerWhite.isBot,
            elo: oldRoom.playerWhite.elo,
        };
        const newRoomId = `room_rematch_${Date.now()}`;
        const newRoom = {
            roomId: newRoomId,
            playerWhite: nextPlayerWhite,
            playerBlack: nextPlayerBlack,
            chessInstance: new chess_js_1.Chess(),
            whiteTime: oldRoom.initialTimeAllocated,
            blackTime: oldRoom.initialTimeAllocated,
            initialTimeAllocated: oldRoom.initialTimeAllocated,
            gameStarted: false,
            gameEnded: false,
            moveInactivitySeconds: 0,
            moveCount: 0,
            isProcessingEnd: false,
            afkCountdownStarted: false,
            lastMoveTimestamp: Date.now(),
            // ✅ Inicializar nuevas propiedades
            isPaused: false,
            playerDisconnected: undefined,
            _reconnectionTimer: undefined,
        };
        this.activeRooms.set(newRoomId, newRoom);
        this.activeRooms.delete(oldRoomId);
        return newRoom;
    }
    getRoom(roomId) {
        return this.activeRooms.get(roomId);
    }
    // ✅ (clearRoomTimers o removeRoom)
    removeRoom(roomId, botService) {
        const room = this.activeRooms.get(roomId);
        if (room) {
            this.clearRoomTimers(room);
            // ✅ Limpiar timers de bots si existen en esta sala
            if (room.playerWhite?.isBot && botService) {
                botService.removeBot(roomId, room.playerWhite.socketId);
            }
            if (room.playerBlack?.isBot && botService) {
                botService.removeBot(roomId, room.playerBlack.socketId);
            }
        }
        this.activeRooms.delete(roomId);
    }
    clearRoomTimers(room) {
        if (room.timerInterval) {
            clearInterval(room.timerInterval);
            room.timerInterval = undefined;
        }
        if (room.initialMoveTimer) {
            clearTimeout(room.initialMoveTimer);
            room.initialMoveTimer = undefined;
        }
        if (room.turnTimer) {
            clearTimeout(room.turnTimer);
            room.turnTimer = undefined;
        }
        if (room.afkAutoWinTimer) {
            clearTimeout(room.afkAutoWinTimer);
            room.afkAutoWinTimer = undefined;
        }
        if (room.afkCountdownInterval) {
            clearInterval(room.afkCountdownInterval);
            room.afkCountdownInterval = undefined;
        }
        if (room._reconnectionTimer) {
            clearTimeout(room._reconnectionTimer);
            room._reconnectionTimer = undefined;
        }
        room.afkCountdownStarted = false;
    }
    removeFromQueue(socketId) {
        for (const [minutes, queue] of this.guestQueues.entries()) {
            const nuevaCola = queue.filter((p) => p.socketId !== socketId);
            this.guestQueues.set(minutes, nuevaCola);
        }
        console.log(`🧹 [RoomManager] Socket ${socketId} removido de todas las colas.`);
    }
    getRoomByPlayerId(socketId) {
        for (const room of this.activeRooms.values()) {
            if (room.playerWhite.socketId === socketId ||
                room.playerBlack.socketId === socketId) {
                return room;
            }
        }
        return undefined;
    }
    getAllRooms() {
        return Array.from(this.activeRooms.values());
    }
    // ⏱️ UTILITY: Obtener tiempo restante de un jugador
    getPlayerTime(room, color) {
        return color === "w" ? room.whiteTime : room.blackTime;
    }
    // ✅ Versión mejorada de setPlayerDisconnected
    setPlayerDisconnected(roomId, socketId) {
        const room = this.activeRooms.get(roomId);
        if (!room)
            return false;
        // ✅ Determinar el nick del jugador desconectado
        const isWhite = room.playerWhite.socketId === socketId;
        const isBlack = room.playerBlack.socketId === socketId;
        if (!isWhite && !isBlack) {
            console.log(`❌ Socket ${socketId} no pertenece a la sala ${roomId}`);
            return false;
        }
        const nick = isWhite ? room.playerWhite.nick : room.playerBlack.nick;
        room.isPaused = true;
        room.playerDisconnected = {
            socketId: socketId,
            nick: nick, // ✅ Incluir el nick
            disconnectedAt: Date.now(),
        };
        if (room.timerInterval) {
            clearInterval(room.timerInterval);
            room.timerInterval = undefined;
        }
        this.clearRoomTimers(room);
        return true;
    }
    createRoomWithBot(humanSocketId, humanNick, minutes, botPlayerData) {
        const timeInSeconds = minutes * 60;
        const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        // El humano juega contra el bot, el color del humano es aleatorio (o fijo, según tu lógica)
        const isHumanWhite = Math.random() > 0.5;
        const humanPlayer = {
            socketId: humanSocketId,
            nick: humanNick.trim(),
            color: isHumanWhite ? "w" : "b",
            isBot: false,
        };
        // Asignamos el color opuesto al bot que ya nos pasaron
        const finalBotPlayer = {
            ...botPlayerData,
            color: isHumanWhite ? "b" : "w",
        };
        const newRoom = {
            roomId,
            playerWhite: isHumanWhite ? humanPlayer : finalBotPlayer,
            playerBlack: isHumanWhite ? finalBotPlayer : humanPlayer,
            chessInstance: new chess_js_1.Chess(),
            whiteTime: timeInSeconds,
            blackTime: timeInSeconds,
            initialTimeAllocated: timeInSeconds,
            gameStarted: false,
            gameEnded: false,
            moveInactivitySeconds: 0,
            moveCount: 0,
            isProcessingEnd: false,
            afkCountdownStarted: false,
            lastMoveTimestamp: Date.now(),
            isPaused: false,
            playerDisconnected: undefined,
            _reconnectionTimer: undefined,
        };
        this.activeRooms.set(roomId, newRoom);
        console.log(`🏠 Sala ${roomId} creada: ${humanNick} vs ${finalBotPlayer.nick} (${finalBotPlayer.color === "w" ? "Blancas" : "Negras"})`);
        return newRoom;
    }
    // ✅ NUEVO: Marcar que un jugador reconectó
    setPlayerReconnected(roomId, socketId, nick) {
        const room = this.activeRooms.get(roomId);
        if (!room)
            return false;
        // ✅ Verificar que el nick del jugador que reconecta es el mismo
        if (room.playerDisconnected?.nick !== nick) {
            console.log(`❌ Nick ${nick} no coincide con el desconectado ${room.playerDisconnected?.nick}`);
            return false;
        }
        // ✅ Actualizar el socketId del jugador en la sala
        const isWhite = room.playerWhite.nick === nick;
        const isBlack = room.playerBlack.nick === nick;
        if (isWhite) {
            room.playerWhite.socketId = socketId;
        }
        else if (isBlack) {
            room.playerBlack.socketId = socketId;
        }
        else {
            console.log(`❌ Nick ${nick} no encontrado en la sala ${roomId}`);
            return false;
        }
        room.isPaused = false;
        room.playerDisconnected = undefined;
        // ✅ Cancelar timer de reconexión
        if (room._reconnectionTimer) {
            clearTimeout(room._reconnectionTimer);
            room._reconnectionTimer = undefined;
        }
        console.log(`✅ Jugador ${nick} reconectado con nuevo socket ${socketId}`);
        return true;
    }
    // ✅ NUEVO: Verificar si un jugador está desconectado
    isPlayerDisconnected(roomId, socketId) {
        const room = this.activeRooms.get(roomId);
        if (!room)
            return false;
        return room.playerDisconnected?.socketId === socketId;
    }
    // ✅ NUEVO: Obtener tiempo restante de reconexión
    getReconnectionTimeLeft(roomId) {
        const room = this.activeRooms.get(roomId);
        if (!room || !room.playerDisconnected)
            return 0;
        const elapsed = (Date.now() - room.playerDisconnected.disconnectedAt) / 1000;
        const remaining = Math.max(0, exports.TIME_CONSTANTS.RECONNECTION_TIMEOUT - elapsed);
        return Math.floor(remaining);
    }
    /**
     * 📊 Obtener el tamaño total de todas las colas
     */
    getQueueSize() {
        let total = 0;
        for (const [, queue] of this.guestQueues.entries()) {
            total += queue.length;
        }
        return total;
    }
    /**
     * 📊 Obtener el tamaño de una cola específica por minutos
     */
    getQueueSizeByMinutes(minutes) {
        const queue = this.guestQueues.get(minutes);
        return queue ? queue.length : 0;
    }
    /**
     * 📊 Obtener todas las colas con sus tamaños
     */
    getQueueStats() {
        const stats = {};
        for (const [minutes, queue] of this.guestQueues.entries()) {
            stats[minutes] = queue.length;
        }
        return stats;
    }
}
exports.RoomManager = RoomManager;
