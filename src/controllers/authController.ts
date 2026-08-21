// src/controllers/authController.ts
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { AppDataSource } from "../config/dataSource";
import { User } from "../entities/User";
import { UserStats } from "../entities/UserStats";
import { validationResult } from "express-validator";
import { sanitizeUser } from "../utils/sanitizeUtil";
import { transporter } from "../config/nodeMailer";

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
        message: "Error de validación",
        errors: errors.array(),
      });
      return;
    }

    const { nick, email, password, initialElo } = req.body;

    const normalizedNick = nick.trim();
    const normalizedEmail = email.trim().toLowerCase();

    const [existingNick, existingEmail] = await Promise.all([
      userRepository.findOne({ where: { nick: normalizedNick } }),
      userRepository.findOne({ where: { email: normalizedEmail } }),
    ]);

    if (existingNick) {
      res.status(400).json({
        message:
          "El nombre de usuario (Nick) ya está en uso. Por favor, elige otro.",
      });
      return;
    }

    if (existingEmail) {
      res.status(400).json({
        message: "El correo electrónico ya está registrado. ¿Ya tienes cuenta?",
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, AUTH_CONFIG.SALT_ROUNDS);

    const newUser = new User();
    newUser.nick = normalizedNick;
    newUser.email = normalizedEmail;
    newUser.password = hashedPassword;
    newUser.authProvider = "local"; // ✅ IMPORTANTE
    newUser.lastLogin = new Date();

    // Crear estadísticas
    const newStats = new UserStats();
    const incomingElo = Number(initialElo) || AUTH_CONFIG.DEFAULT_ELO;
    const { finalElo, initialWins, initialLosses } =
      calculateInitialStats(incomingElo);
    newStats.elo = finalElo;
    newStats.wins = initialWins;
    newStats.losses = initialLosses;
    newStats.draws = 0;
    newUser.stats = newStats;

    await userRepository.save(newUser);

    console.log(
      `📝 Nuevo usuario registrado: ${normalizedNick} (Elo: ${finalElo}, auth: local)`,
    );

    res.status(201).json({
      status: "success",
      message: `¡Cuenta creada exitosamente! Tu Elo inicial es ${finalElo}.`,
      user: {
        nick: normalizedNick,
        elo: finalElo,
        authProvider: "local",
      },
    });
  } catch (error) {
    console.error("❌ Error en el registro de usuario:", error);
    res.status(500).json({
      message: "Error interno del servidor al registrar usuario.",
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
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.userId || req.userId;

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

/* 👤 Actualizar perfil de usuario autenticado
 * Maneja cambio de Nick, Email y Contraseña (solo para usuarios locales)
 */
export const updateProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.userId;
    const { nick, email, currentPassword, newPassword } = req.body;

    if (!userId) {
      res.status(401).json({ message: "Usuario no autenticado." });
      return;
    }

    // 1. Buscar usuario con sus estadísticas
    const user = await userRepository.findOne({
      where: { id: userId },
      relations: ["stats"],
    });

    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    const isSocialUser = user.authProvider !== "local";
    const oldNick = user.nick;

    // --- 2. Cambio de contraseña (solo para usuarios locales) ---
    if (newPassword || currentPassword) {
      if (isSocialUser) {
        res.status(400).json({
          message: `Las cuentas asociadas a ${user.authProvider} no pueden modificar la contraseña desde la plataforma.`,
        });
        return;
      }

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

        user.password = await bcrypt.hash(newPassword, AUTH_CONFIG.SALT_ROUNDS);
      }
    }

    // --- 3. Cambio de Email (solo para usuarios locales) ---
    if (email && email.trim().toLowerCase() !== user.email) {
      if (isSocialUser) {
        res.status(400).json({
          message:
            "Las cuentas con autenticación social no pueden cambiar su correo electrónico.",
        });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const existingEmail = await userRepository.findOne({
        where: { email: cleanEmail },
      });

      if (existingEmail && existingEmail.id !== userId) {
        res.status(400).json({
          message: "El correo electrónico ya está registrado por otro usuario.",
        });
        return;
      }

      user.email = cleanEmail;
    }

    // --- 4. Cambio de Nick (disponible para todos) ---
    if (nick && nick.trim() !== user.nick) {
      const cleanNick = nick.trim();
      const existingNick = await userRepository.findOne({
        where: { nick: cleanNick },
      });

      if (existingNick && existingNick.id !== userId) {
        res.status(400).json({
          message:
            "El nombre de usuario (Nick) ya está en uso por otro jugador.",
        });
        return;
      }

      user.nick = cleanNick;
    }

    // Actualizar fecha de interacción
    user.lastLogin = new Date();

    // --- 5. Guardar cambios del usuario ---
    await userRepository.save(user);

    // --- 6. Si cambió el nick, actualizar historial de partidas (GameHistory) ---
    if (nick && oldNick !== user.nick) {
      const historyRepository = AppDataSource.getRepository("GameHistory");

      await historyRepository
        .createQueryBuilder()
        .update("GameHistory")
        .set({ whiteNick: user.nick })
        .where("whiteNick = :oldNick", { oldNick })
        .execute();

      await historyRepository
        .createQueryBuilder()
        .update("GameHistory")
        .set({ blackNick: user.nick })
        .where("blackNick = :oldNick", { oldNick })
        .execute();
    }

    // --- 7. Generar nuevo JWT actualizado ---
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
      user: sanitizeUser(user), // Asumiendo que tienes esta función helper
    });
  } catch (error) {
    console.error("❌ Error al actualizar el perfil:", error);
    res.status(500).json({
      message: "Error interno del servidor al actualizar el perfil.",
    });
  }
};
/* 🔑 1. Solicitar restablecimiento de contraseña
 * Genera token temporal y envía el correo con el enlace
 */
