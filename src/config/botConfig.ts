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