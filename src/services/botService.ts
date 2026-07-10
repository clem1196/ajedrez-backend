// src/services/botService.ts
import { Chess } from "chess.js";
import { GameRoom, RoomManager } from "../sockets/roomManager";
import { EloService } from "./eloService"; // ✅ Importar EloService

// ✅ Configuración de bots
const BOT_CONFIG = {
  MIN_ELO: 800,
  MAX_ELO: 1400,
  NAMES: [
    "Bot_Master",
    "Bot_Pro",
    "Bot_Novato",
    "Bot_Aprendiz",
    "Bot_Estratega",
    "Bot_Tactico",
    "Bot_Peleon",
    "Bot_Calmado",
    "Bot_Rapido",
    "Bot_Calculador",
    "Bot_Estudioso",
    "Bot_Veterano",
    "Bot_Principiante",
    "Bot_Experto",
    "Bot_Solitario",
    "Bot_Desafiante",
  ],
  THINKING_TIME_MIN: 800, // 0.8 segundos mínimo
  THINKING_TIME_MAX: 3000, // 3 segundos máximo
};

interface Bot {
  id: string;
  nick: string;
  elo: number;
  isBot: boolean;
  color?: "w" | "b";
  socketId: string;
  thinkingTimer?: NodeJS.Timeout;
  roomId?: string;
}

export class BotService {
  public activeBots: Map<string, Bot> = new Map();
  private roomManager: RoomManager;
  private io: any;

  constructor(roomManager: RoomManager, io: any) {
    this.roomManager = roomManager;
    this.io = io;
  }