export const forgotPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ message: "El correo electrónico es requerido." });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await userRepository.findOne({ where: { email: cleanEmail } });

    // Por seguridad (OWASP), no revelamos si el correo existe o no en la BD
    if (!user) {
      res.json({
        status: "success",
        message:
          "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
      });
      return;
    }

    // Validar que no sea un usuario de OAuth (Google, GitHub, Lichess)
    if (user.authProvider !== "local") {
      res.status(400).json({
        message: `Esta cuenta se registró mediante ${user.authProvider}. Inicia sesión con dicho proveedor.`,
      });
      return;
    }

    // Generar token único (32 bytes aleatorios)
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Guardar el hash del token y su tiempo de expiración (15 minutos)
    const tokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // +15 mins

    await userRepository.save(user);

    // Enlace que irá al frontend
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}&id=${user.id}`;

    // Enviar correo electrónico
    await transporter.sendMail({
      from: `"Ajedrez App" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Recuperación de Contraseña - Ajedrez App",
      html: `
        <h2>Restablecimiento de Contraseña</h2>
        <p>Hola <strong>${user.nick}</strong>,</p>
        <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace para continuar:</p>
        <a href="${resetUrl}" target="_blank" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Restablecer Contraseña</a>
        <p>Este enlace es válido solo por <strong>15 minutos</strong>.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
      `,
    });

    res.json({
      status: "success",
      message:
        "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
    });
  } catch (error) {
    console.error("❌ Error en forgotPassword:", error);
    res.status(500).json({
      message: "Error interno al procesar la solicitud de recuperación.",
    });
  }
};

/* 🔒 2. Validar token y cambiar contraseña
 * Procesa la nueva contraseña desde el formulario del frontend
 */
export const resetPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { userId, token, newPassword } = req.body;

    if (!userId || !token || !newPassword) {
      res.status(400).json({ message: "Todos los campos son requeridos." });
      return;
    }

    // Hashear el token entrante para compararlo con el almacenado en BD
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await userRepository.findOne({
      where: { id: userId, resetPasswordToken: tokenHash },
    });

    if (!user) {
      res.status(400).json({
        message: "El token de recuperación es inválido o no existe.",
      });
      return;
    }

    // Verificar si el token ya expiró
    if (
      !user.resetPasswordExpires ||
      user.resetPasswordExpires.getTime() < Date.now()
    ) {
      res.status(400).json({
        message: "El token de recuperación ha expirado. Solicita uno nuevo.",
      });
      return;
    }

    // Hashear la nueva contraseña y limpiar tokens
    user.password = await bcrypt.hash(newPassword, AUTH_CONFIG.SALT_ROUNDS);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await userRepository.save(user);

    res.json({
      status: "success",
      message:
        "Contraseña actualizada exitosamente. Ya puedes iniciar sesión.",
    });
  } catch (error) {
    console.error("❌ Error en resetPassword:", error);
    res.status(500).json({
      message: "Error interno al restablecer la contraseña.",
    });
  }
};

/**
 * 🔄 Actualizar Elo del usuario después de una partida
 */
export const updateElo = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId || req.userId;
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

