// src/services/bots/botBase.ts
import { Chess } from "chess.js";
import { RoomManager } from "../../sockets/roomManager";
import { EloService } from "../eloService";
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

export abstract class BotBase {
  protected roomManager: RoomManager;
  protected io: any;
  public activeBots: Map<string, Bot>;
  protected difficulty: string;

  constructor(roomManager: RoomManager, io: any, difficulty: string) {
    this.roomManager = roomManager;
    this.io = io;
    this.difficulty = difficulty;
    this.activeBots = new Map();
  }

  /**
   * 🤖 Generar ID único para bot
   */
  protected generateBotId(): string {
    return `bot_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * 🎯 Método abstracto para seleccionar movimiento (cada dificultad lo implementa)
   */
  protected abstract selectMove(
    moves: any[],
    botColor: "w" | "b",
    chess: Chess,
  ): any;

  /**
   * ⏱️ Obtener tiempo de pensamiento según dificultad
   */
  protected getRandomThinkingTime(): number {
    const config = this.getDifficultyConfig();
    return (
      Math.floor(
        Math.random() *
          (config.THINKING_TIME_MAX - config.THINKING_TIME_MIN + 1),
      ) + config.THINKING_TIME_MIN
    );
  }

  /**
   * ⚙️ Obtener configuración de la dificultad
   */
  protected getDifficultyConfig(): any {
    const configs = {
      easy: {
        THINKING_TIME_MIN: 1500,
        THINKING_TIME_MAX: 4000,
        MISTAKE_CHANCE: 0.3,
        ELO_RANGE: { min: 800, max: 1100 },
      },
      medium: {
        THINKING_TIME_MIN: 1000,
        THINKING_TIME_MAX: 3000,
        MISTAKE_CHANCE: 0.1,
        ELO_RANGE: { min: 1100, max: 1400 },
      },
      hard: {
        THINKING_TIME_MIN: 500,
        THINKING_TIME_MAX: 2000,
        MISTAKE_CHANCE: 0.02,
        ELO_RANGE: { min: 1400, max: 1800 },
      },
    };
    return configs[this.difficulty as keyof typeof configs] || configs.easy;
  }

  /**
   * 🎲 Obtener Elo según dificultad
   */
  public getRandomElo(): number {
    const config = this.getDifficultyConfig();
    const { min, max } = config.ELO_RANGE;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 🤖 Obtener nombre de bot según dificultad
   */
  public getRandomName(): string {
    const namesByDifficulty: Record<string, string[]> = {
      easy: ["Bot_Novato", "Bot_Aprendiz", "Bot_Principiante", "Bot_Solitario"],
      medium: ["Bot_Estratega", "Bot_Tactico", "Bot_Calmado", "Bot_Estudioso"],
      hard: [
        "Bot_Master",
        "Bot_Pro",
        "Bot_Experto",
        "Bot_Veterano",
        "Bot_GranMaestro",
      ],
    };
    const names = namesByDifficulty[this.difficulty] || namesByDifficulty.easy;
    return names[Math.floor(Math.random() * names.length)];
  }

  /**
   * 🎯 Obtener movimientos al centro del tablero
   */
  protected getCenterMoves(moves: any[]): any[] {
    const centerSquares = ["d4", "e4", "d5", "e5"];
    const extendedCenter = [
      "c3",
      "c4",
      "c5",
      "c6",
      "d3",
      "e3",
      "f3",
      "f4",
      "f5",
      "f6",
    ];
    return moves.filter(
      (m) => centerSquares.includes(m.to) || extendedCenter.includes(m.to),
    );
  }

  /**
   * 🛡️ Obtener movimientos que mejoran la seguridad del rey
   */
  protected getKingSafetyMoves(
    moves: any[],
    chess: Chess,
    botColor: "w" | "b",
  ): any[] {
    const board = chess.board();
    let kingPos: any = null;

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        if (piece && piece.type === "k" && piece.color === botColor) {
          kingPos = { row: i, col: j };
          break;
        }
      }
      if (kingPos) break;
    }

    if (!kingPos) return [];

    const kingCol = String.fromCharCode(97 + kingPos.col);
    const kingRow = String(8 - kingPos.row);
    const kingSquare = kingCol + kingRow;

    return moves.filter((m) => {
      if (m.flags && (m.flags.includes("k") || m.flags.includes("q"))) {
        return true;
      }

      const kingRowNum = botColor === "w" ? "2" : "7";
      const kingColChar = kingSquare[0];

      if (
        m.piece === "p" &&
        m.from[1] === kingRowNum &&
        Math.abs(m.from.charCodeAt(0) - kingColChar.charCodeAt(0)) <= 1
      ) {
        return true;
      }

      return false;
    });
  }

  /**
   * 🎯 Obtener movimientos de desarrollo (caballos y alfiles)
   */
  protected getDevelopingMoves(
    moves: any[],
    chess: Chess,
    botColor: "w" | "b",
  ): any[] {
    const developmentPieces = ["n", "b"];
    const enemyColor = botColor === "w" ? "b" : "w";

    return moves.filter((m) => {
      if (developmentPieces.includes(m.piece)) {
        const testChess = new Chess(chess.fen());
        const result = testChess.move({
          from: m.from,
          to: m.to,
          promotion: m.promotion || "q",
        });
        if (result) {
          const enemyCaptures = testChess
            .moves({ verbose: true })
            .filter((om) => om.captured === m.piece && om.color === enemyColor);
          return enemyCaptures.length === 0;
        }
        return true;
      }
      return false;
    });
  }

  /**
   * 🎯 Evaluar la calidad de un movimiento
   */
  protected evaluateMove(
  move: any,
  pieceValues: { [key: string]: number },
): number {
  let score = 0;

  if (move.captured) {
    score += pieceValues[move.captured] || 0;
  }

  if (move.promotion) {
    score += 9;
  }

  // ✅ CORREGIDO: No usar flags para detectar jaque
  // El jaque se verifica con isCheckMove, no con flags
  // Movimiento al centro
  const centerSquares = ["d4", "e4", "d5", "e5"];
  if (centerSquares.includes(move.to)) {
    score += 1;
  }

  return score;
}


  /**
   * 🎯 Elegir el mejor movimiento de una lista
   */
protected selectBestMove(
  moves: any[],
  pieceValues: { [key: string]: number },
  chess: Chess,
): any {
  // ✅ [...moves] crea una copia nueva. .sort() muta la copia, no el original.
  return [...moves].sort((a, b) => {
    let scoreA = this.evaluateMove(a, pieceValues);
    let scoreB = this.evaluateMove(b, pieceValues);
    
    // ✅ Lógica de puntuación mejorada y más limpia:
    // En lugar de retornos matemáticos raros, simplemente sumamos un "bonus" al puntaje
    if (this.isCheckMove(a, chess)) scoreA += 5; 
    if (this.isCheckMove(b, chess)) scoreB += 5;
    
    // Orden descendente: el de mayor puntaje va primero
    return scoreB - scoreA;
  })[0];
}

  /**
   * ♟️ Manejar jaque mate
   */
  protected async handleCheckmate(
    room: any,
    botColor: "w" | "b",
  ): Promise<void> {
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

      this.io.to(room.roomId).emit("game_over", {
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

      const bot = this.activeBots.get(
        botColor === "w"
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
  protected isSafeMove(move: any, chess: Chess, botColor: "w" | "b"): boolean {
  const testChess = new Chess(chess.fen());
  const result = testChess.move({
    from: move.from,
    to: move.to,
    promotion: move.promotion || "q",
  });
  
  if (!result) return false;
  
  const enemyColor = botColor === "w" ? "b" : "w";
  const enemyMoves = testChess.moves({ verbose: true });
  
  // ✅ Verificar si el movimiento deja una pieza valiosa colgando
  const dangerousCaptures = enemyMoves.filter(
    (m) => m.captured && m.to === move.to
  );
  
  return dangerousCaptures.length === 0;
}
  /**
   * ✅ Verificar si un movimiento es un jaque
   * (No hay flag específico, se verifica con chess.isCheck después de simular)
   */
  protected isCheckMove(move: any, chess: Chess): boolean {
    const testChess = new Chess(chess.fen());
    const result = testChess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || "q",
    });
    if (result) {
      return testChess.isCheck();
    }
    return false;
  }
    /**
   * 🎯 Obtener buenos movimientos de desarrollo (CORREGIDO)
   */
  protected getGoodDevelopingMoves(moves: any[], chess: Chess, botColor: "w" | "b"): any[] {
    const developmentPieces = ["n", "b"];
    const enemyColor = botColor === "w" ? "b" : "w";
    const goodMoves: any[] = [];
    
    const centerMoves = this.getCenterMoves(moves);
    const centerSquares = centerMoves.map(m => m.to);

    const goodKnightSquares = {
      'w': ['c3', 'f3', 'd2', 'e2'],
      'b': ['c6', 'f6', 'd7', 'e7']
    };
    
    const goodBishopSquares = {
      'w': ['c4', 'f4', 'b5', 'g5', 'd3', 'e3'],
      'b': ['c5', 'f5', 'b4', 'g4', 'd6', 'e6']
    };

    // ✅ CRÍTICO: Definir casillas iniciales de piezas de desarrollo
    const startingSquares = {
      'w': { 'n': ['b1', 'g1'], 'b': ['c1', 'f1'] },
      'b': { 'n': ['b8', 'g8'], 'b': ['c8', 'f8'] }
    };

    for (const move of moves) {
      if (!developmentPieces.includes(move.piece)) continue;

      // ✅ Solo considerar "desarrollo" si la pieza AÚN ESTÁ en su casilla inicial.
      // Esto evita que el bot mueva una pieza ya desarrollada de una casilla "buena" a otra (ej. d4 -> f3).
      const pieceStartSquares = startingSquares[botColor][move.piece as 'n' | 'b'];
      if (!pieceStartSquares.includes(move.from)) {
        continue; // La pieza ya se movió, no es un movimiento de desarrollo
      }

      const testChess = new Chess(chess.fen());
      const result = testChess.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || "q",
      });
      if (!result) continue;

      const enemyCaptures = testChess
        .moves({ verbose: true })
        .filter((om) => om.captured === move.piece && om.color === enemyColor);
      if (enemyCaptures.length > 0) continue;

      const goodSquares = move.piece === 'n' 
        ? goodKnightSquares[botColor] 
        : goodBishopSquares[botColor];
      
      const isGoodSquare = goodSquares.includes(move.to);
      const isCenter = centerSquares.includes(move.to);

      if (isGoodSquare || isCenter) {
        goodMoves.push(move);
      }
    }

    return goodMoves.sort((a, b) => {
      const aCenter = centerSquares.includes(a.to) ? 1 : 0;
      const bCenter = centerSquares.includes(b.to) ? 1 : 0;
      return bCenter - aCenter;
    });
  }
  /**
   * ✅ Verificar si un movimiento es una captura
   */
  protected isCapture(move: any): boolean {
    return !!move.captured;
  }

  /**
   * ✅ Verificar si un movimiento es una promoción
   */
  protected isPromotion(move: any): boolean {
    return !!move.promotion;
  }
  /**
   * ♟️ Manejar ahogado (stalemate)
   */
  protected async handleStalemate(room: any): Promise<void> {
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

      this.io.to(room.roomId).emit("game_over", {
        reason: "draw",
        message: "♟️ ¡Ahogado! La partida termina en tablas.",
        whiteEloChange,
        blackEloChange,
      });

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
   * 🎮 Crear un bot (método abstracto que cada dificultad implementa)
   */
  public abstract createBot(roomId: string, botColor: "w" | "b"): Bot;
  public async makeMove(roomId: string, botColor: "w" | "b"): Promise<void> {
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

      if (room.chessInstance.isCheckmate()) {
        console.log(`♟️ ¡JAQUE MATE! El bot ${botColor} ha perdido.`);
        await this.handleCheckmate(room, botColor);
        return;
      }

      if (room.chessInstance.isStalemate()) {
        console.log(`♟️ ¡AHOGADO! La partida termina en tablas.`);
        await this.handleStalemate(room);
        return;
      }

      console.log(
        `⚠️ El bot no tiene movimientos pero no es jaque mate ni ahogado.`,
      );
      return;
    }

    const botSocketId =
      botColor === "w" ? room.playerWhite.socketId : room.playerBlack.socketId;
    const bot = this.activeBots.get(botSocketId);

    if (!bot) {
      console.log(
        `❌ Bot no encontrado para sala ${roomId}, color ${botColor}`,
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
          await this.handleCheckmate(currentRoom, botColor);
        } else if (currentRoom.chessInstance.isStalemate()) {
          await this.handleStalemate(currentRoom);
        }
        if (bot.thinkingTimer) {
          clearTimeout(bot.thinkingTimer);
          bot.thinkingTimer = undefined;
        }
        return;
      }

      // ✅ Seleccionar movimiento usando el método específico de la dificultad
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
      }

      if (bot.thinkingTimer) {
        clearTimeout(bot.thinkingTimer);
        bot.thinkingTimer = undefined;
      }
    }, thinkingTime);
  }
}
