// src/services/bots/botMedium.ts
import { Chess } from "chess.js";
import { Bot, BotBase } from "./botBase";

export class BotMedium extends BotBase {
  constructor(roomManager: any, io: any) {
    super(roomManager, io, "medium");
  }

  protected selectMove(moves: any[], botColor: "w" | "b", chess: Chess): any {
    console.log(`🤖 [Medium] Seleccionando movimiento...`);

    const config = this.getDifficultyConfig();
    const pieceValues: { [key: string]: number } = {
      p: 1,
      n: 3,
      b: 3,
      r: 5,
      q: 9,
      k: 100,
    };

    // ✅ Separar movimientos por tipo correctamente
    const captures = moves.filter((m) => this.isCapture(m));
    const checkMoves = moves.filter((m) => this.isCheckMove(m, chess));
    const promotions = moves.filter((m) => this.isPromotion(m));
    const centerMoves = this.getCenterMoves(moves);
    const goodDevelopingMoves = this.getGoodDevelopingMoves(
      moves,
      chess,
      botColor,
    );
    const kingSafetyMoves = this.getKingSafetyMoves(moves, chess, botColor);

    // ✅ SI ESTÁ EN JAQUE, SALIR
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
        console.log(`🤖 [Medium] Salir del jaque`);
        return this.selectBestMove(checkEscapeMoves, pieceValues, chess);
      }
    }

    // ✅ PROBABILIDAD DE COMETER ERROR (10%)
    if (Math.random() < config.MISTAKE_CHANCE) {
      console.log(`🤖 [Medium] Cometió un error`);
      const badMoves = moves.filter(
        (m) => !this.isCapture(m) && !this.isCheckMove(m, chess),
      );
      if (badMoves.length > 0) {
        return badMoves[Math.floor(Math.random() * badMoves.length)];
      }
    }

    // ✅ PROMOCIONES
    if (promotions.length > 0) {
      const queenPromotions = promotions.filter((m) => m.promotion === "q");
      return queenPromotions.length > 0 ? queenPromotions[0] : promotions[0];
    }

    // ✅ CAPTURAS (80% la mejor, 20% aleatoria entre las 3 mejores)
    if (captures.length > 0) {
      captures.sort((a, b) => {
        const valueA = pieceValues[a.captured] || 0;
        const valueB = pieceValues[b.captured] || 0;
        return valueB - valueA;
      });
      return Math.random() < 0.8
        ? captures[0]
        : captures[Math.floor(Math.random() * Math.min(captures.length, 3))];
    }

    // ✅ JAQUE (prioridad media)
    if (checkMoves.length > 0) {
      // ✅ CORREGIDO en BotMedium.ts
      if (checkMoves.length > 0) {
        console.log(`🤖 [Medium] Haciendo jaque`);
        return this.selectBestMove(checkMoves, pieceValues, chess);
      }
    }

    // ✅ DESARROLLO DE PIEZAS (40% de probabilidad)
    if (goodDevelopingMoves.length > 0 && Math.random() < 0.4) {
      console.log(
        `🤖 [Medium] Desarrollando ${goodDevelopingMoves[0].piece} en ${goodDevelopingMoves[0].to}`,
      );
      return goodDevelopingMoves[0];
    }

    // ✅ MOVIMIENTOS AL CENTRO (50% de probabilidad)
    if (centerMoves.length > 0 && Math.random() < 0.5) {
      const pawnCenterMoves = centerMoves.filter((m) => m.piece === "p");
      if (pawnCenterMoves.length > 0) {
        return pawnCenterMoves[0];
      }
      return centerMoves[0];
    }

    // ✅ SEGURIDAD DEL REY (40% de probabilidad)
    if (kingSafetyMoves.length > 0 && Math.random() < 0.4) {
      console.log(`🤖 [Medium] Protegiendo al rey`);
      return kingSafetyMoves[0];
    }

    // ✅ MOVIMIENTO ALEATORIO
    console.log(`🤖 [Medium] Movimiento aleatorio`);
    return moves[Math.floor(Math.random() * moves.length)];
  }
 

  /**
   * 🎮 Crear un bot medio
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
      `🤖 [Medium] Bot ${botNick} (${botElo} Elo) creado para sala ${roomId}`,
    );
    return bot;
  }
}
