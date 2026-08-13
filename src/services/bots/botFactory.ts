// src/services/bots/botFactory.ts
import { BotBase } from "./botBase";
import { BotEasy } from "./botEasy";
import { BotMedium } from "./botMedium";
import { BotHard } from "./botHard";
import { BotGrandmaster } from "./botGrandmaster";

export class BotFactory {
  static createBot(difficulty: string, roomManager: any, io: any): BotBase {
    switch (difficulty) {
      case "easy":
        return new BotEasy(roomManager, io);
      case "medium":
        return new BotMedium(roomManager, io);
      case "hard":
        return new BotHard(roomManager, io);
      case "grandmaster":
        return new BotGrandmaster(roomManager, io);
      default:
        return new BotEasy(roomManager, io);
    }
  }
}
