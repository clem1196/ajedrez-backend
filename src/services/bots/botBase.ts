// src/services/bots/botBase.ts
import { RoomManager } from "../../sockets/roomManager";
import { EloService } from "../../services/eloService";
import { getBestMove, getEvaluation } from "../../helpers/stockfishHelper";
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
  public lastGameResult?: "win" | "loss" | "draw";

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
    this.lastGameResult = undefined;
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
      easy: ["Novato", "Aprendiz", "Principiante", "Iniciante", "PechoFrio"],
      medium: ["Estratega", "Tactico", "Calmado", "Aficionado", "Resolutivo"],
      hard: ["Veterano", "Experto", "Maestro", "Avanzado", "Titan"],
      grandmaster: ["Master", "GranMaestro", "Leyenda", "Stockfish"],
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
    const range = 50; // ±50 para mantenerlo muy cercano a la capacidad esperada
    const generatedElo = base + Math.floor(Math.random() * range * 2 - range);

    // Regla del piso de Elo: nunca menor a 1200
    return Math.max(1200, Math.min(3000, generatedElo));
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
      const botIsWinner =
        (winnerColor === "w" && room.playerWhite.isBot) ||
        (winnerColor === "b" && room.playerBlack.isBot);
      this.lastGameResult = botIsWinner ? "win" : "loss";
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
       this.lastGameResult = "draw";
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
  public async shouldSurrender(roomId: string): Promise<boolean> {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return false;

    const fen = room.chessInstance.fen();
    const evaluation = getEvaluation(fen);
    // Si está perdiendo por más de 500 centipawns, se rinde
    if (await evaluation < -500) {
      // Además, verificar que no haya posibilidades de jaque mate
      // (esto ya está contemplado por la evaluación)
      return true;
    }
    return false;
  }
  // ──────────────────────────────────────────────
  //  Movimiento del bot (usando Stockfish)
  // ──────────────────────────────────────────────

  /**
   * Ejecuta el movimiento del bot en la sala indicada.
   * Obtiene la mejor jugada mediante Stockfish (stockfishHelper)
   * usando los parámetros de skillLevel y depth definidos en la configuración.
   */
  public async makeMove(roomId: string, botColor: "w" | "b"): Promise<void> {
    if (!BOT_CONFIG.ENABLED) return;

    const room = this.roomManager.getRoom(roomId);
    if (!room || room.gameEnded || room.isProcessingEnd) return;
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
      const currentRoom = this.roomManager.getRoom(roomId);
      if (!currentRoom || currentRoom.gameEnded || currentRoom.isProcessingEnd)
        return;
      if (currentRoom.chessInstance.turn() !== botColor) return;

      const fen = currentRoom.chessInstance.fen();
      const { skillLevel, depth } = this.config;

      try {
        const bestMove = await getBestMove(fen, skillLevel, depth);

        if (bestMove) {
          const from = bestMove.substring(0, 2);
          const to = bestMove.substring(2, 4);
          const promotion =
            bestMove.length === 5 ? bestMove.charAt(4) : undefined;

          const result = currentRoom.chessInstance.move({
            from,
            to,
            promotion,
          });

          if (result) {
            this.io.to(roomId).emit("move_made", {
              move: result,
              fen: currentRoom.chessInstance.fen(),
              turn: currentRoom.chessInstance.turn(),
              whiteTime: currentRoom.whiteTime,
              blackTime: currentRoom.blackTime,
              isBotMove: true,
              botNick: bot.nick,
            });

            console.log(
              `🤖 Bot ${bot.nick} (${this.config.difficulty}) movió: ${result.from} -> ${result.to}`,
            );

            // ✅ Después de mover, verificar fin de partida
            if (currentRoom.chessInstance.isCheckmate()) {
              await this.handleCheckmate(currentRoom, botColor);
              return;
            }
            if (currentRoom.chessInstance.isStalemate()) {
              await this.handleStalemate(currentRoom);
              return;
            }

            // ✅ Ofrecer tablas si corresponde
            this.maybeOfferDraw(currentRoom);
          }
        }
      } catch (err) {
        console.error("❌ Error al calcular jugada con Stockfish:", err);
        // Fallback a movimiento aleatorio (código existente)
        const fallbackMoves = currentRoom.chessInstance.moves({
          verbose: true,
        });
        if (fallbackMoves.length > 0) {
          const randomMove =
            fallbackMoves[Math.floor(Math.random() * fallbackMoves.length)];
          const result = currentRoom.chessInstance.move({
            from: randomMove.from,
            to: randomMove.to,
            promotion: randomMove.promotion || "q",
          });
          if (result) {
            this.io.to(roomId).emit("move_made", {
              move: result,
              fen: currentRoom.chessInstance.fen(),
              turn: currentRoom.chessInstance.turn(),
              whiteTime: currentRoom.whiteTime,
              blackTime: currentRoom.blackTime,
              isBotMove: true,
              botNick: bot.nick,
            });
            if (currentRoom.chessInstance.isCheckmate()) {
              await this.handleCheckmate(currentRoom, botColor);
              return;
            }
            if (currentRoom.chessInstance.isStalemate()) {
              await this.handleStalemate(currentRoom);
              return;
            }
            this.maybeOfferDraw(currentRoom);
          }
        }
      } finally {
        if (bot.thinkingTimer) {
          clearTimeout(bot.thinkingTimer);
          bot.thinkingTimer = undefined;
        }
      }
    }, thinkingTime);
  }
  public async evaluateDrawOffer(roomId: string): Promise<boolean> {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return false;

    const fen = room.chessInstance.fen();
    // Llamar a Stockfish para evaluar la posición
    const evaluation = getEvaluation(fen); // Implementar en stockfishHelper
    // Si el bot está perdiendo por más de 200 centipawns, acepta tablas
    // También si hay poca diferencia de material y la posición es repetitiva
    if (await evaluation < -200) return true;
    // Si el bot está ganando, rechaza
    if (await evaluation > 200) return false;
    // Si está igualada, acepta con probabilidad según dificultad
    const drawAcceptanceProb = this.config.drawAcceptanceProb || 0.3;
    return Math.random() < drawAcceptanceProb;
  }

  public evaluateRematch(roomId: string): boolean {
    // Por defecto, siempre acepta revancha. Pero puedes agregar lógica según el resultado.
    return true; // Siempre acepta
  }
  // ──────────────────────────────────────────────
  //  NUEVOS MÉTODOS PARA DECISIONES DEL BOT
  // ──────────────────────────────────────────────

  /**
   * 🤖 Decide si el bot acepta una oferta de tablas
   * @param room - Sala actual
   * @returns true si acepta, false si rechaza
   */
 /**
 * 🤖 Decide si el bot acepta una oferta de tablas
 * ✅ Ahora es async y usa getEvaluation con fallback
 */
