// src/services/eloService.ts
import { AppDataSource } from "../config/dataSource";
import { UserStats } from "../entities/UserStats";
import { GameHistory } from "../entities/GameHistory";
import { User } from "../entities/User";

interface MatchResultInput {
  roomId: string;
  whiteSocketId: string;
  blackSocketId: string;
  whiteNick: string;
  blackNick: string;
  result: "white_win" | "black_win" | "draw" | "abort";
  reason: string; // 'checkmate', 'surrender', 'timeout', 'abort_by_inactivity', 'draw', 'abandonment'
}

// ✅ Constantes de configuración
const ELO_CONFIG = {
  K_FACTOR: 32, // Factor de desarrollo estándar
  MIN_ELO: 100, // Elo mínimo posible
  DEFAULT_ELO: 1200, // Elo inicial por defecto
  COURTESY_BONUS: 1, // Bono por cortesía en abortos
  ELO_ABORT_PENALTY: 0, // Penalización en abortos
} as const;

export class EloService {
  private static statsRepository = AppDataSource.getRepository(UserStats);
  private static userRepository = AppDataSource.getRepository(User);
  private static historyRepository = AppDataSource.getRepository(GameHistory);

  /**
   * 🏆 Procesa el final de una partida, calcula el Elo e impacta MySQL
   */
  public static async processMatchEnd(input: MatchResultInput) {
    try {
      console.log(
        `💾 [EloService] Procesando fin de partida para la sala: ${input.roomId}`,
      );
      console.log(`   Resultado: ${input.result}, Razón: ${input.reason}`);

      // 1. Buscar si los jugadores están registrados en la BD por su Nick
      const [whiteUser, blackUser] = await Promise.all([
        this.userRepository.findOne({
          where: { nick: input.whiteNick },
          relations: ["stats"],
        }),
        this.userRepository.findOne({
          where: { nick: input.blackNick },
          relations: ["stats"],
        }),
      ]);

      // 2. Calcular cambios de Elo
      const { whiteEloChange, blackEloChange } = this.calculateEloChanges({
        whiteUser,
        blackUser,
        result: input.result,
        reason: input.reason,
      });

      // 3. Actualizar la base de datos para ambos jugadores (si están registrados)
      await this.updatePlayerStats({
        whiteUser,
        blackUser,
        whiteEloChange,
        blackEloChange,
        result: input.result,
      });

      // 4. Registrar el juego en el historial global
      await this.saveGameHistory({
        roomId: input.roomId,
        whiteNick: input.whiteNick,
        blackNick: input.blackNick,
        whiteUser,
        blackUser,
        result: input.result,
        reason: input.reason,
        whiteEloChange,
        blackEloChange,
      });

      console.log(
        `📈 [EloService] Actualizado ${input.roomId}: Blancas ${whiteEloChange > 0 ? "+" : ""}${whiteEloChange}, Negras ${blackEloChange > 0 ? "+" : ""}${blackEloChange}`,
      );

      return {
        whiteEloChange,
        blackEloChange,
        whiteNick: input.whiteNick,
        blackNick: input.blackNick,
        whiteNewElo:
          whiteUser?.stats?.elo ?? ELO_CONFIG.DEFAULT_ELO + whiteEloChange,
        blackNewElo:
          blackUser?.stats?.elo ?? ELO_CONFIG.DEFAULT_ELO + blackEloChange,
      };
    } catch (error) {
      console.error("❌ Error crítico en EloService.processMatchEnd:", error);
      return { whiteEloChange: 0, blackEloChange: 0 };
    }
  }

  /**
   * 🧮 Calcula los cambios de Elo basados en el resultado
   */
  private static calculateEloChanges(params: {
    whiteUser: User | null;
    blackUser: User | null;
    result: "white_win" | "black_win" | "draw" | "abort";
    reason: string;
  }) {
    const { whiteUser, blackUser, result, reason } = params;

    // ✅ Obtener Elos actuales o usar default
    const eloWhite = whiteUser?.stats?.elo || ELO_CONFIG.DEFAULT_ELO;
    const eloBlack = blackUser?.stats?.elo || ELO_CONFIG.DEFAULT_ELO;

    let whiteEloChange = 0;
    let blackEloChange = 0;

    // ✅ Si es aborto, manejo especial
    if (result === "abort") {
      if (reason === "abort_by_inactivity") {
        // Las blancas no movieron: las negras reciben un bono de cortesía si están registradas
        whiteEloChange = 0;
        blackEloChange = blackUser ? ELO_CONFIG.COURTESY_BONUS : 0;
      } else {
        // Otros tipos de aborto: sin cambios
        whiteEloChange = 0;
        blackEloChange = 0;
      }
      return { whiteEloChange, blackEloChange };
    }

    // ✅ Si es tablas
    if (result === "draw") {
      const scoreWhite = 0.5;
      const scoreBlack = 0.5;

      const changeWhite = this.calculateSingleEloChange(
        eloWhite,
        eloBlack,
        scoreWhite,
      );
      const changeBlack = this.calculateSingleEloChange(
        eloBlack,
        eloWhite,
        scoreBlack,
      );

      whiteEloChange = whiteUser ? changeWhite : 0;
      blackEloChange = blackUser ? changeBlack : 0;

      return { whiteEloChange, blackEloChange };
    }

    // ✅ Si es victoria para blancas o negras
    const isWhiteWin = result === "white_win";
    const scoreWhite = isWhiteWin ? 1 : 0;
    const scoreBlack = isWhiteWin ? 0 : 1;

    const changeWhite = this.calculateSingleEloChange(
      eloWhite,
      eloBlack,
      scoreWhite,
    );
    const changeBlack = this.calculateSingleEloChange(
      eloBlack,
      eloWhite,
      scoreBlack,
    );

    whiteEloChange = whiteUser ? changeWhite : 0;
    blackEloChange = blackUser ? changeBlack : 0;

    return { whiteEloChange, blackEloChange };
  }

