"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = void 0;
// [BACKEND] src/sockets/roomManager.ts
const chess_js_1 = require("chess.js");
class RoomManager {
    guestQueue = [];
    activeRooms = new Map();
    addToGuestQueue(socketId, nick) {
        const newPlayer = { socketId, nick };
        if (this.guestQueue.length === 0) {
            this.guestQueue.push(newPlayer);
            return null;
        }
        const opponent = this.guestQueue.shift();
        const isWhite = Math.random() > 0.5;
        newPlayer.color = isWhite ? 'w' : 'b';
        opponent.color = isWhite ? 'b' : 'w';
        const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const newRoom = {
            roomId,
            playerWhite: newPlayer.color === 'w' ? newPlayer : opponent,
            playerBlack: newPlayer.color === 'b' ? newPlayer : opponent,
            chessInstance: new chess_js_1.Chess(),
            whiteTime: 600,
            blackTime: 600,
            gameStarted: false,
            moveInactivitySeconds: 0,
            moveCount: 0
        };
        this.activeRooms.set(roomId, newRoom);
        return newRoom;
    }
    /**
     * 🔄 Genera de forma directa una nueva sala invirtiendo los bando de los jugadores
     */
    createRematchRoom(oldRoomId) {
        const oldRoom = this.activeRooms.get(oldRoomId);
        if (!oldRoom)
            return null;
        // Frenar intervalos y temporizadores anteriores por si acaso
        if (oldRoom.timerInterval)
            clearInterval(oldRoom.timerInterval);
        if (oldRoom.initialMoveTimer)
            clearTimeout(oldRoom.initialMoveTimer);
        const nextPlayerWhite = {
            socketId: oldRoom.playerBlack.socketId,
            nick: oldRoom.playerBlack.nick,
            color: 'w'
        };
        const nextPlayerBlack = {
            socketId: oldRoom.playerWhite.socketId,
            nick: oldRoom.playerWhite.nick,
            color: 'b'
        };
        const newRoomId = `room_rematch_${Date.now()}`;
        const newRoom = {
            roomId: newRoomId,
            playerWhite: nextPlayerWhite,
            playerBlack: nextPlayerBlack,
            chessInstance: new chess_js_1.Chess(),
            whiteTime: 600,
            blackTime: 600,
            gameStarted: false,
            moveInactivitySeconds: 0,
            moveCount: 0
        };
        this.activeRooms.set(newRoomId, newRoom);
        this.activeRooms.delete(oldRoomId); // Eliminamos la sala vieja de forma directa
        return newRoom;
    }
    getRoom(roomId) {
        return this.activeRooms.get(roomId);
    }
    removeRoom(roomId) {
        const room = this.activeRooms.get(roomId);
        if (room) {
            if (room.timerInterval)
                clearInterval(room.timerInterval);
            if (room.initialMoveTimer)
                clearTimeout(room.initialMoveTimer); // 💡 Limpieza preventiva al borrar sala
        }
        this.activeRooms.delete(roomId);
    }
    removeFromQueue(socketId) {
        this.guestQueue = this.guestQueue.filter(p => p.socketId !== socketId);
    }
    getRoomByPlayerId(socketId) {
        for (const room of this.activeRooms.values()) {
            if (room.playerWhite.socketId === socketId || room.playerBlack.socketId === socketId) {
                return room;
            }
        }
        return undefined;
    }
    getAllRooms() {
        return Array.from(this.activeRooms.values());
    }
}
exports.RoomManager = RoomManager;
