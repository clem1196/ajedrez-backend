// src/config/botConfig.ts

export const BOT_CONFIG = {
  ENABLED: process.env.ENABLE_BOTS !== 'false',
  MIN_PLAYERS_TO_DISABLE_BOTS: parseInt(process.env.MIN_PLAYERS_TO_DISABLE_BOTS || '5'),
  DIFFICULTY: process.env.BOT_DIFFICULTY || 'easy',
  BOT_PROBABILITY: parseInt(process.env.BOT_PROBABILITY || '100'),
};

export const updateBotConfig = (newConfig: Partial<typeof BOT_CONFIG>) => {
  Object.assign(BOT_CONFIG, newConfig);
  console.log(`🎛️ Configuración de bots actualizada:`, BOT_CONFIG);
};

export interface BotConfig {
  name: string;
  elo: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'grandmaster';
  skillLevel: number;
  depth: number;
  thinkingTimeMs: number;
}

export const BOT_LEVELS: Record<string, BotConfig> = {
  easy: {
    name: "Bot Novato",
    elo: 800,
    difficulty: "easy",
    skillLevel: 1,
    depth: 3,
    thinkingTimeMs: 800
  },
  medium: {
    name: "Bot Aficionado",
    elo: 1300,
    difficulty: "medium",  // Cambiado de "easy" a "medium"
    skillLevel: 6,
    depth: 6,
    thinkingTimeMs: 1200
  },
  hard: {
    name: "Bot Veterano",
    elo: 1700,
    difficulty: "hard",    // Cambiado de "medium" a "hard"
    skillLevel: 12,
    depth: 10,
    thinkingTimeMs: 1500
  },
  grandmaster: {
    name: "Bot Gran Maestro",
    elo: 2400,
    difficulty: "grandmaster",
    skillLevel: 20,
    depth: 14,
    thinkingTimeMs: 2000
  }
};