public async shouldAcceptDraw(room: any): Promise<boolean> {
  // Si la partida ya terminó, no aceptar
  if (room.gameEnded || room.isProcessingEnd) return false;

  const chess = room.chessInstance;

  // 1. Evaluación rápida sin Stockfish (material)
  const board = chess.board();
  let whiteMaterial = 0;
  let blackMaterial = 0;
  const pieceValues: Record<string, number> = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 100,
  };

  for (const row of board) {
    for (const square of row) {
      if (square) {
        const color = square.color;
        const type = square.type;
        const value = pieceValues[type] || 0;
        if (color === "w") whiteMaterial += value;
        else blackMaterial += value;
      }
    }
  }

  const isBotWhite = this.activeBots.has(room.playerWhite.socketId);
  const botMaterial = isBotWhite ? whiteMaterial : blackMaterial;
  const humanMaterial = isBotWhite ? blackMaterial : whiteMaterial;

  // Si el bot tiene mucha desventaja material (≥3 puntos), acepta tablas
  if (botMaterial < humanMaterial - 3) {
    console.log(`🤖 Bot acepta tablas (desventaja material)`);
    return true;
  }

  // Si el bot tiene ventaja clara (≥5 puntos), rechaza
  if (botMaterial > humanMaterial + 5) {
    console.log(`🤖 Bot rechaza tablas (ventaja clara)`);
    return false;
  }

  // 2. Evaluación con Stockfish (solo si la partida está equilibrada o dudosa)
  try {
    const fen = chess.fen();
    const evalScore = await getEvaluation(fen); // Ahora siempre retorna un número

    // evalScore > 0 = ventaja blancas, < 0 = ventaja negras
    // Si el bot está perdiendo (evalScore en su contra), acepta tablas
    const botAdvantage = isBotWhite ? evalScore : -evalScore;

    // Si el bot está perdiendo por más de 0.5 pawns, acepta tablas
    if (botAdvantage < -0.5) {
      console.log(`🤖 Bot acepta tablas (eval: ${botAdvantage.toFixed(2)})`);
      return true;
    }

    // Si el bot está ganando por más de 1 pawn, rechaza
    if (botAdvantage > 1.0) {
      console.log(`🤖 Bot rechaza tablas (eval: ${botAdvantage.toFixed(2)})`);
      return false;
    }

    // Si está muy equilibrado, decisión aleatoria (30% aceptar)
    const random = Math.random();
    const accept = random < 0.3;
    console.log(
      `🤖 Bot decide ${accept ? "aceptar" : "rechazar"} tablas (aleatorio, eval: ${botAdvantage.toFixed(2)})`,
    );
    return accept;
  } catch (error) {
    console.error("❌ Error en evaluación de tablas, usando fallback:", error);
    // Fallback: si no se pudo evaluar, rechazar tablas (para no regalar puntos)
    return false;
  }
}

  /**
   * 🤖 Obtener la instancia del bot (para decisiones)
   */

  /**
   * 🤖 Decide si el bot acepta una revancha
   * @param room - Sala de la partida anterior
   * @returns true si acepta, false si rechaza
   */
  public shouldAcceptRematch(room: any): boolean {
    // Siempre acepta revancha (puedes ajustar)
    // Pero podríamos basarlo en el resultado anterior
    if (this.lastGameResult === "loss") {
      // Si perdió, quiere revancha (80%)
      const accept = Math.random() < 0.8;
      console.log(`🤖 Bot ${accept ? "acepta" : "rechaza"} revancha (perdió)`);
      return accept;
    }
    if (this.lastGameResult === "win") {
      // Si ganó, puede aceptar o no (50%)
      const accept = Math.random() < 0.5;
      console.log(`🤖 Bot ${accept ? "acepta" : "rechaza"} revancha (ganó)`);
      return accept;
    }
    // Si fue tablas, acepta siempre
    console.log(`🤖 Bot acepta revancha (tablas)`);
    return true;
  }

  /**
   * 🤖 El bot puede ofrecer tablas proactivamente (opcional)
   * Se llama después de cada movimiento del bot
   */
  public maybeOfferDraw(room: any): void {
    if (room.gameEnded || room.isProcessingEnd) return;
    if (room.drawOffered) return; // Ya hay oferta pendiente

    const chess = room.chessInstance;
    // Si la partida lleva más de 30 movimientos y está equilibrada
    if (room.moveCount > 30) {
      const board = chess.board();
      let whiteMaterial = 0;
      let blackMaterial = 0;
      // ... calcular material igual que antes
      // Si material total < 25 y diferencia < 2, ofrecer tablas
      if (
        whiteMaterial + blackMaterial < 25 &&
        Math.abs(whiteMaterial - blackMaterial) < 3
      ) {
        console.log(`🤖 Bot ofrece tablas (partida equilibrada)`);
        const botSocketId = this.activeBots.values().next().value?.socketId;
        if (botSocketId) {
          // Emitir oferta de tablas desde el bot
          const botPlayer =
            room.playerWhite.socketId === botSocketId
              ? room.playerWhite
              : room.playerBlack;
          const opponentSocketId =
            botPlayer === room.playerWhite
              ? room.playerBlack.socketId
              : room.playerWhite.socketId;
          this.io.to(opponentSocketId).emit("draw_offered");
          room.drawOffered = true;
          // Temporizador para cancelar oferta si no responde en 10 segundos
          setTimeout(() => {
            if (room && room.drawOffered) {
              room.drawOffered = false;
              this.io.to(room.roomId).emit("draw_offer_canceled");
            }
          }, 10000);
        }
      }
    }
  }
}
