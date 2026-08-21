// src/routes/userRoutes.ts
import { Router } from 'express';
import { 
  getLeaderboard, 
  getPlayerStats, 
  getTopPlayers,
  getPlayerHistory, 
 
} from '../controllers/userController';
import { authenticateJWT } from '../middlewares/authMiddleware';

const router = Router();

// ✅ Rutas públicas (con autenticación opcional)
router.get('/leaderboard', getLeaderboard);
router.get('/top', getTopPlayers);
router.get('/:nick/stats', getPlayerStats);
router.get('/:nick/history', getPlayerHistory);

export default router;