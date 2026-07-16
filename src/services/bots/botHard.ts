// src/services/bots/botHard.ts
import { Chess } from "chess.js";
import { Bot, BotBase } from "./botBase";

export class BotHard extends BotBase {
  constructor(roomManager: any, io: any) {
    super(roomManager, io, "hard");
  }

  protected selectMove(moves: any[], botColor: "w" | "b", chess: Chess): any {
    console.log(`🤖 [Hard] Evaluando ${moves.length} movimientos...`);

    const pieceValues: { [key: string]: number } = {
      p: 1,
      n: 3,
      b: 3,
      r: 5,
      q: 9,
      k: 100,
    };

    // ✅ Separar movimientos por tipo
    const captures = moves.filter((m) => this.isCapture(m));
    const checkMoves = moves.filter((m) => this.isCheckMove(m, chess));
    const promotions = moves.filter((m) => this.isPromotion(m));
    const centerMoves = this.getCenterMoves(moves);
    const kingSafetyMoves = this.getKingSafetyMoves(moves, chess, botColor);

    // ✅ 1. SI ESTÁ EN JAQUE, SALIR INMEDIATAMENTE

    const config = this.getDifficultyConfig();

    // 2% de probabilidad de que el "Gran Maestro" tenga un despiste
    if (Math.random() < config.MISTAKE_CHANCE) {
      console.log(`🤖 [Hard] ¡Despiste del Gran Maestro! (2% chance)`);
      // En lugar de un movimiento aleatorio total, elige el 2do o 3er mejor movimiento
      const safeMoves = moves.filter((m) =>
        this.isSafeMove(m, chess, botColor),
      );
      const movesToEvaluate = safeMoves.length > 0 ? safeMoves : moves;

      const sortedMoves = [...movesToEvaluate].sort((a, b) => {
        return (
          this.evaluateMove(b, pieceValues) - this.evaluateMove(a, pieceValues)
        );
      });

      // Elige el movimiento #2 o #3 (si existen), que suele ser bueno pero no el óptimo
      const blunderIndex = Math.min(
        1 + Math.floor(Math.random() * 2),
        sortedMoves.length - 1,
      );
      return sortedMoves[blunderIndex];
    }
    if (chess.isCheck()) {
      const checkEscapeMoves = moves.filter((m) => {
        const testChess = new Chess(chess.fen());
        const result = testChess.move({
          from: m.from,
          to: m.to,
          promotion: m.promotion || "q",
        });
        if (result) {
          return !testChess.isCheck();
        }
        return false;
      });

      if (checkEscapeMoves.length > 0) {
        console.log(`🤖 [Hard] Salir del jaque`);
        return this.selectBestMove(checkEscapeMoves, pieceValues, chess);
      }
    }

    // ✅ 2. CAPTURAS (priorizar las de mayor valor y seguras)
    if (captures.length > 0) {
      captures.sort((a, b) => {
        const valueA = pieceValues[a.captured] || 0;
        const valueB = pieceValues[b.captured] || 0;
        return valueB - valueA;
      });

      for (const capture of captures) {
        const testChess = new Chess(chess.fen());
        const result = testChess.move({
          from: capture.from,
          to: capture.to,
          promotion: capture.promotion || "q",
        });
        if (result) {
          const opponentMoves = testChess.moves({ verbose: true });
          const dangerousCaptures = opponentMoves.filter(
            (om) => om.captured && (pieceValues[om.captured] || 0) >= 3,
          );
          if (dangerousCaptures.length === 0) {
            console.log(
              `🤖 [Hard] Capturando ${capture.captured} en ${capture.to}`,
            );
            return capture;
          }
        }
      }
    }

    // ✅ 3. JAQUES (priorizar jaques seguros)
    if (checkMoves.length > 0) {
      for (const check of checkMoves) {
        const testChess = new Chess(chess.fen());
        const result = testChess.move({
          from: check.from,
          to: check.to,
          promotion: check.promotion || "q",
        });
        if (result) {
          const opponentMoves = testChess.moves({ verbose: true });
          const dangerousCaptures = opponentMoves.filter(
            (om) => om.captured && (pieceValues[om.captured] || 0) >= 3,
          );
          if (dangerousCaptures.length === 0) {
            console.log(`🤖 [Hard] Haciendo jaque en ${check.to}`);
            return check;
          }
        }
      }
    }

    // ✅ 4. PROMOCIONES
    if (promotions.length > 0) {
      const queenPromotions = promotions.filter((m) => m.promotion === "q");
      if (queenPromotions.length > 0) {
        console.log(`🤖 [Hard] Promoviendo a dama`);
        return queenPromotions[0];
      }
      console.log(`🤖 [Hard] Promoviendo pieza`);
      return promotions[0];
    }

    // ✅ 5. DESARROLLO DE PIEZAS (MEJORADO: CABALLOS AL CENTRO, NO A LOS BORDES)
    const goodDevelopment = this.getGoodDevelopingMoves(moves, chess, botColor);
    if (goodDevelopment.length > 0) {
      console.log(
        `🤖 [Hard] Desarrollando ${goodDevelopment[0].piece} en ${goodDevelopment[0].to}`,
      );
      return goodDevelopment[0];
    }

    // ✅ 6. MOVIMIENTOS AL CENTRO
    const goodCenterMoves = centerMoves.filter((m) => {
      if (
        m.piece === "p" &&
        (m.from === "a2" ||
          m.from === "a7" ||
          m.from === "h2" ||
          m.from === "h7")
      ) {
        return false;
      }
      return true;
    });

    if (goodCenterMoves.length > 0) {
      const pawnCenterMoves = goodCenterMoves.filter((m) => m.piece === "p");
      if (pawnCenterMoves.length > 0) {
        console.log(
          `🤖 [Hard] Moviendo peón al centro: ${pawnCenterMoves[0].to}`,
        );
        return pawnCenterMoves[0];
      }
      console.log(`🤖 [Hard] Moviendo al centro: ${goodCenterMoves[0].to}`);
      return goodCenterMoves[0];
    }

    // ✅ 7. SEGURIDAD DEL REY
    if (kingSafetyMoves.length > 0) {
      console.log(`🤖 [Hard] Protegiendo al rey`);
      return kingSafetyMoves[0];
    }

    // ✅ CORREGIDO en BotHard.ts (Sección 8)
    const nonTerribleMoves = moves.filter((m) => {
      // Evitar mover peones de las torres en la apertura (a2, h2, a7, h7)
      if (m.piece === "p" && ["a2", "h2", "a7", "h7"].includes(m.from)) {
        return false;
      }
      // Evitar mover torres prematuramente
      if (m.piece === "r" && ["a1", "h1", "a8", "h8"].includes(m.from)) {
        return false;
      }
      // Evitar caballos en los bordes del tablero
      if (m.piece === "n" && ["a", "h"].includes(m.to[0])) {
        return false;
      }

      return true; // ✅ Dejamos que el rey se mueva si es necesario
    });

    if (nonTerribleMoves.length > 0) {
      console.log(
        `🤖 [Hard] Movimiento por defecto: ${nonTerribleMoves[0].from} -> ${nonTerribleMoves[0].to}`,
      );
      return nonTerribleMoves[
        Math.floor(Math.random() * nonTerribleMoves.length)
      ];
    }

    console.log(`🤖 [Hard] Movimiento aleatorio (último recurso)`);
    return moves[Math.floor(Math.random() * moves.length)];
  }
 

  /**
   * 🎮 Crear un bot difícil
   */
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
    console.log(
      `🤖 [Hard] Bot ${botNick} (${botElo} Elo) creado para sala ${roomId}`,
    );
    return bot;
  }
}
