import stockfish from "../../engine/stockfish-18-lite-single.js";
import { BOT_LEVELS, BotConfig } from "../config/botConfig";

export async function getBestMove(fen: string, skillLevel: number, depth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout al esperar respuesta de Stockfish Lite (10s)"));
      }, 10000);

      const engine = stockfish();
      let bestMove = "";

      engine.onmessage = (event: any) => {
        const line = typeof event === "string" ? event : (event?.data || event || "");
        if (typeof line === "string" && line.startsWith("bestmove")) {
          clearTimeout(timeout);
          bestMove = line.split(" ")[1];
          resolve(bestMove);
        }
      };

      const send = (cmd: string) => engine(cmd);

      send("uci");
      send(`setoption name Skill Level value ${skillLevel}`);
      send(`position fen ${fen}`);
      send(`go depth ${depth}`);

    } catch (error) {
      reject(new Error("Error al ejecutar Stockfish Lite: " + (error as Error).message));
    }
  });
}

export function getBotForPlayerElo(playerElo: number): BotConfig {
  if (playerElo < 1200) return BOT_LEVELS.novice;
  if (playerElo < 1600) return BOT_LEVELS.intermediate;
  if (playerElo < 1900) return BOT_LEVELS.veteran;
  if (playerElo < 2200) return BOT_LEVELS.master;
  return BOT_LEVELS.grandmaster;
}
