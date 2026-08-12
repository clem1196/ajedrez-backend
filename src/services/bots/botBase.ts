// src/services/bots/botBase.ts
import { Chess } from "chess.js";
import { RoomManager } from "../../sockets/roomManager";
import { EloService } from "../../services/eloService";
import { getBestMove } from "../../helpers/stockfishHelper";
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
        THINKING_TIME_MIN: 800,
        THINKING_TIME_MAX: 2000,
        ELO_RANGE: { min: 600, max: 1199 },
      },
      medium: {
        THINKING_TIME_MIN: 1000,
        THINKING_TIME_MAX: 2500,
        ELO_RANGE: { min: 1200, max: 1599 },
      },
      hard: {
        THINKING_TIME_MIN: 1200,
        THINKING_TIME_MAX: 3000,
        ELO_RANGE: { min: 1600, max: 1899 },
      },
      grandmaster: {
        THINKING_TIME_MIN: 1500,
        THINKING_TIME_MAX: 3500,
        ELO_RANGE: { min: 1900, max: 2400 },
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
    let kingPos: { row: number; col: number } | null = null;
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
      if (m.flags && (m.flags.includes("k") || m.flags.includes("q")))
        return true;
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
   * 🔍 Evaluar si una captura es realmente buena (Static Exchange Evaluation simplificado)
   */
  protected isGoodCapture(
    move: any,
    chess: Chess,
    botColor: "w" | "b",
  ): boolean {
    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
    const testChess = new Chess(chess.fen());
    const result = testChess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || "q",
    });
    if (!result) return false;

    // Valor de la pieza capturada
    const gain = pieceValues[move.captured as keyof typeof pieceValues] || 0;
    // Valor de la pieza que captura
    const loss = pieceValues[move.piece as keyof typeof pieceValues] || 0;

    // Verificar recaptura inmediata
    const enemyMoves = testChess.moves({ verbose: true });
    const recapture = enemyMoves.find(
      (m) => m.to === move.to && m.captured === move.piece,
    );
    if (recapture) {
      const recaptureVal =
        pieceValues[recapture.piece as keyof typeof pieceValues] || 0;
      // Si el rival recaptura con pieza más barata, la captura es mala
      if (recaptureVal < gain) {
        return false;
      }
    }

    return gain >= loss;
  }
  /**
   * 🎯 Evaluar la calidad de un movimiento
   */
  protected evaluateMove(
    move: any,
    pieceValues: { [key: string]: number },
    chess: Chess,
    botColor: "w" | "b",
  ): number {
    let score = 0;

    // Capturas: solo sumar si son buenas
    if (move.captured) {
      if (this.isGoodCapture(move, chess, botColor)) {
        score += pieceValues[move.captured] || 0;
      } else {
        score -= 3; // penalización por mala captura
      }
    }

    // Promoción: gran bonus
    if (move.promotion) {
      score += 9;
    }

    // Movimientos al centro
    const centerSquares = ["d4", "e4", "d5", "e5"];
    if (centerSquares.includes(move.to)) {
      score += 1;
    }

    // Bonus por jaque
    const testChess = new Chess(chess.fen());
    const result = testChess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || "q",
    });
    if (result && testChess.isCheck()) {
      score += 5;
    }

    // Penalización si el movimiento deja la pieza en peligro
    if (!this.isSafeMove(move, chess, botColor)) {
      score -= 5;
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
    botColor: "w" | "b",
  ): any {
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    let bestScore = -Infinity;
    let bestMove = moves[0];
    for (const move of moves) {
      const testChess = new Chess(chess.fen());
      const result = testChess.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || "q",
      });
      if (!result) continue;
      let score = this.evaluateBoard(testChess, botColor);
      if (testChess.isCheck()) score += 5; // bonus por jaque
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    return bestMove;
  }

  /**
   * ♟️ Manejar jaque mate
   */
  /**
   * ♟️ Manejar jaque mate
   */
  protected async handleCheckmate(
    room: any,
    winnerColor: "w" | "b", // winnerColor es el color del bot/jugador que acaba de dar el mate
  ): Promise<void> {
    room.isProcessingEnd = true;
    room.gameEnded = true;
    this.roomManager.clearRoomTimers(room);

    // ✅ CORREGIDO: Si winnerColor es 'w', el resultado es 'white_win' y el ganador es playerWhite
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
  protected static readonly PAWN_TABLE = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];

  protected static readonly KNIGHT_TABLE = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ];

  protected static readonly BISHOP_TABLE = [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ];

  protected static readonly ROOK_TABLE = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 5, 5, 0, 0, 0],
  ];

  protected static readonly QUEEN_TABLE = [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
  ];

  protected static readonly KING_TABLE = [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20],
  ];
  // ------------------------------------------------------------
  // 🧠 NUEVO: Evaluación posicional completa
  // ------------------------------------------------------------
  protected evaluateBoard(chess: Chess, botColor: "w" | "b"): number {
    const board = chess.board();
    let score = 0;
    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (!piece) continue;

        let value = pieceValues[piece.type as keyof typeof pieceValues] || 0;

        // Aplicar tabla posicional
        const tableIndex = piece.color === "w" ? row : 7 - row;
        let posBonus = 0;
        switch (piece.type) {
          case "p":
            posBonus = BotBase.PAWN_TABLE[tableIndex][col];
            break;
          case "n":
            posBonus = BotBase.KNIGHT_TABLE[tableIndex][col];
            break;
          case "b":
            posBonus = BotBase.BISHOP_TABLE[tableIndex][col];
            break;
          case "r":
            posBonus = BotBase.ROOK_TABLE[tableIndex][col];
            break;
          case "q":
            posBonus = BotBase.QUEEN_TABLE[tableIndex][col];
            break;
          case "k":
            posBonus = BotBase.KING_TABLE[tableIndex][col];
            break;
        }
        value += posBonus / 10;

        // 🔄 PERSPECTIVA FIJA: Sumar si es del bot, restar si es del rival
        if (piece.color === botColor) {
          score += value;
        } else {
          score -= value;
        }
      }
    }
    return score;
  }
  protected filterBestMoves(moves: any[], chess: Chess): any[] {
    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
    // Capturas y jaques siempre se evalúan
    const captures = moves.filter((m) => m.captured);
    const checks = moves.filter((m) => this.isCheckMove(m, chess));
    const promotions = moves.filter((m) => m.promotion);

    // Movimientos al centro (hasta 8)
    const centerMoves = this.getCenterMoves(moves).slice(0, 8);

    // Movimientos de desarrollo (hasta 6)
    const developingMoves = this.getGoodDevelopingMoves(
      moves,
      chess,
      chess.turn() as "w" | "b",
    ).slice(0, 6);

    // Combinar sin duplicados
    const selected = new Map<string, any>();
    [
      ...captures,
      ...checks,
      ...promotions,
      ...centerMoves,
      ...developingMoves,
    ].forEach((m) => {
      const key = m.from + m.to + (m.promotion || "");
      if (!selected.has(key)) {
        selected.set(key, m);
      }
    });

    // Si no hay movimientos seleccionados, devolver los primeros 12
    if (selected.size === 0) {
      return moves.slice(0, 12);
    }

    return Array.from(selected.values());
  }
  protected minimaxWithTimeLimit(
    chess: Chess,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    botColor: "w" | "b",
    deadline: number, // ⚠️ timestamp absoluto (Date.now() límite), NO una duración
  ): { score: number; move: any | null; aborted: boolean } {
    // ⏱️ Si se acabó el tiempo, esta rama NO terminó de explorarse.
    // Marcamos aborted=true para que quien nos llamó SEPA que este score
    // no es de fiar (es solo una foto estática a mitad de una jugada,
    // sin ver la respuesta del rival) y lo descarte.
    if (Date.now() >= deadline) {
      return {
        score: this.evaluateBoard(chess, botColor),
        move: null,
        aborted: true,
      };
    }

    if (depth === 0 || chess.isGameOver()) {
      return {
        score: this.evaluateBoard(chess, botColor),
        move: null,
        aborted: false,
      };
    }

    let moves = chess.moves({ verbose: true });
    if (moves.length === 0) {
      return {
        score: this.evaluateBoard(chess, botColor),
        move: null,
        aborted: false,
      };
    }

    // En nivel Hard, quitamos restricciones excesivas de filtrado para evitar puntos ciegos tácticos
    if (this.difficulty === "hard") {
      // Ordenar para maximizar eficiencia de la poda Alfa-Beta
      moves.sort((a, b) => {
        const aScore =
          (a.captured ? 15 : 0) + (this.isCheckMove(a, chess) ? 5 : 0);
        const bScore =
          (b.captured ? 15 : 0) + (this.isCheckMove(b, chess) ? 5 : 0);
        return bScore - aScore;
      });
    } else {
      moves = this.filterBestMoves(moves, chess);
    }

    let bestMove = null;

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        const testChess = new Chess(chess.fen());
        const result = testChess.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion || "q",
        });
        if (!result) continue;

        const evalResult = this.minimaxWithTimeLimit(
          testChess,
          depth - 1,
          alpha,
          beta,
          false, // Ahora minimiza el oponente
          botColor,
          deadline,
        );

        // 🚫 Si la respuesta del rival no se llegó a calcular por falta de
        // tiempo, NO podemos confiar en que esta jugada sea segura
        // (podría estar regalando la dama y no lo veríamos). Abortamos
        // toda esta profundidad y dejamos que iterativeDeepeningSearch
        // se quede con el resultado de la profundidad anterior, completa.
        if (evalResult.aborted) {
          return { score: maxEval, move: bestMove, aborted: true };
        }

        if (evalResult.score > maxEval) {
          maxEval = evalResult.score;
          bestMove = move;
        }
        alpha = Math.max(alpha, maxEval);
        if (beta <= alpha) break;
      }
      return { score: maxEval, move: bestMove, aborted: false };
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        const testChess = new Chess(chess.fen());
        const result = testChess.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion || "q",
        });
        if (!result) continue;

        const evalResult = this.minimaxWithTimeLimit(
          testChess,
          depth - 1,
          alpha,
          beta,
          true, // Maximiza el bot en el siguiente nivel
          botColor,
          deadline,
        );

        if (evalResult.aborted) {
          return { score: minEval, move: bestMove, aborted: true };
        }

        if (evalResult.score < minEval) {
          minEval = evalResult.score;
          bestMove = move;
        }
        beta = Math.min(beta, minEval);
        if (beta <= alpha) break;
      }
      return { score: minEval, move: bestMove, aborted: false };
    }
  }

  /**
   * 🧠 Búsqueda por profundización iterativa (iterative deepening)
   *
   * Por qué existe: minimaxWithTimeLimit puede cortarse a mitad de una
   * rama cuando se acaba el tiempo. Si usáramos ese resultado parcial tal
   * cual, el bot podía "ver" que capturó una pieza pero el corte de tiempo
   * le impedía ver la recaptura del rival al ply siguiente -> parecía un
   * regalo de dama porque, de hecho, la búsqueda nunca llegó a evaluar esa
   * respuesta.
   *
   * La solución: buscar a profundidad 1, luego 2, luego 3... Cada vez que
   * una profundidad termina COMPLETA (sin aborted) guardamos ese resultado
   * como el mejor confiable. En cuanto una profundidad se corta por tiempo,
   * la descartamos entera y devolvemos la última completa. Así el bot
   * nunca juega en base a una búsqueda a medias.
   */
  protected iterativeDeepeningSearch(
    chess: Chess,
    botColor: "w" | "b",
    maxDepth: number,
    timeLimitMs: number,
  ): { score: number; move: any | null } {
    const deadline = Date.now() + timeLimitMs;
    let best: { score: number; move: any | null } | null = null;

    for (let depth = 1; depth <= maxDepth; depth++) {
      const result = this.minimaxWithTimeLimit(
        chess,
        depth,
        -Infinity,
        Infinity,
        true,
        botColor,
        deadline,
      );

      if (result.aborted || !result.move) {
        // Si no terminó a tiempo, usamos la última búsqueda completa
        break;
      }

      best = result;

      // Si se acabó el tiempo, paramos
      if (Date.now() >= deadline) break;
    }

    return best ?? { score: 0, move: null };
  }

  // ------------------------------------------------------------
  // 🧠 NUEVO: Minimax con poda alfa‑beta
  // ------------------------------------------------------------
  protected minimax(
    chess: Chess,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    botColor: "w" | "b",
  ): { score: number; move: any | null } {
    if (depth === 0 || chess.isGameOver()) {
      return { score: this.evaluateBoard(chess, botColor), move: null };
    }

    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) {
      return { score: this.evaluateBoard(chess, botColor), move: null };
    }

    let bestMove = null;

    // Ordenar movimientos para mejorar la poda: primero capturas y jaques
    moves.sort((a, b) => {
      const aScore =
        (a.captured ? 10 : 0) + (this.isCheckMove(a, chess) ? 5 : 0);
      const bScore =
        (b.captured ? 10 : 0) + (this.isCheckMove(b, chess) ? 5 : 0);
      return bScore - aScore;
    });

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        const testChess = new Chess(chess.fen());
        const result = testChess.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion || "q",
        });
        if (!result) continue;
        const evalResult = this.minimax(
          testChess,
          depth - 1,
          alpha,
          beta,
          false,
          botColor,
        );
        if (evalResult.score > maxEval) {
          maxEval = evalResult.score;
          bestMove = move;
        }
        alpha = Math.max(alpha, maxEval);
        if (beta <= alpha) break;
      }
      return { score: maxEval, move: bestMove };
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        const testChess = new Chess(chess.fen());
        const result = testChess.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion || "q",
        });
        if (!result) continue;
        const evalResult = this.minimax(
          testChess,
          depth - 1,
          alpha,
          beta,
          true,
          botColor,
        );
        if (evalResult.score < minEval) {
          minEval = evalResult.score;
          bestMove = move;
        }
        beta = Math.min(beta, minEval);
        if (beta <= alpha) break;
      }
      return { score: minEval, move: bestMove };
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
    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
    // Verificar si alguna pieza enemiga puede capturar la pieza movida con ventaja
    const dangerous = enemyMoves.some((m) => {
      if (m.captured && m.to === move.to) {
        const capturedVal =
          pieceValues[m.captured as keyof typeof pieceValues] || 0;
        const attackerVal =
          pieceValues[m.piece as keyof typeof pieceValues] || 0;
        return capturedVal > attackerVal;
      }
      return false;
    });
    return !dangerous;
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
  protected getGoodDevelopingMoves(
    moves: any[],
    chess: Chess,
    botColor: "w" | "b",
  ): any[] {
    const developmentPieces = ["n", "b"];
    const enemyColor = botColor === "w" ? "b" : "w";
    const goodMoves: any[] = [];
    const centerMoves = this.getCenterMoves(moves);
    const centerSquares = centerMoves.map((m) => m.to);

    const goodKnightSquares: Record<string, string[]> = {
      w: ["c3", "f3", "d2", "e2"],
      b: ["c6", "f6", "d7", "e7"],
    };
    const goodBishopSquares: Record<string, string[]> = {
      w: ["c4", "f4", "b5", "g5", "d3", "e3"],
      b: ["c5", "f5", "b4", "g4", "d6", "e6"],
    };
    const startingSquares: Record<string, Record<string, string[]>> = {
      w: { n: ["b1", "g1"], b: ["c1", "f1"] },
      b: { n: ["b8", "g8"], b: ["c8", "f8"] },
    };

    for (const move of moves) {
      if (!developmentPieces.includes(move.piece)) continue;
      const pieceStartSquares =
        startingSquares[botColor][move.piece as "n" | "b"];
      if (!pieceStartSquares.includes(move.from)) continue;

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

      const goodSquares =
        move.piece === "n"
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
  /* ✅ Verificar si un movimiento es una captura
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
      const fen = room.chessInstance.fen();

      const difficultyConfig: Record<string, { skill: number; depth: number }> =
        {
          easy: { skill: 1, depth: 3 }, // 🟢 Novato: Comete errores tácticos reales
          medium: { skill: 8, depth: 7 }, // 🟡 Intermedio: Jugador aficionado (~1400 Elo)
          hard: { skill: 15, depth: 11 }, // 🟠 Avanzado: Jugador de club (~1800 Elo)
          grandmaster: { skill: 20, depth: 16 }, // 🟣 Gran Maestro: Máxima potencia Stockfish
        };
      const { skill, depth } =
        difficultyConfig[this.difficulty] || difficultyConfig.easy;

      try {
        const bestMove = await getBestMove(fen, skill, depth);
        if (bestMove) {
          // ✅ CORREGIDO: Asegurar que chess.js procese correctamente el string UCI de Stockfish
          // Si usas chess.js v1.0.0-beta.6 o superior, acepta la propiedad 'sloppy' u objetos directos
          const result = room.chessInstance.move({
            from: bestMove.substring(0, 2),
            to: bestMove.substring(2, 4),
            promotion: bestMove.length === 5 ? bestMove.charAt(4) : undefined,
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
              `🤖 Bot ${bot.nick} (Stockfish) movió: ${result.from} -> ${result.to}`,
            );
            // ♟️ VERIFICAR SI EL BOT HIZO JAQUE MATE O AHOGADO
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
              `⚠️ Stockfish generó un movimiento UCI inválido para chess.js: ${bestMove}`,
            );
          }
        }
      } catch (err) {
        console.error("❌ Error al calcular jugada con Stockfish:", err);
      }

      if (bot.thinkingTimer) {
        clearTimeout(bot.thinkingTimer);
        bot.thinkingTimer = undefined;
      }
    }, thinkingTime);
  }
}
