// src/routes/adminRoutes.ts
import { Router } from 'express';
import { AdminController } from '../controllers/adminController';
import { BotService } from '../services/botService';
import { RoomManager } from '../sockets/roomManager';
import { Server } from 'socket.io';

// ✅ Recibir dependencias como parámetros
export const createAdminRoutes = (
  roomManager: RoomManager,
  io: Server,
  botService: BotService
) => {
  const router = Router();
  const adminController = new AdminController(botService);

  // ✅ Rutas de administración de bots
  router.post('/bot-config', adminController.updateBotConfig);
  router.get('/bot-stats', adminController.getBotStats);
  router.post('/bot-difficulty', adminController.setBotDifficulty);
  console.log(`📋 Rutas de admin registradas: /bot-config, /bot-stats, /bot-difficulty`);
  
  return router;
};