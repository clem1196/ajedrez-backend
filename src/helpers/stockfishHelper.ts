// src/helpers/stockfishHelper.ts
import stockfish from "stockfish";
import { BOT_LEVELS, BotConfig } from "../config/botConfig";

export async function getBestMove(fen: string, skillLevel: number, depth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Iniciar el motor JS/WebAssembly nativo
      const engine = stockfish();
      let bestMove = "";

      // Timeout de seguridad en caso de que el motor no responda en un tiempo razonable
      const timeout = setTimeout(() => {
        reject(new Error("Timeout al esperar respuesta de Stockfish"));
      }, 10000);

      engine.onmessage = (event: any) => {
        // En algunas versiones event es string, en otras un objeto { data: string }
        const line = typeof event === "string" ? event : event?.data || "";

        if (line.startsWith("bestmove")) {
          clearTimeout(timeout);
          bestMove = line.split(" ")[1];
          
          // Finalizar consulta
          engine.postMessage("quit");
          resolve(bestMove);
        }
      };

      // Comandos UCI para configurar y pedir la jugada
      engine.postMessage("uci");
      engine.postMessage(`setoption name Skill Level value ${skillLevel}`);
      engine.postMessage(`position fen ${fen}`);
      engine.postMessage(`go depth ${depth}`);
    } catch (error) {
      reject(new Error("Error al ejecutar el motor Stockfish: " + (error as Error).message));
    }
  });
}

// Helper para obtener el bot adecuado según el Elo del jugador
export function getBotForPlayerElo(playerElo: number): BotConfig {
  if (playerElo < 1200) return BOT_LEVELS.novice;
  if (playerElo < 1600) return BOT_LEVELS.intermediate;
  if (playerElo < 1900) return BOT_LEVELS.veteran;
  if (playerElo < 2200) return BOT_LEVELS.master;
  return BOT_LEVELS.grandmaster;
}