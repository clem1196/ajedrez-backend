// src/sockets/roomManager.ts
import { Chess } from "chess.js";

// ⏱️ CONSTANTES DE TIEMPO (TODAS EN SEGUNDOS)
export const TIME_CONSTANTS = {
  COURTESY_SECONDS: 60,
  TURN_SECONDS: 90,
  AFK_SECONDS: 70,
  INACTIVITY_KICK_SECONDS: 240,
  RECONNECTION_TIMEOUT: 45, // ✅ Nuevo: Tiempo de espera para reconexión en segundos
} as const;

interface Player {
  socketId: string;
  nick: string;
  color?: "w" | "b";
  isBot?: boolean;
  elo?:number;
}

export interface GameRoom {
  roomId: string;
  playerWhite: Player;
  playerBlack: Player;
  chessInstance: Chess;
  whiteTime: number;
  blackTime: number;
  initialTimeAllocated: number;
  gameStarted: boolean;
  gameEnded: boolean;
  moveInactivitySeconds: number;
  moveCount: number;
  timerInterval?: NodeJS.Timeout;
  initialMoveTimer?: NodeJS.Timeout;
  isProcessingEnd: boolean;
  turnTimer?: NodeJS.Timeout;
  afkAutoWinTimer?: NodeJS.Timeout;
  afkCountdownInterval?: NodeJS.Timeout;
  afkCountdownStarted: boolean;
  lastMoveTimestamp?: number;

  // ✅ NUEVOS: Para manejar reconexiones
  isPaused: boolean;
  playerDisconnected?: {
    socketId: string;
    nick: string;
    disconnectedAt: number;
  };
  _reconnectionTimer?: NodeJS.Timeout;
}

export class RoomManager {
  private guestQueues: Map<number, Player[]> = new Map();
  private activeRooms: Map<string, GameRoom> = new Map();

