// src/config/botConfig.ts

export const BOT_CONFIG = {
  ENABLED: process.env.ENABLE_BOTS !== "false",
  MIN_PLAYERS_TO_DISABLE_BOTS: parseInt(
    process.env.MIN_PLAYERS_TO_DISABLE_BOTS || "5",
  ),
  BOT_PROBABILITY: parseInt(process.env.BOT_PROBABILITY || "100"),
};

export const updateBotConfig = (newConfig: Partial<typeof BOT_CONFIG>) => {
  Object.assign(BOT_CONFIG, newConfig);
  console.log(`🎛️ Configuración de bots actualizada:`, BOT_CONFIG);
};

export interface BotConfig {
  name: string;
  elo: number;
  difficulty: "easy" | "medium" | "hard" | "grandmaster";
  skillLevel: number;
  depth: number;
  thinkingTimeMs: number;
  drawAcceptanceProb: number;
}

export const BOT_LEVELS: Record<string, BotConfig> = {
  easy: {
    name: "Bot Novato",
    elo: 1200, // Ajustado a 1200 como piso base
    difficulty: "easy",
    skillLevel: 1,
    depth: 3,
    thinkingTimeMs: 800,
    drawAcceptanceProb: 0.4,
  },
  medium: {
    name: "Bot Aficionado",
    elo: 1400,
    difficulty: "medium",
    skillLevel: 6,
    depth: 6,
    thinkingTimeMs: 1200,
    drawAcceptanceProb: 0.3,
  },
  hard: {
    name: "Bot Veterano",
    elo: 1750,
    difficulty: "hard",
    skillLevel: 12,
    depth: 10,
    thinkingTimeMs: 1500,
    drawAcceptanceProb: 0.2,
  },
  grandmaster: {
    name: "Bot Gran Maestro",
    elo: 2200,
    difficulty: "grandmaster",
    skillLevel: 20,
    depth: 14,
    thinkingTimeMs: 2000,
    drawAcceptanceProb: 0.1,
  },
};
export const BOT_NAMES_LOWERCASE: string[] = [
  // Nombres fáciles
  "Novato",
  "Aprendiz",
  "Principiante",
  "Iniciante",
  "PechoFrio",
  // Medios
  "Estratega",
  "Tactico",
  "Calmado",
  "Aficionado",
  "Resolutivo",
  // Difíciles
  "Veterano",
  "Experto",
  "Maestro",
  "Avanzado",
  "Titan",
  // Grandmaster
  "Master",
  "GranMaestro",
  "Leyenda",
  "Stockfish",
];
