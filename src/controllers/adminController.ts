// src/controllers/adminController.ts
import { Request, Response } from 'express';
import { BotService } from '../services/botService';
import { BOT_CONFIG } from '../config/botConfig';

export class AdminController {
  private botService: BotService;

  constructor(botService: BotService) {
    this.botService = botService;
  }

  /**
   * 🎛️ Actualizar configuración global de bots
   */
  public updateBotConfig = (req: Request, res: Response): void => {
    try {
      const { enabled, difficulty, botProbability, minPlayersToDisable } = req.body;

      if (enabled !== undefined) {
        BOT_CONFIG.ENABLED = Boolean(enabled);
      }

      if (difficulty) {
        const validDifficulties = ['easy', 'medium', 'hard', 'grandmaster'];
        const normalizedDifficulty = String(difficulty).toLowerCase();

        if (!validDifficulties.includes(normalizedDifficulty)) {
          res.status(400).json({
            status: 'error',
            message: `Dificultad inválida. Opciones: ${validDifficulties.join(', ')}`,
          });
          return;
        }
        BOT_CONFIG.DIFFICULTY = normalizedDifficulty;
      }

      if (botProbability !== undefined) {
        const prob = Number(botProbability);
        if (!isNaN(prob) && prob >= 0 && prob <= 100) {
          BOT_CONFIG.BOT_PROBABILITY = prob;
        } else {
          res.status(400).json({
            status: 'error',
            message: 'botProbability debe ser un número entre 0 y 100',
          });
          return;
        }
      }

      if (minPlayersToDisable !== undefined) {
        const minPlayers = Number(minPlayersToDisable);
        if (!isNaN(minPlayers) && minPlayers >= 0) {
          BOT_CONFIG.MIN_PLAYERS_TO_DISABLE_BOTS = minPlayers;
        } else {
          res.status(400).json({
            status: 'error',
            message: 'minPlayersToDisable debe ser un número mayor o igual a 0',
          });
          return;
        }
      }

      console.log(`🎛️ Configuración de bots actualizada:`, BOT_CONFIG);

      res.json({
        status: 'success',
        message: 'Configuración actualizada correctamente',
        config: BOT_CONFIG,
      });
    } catch (error) {
      console.error('❌ Error actualizando configuración:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error interno actualizando configuración',
      });
    }
  };

  /**
   * 📊 Obtener estadísticas de bots
   */
  public getBotStats = (req: Request, res: Response): void => {
    try {
      const stats = this.botService.getBotStats();
      res.json({
        status: 'success',
        data: {
          ...stats,
          config: BOT_CONFIG,
        },
      });
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error obteniendo estadísticas de los bots',
      });
    }
  };

  /**
   * 🎯 Establecer dificultad global de bots
   */
  public setBotDifficulty = (req: Request, res: Response): void => {
    try {
      const { difficulty } = req.body;

      if (!difficulty) {
        res.status(400).json({
          status: 'error',
          message: 'El campo "difficulty" es requerido',
        });
        return;
      }

      const validDifficulties = ['easy', 'medium', 'hard', 'grandmaster'];
      const normalizedDifficulty = String(difficulty).toLowerCase();

      if (!validDifficulties.includes(normalizedDifficulty)) {
        res.status(400).json({
          status: 'error',
          message: `Dificultad inválida. Opciones: ${validDifficulties.join(', ')}`,
        });
        return;
      }

      BOT_CONFIG.DIFFICULTY = normalizedDifficulty;
      console.log(`🎯 Dificultad de bots cambiada a: ${normalizedDifficulty}`);

      res.json({
        status: 'success',
        message: `Dificultad cambiada a ${normalizedDifficulty}`,
        config: BOT_CONFIG,
      });
    } catch (error) {
      console.error('❌ Error cambiando dificultad:', error);
      res.status(500).json({
        status: 'error',
        message: 'Error interno al cambiar la dificultad',
      });
    }
  };
}