  public addToGuestQueue(
    socketId: string,
    nick: string,
    minutes: number,
  ): GameRoom | null {
    const newPlayer: Player = { socketId, nick, isBot: false };

    if (!this.guestQueues.has(minutes)) {
      this.guestQueues.set(minutes, []);
    }

    const queue = this.guestQueues.get(minutes)!;
    if (queue.some((p) => p.socketId === socketId)) {
      console.log(`⚠️ ${nick} ya está en la cola de ${minutes} min`);
      return null;
    }
    if (queue.length === 0) {
      queue.push(newPlayer);
      console.log(
        `📌 ${nick} agregado a la cola de ${minutes} min (esperando oponente)`,
      );
      return null;
    }
    if (queue[0].socketId === socketId) {
      return null;
    }

    const opponent = queue.shift()!;
    const isWhite = Math.random() > 0.5;

    newPlayer.color = isWhite ? "w" : "b";
    opponent.color = isWhite ? "b" : "w";

    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const timeInSeconds = minutes * 60;
    console.log(
      `🎯 Emparejamiento creado: ${newPlayer.nick} vs ${opponent.nick} (${minutes} min)`,
    );
    const newRoom: GameRoom = {
      roomId,
      playerWhite: {
        ...(newPlayer.color === "w" ? newPlayer : opponent),
        isBot: false, // ✅ Los humanos no son bots
      },
      playerBlack: {
        ...(newPlayer.color === "b" ? newPlayer : opponent),
        isBot: false,
      },
      chessInstance: new Chess(),
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

  public createRematchRoom(oldRoomId: string): GameRoom | null {
    const oldRoom = this.activeRooms.get(oldRoomId);
    if (!oldRoom) return null;

    this.clearRoomTimers(oldRoom);

    const nextPlayerWhite: Player = {
      socketId: oldRoom.playerBlack.socketId,
      nick: oldRoom.playerBlack.nick,
      color: "w",
      isBot: oldRoom.playerBlack.isBot,
    };

    const nextPlayerBlack: Player = {
      socketId: oldRoom.playerWhite.socketId,
      nick: oldRoom.playerWhite.nick,
      color: "b",
      isBot: oldRoom.playerWhite.isBot,
    };

    const newRoomId = `room_rematch_${Date.now()}`;
    const newRoom: GameRoom = {
      roomId: newRoomId,
      playerWhite: nextPlayerWhite,
      playerBlack: nextPlayerBlack,
      chessInstance: new Chess(),
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

  public getRoom(roomId: string): GameRoom | undefined {
    return this.activeRooms.get(roomId);
  }

// ✅ (clearRoomTimers o removeRoom)
public removeRoom(roomId: string, botService?: any): void {
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

  public clearRoomTimers(room: GameRoom): void {
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

  public removeFromQueue(socketId: string): void {
    for (const [minutes, queue] of this.guestQueues.entries()) {
      const nuevaCola = queue.filter((p) => p.socketId !== socketId);
      this.guestQueues.set(minutes, nuevaCola);
    }
    console.log(
      `🧹 [RoomManager] Socket ${socketId} removido de todas las colas.`,
    );
  }

  public getRoomByPlayerId(socketId: string): GameRoom | undefined {
    for (const room of this.activeRooms.values()) {
      if (
        room.playerWhite.socketId === socketId ||
        room.playerBlack.socketId === socketId
      ) {
        return room;
      }
    }
    return undefined;
  }

  public getAllRooms(): GameRoom[] {
    return Array.from(this.activeRooms.values());
  }

  // ⏱️ UTILITY: Obtener tiempo restante de un jugador
  public getPlayerTime(room: GameRoom, color: "w" | "b"): number {
    return color === "w" ? room.whiteTime : room.blackTime;
  }

  // ✅ Versión mejorada de setPlayerDisconnected
  public setPlayerDisconnected(roomId: string, socketId: string): boolean {
    const room = this.activeRooms.get(roomId);
    if (!room) return false;

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
  // ✅ CORREGIDO
  public createRoomWithBot(
    humanSocketId: string,
    humanNick: string,
    minutes: number,
    botPlayerData: Player, // ✅ Recibe el bot ya creado por BotService
  ): GameRoom | null {
    const timeInSeconds = minutes * 60;
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    // El humano juega contra el bot, el color del humano es aleatorio (o fijo, según tu lógica)
    const isHumanWhite = Math.random() > 0.5;

    const humanPlayer: Player = {
      socketId: humanSocketId,
      nick: humanNick.trim(),
      color: isHumanWhite ? "w" : "b",
      isBot: false,
    };

    // Asignamos el color opuesto al bot que ya nos pasaron
    const finalBotPlayer: Player = {
      ...botPlayerData,
      color: isHumanWhite ? "b" : "w",
    };

    const newRoom: GameRoom = {
      roomId,
      playerWhite: isHumanWhite ? humanPlayer : finalBotPlayer,
      playerBlack: isHumanWhite ? finalBotPlayer : humanPlayer,
      chessInstance: new Chess(),
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
    console.log(
      `🏠 Sala ${roomId} creada: ${humanNick} vs ${finalBotPlayer.nick} (${finalBotPlayer.color === "w" ? "Blancas" : "Negras"})`,
    );
    return newRoom;
  }
  // ✅ NUEVO: Marcar que un jugador reconectó
  public setPlayerReconnected(
    roomId: string,
    socketId: string,
    nick: string,
  ): boolean {
    const room = this.activeRooms.get(roomId);
    if (!room) return false;
    // ✅ Verificar que el nick del jugador que reconecta es el mismo
    if (room.playerDisconnected?.nick !== nick) {
      console.log(
        `❌ Nick ${nick} no coincide con el desconectado ${room.playerDisconnected?.nick}`,
      );
      return false;
    }

    // ✅ Actualizar el socketId del jugador en la sala
    const isWhite = room.playerWhite.nick === nick;
    const isBlack = room.playerBlack.nick === nick;

    if (isWhite) {
      room.playerWhite.socketId = socketId;
    } else if (isBlack) {
      room.playerBlack.socketId = socketId;
    } else {
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
  public isPlayerDisconnected(roomId: string, socketId: string): boolean {
    const room = this.activeRooms.get(roomId);
    if (!room) return false;

    return room.playerDisconnected?.socketId === socketId;
  }

  // ✅ NUEVO: Obtener tiempo restante de reconexión
  public getReconnectionTimeLeft(roomId: string): number {
    const room = this.activeRooms.get(roomId);
    if (!room || !room.playerDisconnected) return 0;

    const elapsed =
      (Date.now() - room.playerDisconnected.disconnectedAt) / 1000;
    const remaining = Math.max(
      0,
      TIME_CONSTANTS.RECONNECTION_TIMEOUT - elapsed,
    );

    return Math.floor(remaining);
  }
  /**
   * 📊 Obtener el tamaño total de todas las colas
   */
  public getQueueSize(): number {
    let total = 0;
    for (const [, queue] of this.guestQueues.entries()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * 📊 Obtener el tamaño de una cola específica por minutos
   */
  public getQueueSizeByMinutes(minutes: number): number {
    const queue = this.guestQueues.get(minutes);
    return queue ? queue.length : 0;
  }

  /**
   * 📊 Obtener todas las colas con sus tamaños
   */
  public getQueueStats(): { [minutes: number]: number } {
    const stats: { [minutes: number]: number } = {};
    for (const [minutes, queue] of this.guestQueues.entries()) {
      stats[minutes] = queue.length;
    }
    return stats;
  }
}
