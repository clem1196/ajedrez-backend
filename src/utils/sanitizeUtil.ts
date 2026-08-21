// src/utils/sanitizeUtils.ts
import { User } from "../entities/User";
import { UserStats } from "../entities/UserStats";

/**
 * 🧹 Sanitizar datos de usuario para respuesta API
 */
export const sanitizeUser = (user: User) => {
  if (!user) return null;

  return {
    id: user.id,
    nick: user.nick,
    email: user.email,
    googleId: user.googleId || null,
    githubId: user.githubId || null,
    lichessId: user.lichessId || null,
    elo: user.stats?.elo || 1200,
    wins: user.stats?.wins || 0,
    losses: user.stats?.losses || 0,
    draws: user.stats?.draws || 0,
    totalGames:
      (user.stats?.wins || 0) +
      (user.stats?.losses || 0) +
      (user.stats?.draws || 0),
    winRate:
      (user.stats?.wins || 0) +
        (user.stats?.losses || 0) +
        (user.stats?.draws || 0) >
      0
        ? Math.round(
            ((user.stats?.wins || 0) /
              ((user.stats?.wins || 0) +
                (user.stats?.losses || 0) +
                (user.stats?.draws || 0))) *
              100,
          )
        : 0,
    isAdmin: user.isAdmin || false,
     authProvider: user.authProvider || 'local',
     createdAt: user.createdAt,
  };
};

/**
 * 🧹 Sanitizar estadísticas de usuario para respuesta API
 */
export const sanitizeStats = (stats: UserStats) => {
  if (!stats || !stats.user) return null;

  const totalGames = stats.wins + stats.losses + stats.draws;

  return {
    userId: stats.user.id,
    nick: stats.user.nick,
    elo: stats.elo,
    wins: stats.wins,
    losses: stats.losses,
    draws: stats.draws,
    totalGames: totalGames,
    winRate: totalGames > 0 ? Math.round((stats.wins / totalGames) * 100) : 0,
    lossRate:
      totalGames > 0 ? Math.round((stats.losses / totalGames) * 100) : 0,
    drawRate: totalGames > 0 ? Math.round((stats.draws / totalGames) * 100) : 0,
  };
};

/**
 * 🧹 Sanitizar datos de ranking
 */
export const sanitizeRanking = (item: any, rank: number) => {
  const totalGames = (item.wins || 0) + (item.losses || 0) + (item.draws || 0);
  return {
    rank,
    userId: item.user?.id || null,
    nick: item.user?.nick || "Desconocido",
    elo: item.elo || 1200,
    wins: item.wins || 0,
    losses: item.losses || 0,
    draws: item.draws || 0,
    totalGames: totalGames,
    winRate:
      totalGames > 0 ? Math.round(((item.wins || 0) / totalGames) * 100) : 0,
  };
};

/**
 * 🧹 Sanitizar historial de partidas
 */
export const sanitizeHistory = (game: any, playerNick: string) => {
  if (!game) return null;

  const isWhite = game.whiteNick === playerNick;
  const playerResult = isWhite
    ? game.result === "white_win"
      ? "win"
      : game.result === "draw"
        ? "draw"
        : "loss"
    : game.result === "black_win"
      ? "win"
      : game.result === "draw"
        ? "draw"
        : "loss";

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
};
