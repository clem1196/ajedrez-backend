// src/helpers/stockfishHelper.ts
import { spawn } from "node:child_process";
import path from "node:path";

// ✅ Constantes de tiempo (declaradas al inicio)
const EVAL_TIMEOUT_MS = 5000;   // 5 segundos para evaluación
const MOVE_TIMEOUT_MS = 15000;  // 15 segundos para obtener mejor jugada

/**
 * Obtiene la mejor jugada usando Stockfish
 */
export async function getBestMove(
  fen: string,
  skillLevel: number,
  depth: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stockfishPath = path.resolve(
      process.cwd(),
      "engine",
      "stockfish-18-lite-single.js",
    );

    const engine = spawn(process.execPath, [stockfishPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      engine.kill();
      reject(new Error(`Timeout al esperar respuesta de Stockfish (${MOVE_TIMEOUT_MS}ms)`));
    }, MOVE_TIMEOUT_MS);

    const finish = (error?: Error, move?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      engine.stdin.end();
      engine.kill();
      if (error) reject(error);
      else if (move) resolve(move);
      else reject(new Error("Stockfish no devolvió una jugada válida"));
    };

    engine.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("bestmove")) {
          const parts = trimmed.split(/\s+/);
          const bestMove = parts[1];
          if (bestMove) {
            finish(undefined, bestMove);
          } else {
            finish(new Error(`bestmove inválido: ${trimmed}`));
          }
          return;
        }
      }
    });

    engine.stderr.on("data", (data: Buffer) => {
      console.error(`Stockfish stderr: ${data.toString().trim()}`);
    });

    engine.on("error", (error) => {
      finish(new Error(`Error al iniciar Stockfish: ${error.message}`));
    });

    engine.on("exit", (code, signal) => {
      if (!finished) {
        finish(
          new Error(
            `Stockfish terminó inesperadamente. code=${code}, signal=${signal}`,
          ),
        );
      }
    });

    const send = (command: string) => engine.stdin.write(`${command}\n`);

    send("uci");
    send(`setoption name Skill Level value ${skillLevel}`);
    send(`position fen ${fen}`);
    send(`go depth ${depth}`);
  });
}

/**
 * Obtiene la evaluación de una posición en centipawns (cp)
 * ✅ CORREGIDO: usa "go depth 1" en lugar de "eval" (más fiable)
 * ✅ SIEMPRE RESUELVE (nunca reject) con fallback a 0
 * Valor positivo = ventaja blancas, negativo = ventaja negras
 */
export async function getEvaluation(fen: string): Promise<number> {
  return new Promise((resolve) => {
    // ✅ Resolvemos siempre, incluso en error (fallback a 0)
    const stockfishPath = path.resolve(
      process.cwd(),
      "engine",
      "stockfish-18-lite-single.js",
    );

    const engine = spawn(process.execPath, [stockfishPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    let finished = false;
    let evaluation: number | undefined;

    // ✅ Timeout usando la constante definida
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      engine.kill();
      console.warn(`⚠️ Timeout en getEvaluation (${EVAL_TIMEOUT_MS}ms), usando 0`);
      resolve(0); // Fallback: posición equilibrada
    }, EVAL_TIMEOUT_MS);

    const finish = (value: number) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      engine.stdin.end();
      engine.kill();
      resolve(value);
    };

    engine.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();

        // Buscar score cp en la línea info
        if (trimmed.startsWith("info") && trimmed.includes("score cp")) {
          const match = trimmed.match(/score cp ([-\d]+)/);
          if (match) {
            const cp = parseInt(match[1], 10);
            evaluation = cp / 100; // Convertir a pawns
            finish(evaluation);
            return;
          }
        }

        // Si Stockfish devuelve "bestmove" (por si acaso)
        if (trimmed.startsWith("bestmove")) {
          if (evaluation !== undefined) {
            finish(evaluation);
          } else {
            finish(0); // Fallback
          }
          return;
        }
      }
    });

    engine.stderr.on("data", (data: Buffer) => {
      console.error(`Stockfish eval stderr: ${data.toString().trim()}`);
    });

    engine.on("error", () => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        engine.kill();
        console.warn(`⚠️ Error en Stockfish para evaluación, usando 0`);
        resolve(0);
      }
    });

    engine.on("exit", (code, signal) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        console.warn(
          `⚠️ Stockfish terminó inesperadamente (code=${code}, signal=${signal}), usando 0`,
        );
        resolve(0);
      }
    });

    const send = (command: string) => engine.stdin.write(`${command}\n`);

    send("uci");
    send(`position fen ${fen}`);
    send("go depth 1"); // ✅ En lugar de "eval"
  });
}