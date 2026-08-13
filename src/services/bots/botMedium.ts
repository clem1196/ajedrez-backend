import { Chess } from "chess.js";
import { Bot, BotBase } from "./botBase";
import { getBestMove } from "../../helpers/chessHelper";

export class BotMedium extends BotBase {
  constructor(roomManager: any, io: any) {
    super(roomManager, io, "medium");
  }

  protected async selectMove(moves: any[], botColor: "w" | "b", chess: Chess): Promise<any> {
    // 15% de probabilidad de error/aleatoriedad
    if (Math.random() < 0.15) {
      return moves[Math.floor(Math.random() * moves.length)];
    }
    // Stockfish nivel medio (skill 8, profundidad 4)
    return await getBestMove(chess.fen(), 8, 4);
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