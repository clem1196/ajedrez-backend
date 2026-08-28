// src/services/botService.ts (nuevo)
import { RoomManager } from "../sockets/roomManager";
import { BotFactory, BotBase, Bot } from "./bots";
import { BOT_CONFIG as BOT_CONFIG_GLOBAL } from "../config/botConfig";

export class BotService {
  private activeBots: Map<string, Bot> = new Map();
  private botInstances: Map<string, BotBase> = new Map();
  private roomManager: RoomManager;
  private io: any;

  constructor(roomManager: RoomManager, io: any) {
    this.roomManager = roomManager;
    this.io = io;
  }

  /**
   * 🤖 Obtener instancia del bot según dificultad
   */
  private getBotInstance(difficulty: string): BotBase {
    if (!this.botInstances.has(difficulty)) {
      const bot = BotFactory.createBot(difficulty, this.roomManager, this.io);
      bot.activeBots = this.activeBots;
      this.botInstances.set(difficulty, bot);
    }
    return this.botInstances.get(difficulty)!;
  }
  /**
   * 🤖 Obtener la instancia del bot que pertenece a un socketId específico
   * @param socketId - ID del socket del bot (puede ser el ID del bot o el socketId)
   * @returns La instancia de BotBase si existe, o undefined
   */
  public getBotInstanceForPlayer(socketId: string): BotBase | undefined {
    const bot = this.activeBots.get(socketId);
    if (bot && bot.difficulty) {
      return this.getBotInstance(bot.difficulty);
    }

    // Fallback: buscar en todas las instancias creadas
    for (const [, instance] of this.botInstances) {
      if (instance.activeBots.has(socketId)) {
        return instance;
      }
    }

    return undefined;
  }
  public createBot(difficulty: string, roomId: string, botColor: "w" | "b") {
    const botInstance = this.getBotInstance(difficulty);
    return botInstance.createBot(roomId, botColor);
  }
  /**
   * 🎯 Determinar nivel automáticamente basándose en el Elo del jugador
   */
  public getDifficultyByElo(playerElo: number): string {
    const elo = Math.max(1200, playerElo); // Aseguramos piso 1200
    if (elo < 1400) return "easy";
    if (elo < 1750) return "medium";
    if (elo < 2200) return "hard";
    return "grandmaster";
  }
  /**
   * 🤖 Agregar un bot existente al servicio (para reconexiones)
   */
  public addBot(botData: {
    id: string;
    nick: string;
    elo: number;
    color: "w" | "b";
    socketId: string;
    roomId: string;
    difficulty?: string;
  }): Bot {
    // ✅ Verificar si el bot ya existe
    if (this.activeBots.has(botData.id)) {
      console.log(`ℹ️ Bot ${botData.nick} ya está registrado`);
      return this.activeBots.get(botData.id)!;
    }

    const bot: Bot = {
      id: botData.id,
      nick: botData.nick,
      elo: botData.elo,
      isBot: true,
      color: botData.color,
      socketId: botData.socketId,
      roomId: botData.roomId,
      thinkingTimer: undefined,
      difficulty: botData.difficulty,
    };

    this.activeBots.set(bot.id, bot);
    for (const [, instance] of this.botInstances) {
      instance.activeBots = this.activeBots;
    }
    return bot;
  }

  /**
   * 🎮 Crear un bot para una partida
   */
  public createBotForGame(roomId: string): Bot | null {
    if (!BOT_CONFIG_GLOBAL.ENABLED) {
      console.log(
        `🤖 Creación de bot cancelada: Bots deshabilitados por configuración admin.`,
      );
      return null;
    }

    const room = this.roomManager.getRoom(roomId);
    if (!room) return null;

    // Obtener jugador humano presente en la sala
    const humanPlayer =
      room.playerWhite?.isBot === false
        ? room.playerWhite
        : room.playerBlack?.isBot === false
          ? room.playerBlack
          : null;

    // Obtener Elo del jugador (piso 1200)
    const playerElo = Math.max(1200, humanPlayer?.elo || 1200);
    const difficulty = this.getDifficultyByElo(playerElo);

    const botInstance = this.getBotInstance(difficulty);
    botInstance.activeBots = this.activeBots;

    const hasWhite =
      room.playerWhite && room.playerWhite.nick && room.playerWhite.nick !== "";
    const hasBlack =
      room.playerBlack && room.playerBlack.nick && room.playerBlack.nick !== "";

    if (hasWhite && hasBlack) return null;

    const botColor = !hasWhite ? "w" : "b";
    const bot = botInstance.createBot(roomId, botColor);

    // Asignar el Elo dinamizado al bot
    bot.elo = botInstance.getRandomElo();
    bot.difficulty = difficulty;

    if (botColor === "w") {
      room.playerWhite = {
        socketId: bot.id,
        nick: bot.nick,
        color: "w",
        isBot: true,
        elo: bot.elo,
      };
    } else {
      room.playerBlack = {
        socketId: bot.id,
        nick: bot.nick,
        color: "b",
        isBot: true,
        elo: bot.elo,
      };
    }

    if (!this.activeBots.has(bot.id)) {
      this.activeBots.set(bot.id, bot);
    }

    console.log(
      `🤖 Bot ${bot.nick} (${bot.elo} Elo) creado para jugador con Elo ${playerElo} (Dificultad: ${difficulty})`,
    );
    return bot;
  }

