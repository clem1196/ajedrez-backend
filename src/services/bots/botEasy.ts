// src/services/bots/botEasy.ts
import { Bot, BotBase } from "./botBase";

export class BotEasy extends BotBase {
  constructor(roomManager: any, io: any) {
    super(roomManager, io, "easy");
  }

  public createBot(roomId: string, botColor: "w" | "b"): Bot {
    const botId = this.generateBotId();
    const botNick = this.getRandomName();
    const botElo = this.getRandomElo(); // Usa la configuración de easy (elo ~800)

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