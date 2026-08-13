// src/services/bots/botEasy.ts
import { Chess } from "chess.js";
import { Bot, BotBase } from "./botBase";

export class BotEasy extends BotBase {
  constructor(roomManager: any, io: any) {
    super(roomManager, io, "easy");
  }

  // ✅ Requerido por la interfaz abstracta
  protected selectMove(moves: any[], botColor: "w" | "b", chess: Chess): any {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  /**
   * 🎮 Crear un bot fácil (Principiante / Novato)
   */
  public createBot(roomId: string, botColor: "w" | "b"): Bot {
    const botId = this.generateBotId();
    const botNick = this.getRandomName();
    const botElo = this.getRandomElo(); // Retorna entre 600 y 1199

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
      `🤖 [Easy] Bot ${botNick} (${botElo} Elo) creado para sala ${roomId}`,
    );
    return bot;
  }
}