// src/services/bots/botHard.ts
import { Chess } from "chess.js";
import { Bot, BotBase } from "./botBase";

export class BotHard extends BotBase {
  constructor(roomManager: any, io: any) {
    super(roomManager, io, "hard");
  }

  protected selectMove(moves: any[], botColor: "w" | "b", chess: Chess): any {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  /**
   * 🎮 Crear un bot difícil (Avanzado)
   */
  public createBot(roomId: string, botColor: "w" | "b"): Bot {
    const botId = this.generateBotId();
    const botNick = this.getRandomName();
    const botElo = this.getRandomElo(); // Retorna entre 1600 y 1899

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