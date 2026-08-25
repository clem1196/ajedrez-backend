"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateElo = exports.resetPassword = exports.forgotPassword = exports.updateProfile = exports.getProfile = exports.login = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const dataSource_1 = require("../config/dataSource");
const User_1 = require("../entities/User");
const UserStats_1 = require("../entities/UserStats");
const express_validator_1 = require("express-validator");
const sanitizeUtil_1 = require("../utils/sanitizeUtil");
const nodeMailer_1 = require("../config/nodeMailer");
const botConfig_1 = require("../config/botConfig");
const userRepository = dataSource_1.AppDataSource.getRepository(User_1.User);
// ✅ Constantes de configuración
const AUTH_CONFIG = {
    SALT_ROUNDS: 10,
    TOKEN_EXPIRY: "7d",
    DEFAULT_ELO: 1200,
    ELO_CHANGE_WIN: 16,
    MIN_ELO: 1200, // ✅ Cambiado de 100 a 1200
    MIN_NICK_LENGTH: 3,
    MAX_NICK_LENGTH: 15,
    NICK_REGEX: /^[A-Za-z0-9_]+$/, // Solo letras, números y guión bajo
};
/**
 * 📝 Registrar un nuevo usuario
 */
const register = async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
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
        // ✅ Validación de longitud y caracteres del nick
        if (normalizedNick.length < AUTH_CONFIG.MIN_NICK_LENGTH ||
            normalizedNick.length > AUTH_CONFIG.MAX_NICK_LENGTH) {
            res.status(400).json({
                message: `El nick debe tener entre ${AUTH_CONFIG.MIN_NICK_LENGTH} y ${AUTH_CONFIG.MAX_NICK_LENGTH} caracteres.`,
            });
            return;
        }
        if (!AUTH_CONFIG.NICK_REGEX.test(normalizedNick)) {
            res.status(400).json({
                message: "El nick solo puede contener letras, números y guión bajo (_).",
            });
            return;
        }
        // ✅ Validación de nombre reservado para bots
        if (botConfig_1.BOT_NAMES_LOWERCASE.includes(normalizedNick.toLowerCase())) {
            res.status(400).json({
                message: `El nombre "${normalizedNick}" está reservado para bots. Por favor, elige otro.`,
            });
            return;
        }
        // Verificar si el nick o email ya existen
        const [existingNick, existingEmail] = await Promise.all([
            userRepository.findOne({ where: { nick: normalizedNick } }),
            userRepository.findOne({ where: { email: normalizedEmail } }),
        ]);
        if (existingNick) {
            res.status(400).json({
                message: "El nombre de usuario (Nick) ya está en uso. Por favor, elige otro.",
            });
            return;
        }
        if (existingEmail) {
            res.status(400).json({
                message: "El correo electrónico ya está registrado. ¿Ya tienes cuenta?",
            });
            return;
        }
        const hashedPassword = await bcrypt_1.default.hash(password, AUTH_CONFIG.SALT_ROUNDS);
        const newUser = new User_1.User();
        newUser.nick = normalizedNick;
        newUser.email = normalizedEmail;
        newUser.password = hashedPassword;
        newUser.authProvider = "local";
        newUser.lastLogin = new Date();
        // Crear estadísticas
        const newStats = new UserStats_1.UserStats();
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
            status: "success",
            message: `¡Cuenta creada exitosamente! Tu Elo inicial es ${finalElo}.`,
            user: {
                nick: normalizedNick,
                elo: finalElo,
                authProvider: "local",
            },
        });
    }
    catch (error) {
        console.error("❌ Error en el registro de usuario:", error);
        res.status(500).json({
            message: "Error interno del servidor al registrar usuario.",
        });
    }
};
exports.register = register;
/**
 * 🔐 Iniciar sesión
 */
