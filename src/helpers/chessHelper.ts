// src/helpers/chessHelper.ts
import { Chess } from "chess.js";
import { BOT_LEVELS, BotConfig } from "../config/botConfig";

// Valor estándar de las piezas para la evaluación
const PIECE_VALUES: Record<string, number> = {
  p: 10,
  n: 30,
  b: 30,
  r: 50,
  q: 90,
  k: 900,
};

// Función de evaluación posicional simple
function evaluateBoard(chess: Chess): number {
  let totalEvaluation = 0;
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) {
        const val = PIECE_VALUES[piece.type] || 0;
        totalEvaluation += piece.color === "w" ? val : -val;
      }
    }
  }
  return totalEvaluation;
}

// Algoritmo Minimax con Podado Alfa-Beta
function minimax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean
): number {
  if (depth === 0 || chess.isGameOver()) {
    return evaluateBoard(chess);
  }

  const moves = chess.moves();

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const evaluation = minimax(chess, depth - 1, alpha, beta, false);
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
      const evaluation = minimax(chess, depth - 1, alpha, beta, true);
      chess.undo();
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

export async function getBestMove(
  fen: string,
  skillLevel: number,
  depth: number
): Promise<string> {
  return new Promise((resolve) => {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });

    if (moves.length === 0) {
      resolve("");
      return;
    }

    // Nivel Novato (Skill low): Toma decisiones aleatorias para errores humanos reales
    if (skillLevel <= 2) {
      const randomMove = moves[Math.floor(Math.random() * moves.length)];
      resolve(`${randomMove.from}${randomMove.to}${randomMove.promotion || ""}`);
      return;
    }

    const isMaximizing = chess.turn() === "w";
    let bestMove = moves[0];
    let bestValue = isMaximizing ? -Infinity : Infinity;

    // Profundidad máxima de 3 para garantizar respuesta inmediata (< 50ms)
    const searchDepth = Math.min(depth, 3);

    for (const move of moves) {
      chess.move(move);
      const boardValue = minimax(
        chess,
        searchDepth - 1,
        -Infinity,
        Infinity,
        !isMaximizing
      );
      chess.undo();

      if (isMaximizing) {
        if (boardValue > bestValue) {
          bestValue = boardValue;
          bestMove = move;
        }
      } else {
        if (boardValue < bestValue) {
          bestValue = boardValue;
          bestMove = move;
        }
      }
    }

    resolve(`${bestMove.from}${bestMove.to}${bestMove.promotion || ""}`);
  });
}

// Helper para obtener la configuración del bot según el Elo del jugador
export function getBotForPlayerElo(playerElo: number): BotConfig {
  if (playerElo < 1200) return BOT_LEVELS.novice;
  if (playerElo < 1600) return BOT_LEVELS.intermediate;
  if (playerElo < 1900) return BOT_LEVELS.veteran;
  if (playerElo < 2200) return BOT_LEVELS.master;
  return BOT_LEVELS.grandmaster;
}