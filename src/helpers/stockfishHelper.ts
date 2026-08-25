//src/helpers/stockfishHelper.ts
import { spawn } from "node:child_process";
import path from "node:path";

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

    const engine = spawn(
      process.execPath,
      [stockfishPath],
      {
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let buffer = "";
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;

      finished = true;
      engine.kill();

      reject(
        new Error("Timeout al esperar respuesta de Stockfish Lite (15s)"),
      );
    }, 15000);

    const finish = (error?: Error, move?: string) => {
      if (finished) return;

      finished = true;
      clearTimeout(timeout);

      try {
        engine.stdin.end();
      } catch {}

      try {
        engine.kill();
      } catch {}

      if (error) {
        reject(error);
      } else if (move) {
        resolve(move);
      } else {
        reject(new Error("Stockfish no devolvió una jugada válida"));
      }
    };

    engine.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();

        console.log(`♟️ Stockfish: ${trimmed}`);

        if (trimmed.startsWith("bestmove")) {
          const parts = trimmed.split(/\s+/);
          const bestMove = parts[1];

          if (bestMove) {
            finish(undefined, bestMove);
          } else {
            finish(
              new Error(
                `Stockfish devolvió un bestmove inválido: ${trimmed}`,
              ),
            );
          }

          return;
        }
      }
    });

    engine.stderr.on("data", (data: Buffer) => {
      console.error(`Stockfish stderr: ${data.toString().trim()}`);
    });

    engine.on("error", (error) => {
      finish(
        new Error(
          `Error al iniciar Stockfish Lite: ${error.message}`,
        ),
      );
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

    const send = (command: string) => {
      engine.stdin.write(`${command}\n`);
    };

    send("uci");
    send(`setoption name Skill Level value ${skillLevel}`);
    send(`position fen ${fen}`);
    send(`go depth ${depth}`);
  });
};
/**
 * Obtiene la evaluación de una posición en centipawns (cp)
 * Valor positivo favorece a las blancas, negativo a las negras.
 */
export async function getEvaluation(fen: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const stockfishPath = path.resolve(
      process.cwd(),
      "engine",
      "stockfish-18-lite-single.js",
    );

    const engine = spawn(
      process.execPath,
      [stockfishPath],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    let buffer = "";
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      engine.kill();
      reject(new Error("Timeout al obtener evaluación (10s)"));
    }, 10000);

    const finish = (error?: Error, evaluation?: number) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      engine.stdin.end();
      engine.kill();
      if (error) reject(error);
      else if (evaluation !== undefined) resolve(evaluation);
      else reject(new Error("No se pudo obtener evaluación"));
    };

    engine.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        console.log(`📊 Stockfish eval: ${trimmed}`);

        if (trimmed.startsWith("info") && trimmed.includes("score cp")) {
          // Extraer el score
          const match = trimmed.match(/score cp ([-\d]+)/);
          if (match) {
            const cp = parseInt(match[1], 10);
            // cp es centipawns, positivo = ventaja blancas
            finish(undefined, cp / 100); // Convertir a pawns
            return;
          }
        }
      }
    });

    engine.stderr.on("data", (data: Buffer) => {
      console.error(`Stockfish eval stderr: ${data.toString().trim()}`);
    });

    engine.on("error", (error) => {
      finish(new Error(`Error al iniciar Stockfish: ${error.message}`));
    });

    engine.on("exit", (code, signal) => {
      if (!finished) {
        finish(new Error(`Stockfish terminó inesperadamente. code=${code}, signal=${signal}`));
      }
    });

    const send = (command: string) => engine.stdin.write(`${command}\n`);

    send("uci");
    send(`position fen ${fen}`);
    send("eval"); // O también "go depth 1" y parsear el score
  });
}