const login = async (req, res) => {
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
        if (user.authProvider !== "local") {
            res.status(401).json({
                message: `Esta cuenta usa autenticación con ${user.authProvider}. Por favor, inicia sesión con ese método.`,
            });
            return;
        }
        if (!user.password) {
            res.status(401).json({
                message: "Esta cuenta no tiene contraseña configurada. Usa el método de autenticación social.",
            });
            return;
        }
        const isMatch = await bcrypt_1.default.compare(password, user.password);
        if (!isMatch) {
            res.status(401).json({
                message: "Credenciales inválidas. Verifica tu email y contraseña.",
            });
            return;
        }
        user.lastLogin = new Date();
        await userRepository.save(user);
        const jwtSecret = process.env.JWT_SECRET || "fallback_secret_key";
        const token = jsonwebtoken_1.default.sign({
            userId: user.id,
            nick: user.nick,
            email: user.email,
            elo: user.stats?.elo || AUTH_CONFIG.DEFAULT_ELO,
            isAdmin: user.isAdmin || false,
            authProvider: user.authProvider || "local",
        }, jwtSecret, { expiresIn: AUTH_CONFIG.TOKEN_EXPIRY });
        res.json({
            status: "success",
            token,
            user: (0, sanitizeUtil_1.sanitizeUser)(user),
        });
        console.log(`🔐 Usuario logueado: ${user.nick} (${user.authProvider})`);
    }
    catch (error) {
        console.error("❌ Error en el login:", error);
        res.status(500).json({
            message: "Error interno del servidor al iniciar sesión.",
        });
    }
};
exports.login = login;
/**
 * 👤 Obtener perfil del usuario autenticado
 */
