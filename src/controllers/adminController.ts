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
   * 🎛️ Actualizar configuración de bots
   */
  public updateBotConfig = (req: Request, res: Response): void => {
    try {
      const { enabled, difficulty, botProbability, minPlayersToDisable } = req.body;
      
      if (enabled !== undefined) {
        BOT_CONFIG.ENABLED = enabled;
      }
      
      if (difficulty) {
        const validDifficulties = ['easy', 'medium', 'hard'];
        if (!validDifficulties.includes(difficulty)) {
          res.status(400).json({ 
            message: `Dificultad inválida. Opciones: ${validDifficulties.join(', ')}` 
          });
          return;
        }
        BOT_CONFIG.DIFFICULTY = difficulty;
      }

      if (botProbability !== undefined && botProbability >= 0 && botProbability <= 100) {
        BOT_CONFIG.BOT_PROBABILITY = botProbability;
      }

      if (minPlayersToDisable !== undefined && minPlayersToDisable >= 0) {
        BOT_CONFIG.MIN_PLAYERS_TO_DISABLE_BOTS = minPlayersToDisable;
      }
      
      console.log(`🎛️ Configuración de bots actualizada:`, BOT_CONFIG);
      
      res.json({
        status: 'success',
        config: BOT_CONFIG
      });
    } catch (error) {
      console.error('❌ Error actualizando configuración:', error);
      res.status(500).json({ message: 'Error actualizando configuración' });
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
          config: BOT_CONFIG
        }
      });
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      res.status(500).json({ message: 'Error obteniendo estadísticas' });
    }
  };

  /**
   * 🎯 Establecer dificultad de bots
   */
  public setBotDifficulty = (req: Request, res: Response): void => {
    try {
      const { difficulty } = req.body;
      
      const validDifficulties = ['easy', 'medium', 'hard'];
      if (!validDifficulties.includes(difficulty)) {
        res.status(400).json({ 
          message: `Dificultad inválida. Opciones: ${validDifficulties.join(', ')}` 
        });
        return;
      }

      BOT_CONFIG.DIFFICULTY = difficulty;
      console.log(`🎯 Dificultad de bots cambiada a: ${difficulty}`);
      
      res.json({
        status: 'success',
        message: `Dificultad cambiada a ${difficulty}`,
        config: BOT_CONFIG
      });
    } catch (error) {
      console.error('❌ Error cambiando dificultad:', error);
      res.status(500).json({ message: 'Error cambiando dificultad' });
    }
  };
}