  /**
   * 🤖 Hacer que un bot mueva
   */
  public async botMakeMove(roomId: string, botColor: "w" | "b"): Promise<void> {
    if (!BOT_CONFIG_GLOBAL.ENABLED) return;

    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    const humanPlayer =
      room.playerWhite?.isBot === false
        ? room.playerWhite
        : room.playerBlack?.isBot === false
          ? room.playerBlack
          : null;

    const playerElo = Math.max(1200, humanPlayer?.elo || 1200);
    const difficulty = this.getDifficultyByElo(playerElo);
    const botInstance = this.getBotInstance(difficulty);

    await botInstance.makeMove(roomId, botColor);
  }

  /**
   * 🗑️ Eliminar un bot
   */
  public removeBot(roomId: string, botId: string): void {
    const bot = this.activeBots.get(botId);
    if (bot && bot.thinkingTimer) {
      clearTimeout(bot.thinkingTimer);
      bot.thinkingTimer = undefined;
    }
    this.activeBots.delete(botId);
  }

  public cleanupInactiveBots(): void {
    for (const [botId, bot] of this.activeBots) {
      if (!bot.roomId) {
        this.activeBots.delete(botId);
        continue;
      }
      const room = this.roomManager.getRoom(bot.roomId);
      if (!room) {
        this.removeBot(bot.roomId, botId);
      }
    }
  }
  /**
   * 🤝 Procesar solicitud de revancha contra un Bot
   */
  public handleBotRematchRequest(
    roomId: string,
    playerSocketId: string,
  ): boolean {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return false;

    const botPlayer = room.playerWhite?.isBot
      ? room.playerWhite
      : room.playerBlack?.isBot
        ? room.playerBlack
        : null;
    if (!botPlayer) return false;

    const botInstance = this.getBotInstanceForPlayer(botPlayer.socketId);
    if (!botInstance) return false;

    // Evaluar si acepta la revancha usando la lógica dinámica del bot
    return botInstance.shouldAcceptRematch(room);
  }
  public getBotInfo(socketId: string): Bot | undefined {
    return this.activeBots.get(socketId);
  }

  /**
   * 📊 Obtener estadísticas de bots activos
   */
  public getBotStats(): { total: number; active: number; names: string[] } {
    const bots = Array.from(this.activeBots.values());
    return {
      total: bots.length,
      active: bots.filter((b) => b.thinkingTimer).length,
      names: bots.map((b) => b.nick),
    };
  }

  /**
   * 🎲 Obtener nombre de bot según dificultad
   */
  public getRandomBotNameByDifficulty(difficulty: string): string {
    const botInstance = this.getBotInstance(difficulty);
    return botInstance.getRandomName(); // ✅ Tipado seguro y limpio
  }

  /**
   * 🎲 Obtener Elo de bot según dificultad
   */
  public getRandomEloByDifficulty(difficulty: string): number {
    const botInstance = this.getBotInstance(difficulty);
    return botInstance.getRandomElo(); // ✅ Tipado seguro y limpio
  }
  /**
   * 🤖 Verifica si le toca mover a un Bot en la sala y programa/ejecuta su movimiento
   */
  public async handleBotTurnIfNeeded(io: any, room: any): Promise<void> {
    if (!room || room.isGameOver) return;

    // Determinar a quién le toca mover en la partida de ajedrez
    const turn = room.chessInstance.turn(); // 'w' o 'b'
    const activePlayer = turn === "w" ? room.playerWhite : room.playerBlack;

    // Si el jugador activo es un bot, programar su movimiento
    if (activePlayer && activePlayer.isBot) {
      const botInstance = this.getBotInstanceForPlayer(activePlayer.socketId);
      if (botInstance) {
        console.log(
          `🤖 Programando movimiento inicial/siguiente para el bot: ${activePlayer.nick}`,
        );
        await botInstance.makeMove(io, room);
      }
    }
  }
}
