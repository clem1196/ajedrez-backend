// src/config/botConfig.ts
export const BOT_CONFIG = {
  // ✅ Activar/desactivar bots globalmente
  ENABLED: process.env.ENABLE_BOTS !== 'false', // Por defecto true
  
  // ✅ Umbral mínimo de usuarios en cola para desactivar bots
  MIN_PLAYERS_TO_DISABLE_BOTS: parseInt(process.env.MIN_PLAYERS_TO_DISABLE_BOTS || '5'), // Si hay 5+ jugadores en cola, no usar bots
  
  // ✅ Niveles de dificultad
  DIFFICULTY: process.env.BOT_DIFFICULTY || 'easy', // 'easy', 'medium', 'hard'
  
  // ✅ Porcentaje de partidas que usan bots (0-100)
  BOT_PROBABILITY: parseInt(process.env.BOT_PROBABILITY || '100'),
};
// ✅ Función para actualizar configuración desde el panel admin
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
  novice: {
    name: "Bot Novato",
    elo: 800,
    difficulty: "easy",
    skillLevel: 1,      // 🔥 Bajado de 5 a 1
    depth: 3,           // 🔥 Bajado de 6 a 3
    thinkingTimeMs: 800
  },
  intermediate: {
    name: "Bot Aficionado",
    elo: 1300,
    difficulty: "easy",
    skillLevel: 6,
    depth: 6,
    thinkingTimeMs: 1200
  },
  veteran: {
    name: "Bot Veterano",
    elo: 1700,
    difficulty: "medium",
    skillLevel: 12,
    depth: 10,
    thinkingTimeMs: 1500
  },
  master: {
    name: "Bot Maestro",
    elo: 2000,
    difficulty: "hard",
    skillLevel: 18,
    depth: 14,
    thinkingTimeMs: 1800
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