// src/helpers/stockfishHelper.ts
import stockfish from "stockfish";
import { BOT_LEVELS, BotConfig } from "../config/botConfig";

export async function getBestMove(fen: string, skillLevel: number, depth: number): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      // Timeout de seguridad por si el motor no responde en 10 segundos
      const timeout = setTimeout(() => {
        reject(new Error("Timeout al esperar respuesta de Stockfish (10s)"));
      }, 10000);

      // 1. Invocar la fábrica de Stockfish
      let rawInstance: any;
      if (typeof stockfish === "function") {
        rawInstance = stockfish();
      } else {
        rawInstance = stockfish;
      }

      // 🔑 CLAVE: Stockfish 18 WASM devuelve una Promesa mientras inicializa WebAssembly
      const engine = (rawInstance && typeof rawInstance.then === "function") 
        ? await rawInstance 
        : rawInstance;

      if (!engine) {
        throw new Error("No se pudo inicializar la instancia de Stockfish WASM");
      }

      let bestMove = "";

      // Handler para procesar la respuesta UCI del motor
      const onMessage = (event: any) => {
        const line = typeof event === "string" ? event : (event?.data || event || "");
        
        if (typeof line === "string" && line.startsWith("bestmove")) {
          clearTimeout(timeout);
          bestMove = line.split(" ")[1];

          // Intentar cerrar / liberar la instancia limpiamente
          try {
            if (typeof engine.postMessage === "function") {
              engine.postMessage("quit");
            }
          } catch (_) {}

          resolve(bestMove);
        }
      };

      // 2. Registrar el receptor de mensajes (soporta varias variantes de la API WASM)
      if (typeof engine.addMessageListener === "function") {
        engine.addMessageListener(onMessage);
      } else if ("onmessage" in engine || typeof engine.onmessage !== "undefined") {
        engine.onmessage = onMessage;
      } else if (typeof engine.on === "function") {
        engine.on("message", onMessage);
      } else {
        engine.onmessage = onMessage;
      }

      // Función auxiliar para emitir comandos UCI
      const sendCmd = (cmd: string) => {
        if (typeof engine.postMessage === "function") {
          engine.postMessage(cmd);
        } else if (typeof engine.send === "function") {
          engine.send(cmd);
        } else {
          throw new Error(`El motor no expone método de envío conocido. Métodos disponibles: ${Object.keys(engine).join(", ")}`);
        }
      };

      // 3. Enviar flujo UCI
      sendCmd("uci");
      sendCmd(`setoption name Skill Level value ${skillLevel}`);
      sendCmd(`position fen ${fen}`);
      sendCmd(`go depth ${depth}`);

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