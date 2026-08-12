// src/helpers/stockfishHelper.ts
import { spawn } from "child_process";
import path from "path";
import { BOT_LEVELS, BotConfig } from "../config/botConfig";

export async function getBestMove(fen: string, skillLevel: number, depth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Ruta al binario ejecutable de Stockfish que descargues
    const stockfishPath = path.join(__dirname, "../bin/stockfish.exe"); 
    
    // Iniciar el proceso de forma nativa en el sistema
    const engine = spawn(stockfishPath);

    let buffer = "";

    engine.stdout.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Mantener la última línea incompleta en el buffer

      for (const line of lines) {
        if (line.startsWith("bestmove")) {
          const move = line.split(" ")[1];
          engine.kill(); // Matar el proceso inmediatamente para liberar memoria
          resolve(move);
          return;
        }
      }
    });

    engine.on("error", (err) => {
      reject(new Error("Error en el binario de Stockfish: " + err.message));
    });

    // Enviar comandos UCI directamente al flujo de entrada estándar del sistema
    engine.stdin.write("uci\n");
    engine.stdin.write(`setoption name Skill Level value ${skillLevel}\n`);
    engine.stdin.write(`position fen ${fen}\n`);
    engine.stdin.write(`go depth ${depth}\n`);
  });
};
// Helper para obtener el bot adecuado según el Elo del jugador
export function getBotForPlayerElo(playerElo: number): BotConfig {
  if (playerElo < 1200) return BOT_LEVELS.novice;
  if (playerElo < 1600) return BOT_LEVELS.intermediate;
  if (playerElo < 1900) return BOT_LEVELS.veteran;
  if (playerElo < 2200) return BOT_LEVELS.master;
  return BOT_LEVELS.grandmaster;
}