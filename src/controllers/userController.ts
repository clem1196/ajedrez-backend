// src/controllers/userController.ts
import { Response, Request, NextFunction } from 'express';
import { AppDataSource } from '../config/dataSource';
import { UserStats } from '../entities/UserStats';

import { extractString } from '../utils/paramUtil';
import { sanitizeRanking } from '../utils/sanitizeUtil';
import { User } from '../entities/User';

const statsRepository = AppDataSource.getRepository(UserStats);
const userRepository = AppDataSource.getRepository(User);
// ✅ Constantes de configuración
const LEADERBOARD_CONFIG = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 15,
  MAX_LIMIT: 50,
  MIN_LIMIT: 5,
} as const;



/**
 * 👑 Devuelve el ranking de jugadores con buscador y paginación
 */
export const getLeaderboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || LEADERBOARD_CONFIG.DEFAULT_PAGE);
    let limit = parseInt(req.query.limit as string) || LEADERBOARD_CONFIG.DEFAULT_LIMIT;
    limit = Math.max(LEADERBOARD_CONFIG.MIN_LIMIT, Math.min(LEADERBOARD_CONFIG.MAX_LIMIT, limit));
    
    const search = (req.query.search as string || '').trim();
    const skip = (page - 1) * limit;

    console.log(`📊 [Ranking] Página: ${page}, Límite: ${limit}, Búsqueda: "${search || 'ninguna'}"`);

    // ✅ Usar QueryBuilder con relaciones correctas
    const queryBuilder = statsRepository
      .createQueryBuilder('stats')
      .leftJoinAndSelect('stats.user', 'user');

    // ✅ Ordenamiento correcto
    queryBuilder
      .orderBy('stats.elo', 'DESC')
      .addOrderBy('stats.wins', 'DESC')
      .addOrderBy('user.nick', 'ASC');

    // ✅ Búsqueda
    if (search) {
      queryBuilder.where('LOWER(user.nick) LIKE LOWER(:search)', { 
        search: `%${search}%` 
      });
    }

    // ✅ Paginación
    queryBuilder.skip(skip).take(limit);

    // ✅ Ejecutar consulta
    const [leaderboard, totalUsers] = await queryBuilder.getManyAndCount();

    console.log(`📊 [Ranking] Encontrados ${totalUsers} jugadores, mostrando ${leaderboard.length}`);

    const totalPages = Math.ceil(totalUsers / limit);

    // ✅ Formatear respuesta
    const formattedLeaderboard = leaderboard.map((item, index) => 
      sanitizeRanking(item, skip + index + 1)
    );

    // ✅ Obtener posición del usuario autenticado
    let userRank = null;
    if (req.userId) {
      try {
        userRank = await getUserRank(req.userId, search);
      } catch (rankError) {
        console.error('⚠️ Error calculando ranking del usuario:', rankError);
      }
    }

    res.json({
      status: 'success',
      data: formattedLeaderboard,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      userRank,
    });
  } catch (error) {
    console.error('❌ Error al obtener el ranking:', error);
    res.status(500).json({ 
      message: 'Error al consultar la tabla de clasificación.',
      error: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
};

/**
 * 📊 Obtener el top de jugadores (para la página de inicio)
 */
export const getTopPlayers = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 10);

    const topPlayers = await statsRepository
      .createQueryBuilder('stats')
      .leftJoinAndSelect('stats.user', 'user')
      .orderBy('stats.elo', 'DESC')
      .take(limit)
      .getMany();

    const formattedTop = topPlayers.map((item, index) => ({
      rank: index + 1,
      userId: item.user?.id || null,
      nick: item.user?.nick || 'Desconocido',
      elo: item.elo || 1200,
      wins: item.wins || 0,
    }));

    res.json({
      status: 'success',
      data: formattedTop,
    });
  } catch (error) {
    console.error('❌ Error al obtener top jugadores:', error);
    res.status(500).json({ 
      message: 'Error al consultar el top de jugadores.' 
    });
  }
};

/**
 * 📊 Obtener estadísticas de un jugador específico
 */
export const getPlayerStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const nick = extractString(req.params.nick);

    if (!nick) {
      res.status(400).json({ message: 'Nick es requerido.' });
      return;
    }

    const stats = await statsRepository
      .createQueryBuilder('stats')
      .leftJoinAndSelect('stats.user', 'user')
      .where('LOWER(user.nick) = LOWER(:nick)', { nick })
      .getOne();

    if (!stats) {
      res.status(404).json({ message: 'Jugador no encontrado.' });
      return;
    }

    const totalGames = (stats.wins || 0) + (stats.losses || 0) + (stats.draws || 0);

    res.json({
      status: 'success',
      data: {
        userId: stats.user.id,
        nick: stats.user.nick,
        elo: stats.elo || 1200,
        wins: stats.wins || 0,
        losses: stats.losses || 0,
        draws: stats.draws || 0,
        totalGames: totalGames,
        winRate: totalGames > 0 ? Math.round(((stats.wins || 0) / totalGames) * 100) : 0,
      }
    });
  } catch (error) {
    console.error('❌ Error al obtener estadísticas:', error);
    res.status(500).json({ 
      message: 'Error al consultar las estadísticas del jugador.' 
    });
  }
};

/**
 * 📊 Obtener historial de partidas de un jugador
 */
export const getPlayerHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const nick = extractString(req.params.nick);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    if (!nick) {
      res.status(400).json({ message: 'Nick es requerido.' });
      return;
    }

    const historyRepository = AppDataSource.getRepository('GameHistory');
    
    const history = await historyRepository.find({
      where: [
        { whiteNick: nick },
        { blackNick: nick }
      ],
      order: { playedAt: 'DESC' },
      take: limit,
    });

    const sanitizedHistory = history.map((game: any) => {
      const isWhite = game.whiteNick === nick;
      const playerResult = isWhite 
        ? game.result === 'white_win' ? 'win' : game.result === 'draw' ? 'draw' : 'loss'
        : game.result === 'black_win' ? 'win' : game.result === 'draw' ? 'draw' : 'loss';
      
      return {
        roomId: game.roomId,
        whiteNick: game.whiteNick,
        blackNick: game.blackNick,
        result: game.result,
        reason: game.reason,
        playerResult,
        eloChange: isWhite ? game.whiteEloChange : game.blackEloChange,
        playedAt: game.playedAt,
      };
    });

    res.json({
      status: 'success',
      data: sanitizedHistory,
      count: history.length,
    });
  } catch (error) {
    console.error('❌ Error al obtener historial:', error);
    res.status(500).json({ 
      message: 'Error al consultar el historial del jugador.' 
    });
  }
};

/**
 * 🏆 Función auxiliar para obtener el ranking de un usuario específico
 */
async function getUserRank(userId: number, search: string = ''): Promise<number | null> {
  try {
    if (search) return null;

    const stats = await statsRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!stats) return null;

    const higherRanked = await statsRepository
      .createQueryBuilder('stats')
      .where('stats.elo > :elo', { elo: stats.elo })
      .getCount();

    return higherRanked + 1;
  } catch (error) {
    console.error('❌ Error calculando ranking del usuario:', error);
    return null;
  }
};

