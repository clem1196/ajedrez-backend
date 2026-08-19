"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/authRoutes.ts
const express_1 = require("express");
const passport_1 = __importDefault(require("passport"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authController_1 = require("../controllers/authController");
const express_validator_1 = require("express-validator");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const validationMiddleware_1 = require("../middlewares/validationMiddleware");
const router = (0, express_1.Router)();
// Base URL del frontend priorizando FRONTEND_URL y luego CORS_ORIGIN
const FRONTEND_URL = process.env.FRONTEND_URL ||
    "https://ajedrez-frontend.vercel.app";
// ✅ Validaciones
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
// ✅ Rutas tradicionales
router.post("/register", registerValidation, authController_1.register);
router.post("/login", loginValidation, authController_1.login);
router.get("/me", authMiddleware_1.authenticateJWT, authController_1.getProfile);
router.put("/elo", authMiddleware_1.authenticateJWT, authController_1.updateElo);
router.put("/profile", authMiddleware_1.authenticateJWT, validationMiddleware_1.validateUpdateProfile, authController_1.updateProfile);
// ✅ RUTAS DE AUTENTICACIÓN SOCIAL
// Configuración de callbacks para emitir JWT al frontend
const handleOAuthCallback = (req, res) => {
    // Extraemos el usuario que adjuntó Passport tras autenticar
    const user = req.user;
    // Generamos el JWT con el formato EXACTO que espera authMiddleware.ts
    const token = jsonwebtoken_1.default.sign({
        userId: user.id, // 👈 Requerido por req.userId
        nick: user.nick || user.displayName, // 👈 Requerido por req.userNick
        email: user.email, // 👈 Requerido por req.userEmail
        elo: user.elo || 1200, // 👈 Opcional / Por defecto
        isAdmin: user.isAdmin || false, // 👈 Opcional
        authProvider: user.authProvider || "google"
    }, process.env.JWT_SECRET || "fallback_secret_key", { expiresIn: "7d" });
    const frontendUrl = process.env.FRONTEND_URL ||
        process.env.CORS_ORIGIN ||
        "https://ajedrez-frontend.vercel.app";
    // Redirigir al frontend pasando el token completo
    res.redirect(`${frontendUrl}/auth/success?token=${token}`);
};
// --- Google ---
router.get("/google", passport_1.default.authenticate("google", { scope: ["profile", "email"] }));
router.get("/google/callback", passport_1.default.authenticate("google", {
    failureRedirect: `${FRONTEND_URL}/login?error=google_failed`,
    session: false,
}), (req, res) => handleOAuthCallback(req, res));
/*// --- Facebook ---
router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: ["public_profile", "email"]})
);

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", {
    failureRedirect: `${FRONTEND_URL}/login?error=facebook_failed`,
    session: false,
  }),
  (req, res) => handleOAuthCallback(req, res)
);

// --- Microsoft ---
router.get(
  "/microsoft",
  passport.authenticate("microsoft", {
    scope: ["openid", "profile", "email", "offline_access"],
  })
);

router.get(
  "/microsoft/callback",
  passport.authenticate("microsoft", {
    failureRedirect: `${FRONTEND_URL}/login?error=microsoft_failed`,
    session: false,
  }),
  (req, res) => handleOAuthCallback(req, res)
);
// Endpoint exigido por Meta para procesar la eliminación de datos de usuario
router.post("/facebook/data-deletion", (req, res) => {
  res.json({
    url: "https://ajedrez-frontend.vercel.app/data-deletion-status",
    confirmation_code: "code_" + Date.now()
  });
});
*/
// --- Endpoint para verificar autenticación social (opcional si usas JWT puro) ---
// --- Github ---
router.get("/github", passport_1.default.authenticate("github", { scope: ["user:email"] }));
router.get("/github/callback", passport_1.default.authenticate("github", { failureRedirect: "/login", session: false }), handleOAuthCallback);
// --- Lichess ---
router.get("/lichess", passport_1.default.authenticate("lichess"));
router.get("/lichess/callback", passport_1.default.authenticate("lichess", { failureRedirect: "/login", session: false }), handleOAuthCallback);
// --- Local ---
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
exports.default = router;
