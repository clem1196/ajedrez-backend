import { Chess } from "chess.js";
import { Bot, BotBase } from "./botBase";

export class BotGrandmaster extends BotBase {
  constructor(roomManager: any, io: any) {
    super(roomManager, io, "grandmaster");
  }

  protected async selectMove(moves: any[], botColor: "w" | "b", chess: Chess): Promise<any> {
    // 🧠 Ejecuta la búsqueda interna con profundidad 6 y 2.5 segundos de limite
    const result = this.iterativeDeepeningSearch(chess, botColor, 6, 2500);

    if (result && result.move) {
      return result.move;
    }

    return moves[0];
  }

  public createBot(roomId: string, botColor: "w" | "b"): Bot {
    const botId = this.generateBotId();
    const botNick = this.getRandomName(); // Tomará un nombre de Grandmaster ("Bot_Stockfish", "Bot_Leyenda", etc.)
    const botElo = this.getRandomElo();   // Tomará Elo alto (1900-2400)

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
    console.log(`🤖 [Grandmaster] Bot ${botNick} (${botElo} Elo) creado para sala ${roomId}`);
    return bot;
  }
}