const getProfile = async (req, res) => {
    try {
        const userId = req.userId;
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
            user: (0, sanitizeUtil_1.sanitizeUser)(user),
        });
    }
    catch (error) {
        console.error("❌ Error obteniendo perfil:", error);
        res.status(500).json({
            message: "Error interno del servidor.",
        });
    }
};
exports.getProfile = getProfile;
/* 👤 Actualizar perfil de usuario autenticado */
const updateProfile = async (req, res) => {
    try {
        const userId = req.userId;
        const { nick, email, currentPassword, newPassword } = req.body;
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
        const isSocialUser = user.authProvider !== "local";
        const oldNick = user.nick;
        // Cambio de contraseña (solo para usuarios locales)
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
                        message: "La contraseña actual es requerida para cambiar la contraseña.",
                    });
                    return;
                }
                const isMatch = await bcrypt_1.default.compare(currentPassword, user.password);
                if (!isMatch) {
                    res.status(400).json({
                        message: "La contraseña actual es incorrecta.",
                    });
                    return;
                }
                user.password = await bcrypt_1.default.hash(newPassword, AUTH_CONFIG.SALT_ROUNDS);
            }
        }
        // Cambio de Email (solo para usuarios locales)
        if (email && email.trim().toLowerCase() !== user.email) {
            if (isSocialUser) {
                res.status(400).json({
                    message: "Las cuentas con autenticación social no pueden cambiar su correo electrónico.",
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
        // Cambio de Nick (disponible para todos)
        if (nick && nick.trim() !== user.nick) {
            const cleanNick = nick.trim();
            // ✅ Validar longitud y caracteres
            if (cleanNick.length < AUTH_CONFIG.MIN_NICK_LENGTH ||
                cleanNick.length > AUTH_CONFIG.MAX_NICK_LENGTH) {
                res.status(400).json({
                    message: `El nick debe tener entre ${AUTH_CONFIG.MIN_NICK_LENGTH} y ${AUTH_CONFIG.MAX_NICK_LENGTH} caracteres.`,
                });
                return;
            }
            if (!AUTH_CONFIG.NICK_REGEX.test(cleanNick)) {
                res.status(400).json({
                    message: "El nick solo puede contener letras, números y guión bajo (_).",
                });
                return;
            }
            // ✅ Validar nombre reservado para bots
            if (botConfig_1.BOT_NAMES_LOWERCASE.includes(cleanNick.toLowerCase())) {
                res.status(400).json({
                    message: `El nombre "${cleanNick}" está reservado para bots. Por favor, elige otro.`,
                });
                return;
            }
            const existingNick = await userRepository.findOne({
                where: { nick: cleanNick },
            });
            if (existingNick && existingNick.id !== userId) {
                res.status(400).json({
                    message: "El nombre de usuario (Nick) ya está en uso por otro jugador.",
                });
                return;
            }
            user.nick = cleanNick;
        }
        user.lastLogin = new Date();
        await userRepository.save(user);
        // Si cambió el nick, actualizar historial de partidas
        if (nick && oldNick !== user.nick) {
            const historyRepository = dataSource_1.AppDataSource.getRepository("GameHistory");
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
        const jwtSecret = process.env.JWT_SECRET || "fallback_secret_key";
        const token = jsonwebtoken_1.default.sign({
            userId: user.id,
            nick: user.nick,
            email: user.email,
            elo: user.stats?.elo || AUTH_CONFIG.DEFAULT_ELO,
            isAdmin: user.isAdmin || false,
            authProvider: user.authProvider || "local",
        }, jwtSecret, { expiresIn: AUTH_CONFIG.TOKEN_EXPIRY });
        res.json({
            status: "success",
            message: "Perfil actualizado correctamente.",
            token,
            user: (0, sanitizeUtil_1.sanitizeUser)(user),
        });
    }
    catch (error) {
        console.error("❌ Error al actualizar el perfil:", error);
        res.status(500).json({
            message: "Error interno del servidor al actualizar el perfil.",
        });
    }
};
exports.updateProfile = updateProfile;
/* 🔑 1. Solicitar restablecimiento de contraseña */
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            res.status(400).json({ message: "El correo electrónico es requerido." });
            return;
        }
        const cleanEmail = email.trim().toLowerCase();
        const user = await userRepository.findOne({ where: { email: cleanEmail } });
        if (!user) {
            res.json({
                status: "success",
                message: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
            });
            return;
        }
        if (user.authProvider !== "local") {
            res.status(400).json({
                message: `Esta cuenta se registró mediante ${user.authProvider}. Inicia sesión con dicho proveedor.`,
            });
            return;
        }
        const resetToken = crypto_1.default.randomBytes(32).toString("hex");
        const tokenHash = crypto_1.default
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");
        user.resetPasswordToken = tokenHash;
        user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
        await userRepository.save(user);
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}&id=${user.id}`;
        await nodeMailer_1.transporter.sendMail({
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
            message: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
        });
    }
    catch (error) {
        console.error("❌ Error en forgotPassword:", error);
        res.status(500).json({
            message: "Error interno al procesar la solicitud de recuperación.",
        });
    }
};
exports.forgotPassword = forgotPassword;
/* 🔒 2. Validar token y cambiar contraseña */
const resetPassword = async (req, res) => {
    try {
        const { userId, token, newPassword } = req.body;
        if (!userId || !token || !newPassword) {
            res.status(400).json({ message: "Todos los campos son requeridos." });
            return;
        }
        const tokenHash = crypto_1.default
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
        if (!user.resetPasswordExpires ||
            user.resetPasswordExpires.getTime() < Date.now()) {
            res.status(400).json({
                message: "El token de recuperación ha expirado. Solicita uno nuevo.",
            });
            return;
        }
        user.password = await bcrypt_1.default.hash(newPassword, AUTH_CONFIG.SALT_ROUNDS);
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await userRepository.save(user);
        res.json({
            status: "success",
            message: "Contraseña actualizada exitosamente. Ya puedes iniciar sesión.",
        });
    }
    catch (error) {
        console.error("❌ Error en resetPassword:", error);
        res.status(500).json({
            message: "Error interno al restablecer la contraseña.",
        });
    }
};
exports.resetPassword = resetPassword;
/**
 * 🔄 Actualizar Elo del usuario después de una partida
 */
const updateElo = async (req, res) => {
    try {
        const userId = req.userId;
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
        // ✅ Aplicar piso de 1200
        user.stats.elo = Math.max(AUTH_CONFIG.MIN_ELO, newElo);
        if (result === "win")
            user.stats.wins += 1;
        else if (result === "loss")
            user.stats.losses += 1;
        else if (result === "draw")
            user.stats.draws += 1;
        await userRepository.save(user);
        res.json({
            status: "success",
            message: "Estadísticas actualizadas correctamente.",
            elo: user.stats.elo,
        });
    }
    catch (error) {
        console.error("❌ Error actualizando Elo:", error);
        res.status(500).json({
            message: "Error interno del servidor.",
        });
    }
};
exports.updateElo = updateElo;
/**
 * 📊 Función auxiliar para calcular estadísticas iniciales
 */
function calculateInitialStats(incomingElo) {
    const clampedElo = Math.max(AUTH_CONFIG.MIN_ELO, incomingElo);
    if (clampedElo > AUTH_CONFIG.DEFAULT_ELO) {
        return {
            finalElo: clampedElo,
            initialWins: 1,
            initialLosses: 0,
        };
    }
    if (clampedElo < AUTH_CONFIG.DEFAULT_ELO) {
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
