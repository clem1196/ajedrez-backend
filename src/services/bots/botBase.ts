// src/services/bots/botBase.ts
import { Chess } from "chess.js";
import { RoomManager } from "../../sockets/roomManager";
import { EloService } from "../../services/eloService";
import { getBestMove } from "../../helpers/stockfishHelper";
import { BOT_CONFIG, BOT_LEVELS, BotConfig } from "../../config/botConfig";

/**
 * Interfaz que representa un bot dentro de la sala.
 */
export interface Bot {
  id: string;
  nick: string;
  elo: number;
  isBot: boolean;
  color?: "w" | "b";
  socketId: string;
  thinkingTimer?: NodeJS.Timeout;
  roomId?: string;
}

/**
 * Clase base abstracta para todos los bots.
 * Se encarga de la gestión del ciclo de vida del bot,
 * y delega la generación de movimientos a Stockfish
 * a través de stockfishHelper.
 */
export abstract class BotBase {
  protected roomManager: RoomManager;
  protected io: any;

  // Mapa de bots activos (socketId -> Bot)
  public activeBots: Map<string, Bot>;

  // Configuración actual del bot (según dificultad)
  protected config: BotConfig;

  constructor(
    roomManager: RoomManager,
    io: any,
    difficulty: string, // 'easy' | 'medium' | 'hard' | 'grandmaster'
  ) {
    this.roomManager = roomManager;
    this.io = io;

    // Obtener la configuración correspondiente a la dificultad
    const config = BOT_LEVELS[difficulty];
    if (!config) {
      throw new Error(`Dificultad desconocida: ${difficulty}`);
    }
    this.config = config;

    this.activeBots = new Map();
  }

  // ──────────────────────────────────────────────
  //  Métodos auxiliares (usando la configuración)
  // ──────────────────────────────────────────────

