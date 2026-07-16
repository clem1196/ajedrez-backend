// src/services/bots/botEasy.ts
import { Chess } from "chess.js";
import { Bot, BotBase } from "./botBase";

export class BotEasy extends BotBase {
  constructor(roomManager: any, io: any) {
    super(roomManager, io, "easy");
  }

  protected selectMove(moves: any[], botColor: "w" | "b", chess: Chess): any {
    console.log(`🤖 [Easy] Seleccionando movimiento...`);
    
    const config = this.getDifficultyConfig();
    const pieceValues: { [key: string]: number } = {
      p: 1, n: 3, b: 3, r: 5, q: 9, k: 100,
    };

    // ✅ Separar movimientos por tipo correctamente
    const captures = moves.filter((m) => this.isCapture(m));
    const checkMoves = moves.filter((m) => this.isCheckMove(m, chess));
    const promotions = moves.filter((m) => this.isPromotion(m));
    const centerMoves = this.getCenterMoves(moves);

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
        console.log(`🤖 [Easy] Salir del jaque`);
        return checkEscapeMoves[Math.floor(Math.random() * checkEscapeMoves.length)];
      }
    }

    // ✅ PROBABILIDAD DE COMETER ERROR (30%)
    if (Math.random() < config.MISTAKE_CHANCE) {
      console.log(`🤖 [Easy] Cometió un error`);
      const badMoves = moves.filter(
        (m) => !this.isCapture(m) && !this.isCheckMove(m, chess)
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

    // ✅ CAPTURAS (50% la mejor, 50% aleatoria)
    if (captures.length > 0) {
      captures.sort((a, b) => {
        const valueA = pieceValues[a.captured] || 0;
        const valueB = pieceValues[b.captured] || 0;
        return valueB - valueA;
      });
      return Math.random() < 0.5 
        ? captures[0] 
        : captures[Math.floor(Math.random() * Math.min(captures.length, 3))];
    }

    // ✅ JAQUE (40% de probabilidad)
    if (checkMoves.length > 0 && Math.random() < 0.4) {
      return checkMoves[0];
    }

    // ✅ MOVIMIENTOS AL CENTRO (30% de probabilidad)
    if (centerMoves.length > 0 && Math.random() < 0.3) {
      const pawnCenterMoves = centerMoves.filter((m) => m.piece === "p");
      if (pawnCenterMoves.length > 0) {
        return pawnCenterMoves[0];
      }
      return centerMoves[0];
    }

    // ✅ MOVIMIENTO ALEATORIO
    console.log(`🤖 [Easy] Movimiento aleatorio`);
    return moves[Math.floor(Math.random() * moves.length)];
  }

  /**
   * 🎮 Crear un bot fácil
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
    console.log(`🤖 [Easy] Bot ${botNick} (${botElo} Elo) creado para sala ${roomId}`);
    return bot;
  }
}