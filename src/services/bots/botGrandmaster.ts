// src/services/bots/botGrandmaster.ts
import { Chess, PieceSymbol } from "chess.js";
import { Bot, BotBase } from "./botBase";

// 📊 Valores de piezas (Centipeones)
const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// ♟️ Tablas Posicionales (Piece-Square Tables)
const PAWN_PST = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_PST = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50
];

const BISHOP_PST = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20
];

const ROOK_PST = [
    0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0
];

export class BotGrandmaster extends BotBase {
  constructor(roomManager: any, io: any) {
    super(roomManager, io, "grandmaster");
  }

  /**
   * 🧠 Evaluación de posición (Material + Posición)
   * 💡 Se declara como protected para coincidir con la firma de BotBase
   */
  protected evaluateBoard(chess: Chess, botColor: "w" | "b"): number {
    let totalScore = 0;
    const board = chess.board();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece) continue;

        let pieceVal = PIECE_VALUES[piece.type] || 0;
        let pstVal = 0;
        const idx = r * 8 + c;

        const pstIdx = piece.color === "w" ? idx : (7 - r) * 8 + c;

        if (piece.type === "p") pstVal = PAWN_PST[pstIdx];
        else if (piece.type === "n") pstVal = KNIGHT_PST[pstIdx];
        else if (piece.type === "b") pstVal = BISHOP_PST[pstIdx];
        else if (piece.type === "r") pstVal = ROOK_PST[pstIdx];

        const value = pieceVal + pstVal;

        if (piece.color === botColor) {
          totalScore += value;
        } else {
          totalScore -= value;
        }
      }
    }
    return totalScore;
  }

  /**
   * ⚔️ Búsqueda de Quiescencia (Evalúa capturas para evitar colgar piezas)
   */
  private quiescenceSearch(
    chess: Chess,
    alpha: number,
    beta: number,
    botColor: "w" | "b"
  ): number {
    const standPat = this.evaluateBoard(chess, botColor);
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;

    const captureMoves = chess.moves({ verbose: true }).filter((m) => m.captured);

    for (const move of captureMoves) {
      chess.move(move);
      const score = -this.quiescenceSearch(chess, -beta, -alpha, botColor);
      chess.undo();

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /**
   * 🌲 Algoritmo Minimax Local
   */
  private evaluateMinimax(
    chess: Chess,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    botColor: "w" | "b"
  ): number {
    if (depth === 0 || chess.isGameOver()) {
      return this.quiescenceSearch(chess, alpha, beta, botColor);
    }

    const moves = chess.moves({ verbose: true });
    moves.sort((a, b) => (b.captured ? 10 : 0) - (a.captured ? 10 : 0));

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        chess.move(move);
        const evaluation = this.evaluateMinimax(chess, depth - 1, alpha, beta, false, botColor);
        chess.undo();
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        chess.move(move);
        const evaluation = this.evaluateMinimax(chess, depth - 1, alpha, beta, true, botColor);
        chess.undo();
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  /**
   * 🎯 Selección de la mejor jugada
   */
  protected async selectMove(moves: any[], botColor: "w" | "b", chess: Chess): Promise<any> {
    if (!moves || moves.length === 0) return null;

    let bestMove = moves[0];
    let bestValue = -Infinity;
    const depth = 4;

    for (const move of moves) {
      chess.move(move);
      const boardValue = this.evaluateMinimax(
        chess,
        depth - 1,
        -Infinity,
        Infinity,
        false,
        botColor
      );
      chess.undo();

      if (boardValue > bestValue) {
        bestValue = boardValue;
        bestMove = move;
      }
    }

    console.log(`🤖 [Grandmaster] Jugada seleccionada: ${bestMove.from}->${bestMove.to} (Score: ${bestValue})`);
    return bestMove;
  }

  public createBot(roomId: string, botColor: "w" | "b"): Bot {
    const botId = this.generateBotId();
    const botNick = this.getRandomName();
    const botElo = this.getRandomElo();

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
    console.log(`🤖 [Grandmaster] Bot ${botNick} (${botElo} Elo) creado para sala ${roomId}`);
    return bot;
  }
}