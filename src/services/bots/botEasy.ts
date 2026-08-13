import { Chess } from "chess.js";
import { Bot, BotBase } from "./botBase";
import { getBestMove } from "../../helpers/chessHelper";

export class BotEasy extends BotBase {
  constructor(roomManager: any, io: any) {
    super(roomManager, io, "easy");
  }

  protected async selectMove(moves: any[], botColor: "w" | "b", chess: Chess): Promise<any> {
    // 40% de probabilidad de hacer una jugada completamente aleatoria
    if (Math.random() < 0.4) {
      return moves[Math.floor(Math.random() * moves.length)];
    }
    // Si no, calcula una jugada básica (Stockfish skill 1, profundidad 2)
    return await getBestMove(chess.fen(), 1, 2);
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