"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/authRoutes.ts
const express_1 = require("express");
const passport_1 = __importDefault(require("passport"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dataSource_1 = require("../config/dataSource");
const User_1 = require("../entities/User");
const authController_1 = require("../controllers/authController");
const express_validator_1 = require("express-validator");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const validationMiddleware_1 = require("../middlewares/validationMiddleware");
const jwt_1 = require("../config/jwt");
const router = (0, express_1.Router)();
const userRepository = dataSource_1.AppDataSource.getRepository(User_1.User);
// Base URL del frontend
const FRONTEND_URL = process.env.FRONTEND_URL ||
    process.env.CORS_ORIGIN ||
    "https://ajedrez-frontend.vercel.app";
// Validaciones
const registerValidation = [
    (0, express_validator_1.body)("nick")
        .trim()
        .isLength({ min: 3, max: 15 })
        .withMessage("Nick debe tener 3-15 caracteres"),
    (0, express_validator_1.body)("email").isEmail().withMessage("Email inválido"),
    (0, express_validator_1.body)("password")
        .isLength({ min: 6 })
        .withMessage("Contraseña debe tener al menos 6 caracteres"),
];
const loginValidation = [
    (0, express_validator_1.body)("email").isEmail().withMessage("Email inválido"),
    (0, express_validator_1.body)("password").notEmpty().withMessage("Contraseña requerida"),
];
// Rutas tradicionales
router.post("/register", registerValidation, authController_1.register);
router.post("/login", loginValidation, authController_1.login);
router.get("/me", authMiddleware_1.authenticateJWT, authController_1.getProfile);
router.put("/elo", authMiddleware_1.authenticateJWT, authController_1.updateElo);
router.put("/profile", authMiddleware_1.authenticateJWT, validationMiddleware_1.validateUpdateProfile, authController_1.updateProfile);
// ==========================================
// 🔗 RUTA INICIAL DE VINCULACIÓN (Account Linking)
// ==========================================
router.get("/link/:provider", (req, res, next) => {
    const { provider } = req.params;
    const token = req.query.token;
    if (!token) {
        return res.redirect(`${FRONTEND_URL}/profile?error=unauthorized`);
    }
    // 1. Guardar el token en una cookie temporal de 10 minutos
    res.cookie("linkToken", token, {
        httpOnly: true,
        secure: true, // Requerido en producción (HTTPS/Render)
        sameSite: "none", // Necesario para redirecciones cross-domain/OAuth
        maxAge: 10 * 60 * 1000, // 10 minutos
    });
    // 2. Ejecutar la autenticación con el proveedor
    if (provider === "google") {
        return passport_1.default.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
    }
    else if (provider === "github") {
        return passport_1.default.authenticate("github", { scope: ["user:email"] })(req, res, next);
    }
    else if (provider === "lichess") {
        return passport_1.default.authenticate("lichess")(req, res, next);
    }
    else {
        return res.redirect(`${FRONTEND_URL}/profile?error=invalid_provider`);
    }
});
// ==========================================
// 🔐 MANEJADOR UNIFICADO DE CALLBACKS (OAuth)
// ==========================================
const handleOAuthCallback = async (req, res) => {
    res.clearCookie("linkToken", {
        httpOnly: true,
        secure: true,
        sameSite: "none",
    });
    const oAuthUser = req.user; // Usuario retornado por la estrategia de Passport
    let linkToken = null;
    if (req.query.state) {
        try {
            const decodedState = JSON.parse(decodeURIComponent(req.query.state));
            linkToken = decodedState.linkToken || null;
        }
        catch (e) {
            console.warn("No se pudo decodificar el estado de OAuth:", e);
        }
    }
    // --- CASO A: VINCULACIÓN DE CUENTA DESDE EL PERFIL ---
    if (linkToken) {
        try {
            const payload = jsonwebtoken_1.default.verify(linkToken, jwt_1.JWT_SECRET);
            const currentUserId = payload.userId || payload.id;
            // 1. Buscar al usuario logueado en la app (el principal)
            const currentUser = await userRepository.findOneBy({ id: currentUserId });
            if (currentUser && oAuthUser) {
                // Identificar qué ID social estamos intentando vincular
                const providerField = oAuthUser.googleId
                    ? "googleId"
                    : oAuthUser.githubId
                        ? "githubId"
                        : oAuthUser.lichessId
                            ? "lichessId"
                            : null;
                const socialId = oAuthUser.googleId || oAuthUser.githubId || oAuthUser.lichessId;
                if (providerField && socialId) {
                    // 🔍 VERIFICACIÓN: Comprobar si otra cuenta (distinta a la actual) ya tiene este ID social
                    const existingSocialUser = await userRepository.findOne({
                        where: { [providerField]: socialId },
                    });
                    if (existingSocialUser && existingSocialUser.id !== currentUser.id) {
                        // Si el ID social estaba asignado a un usuario secundario/duplicado, lo desvinculamos o eliminamos
                        existingSocialUser[providerField] = null;
                        await userRepository.save(existingSocialUser);
                        // Si ese usuario fue creado solo para esta red social (sin password ni otros ids), podemos borrarlo
                        if (!existingSocialUser.password &&
                            !existingSocialUser.googleId &&
                            !existingSocialUser.githubId &&
                            !existingSocialUser.lichessId) {
                            await userRepository.delete(existingSocialUser.id);
                        }
                    }
                    // Asignamos el ID social a la cuenta del usuario actual
                    currentUser[providerField] = socialId;
                    await userRepository.save(currentUser);
                }
                // Limpiamos el usuario temporal si Passport generó uno nuevo distinto al actual
                if (oAuthUser.id && oAuthUser.id !== currentUser.id) {
                    try {
                        await userRepository.delete(oAuthUser.id);
                    }
                    catch (delError) {
                        console.warn("No se pudo eliminar el usuario temporal:", delError);
                    }
                }
                return res.redirect(`${FRONTEND_URL}/profile?linked=${oAuthUser.authProvider || "social"}`);
            }
        }
        catch (error) {
            console.error("Error validando token en vinculación:", error);
            return res.redirect(`${FRONTEND_URL}/profile?error=link_failed`);
        }
    }
    // --- CASO B: LOGIN / REGISTRO NORMAL VÍA RED SOCIAL ---
    const token = jsonwebtoken_1.default.sign({
        userId: oAuthUser.id,
        nick: oAuthUser.nick || oAuthUser.displayName,
        email: oAuthUser.email,
        elo: oAuthUser.elo || 1200,
        isAdmin: oAuthUser.isAdmin || false,
        authProvider: oAuthUser.authProvider || "google",
    }, process.env.JWT_SECRET || "fallback_secret_key", { expiresIn: "7d" });
    return res.redirect(`${FRONTEND_URL}/auth/success?token=${token}`);
};
// ==========================================
// 🌐 RUTAS CALLBACKS OAUTH
// ==========================================
router.get("/google", passport_1.default.authenticate("google", { scope: ["profile", "email"] }));
router.get("/google/callback", passport_1.default.authenticate("google", {
    failureRedirect: `${FRONTEND_URL}/login?error=google_failed`,
    session: false,
}), handleOAuthCallback);
router.get("/github", passport_1.default.authenticate("github", { scope: ["user:email"] }));
router.get("/github/callback", passport_1.default.authenticate("github", {
    failureRedirect: `${FRONTEND_URL}/login?error=github_failed`,
    session: false,
}), handleOAuthCallback);
router.get("/lichess", passport_1.default.authenticate("lichess"));
router.get("/lichess/callback", passport_1.default.authenticate("lichess", {
    failureRedirect: `${FRONTEND_URL}/login?error=lichess_failed`,
    session: false,
}), handleOAuthCallback);
router.get("/session", (req, res) => {
    if (req.isAuthenticated()) {
        const user = req.user;
        res.json({
            authenticated: true,
            user: {
                id: user.id,
                nick: user.nick,
                email: user.email,
                elo: user.elo,
            },
        });
    }
    else {
        res.json({ authenticated: false });
    }
});
// Rutas públicas (no requieren middleware de JWT)
router.post("/forgot-password", authController_1.forgotPassword);
router.post("/reset-password", authController_1.resetPassword);
exports.default = router;
