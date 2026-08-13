import { Chess } from "chess.js";
import { Bot, BotBase } from "./botBase";
import { getBestMove } from "../../helpers/chessHelper";

export class BotGrandmaster extends BotBase {
  constructor(roomManager: any, io: any) {
    super(roomManager, io, "grandmaster");
  }

  protected async selectMove(moves: any[], botColor: "w" | "b", chess: Chess): Promise<any> {
    // Máxima precisión táctica e intachabilidad
    const bestMove = await getBestMove(chess.fen(), 20, 14);
    
    if (!bestMove) {
      const fallback = this.iterativeDeepeningSearch(chess, botColor, 6, 2500);
      return fallback.move;
    }
    return bestMove;
  }

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
    return bot;
  }
}