// src/controllers/authController.ts
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../config/dataSource";
import { User } from "../entities/User";
import { UserStats } from "../entities/UserStats";
import { validationResult } from "express-validator";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { sanitizeUser } from "../utils/sanitizeUtil";

const userRepository = AppDataSource.getRepository(User);

// ✅ Constantes de configuración
const AUTH_CONFIG = {
  SALT_ROUNDS: 10,
  TOKEN_EXPIRY: "7d",
  DEFAULT_ELO: 1200,
  ELO_CHANGE_WIN: 16, // Cambio estándar por victoria/derrota
  MIN_ELO: 100,
} as const;

/**
 * 📝 Registrar un nuevo usuario
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        message: 'Error de validación',
        errors: errors.array()
      });
      return;
    }

    const { nick, email, password, initialElo } = req.body;

    const normalizedNick = nick.trim();
    const normalizedEmail = email.trim().toLowerCase();

    const [existingNick, existingEmail] = await Promise.all([
      userRepository.findOne({ where: { nick: normalizedNick } }),
      userRepository.findOne({ where: { email: normalizedEmail } })
    ]);

    if (existingNick) {
      res.status(400).json({
        message: 'El nombre de usuario (Nick) ya está en uso. Por favor, elige otro.'
      });
      return;
    }

    if (existingEmail) {
      res.status(400).json({
        message: 'El correo electrónico ya está registrado. ¿Ya tienes cuenta?'
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, AUTH_CONFIG.SALT_ROUNDS);

    const newUser = new User();
    newUser.nick = normalizedNick;
    newUser.email = normalizedEmail;
    newUser.password = hashedPassword;
    newUser.authProvider = 'local'; // ✅ IMPORTANTE
    newUser.lastLogin = new Date();

    // Crear estadísticas
    const newStats = new UserStats();
    const incomingElo = Number(initialElo) || AUTH_CONFIG.DEFAULT_ELO;
    const { finalElo, initialWins, initialLosses } = calculateInitialStats(incomingElo);
    newStats.elo = finalElo;
    newStats.wins = initialWins;
    newStats.losses = initialLosses;
    newStats.draws = 0;
    newUser.stats = newStats;

    await userRepository.save(newUser);

    console.log(`📝 Nuevo usuario registrado: ${normalizedNick} (Elo: ${finalElo}, auth: local)`);

    res.status(201).json({
      status: 'success',
      message: `¡Cuenta creada exitosamente! Tu Elo inicial es ${finalElo}.`,
      user: {
        nick: normalizedNick,
        elo: finalElo,
        authProvider: 'local'
      }
    });
  } catch (error) {
    console.error('❌ Error en el registro de usuario:', error);
    res.status(500).json({
      message: 'Error interno del servidor al registrar usuario.'
    });
  }
};

/**
 * 🔐 Iniciar sesión
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await userRepository.findOne({
      where: { email: email.trim().toLowerCase() },
      relations: ["stats"],
    });

    if (!user) {
      res.status(401).json({
        message: "Credenciales inválidas. Verifica tu email y contraseña.",
      });
      return;
    }

    // ✅ Verificar que el usuario tenga contraseña (no es social)
    if (user.authProvider !== "local") {
      res.status(401).json({
        message: `Esta cuenta usa autenticación con ${user.authProvider}. Por favor, inicia sesión con ese método.`,
      });
      return;
    }

    // ✅ Verificar contraseña (ahora puede ser null, pero en local siempre existe)
    if (!user.password) {
      res.status(401).json({
        message:
          "Esta cuenta no tiene contraseña configurada. Usa el método de autenticación social.",
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({
        message: "Credenciales inválidas. Verifica tu email y contraseña.",
      });
      return;
    }

    // ✅ Actualizar último login
    user.lastLogin = new Date();
    await userRepository.save(user);

    const jwtSecret = process.env.JWT_SECRET || "fallback_secret_key";
    const token = jwt.sign(
      {
        userId: user.id,
        nick: user.nick,
        email: user.email,
        elo: user.stats?.elo || AUTH_CONFIG.DEFAULT_ELO,
        isAdmin: user.isAdmin || false,
        authProvider: user.authProvider || "local",
      },
      jwtSecret,
      { expiresIn: AUTH_CONFIG.TOKEN_EXPIRY },
    );

    res.json({
      status: "success",
      token,
      user: sanitizeUser(user),
    });
    console.log(`🔐 Usuario logueado: ${user.nick} (${user.authProvider})`);
  } catch (error) {
    console.error("❌ Error en el login:", error);
    res.status(500).json({
      message: "Error interno del servidor al iniciar sesión.",
    });
  }
};

/**
 * 👤 Obtener perfil del usuario autenticado
 */
export const getProfile = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.userId || req.user?.userId;

    if (!userId) {
      res.status(401).json({ message: "Usuario no autenticado." });
      return;
    }
    const user = await userRepository.findOne({
      where: { id: userId },
      relations: ["stats"],
    });
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    res.json({
      status: "success",
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("❌ Error obteniendo perfil:", error);
    res.status(500).json({
      message: "Error interno del servidor.",
    });
  }
};

/* 👤 Actualizar perfil de usuario
 */
