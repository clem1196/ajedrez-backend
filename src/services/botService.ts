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
   * 🎯 Determinar nivel automáticamente basándose en el Elo del jugador
   */
  public getDifficultyByElo(playerElo: number): string {
    if (playerElo < 1200) return "easy";
    if (playerElo < 1600) return "medium";
    if (playerElo < 1900) return "hard";
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
    };

    this.activeBots.set(bot.id, bot);
    for (const [, instance] of this.botInstances) {
      instance.activeBots = this.activeBots;
    }

    const difficulty =
      botData.difficulty || BOT_CONFIG_GLOBAL.DIFFICULTY || "easy";
    console.log(
      `🤖 Bot ${bot.nick} (${bot.elo} Elo) agregado al servicio para sala ${bot.roomId} (dificultad: ${difficulty})`,
    );
    return bot;
  }

  /**
   * 🎮 Crear un bot para una partida
   */
  public createBotForGame(
    roomId: string,
    requestedDifficulty?: string,
  ): Bot | null {
    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      console.log(`❌ Sala ${roomId} no encontrada para crear bot`);
      return null;
    }
    // 1. Obtener Elo del jugador humano presente en la sala
    const humanPlayer =
      room.playerWhite?.isBot === false
        ? room.playerWhite
        : room.playerBlack?.isBot === false
          ? room.playerBlack
          : null;

    // 2. Determinar dificultad: Usar la solicitada, calcularla por Elo o usar fallback
    let difficulty =
      requestedDifficulty || room.difficulty || BOT_CONFIG_GLOBAL.DIFFICULTY;
    if (!difficulty && humanPlayer) {
      difficulty = this.getDifficultyByElo(humanPlayer.elo || 1200);
    }
    if (!difficulty) {
      difficulty = "easy";
    }
    room.difficulty = difficulty;
    const botInstance = this.getBotInstance(difficulty);

    // ✅ Asegurar que la instancia use el mismo activeBots
    botInstance.activeBots = this.activeBots;

    // ✅ Determinar color faltante
    const hasWhite =
      room.playerWhite && room.playerWhite.nick && room.playerWhite.nick !== "";
    const hasBlack =
      room.playerBlack && room.playerBlack.nick && room.playerBlack.nick !== "";

    if (hasWhite && hasBlack) {
      console.log(
        `ℹ️ Sala ${roomId} ya tiene ambos jugadores, no se necesita bot`,
      );
      return null;
    }

    const isWhiteBot = room.playerWhite?.isBot || false;
    const isBlackBot = room.playerBlack?.isBot || false;

    if (isWhiteBot || isBlackBot) {
      console.log(`ℹ️ Sala ${roomId} ya tiene un bot, no se necesita otro`);
      return null;
    }

    const botColor = !hasWhite ? "w" : "b";

    // ✅ Crear bot usando la instancia específica
    const bot = botInstance.createBot(roomId, botColor);

    // ✅ Asignar bot a la sala
    if (botColor === "w") {
      room.playerWhite = {
        socketId: bot.id,
        nick: bot.nick,
        color: "w",
        isBot: true,
      };
    } else {
      room.playerBlack = {
        socketId: bot.id,
        nick: bot.nick,
        color: "b",
        isBot: true,
      };
    }

    // ✅ Guardar en activeBots (ya debería estar, pero por si acaso)
    if (!this.activeBots.has(bot.id)) {
      this.activeBots.set(bot.id, bot);
    }

    console.log(
      `🤖 Bot ${bot.nick} (${bot.elo} Elo) creado como ${botColor === "w" ? "Blancas" : "Negras"} en sala ${roomId} (dificultad: ${difficulty})`,
    );
    return bot;
  }

  /**
   * 🤖 Hacer que un bot mueva
   */
  public async botMakeMove(roomId: string, botColor: "w" | "b"): Promise<void> {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    // Obtener el bot activo en la sala
    const botSocketId =
      botColor === "w"
        ? room.playerWhite?.socketId
        : room.playerBlack?.socketId;

    // Si la sala o el bot guardan la dificultad específica, la usamos
    const difficulty =
      room.difficulty || BOT_CONFIG_GLOBAL.DIFFICULTY || "easy";
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
    console.log(`🗑️ Bot ${botId} eliminado de sala ${roomId}`);
  }

  /**
   * 🧹 Limpiar bots inactivos
   */
  public cleanupInactiveBots(): void {
    for (const [botId, bot] of this.activeBots) {
      if (!bot.roomId) {
        this.activeBots.delete(botId);
        continue;
      }
      const room = this.roomManager.getRoom(bot.roomId);
      if (!room || room.gameEnded) {
        this.removeBot(bot.roomId, botId);
      }
    }
  }

  /**
   * 🤖 Obtener información de un bot
   */
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
}
