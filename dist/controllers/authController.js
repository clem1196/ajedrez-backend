"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateElo = exports.updateProfile = exports.getProfile = exports.login = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dataSource_1 = require("../config/dataSource");
const User_1 = require("../entities/User");
const UserStats_1 = require("../entities/UserStats");
const express_validator_1 = require("express-validator");
const sanitizeUtil_1 = require("../utils/sanitizeUtil");
const userRepository = dataSource_1.AppDataSource.getRepository(User_1.User);
// ✅ Constantes de configuración
const AUTH_CONFIG = {
    SALT_ROUNDS: 10,
    TOKEN_EXPIRY: "7d",
    DEFAULT_ELO: 1200,
    ELO_CHANGE_WIN: 16, // Cambio estándar por victoria/derrota
    MIN_ELO: 100,
};
/**
 * 📝 Registrar un nuevo usuario
 */
const register = async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
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
        const hashedPassword = await bcrypt_1.default.hash(password, AUTH_CONFIG.SALT_ROUNDS);
        const newUser = new User_1.User();
        newUser.nick = normalizedNick;
        newUser.email = normalizedEmail;
        newUser.password = hashedPassword;
        newUser.authProvider = 'local'; // ✅ IMPORTANTE
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
            status: 'success',
            message: `¡Cuenta creada exitosamente! Tu Elo inicial es ${finalElo}.`,
            user: {
                nick: normalizedNick,
                elo: finalElo,
                authProvider: 'local'
            }
        });
    }
    catch (error) {
        console.error('❌ Error en el registro de usuario:', error);
        res.status(500).json({
            message: 'Error interno del servidor al registrar usuario.'
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
        // ✅ Actualizar último login
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
/* 👤 Actualizar perfil de usuario autenticado
 * Maneja cambio de Nick, Email y Contraseña (solo para usuarios locales)
 */
const updateProfile = async (req, res) => {
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
        // --- 3. Cambio de Email (solo para usuarios locales) ---
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
        // --- 4. Cambio de Nick (disponible para todos) ---
        if (nick && nick.trim() !== user.nick) {
            const cleanNick = nick.trim();
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
        // Actualizar fecha de interacción
        user.lastLogin = new Date();
        // --- 5. Guardar cambios del usuario ---
        await userRepository.save(user);
        // --- 6. Si cambió el nick, actualizar historial de partidas (GameHistory) ---
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
        // --- 7. Generar nuevo JWT actualizado ---
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
            user: (0, sanitizeUtil_1.sanitizeUser)(user), // Asumiendo que tienes esta función helper
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
/**
 * 🔄 Actualizar Elo del usuario después de una partida
 */
const updateElo = async (req, res) => {
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