export const updateProfile = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.userId || req.user?.userId;
    const { nick, email, currentPassword, newPassword } = req.body;

    if (!userId) {
      res.status(401).json({ message: "Usuario no autenticado." });
      return;
    }

    // Buscar usuario con sus estadísticas
    const user = await userRepository.findOne({
      where: { id: userId },
      relations: ["stats"],
    });

    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    // ✅ Verificar si es usuario social (no tiene contraseña)
    const isSocialUser = user.authProvider !== "local";

    // --- 1. Cambio de contraseña (solo para usuarios locales) ---
    if (newPassword || currentPassword) {
      if (isSocialUser) {
        res.status(400).json({
          message: `Las cuentas con autenticación ${user.authProvider} no pueden cambiar la contraseña.`,
        });
        return;
      }

      // Si se quiere cambiar la contraseña, verificar la actual
      if (newPassword) {
        if (!currentPassword) {
          res.status(400).json({
            message:
              "La contraseña actual es requerida para cambiar la contraseña.",
          });
          return;
        }

        const isMatch = await bcrypt.compare(
          currentPassword,
          user.password as string,
        );
        if (!isMatch) {
          res.status(400).json({
            message: "La contraseña actual es incorrecta.",
          });
          return;
        }

        // Cifrar nueva contraseña
        const hashedPassword = await bcrypt.hash(
          newPassword,
          AUTH_CONFIG.SALT_ROUNDS,
        );
        user.password = hashedPassword;
      }
    }

    // --- 2. Cambio de email (solo para usuarios locales) ---
    if (email) {
      if (isSocialUser) {
        res.status(400).json({
          message:
            "Las cuentas con autenticación social no pueden cambiar su correo electrónico.",
        });
        return;
      }

      const existingUser = await userRepository.findOne({
        where: { email: email.trim().toLowerCase() },
      });

      if (existingUser && existingUser.id !== userId) {
        res.status(400).json({
          message: "El correo electrónico ya está registrado por otro usuario.",
        });
        return;
      }

      user.email = email.trim().toLowerCase();
    }

    // --- 3. Cambio de nick (todos los usuarios pueden) ---
    if (nick) {
      const existingUser = await userRepository.findOne({
        where: { nick: nick.trim() },
      });

      if (existingUser && existingUser.id !== userId) {
        res.status(400).json({
          message:
            "El nombre de usuario (Nick) ya está en uso por otro jugador.",
        });
        return;
      }

      user.nick = nick.trim();
    }

    // ✅ Actualizar último login
    user.lastLogin = new Date();

    // Guardar cambios
    await userRepository.save(user);

    // ✅ Generar nuevo token con datos actualizados
    const jwtSecret = process.env.JWT_SECRET || "fallback_secret_key";
    const token = jwt.sign(
      {
        userId: user.id,
        nick: user.nick,
        email: user.email,
        elo: user.stats?.elo || AUTH_CONFIG.DEFAULT_ELO,
        isAdmin: user.isAdmin || false,
        authProvider: user.authProvider || "local",
      },
      jwtSecret,
      { expiresIn: AUTH_CONFIG.TOKEN_EXPIRY },
    );

    res.json({
      status: "success",
      message: "Perfil actualizado correctamente.",
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("❌ Error al actualizar perfil:", error);
    res.status(500).json({
      message: "Error interno del servidor al actualizar el perfil.",
    });
  }
};

/**
 * 🔄 Actualizar Elo del usuario después de una partida
 */
export const updateElo = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.userId || req.user?.userId;
    const { newElo, result } = req.body;

    if (!userId) {
      res.status(401).json({ message: "Usuario no autenticado." });
      return;
    }

    const user = await userRepository.findOne({
      where: { id: userId },
      relations: ["stats"],
    });

    if (!user || !user.stats) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    // ✅ Actualizar Elo
    user.stats.elo = Math.max(100, newElo);

    // ✅ Actualizar estadísticas según resultado
    if (result === "win") user.stats.wins += 1;
    else if (result === "loss") user.stats.losses += 1;
    else if (result === "draw") user.stats.draws += 1;

    await userRepository.save(user);

    res.json({
      status: "success",
      message: "Estadísticas actualizadas correctamente.",
      elo: user.stats.elo,
    });
  } catch (error) {
    console.error("❌ Error actualizando Elo:", error);
    res.status(500).json({
      message: "Error interno del servidor.",
    });
  }
};

/**
 * 📊 Función auxiliar para calcular estadísticas iniciales
 */
function calculateInitialStats(incomingElo: number): {
  finalElo: number;
  initialWins: number;
  initialLosses: number;
} {
  if (incomingElo > AUTH_CONFIG.DEFAULT_ELO) {
    return {
      finalElo: incomingElo,
      initialWins: 1,
      initialLosses: 0,
    };
  }

  if (incomingElo < AUTH_CONFIG.DEFAULT_ELO) {
    return {
      finalElo: AUTH_CONFIG.DEFAULT_ELO,
      initialWins: 0,
      initialLosses: 0,
    };
  }

  return {
    finalElo: AUTH_CONFIG.DEFAULT_ELO,
    initialWins: 0,
    initialLosses: 0,
  };
}