  /**
   * Genera un ID único para el bot.
   */
  protected generateBotId(): string {
    return `bot_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Devuelve el tiempo de pensamiento (con una ligera variación aleatoria)
   * basado en la configuración de la dificultad.
   */
  protected getRandomThinkingTime(): number {
    const base = this.config.thinkingTimeMs;
    // Variación de ±20% para que no sea siempre igual
    const variation = Math.floor(base * 0.2);
    return Math.max(
      200,
      base + Math.floor(Math.random() * variation * 2 - variation),
    );
  }

  /**
   * Obtiene un nombre aleatorio para el bot, basado en la dificultad.
   * Si se desea, se puede personalizar aquí o en botConfig.
   */
  public getRandomName(): string {
    // Puedes definir listas de nombres por dificultad o usar el nombre fijo de la configuración
    const namesByDifficulty: Record<string, string[]> = {
      easy: ["Bot_Novato", "Bot_Aprendiz", "Bot_Principiante", "Bot_Iniciante"],
      medium: ["Bot_Estratega", "Bot_Tactico", "Bot_Calmado", "Bot_Aficionado"],
      hard: ["Bot_Veterano", "Bot_Experto", "Bot_Pro", "Bot_Avanzado"],
      grandmaster: [
        "Bot_Master",
        "Bot_GranMaestro",
        "Bot_Leyenda",
        "Bot_Stockfish",
      ],
    };
    const names =
      namesByDifficulty[this.config.difficulty] || namesByDifficulty.easy;
    return names[Math.floor(Math.random() * names.length)];
  }

  /**
   * Obtiene un ELO aleatorio dentro de un rango alrededor del ELO base definido en la configuración.
   * Por ejemplo, si el ELO base es 1300, devolverá entre 1200 y 1400.
   */
  public getRandomElo(): number {
    const base = this.config.elo;
    const range = 150; // ±150
    return Math.max(
      100,
      Math.min(3000, base + Math.floor(Math.random() * range * 2 - range)),
    );
  }

  // ──────────────────────────────────────────────
  //  Gestión de partidas (checkmate, stalemate)
  // ──────────────────────────────────────────────

  /**
   * Maneja el fin de partida por jaque mate.
   * winnerColor es el color del jugador que dio mate.
   */
  protected async handleCheckmate(
    room: any,
    winnerColor: "w" | "b",
  ): Promise<void> {
    room.isProcessingEnd = true;
    room.gameEnded = true;
    this.roomManager.clearRoomTimers(room);

    const winnerResult = winnerColor === "w" ? "white_win" : "black_win";
    const winnerNick =
      winnerColor === "w" ? room.playerWhite.nick : room.playerBlack.nick;
    const loserNick =
      winnerColor === "w" ? room.playerBlack.nick : room.playerWhite.nick;

    try {
      const eloResult = await EloService.processMatchEnd({
        roomId: room.roomId,
        whiteSocketId: room.playerWhite.socketId,
        blackSocketId: room.playerBlack.socketId,
        whiteNick: room.playerWhite.nick,
        blackNick: room.playerBlack.nick,
        result: winnerResult,
        reason: "checkmate",
      });

      this.io.to(room.roomId).emit("game_over", {
        reason: "checkmate",
        loserSocketId:
          winnerColor === "w"
            ? room.playerBlack.socketId
            : room.playerWhite.socketId,
        message: `♟️ ¡Jaque Mate! ${winnerNick} gana la partida.`,
        whiteEloChange: eloResult.whiteEloChange,
        blackEloChange: eloResult.blackEloChange,
        players: [
          {
            nick: eloResult.whiteNick,
            newElo: eloResult.whiteNewElo,
            eloChange: eloResult.whiteEloChange,
          },
          {
            nick: eloResult.blackNick,
            newElo: eloResult.blackNewElo,
            eloChange: eloResult.blackEloChange,
          },
        ],
        winnerMessage: `🏆 ¡Victoria! ${winnerNick} gana por jaque mate.`,
        loserMessage: `💀 Derrota: ${loserNick} pierde por jaque mate.`,
      });

      // Eliminar el bot de la sala
      const bot = this.activeBots.get(
        winnerColor === "w"
          ? room.playerWhite.socketId
          : room.playerBlack.socketId,
      );
      if (bot) {
        this.removeBot(room.roomId, bot.id);
      }

      this.roomManager.removeRoom(room.roomId);
    } catch (err) {
      console.error("❌ Error en jaque mate:", err);
    }
  }

  /**
   * Maneja el fin de partida por ahogado (stalemate).
   */
  protected async handleStalemate(room: any): Promise<void> {
    room.isProcessingEnd = true;
    room.gameEnded = true;
    this.roomManager.clearRoomTimers(room);

    try {
      const eloResult = await EloService.processMatchEnd({
        roomId: room.roomId,
        whiteSocketId: room.playerWhite.socketId,
        blackSocketId: room.playerBlack.socketId,
        whiteNick: room.playerWhite.nick,
        blackNick: room.playerBlack.nick,
        result: "draw",
        reason: "stalemate",
      });

      this.io.to(room.roomId).emit("game_over", {
        reason: "draw",
        message: "♟️ ¡Ahogado! La partida termina en tablas.",
        whiteEloChange: eloResult.whiteEloChange,
        blackEloChange: eloResult.blackEloChange,
        players: [
          {
            nick: eloResult.whiteNick,
            newElo: eloResult.whiteNewElo,
            eloChange: eloResult.whiteEloChange,
          },
          {
            nick: eloResult.blackNick,
            newElo: eloResult.blackNewElo,
            eloChange: eloResult.blackEloChange,
          },
        ],
      });

      // Eliminar el bot de la sala (si existe)
      const bot = this.activeBots.get(
        room.playerWhite?.isBot
          ? room.playerWhite.socketId
          : room.playerBlack?.socketId,
      );
      if (bot) {
        this.removeBot(room.roomId, bot.id);
      }

      this.roomManager.removeRoom(room.roomId);
    } catch (err) {
      console.error("❌ Error en ahogado:", err);
    }
  }

  // ──────────────────────────────────────────────
  //  Métodos públicos de gestión de bots
  // ──────────────────────────────────────────────

  /**
   * Elimina un bot de la sala y limpia su temporizador.
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
   * Obtiene la información de un bot por su socketId.
   */
  public getBotInfo(socketId: string): Bot | undefined {
    return this.activeBots.get(socketId);
  }

  /**
   * Devuelve estadísticas de los bots activos.
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
   * Limpia bots que ya no tienen sala o cuya partida terminó.
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

  // ──────────────────────────────────────────────
  //  Métodos abstractos (deben implementar las hijas)
  // ──────────────────────────────────────────────

  /**
   * Crea un bot en una sala específica.
   * La implementación debe asignarle color, socketId, etc.
   */
  public abstract createBot(roomId: string, botColor: "w" | "b"): Bot;

  // ──────────────────────────────────────────────
  //  Movimiento del bot (usando Stockfish)
  // ──────────────────────────────────────────────

  /**
   * Ejecuta el movimiento del bot en la sala indicada.
   * Obtiene la mejor jugada mediante Stockfish (stockfishHelper)
   * usando los parámetros de skillLevel y depth definidos en la configuración.
   */
  public async makeMove(roomId: string, botColor: "w" | "b"): Promise<void> {
    if (!BOT_CONFIG.ENABLED) {
      console.log("🤖 Bots deshabilitados por configuración.");
      return;
    }

    const room = this.roomManager.getRoom(roomId);
    if (!room) return;
    if (room.gameEnded || room.isProcessingEnd) return;
    if (room.chessInstance.turn() !== botColor) return;

    const moves = room.chessInstance.moves({ verbose: true });
    if (moves.length === 0) {
      if (room.chessInstance.isCheckmate()) {
        await this.handleCheckmate(room, botColor);
      } else if (room.chessInstance.isStalemate()) {
        await this.handleStalemate(room);
      }
      return;
    }

    const botSocketId =
      botColor === "w" ? room.playerWhite.socketId : room.playerBlack.socketId;
    const bot = this.activeBots.get(botSocketId);
    if (!bot) return;

    if (bot.thinkingTimer) {
      clearTimeout(bot.thinkingTimer);
      bot.thinkingTimer = undefined;
    }

    const thinkingTime = this.getRandomThinkingTime();
    console.log(`🤖 Bot ${bot.nick} está pensando... (${thinkingTime}ms)`);

    bot.thinkingTimer = setTimeout(async () => {
      // 🛑 Verificar que la sala siga activa y el turno sea del bot
      const room = this.roomManager.getRoom(roomId);
      if (
        !room ||
        room.gameEnded ||
        room.isProcessingEnd ||
        room.chessInstance.turn() !== botColor
      ) {
        console.log(
          `⏹️ Bot ${bot.nick} canceló movimiento: sala terminada o turno cambiado.`,
        );
        return;
      }

      const fen = room.chessInstance.fen();
      const { skillLevel, depth } = this.config;

      try {
        const bestMove = await getBestMove(fen, skillLevel, depth);

        if (bestMove) {
          const from = bestMove.substring(0, 2);
          const to = bestMove.substring(2, 4);
          const promotion =
            bestMove.length === 5 ? bestMove.charAt(4) : undefined;

          const result = room.chessInstance.move({
            from,
            to,
            promotion,
          });

          if (result) {
            this.io.to(roomId).emit("move_made", {
              move: result,
              fen: room.chessInstance.fen(),
              turn: room.chessInstance.turn(),
              whiteTime: room.whiteTime,
              blackTime: room.blackTime,
              isBotMove: true,
              botNick: bot.nick,
            });

            console.log(
              `🤖 Bot ${bot.nick} (${this.config.difficulty}) movió: ${result.from} -> ${result.to}`,
            );

            if (room.chessInstance.isCheckmate()) {
              await this.handleCheckmate(room, botColor);
              return;
            }
            if (room.chessInstance.isStalemate()) {
              await this.handleStalemate(room);
              return;
            }
          } else {
            console.error(
              `⚠️ Movimiento UCI inválido para chess.js: ${bestMove}`,
            );
          }
        }
      } catch (err) {
        console.error("❌ Error al calcular jugada con Stockfish:", err);

        // 🆘 Fallback: movimiento aleatorio
        const fallbackMoves = room.chessInstance.moves({ verbose: true });
        if (fallbackMoves.length > 0) {
          const randomMove =
            fallbackMoves[Math.floor(Math.random() * fallbackMoves.length)];
          const result = room.chessInstance.move({
            from: randomMove.from,
            to: randomMove.to,
            promotion: randomMove.promotion || "q",
          });
          if (result) {
            this.io.to(roomId).emit("move_made", {
              move: result,
              fen: room.chessInstance.fen(),
              turn: room.chessInstance.turn(),
              whiteTime: room.whiteTime,
              blackTime: room.blackTime,
              isBotMove: true,
              botNick: bot.nick,
            });
            console.log(
              `🤖 Bot ${bot.nick} usó movimiento aleatorio por timeout: ${result.from}->${result.to}`,
            );
            if (room.chessInstance.isCheckmate()) {
              await this.handleCheckmate(room, botColor);
              return;
            }
            if (room.chessInstance.isStalemate()) {
              await this.handleStalemate(room);
              return;
            }
          }
        } else {
          console.warn(`⚠️ Bot ${bot.nick} sin movimientos disponibles.`);
        }
      } finally {
        if (bot.thinkingTimer) {
          clearTimeout(bot.thinkingTimer);
          bot.thinkingTimer = undefined;
        }
      }
    }, thinkingTime);
  }
}