  /**
   * 🧮 Calcula el cambio de Elo para un solo jugador
   */
  private static calculateSingleEloChange(
    eloA: number,
    eloB: number,
    scoreA: number,
  ): number {
    // Esperanza de victoria para el jugador A
    const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));

    // Variación neta (puede ser positiva o negativa)
    const change = Math.round(ELO_CONFIG.K_FACTOR * (scoreA - expectedA));

    return change;
  }

  /**
   * 📊 Actualiza las estadísticas de los jugadores en la BD
   */
  private static async updatePlayerStats(params: {
    whiteUser: User | null;
    blackUser: User | null;
    whiteEloChange: number;
    blackEloChange: number;
    result: "white_win" | "black_win" | "draw" | "abort";
  }) {
    const { whiteUser, blackUser, whiteEloChange, blackEloChange, result } =
      params;

    // ✅ Actualizar Blancas
    if (whiteUser?.stats) {
      const stats = whiteUser.stats;
      stats.elo = Math.max(ELO_CONFIG.MIN_ELO, stats.elo + whiteEloChange);

      if (result === "white_win") stats.wins += 1;
      else if (result === "black_win") stats.losses += 1;
      else if (result === "draw") stats.draws += 1;

      await this.statsRepository.save(stats);
      console.log(
        `   🟢 Blancas (${whiteUser.nick}): Elo ${stats.elo - whiteEloChange} → ${stats.elo} (${whiteEloChange > 0 ? "+" : ""}${whiteEloChange})`,
      );
    }

    // ✅ Actualizar Negras
    if (blackUser?.stats) {
      const stats = blackUser.stats;
      stats.elo = Math.max(ELO_CONFIG.MIN_ELO, stats.elo + blackEloChange);

      if (result === "black_win") stats.wins += 1;
      else if (result === "white_win") stats.losses += 1;
      else if (result === "draw") stats.draws += 1;

      await this.statsRepository.save(stats);
      console.log(
        `   🔴 Negras (${blackUser.nick}): Elo ${stats.elo - blackEloChange} → ${stats.elo} (${blackEloChange > 0 ? "+" : ""}${blackEloChange})`,
      );
    }

    // ✅ Si ambos son invitados, solo loguear
    if (!whiteUser && !blackUser) {
      console.log("   👤 Ambos jugadores son invitados - Sin cambios en BD");
    }
  }

  /**
   * 💾 Guarda el historial de la partida
   */
  private static async saveGameHistory(params: {
    roomId: string;
    whiteNick: string;
    blackNick: string;
    whiteUser: User | null;
    blackUser: User | null;
    result: "white_win" | "black_win" | "draw" | "abort";
    reason: string;
    whiteEloChange: number;
    blackEloChange: number;
  }) {
    const history = new GameHistory();
    history.roomId = params.roomId;
    history.whiteNick = params.whiteNick;
    history.blackNick = params.blackNick;
    history.whiteUser = params.whiteUser || null;
    history.blackUser = params.blackUser || null;
    history.result = params.result;
    history.reason = params.reason;
    history.whiteEloChange = params.whiteEloChange;
    history.blackEloChange = params.blackEloChange;
    history.playedAt = new Date();

    await this.historyRepository.save(history);
    console.log(`   📝 Historial guardado para ${params.roomId}`);
  }

  /**
   * 📊 Obtener el historial de un jugador
   */
  public static async getPlayerHistory(nick: string, limit: number = 50) {
    try {
      const user = await this.userRepository.findOne({ where: { nick } });
      if (!user) return [];

      const history = await this.historyRepository.find({
        where: [{ whiteUser: { id: user.id } }, { blackUser: { id: user.id } }],
        order: { playedAt: "DESC" },
        take: limit,
      });

      return history;
    } catch (error) {
      console.error("❌ Error obteniendo historial:", error);
      return [];
    }
  }

  /**
   * 📊 Obtener el ranking de jugadores
   */
  public static async getRanking(limit: number = 100) {
    try {
      const ranking = await this.statsRepository.find({
        relations: ["user"],
        order: { elo: "DESC" },
        take: limit,
      });

      return ranking.map((stat) => ({
        nick: stat.user.nick,
        elo: stat.elo,
        wins: stat.wins,
        losses: stat.losses,
        draws: stat.draws,
        totalGames: stat.wins + stat.losses + stat.draws,
      }));
    } catch (error) {
      console.error("❌ Error obteniendo ranking:", error);
      return [];
    }
  }

  /**
   * 📊 Obtener estadísticas de un jugador específico
   */
  public static async getPlayerStats(nick: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { nick },
        relations: ["stats"],
      });

      if (!user || !user.stats) return null;

      return {
        nick: user.nick,
        elo: user.stats.elo,
        wins: user.stats.wins,
        losses: user.stats.losses,
        draws: user.stats.draws,
        totalGames: user.stats.wins + user.stats.losses + user.stats.draws,
      };
    } catch (error) {
      console.error("❌ Error obteniendo estadísticas:", error);
      return null;
    }
  }

  /**
   * 📊 Método público para calcular cambio de Elo (utilidad)
   */
  public static calculateEloChange(
    eloA: number,
    eloB: number,
    scoreA: number,
  ): number {
    return this.calculateSingleEloChange(eloA, eloB, scoreA);
  }
}