  /**
   * 🤖 Generar un ID único para bot
   */
  private generateBotId(): string {
    return `bot_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * 🎮 Crear un bot para una partida (cuando se usa createBotForGame)
   */
  public createBotForGame(roomId: string): Bot | null {
    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      console.log(`❌ Sala ${roomId} no encontrada para crear bot`);
      return null;
    }

    // ✅ Determinar qué color falta
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

    const botNick = this.getRandomBotName();
    const botElo = this.getRandomElo();
    const botId = this.generateBotId();
    const botColor = !hasWhite ? "w" : "b";

    const bot: Bot = {
      id: botId,
      nick: botNick,
      elo: botElo,
      isBot: true,
      color: botColor,
      socketId: botId,
      roomId: roomId,
    };

    this.activeBots.set(botId, bot);

    if (botColor === "w") {
      room.playerWhite = {
        socketId: botId,
        nick: botNick,
        color: "w",
        isBot: true,
      };
    } else {
      room.playerBlack = {
        socketId: botId,
        nick: botNick,
        color: "b",
        isBot: true,
      };
    }

    console.log(
      `🤖 Bot ${botNick} (${botElo} Elo) creado como ${botColor === "w" ? "Blancas" : "Negras"} en sala ${roomId}`,
    );
    return bot;
  }

  /**
   * 🤖 Agregar un bot al servicio (para bots creados externamente, ej: createRoomWithBot)
   */
  public addBot(botData: {
    id: string;
    nick: string;
    elo: number;
    color: "w" | "b";
    socketId: string;
    roomId: string;
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
    console.log(
      `🤖 Bot ${bot.nick} (${bot.elo} Elo) registrado para sala ${bot.roomId}`,
    );
    return bot;
  }

  /**
   * 🤖 Hacer que un bot juegue su movimiento
   */
  public async botMakeMove(roomId: string, botColor: "w" | "b"): Promise<void> {
    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      console.log(`❌ Sala ${roomId} no encontrada para movimiento de bot`);
      return;
    }

    if (room.gameEnded || room.isProcessingEnd) {
      console.log(`⏭️ Partida ${roomId} ya terminada, bot no mueve`);
      return;
    }

    const currentTurn = room.chessInstance.turn();
    if (currentTurn !== botColor) {
      console.log(
        `⏭️ No es turno del bot (${botColor}), es turno de ${currentTurn}`,
      );
      return;
    }

    const moves = room.chessInstance.moves({ verbose: true });
    if (moves.length === 0) {
      console.log(`❌ Bot no tiene movimientos disponibles en sala ${roomId}`);

      // ✅ Verificar si es jaque mate
      if (room.chessInstance.isCheckmate()) {
        console.log(`♟️ ¡JAQUE MATE! El bot ${botColor} ha perdido.`);

        // ✅ Declarar victoria para el humano
        room.isProcessingEnd = true;
        room.gameEnded = true;
        this.roomManager.clearRoomTimers(room);

        const winnerResult = botColor === "w" ? "black_win" : "white_win";
        const winnerNick =
          botColor === "w" ? room.playerBlack.nick : room.playerWhite.nick;
        const loserNick =
          botColor === "w" ? room.playerWhite.nick : room.playerBlack.nick;

        try {
          const { whiteEloChange, blackEloChange } =
            await EloService.processMatchEnd({
              roomId: room.roomId,
              whiteSocketId: room.playerWhite.socketId,
              blackSocketId: room.playerBlack.socketId,
              whiteNick: room.playerWhite.nick,
              blackNick: room.playerBlack.nick,
              result: winnerResult,
              reason: "checkmate",
            });

          this.io.to(roomId).emit("game_over", {
            reason: "checkmate",
            loserSocketId:
              botColor === "w"
                ? room.playerWhite.socketId
                : room.playerBlack.socketId,
            message: `♟️ ¡Jaque Mate! ${winnerNick} gana la partida.`,
            whiteEloChange,
            blackEloChange,
            winnerMessage: `🏆 ¡Victoria! ${winnerNick} gana por jaque mate.`,
            loserMessage: `💀 Derrota: ${loserNick} pierde por jaque mate.`,
          });

          // ✅ Eliminar el bot
          const bot = this.activeBots.get(
            botColor === "w"
              ? room.playerWhite.socketId
              : room.playerBlack.socketId,
          );
          if (bot) {
            this.removeBot(roomId, bot.id);
          }

          this.roomManager.removeRoom(roomId);
        } catch (err) {
          console.error("❌ Error en jaque mate:", err);
        }
        return;
      }
      // ✅ Si es ahogado (stale mate) - tablas
      if (room.chessInstance.isStalemate()) {
        console.log(`♟️ ¡AHOGADO! La partida termina en tablas.`);

        room.isProcessingEnd = true;
        room.gameEnded = true;
        this.roomManager.clearRoomTimers(room);

        try {
          const { whiteEloChange, blackEloChange } =
            await EloService.processMatchEnd({
              roomId: room.roomId,
              whiteSocketId: room.playerWhite.socketId,
              blackSocketId: room.playerBlack.socketId,
              whiteNick: room.playerWhite.nick,
              blackNick: room.playerBlack.nick,
              result: "draw",
              reason: "stalemate",
            });

          this.io.to(roomId).emit("game_over", {
            reason: "draw",
            message: "♟️ ¡Ahogado! La partida termina en tablas.",
            whiteEloChange,
            blackEloChange,
          });

          const bot = this.activeBots.get(
            botColor === "w"
              ? room.playerWhite.socketId
              : room.playerBlack.socketId,
          );
          if (bot) {
            this.removeBot(roomId, bot.id);
          }

          this.roomManager.removeRoom(roomId);
        } catch (err) {
          console.error("❌ Error en ahogado:", err);
        }
        return;
      }

      // ✅ Si no hay movimientos pero no es jaque mate ni ahogado (error)
      console.log(
        `⚠️ El bot no tiene movimientos pero no es jaque mate ni ahogado.`,
      );
      return;
    }

    // ✅ Buscar el bot en la sala usando el socketId correcto
    const botSocketId =
      botColor === "w" ? room.playerWhite.socketId : room.playerBlack.socketId;
    const bot = this.activeBots.get(botSocketId);

    if (!bot) {
      console.log(
        `❌ Bot no encontrado para sala ${roomId}, color ${botColor}, socketId ${botSocketId}`,
      );
      return;
    }

    if (bot.thinkingTimer) {
      clearTimeout(bot.thinkingTimer);
      bot.thinkingTimer = undefined;
    }

    const thinkingTime = this.getRandomThinkingTime();
    console.log(`🤖 Bot ${bot.nick} está pensando... (${thinkingTime}ms)`);

    bot.thinkingTimer = setTimeout(async () => {
      const currentRoom = this.roomManager.getRoom(roomId);
      if (
        !currentRoom ||
        currentRoom.gameEnded ||
        currentRoom.isProcessingEnd
      ) {
        if (bot.thinkingTimer) {
          clearTimeout(bot.thinkingTimer);
          bot.thinkingTimer = undefined;
        }
        return;
      }

      if (currentRoom.chessInstance.turn() !== botColor) {
        if (bot.thinkingTimer) {
          clearTimeout(bot.thinkingTimer);
          bot.thinkingTimer = undefined;
        }
        return;
      }

      const currentMoves = currentRoom.chessInstance.moves({ verbose: true });
      if (currentMoves.length === 0) {
        if (currentRoom.chessInstance.isCheckmate()) {
          console.log(`♟️ ¡JAQUE MATE! El bot ${botColor} ha perdido.`);
          console.log(`♟️ ¡JAQUE MATE! El bot ${botColor} ha perdido.`);

          // ✅ Declarar victoria para el humano
          room.isProcessingEnd = true;
          room.gameEnded = true;
          this.roomManager.clearRoomTimers(room);

          const winnerResult = botColor === "w" ? "black_win" : "white_win";
          const winnerNick =
            botColor === "w" ? room.playerBlack.nick : room.playerWhite.nick;
          const loserNick =
            botColor === "w" ? room.playerWhite.nick : room.playerBlack.nick;

          try {
            const { whiteEloChange, blackEloChange } =
              await EloService.processMatchEnd({
                roomId: room.roomId,
                whiteSocketId: room.playerWhite.socketId,
                blackSocketId: room.playerBlack.socketId,
                whiteNick: room.playerWhite.nick,
                blackNick: room.playerBlack.nick,
                result: winnerResult,
                reason: "checkmate",
              });

            this.io.to(roomId).emit("game_over", {
              reason: "checkmate",
              loserSocketId:
                botColor === "w"
                  ? room.playerWhite.socketId
                  : room.playerBlack.socketId,
              message: `♟️ ¡Jaque Mate! ${winnerNick} gana la partida.`,
              whiteEloChange,
              blackEloChange,
              winnerMessage: `🏆 ¡Victoria! ${winnerNick} gana por jaque mate.`,
              loserMessage: `💀 Derrota: ${loserNick} pierde por jaque mate.`,
            });

            // ✅ Eliminar el bot
            const bot = this.activeBots.get(
              botColor === "w"
                ? room.playerWhite.socketId
                : room.playerBlack.socketId,
            );
            if (bot) {
              this.removeBot(roomId, bot.id);
            }

            this.roomManager.removeRoom(roomId);
          } catch (err) {
            console.error("❌ Error en jaque mate:", err);
          }
          return;
        }
        if (bot.thinkingTimer) {
          clearTimeout(bot.thinkingTimer);
          bot.thinkingTimer = undefined;
        }
        return;
      }

      const selectedMove = this.selectMove(
        currentMoves,
        botColor,
        currentRoom.chessInstance,
      );

      const result = currentRoom.chessInstance.move({
        from: selectedMove.from,
        to: selectedMove.to,
        promotion: selectedMove.promotion || "q",
      });

      if (result) {
        if (botColor === "w") {
          currentRoom.whiteTime = Math.max(0, currentRoom.whiteTime);
        } else {
          currentRoom.blackTime = Math.max(0, currentRoom.blackTime);
        }

        this.io.to(roomId).emit("move_made", {
          move: result,
          fen: currentRoom.chessInstance.fen(),
          turn: currentRoom.chessInstance.turn(),
          whiteTime: currentRoom.whiteTime,
          blackTime: currentRoom.blackTime,
          isBotMove: true,
          botNick: bot.nick,
        });

        console.log(`🤖 Bot ${bot.nick} movió: ${result.from} -> ${result.to}`);

        // ✅ Si sigue siendo turno del bot, mover de nuevo (ej: jaque)
        setTimeout(() => {
          const newTurn = currentRoom.chessInstance.turn();
          if (newTurn === botColor && !currentRoom.gameEnded) {
            console.log(
              `🔄 Bot ${bot.nick} debe mover nuevamente (${newTurn})`,
            );
            this.botMakeMove(roomId, botColor);
          }
        }, thinkingTime / 2);
      }

      if (bot.thinkingTimer) {
        clearTimeout(bot.thinkingTimer);
        bot.thinkingTimer = undefined;
      }
    }, thinkingTime);
  }

  /**
   * 🎯 Seleccionar un movimiento con lógica básica
   */
  private selectMove(moves: any[], botColor: "w" | "b", chess: Chess): any {
    const pieceValues: { [key: string]: number } = {
      p: 1,
      n: 3,
      b: 3,
      r: 5,
      q: 9,
      k: 100,
    };

    const captures = moves.filter((m) => m.captured);
    const checks = moves.filter(
      (m) => m.flags && (m.flags.includes("n") || m.flags.includes("b")),
    );
    const promotions = moves.filter((m) => m.promotion);

    // ✅ Prioridad: Promociones > Capturas de piezas valiosas > Jaque > Otros
    if (promotions.length > 0) {
      const queenPromotions = promotions.filter((m) => m.promotion === "q");
      if (queenPromotions.length > 0) {
        return queenPromotions[0];
      }
      return promotions[0];
    }

    if (captures.length > 0) {
      captures.sort((a, b) => {
        const valueA = pieceValues[a.captured] || 0;
        const valueB = pieceValues[b.captured] || 0;
        return valueB - valueA;
      });

      const highValueCapture = captures.find(
        (m) => (pieceValues[m.captured] || 0) >= 3,
      );
      if (highValueCapture) {
        return highValueCapture;
      }
      return captures[0];
    }

    if (checks.length > 0) {
      return checks[0];
    }

    // ✅ Movimientos al centro
    const centerSquares = ["d4", "e4", "d5", "e5"];
    const centerMoves = moves.filter(
      (m) =>
        centerSquares.includes(m.to) ||
        (m.to[0] >= "c" && m.to[0] <= "f" && m.to[1] >= "3" && m.to[1] <= "6"),
    );

    if (centerMoves.length > 0) {
      const pawnMoves = centerMoves.filter((m) => m.piece === "p");
      if (pawnMoves.length > 0) {
        return pawnMoves[0];
      }
      return centerMoves[0];
    }

    return moves[Math.floor(Math.random() * moves.length)];
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
   * 🎲 Obtener un nombre de bot aleatorio
   */
  private getRandomBotName(): string {
    return BOT_CONFIG.NAMES[
      Math.floor(Math.random() * BOT_CONFIG.NAMES.length)
    ];
  }

  /**
   * 🎲 Obtener un Elo aleatorio
   */
  private getRandomElo(): number {
    return (
      Math.floor(
        Math.random() * (BOT_CONFIG.MAX_ELO - BOT_CONFIG.MIN_ELO + 1),
      ) + BOT_CONFIG.MIN_ELO
    );
  }

  /**
   * ⏱️ Obtener tiempo de pensamiento aleatorio
   */
  private getRandomThinkingTime(): number {
    return (
      Math.floor(
        Math.random() *
          (BOT_CONFIG.THINKING_TIME_MAX - BOT_CONFIG.THINKING_TIME_MIN + 1),
      ) + BOT_CONFIG.THINKING_TIME_MIN
    );
  }
}
