"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/authRoutes.ts
const express_1 = require("express");
const passport_1 = __importDefault(require("passport"));
const authController_1 = require("../controllers/authController");
const express_validator_1 = require("express-validator");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const validationMiddleware_1 = require("../middlewares/validationMiddleware");
const router = (0, express_1.Router)();
// ✅ Validaciones (sin cambios)
const registerValidation = [
    (0, express_validator_1.body)('nick').trim().isLength({ min: 3, max: 15 }).withMessage('Nick debe tener 3-15 caracteres'),
    (0, express_validator_1.body)('email').isEmail().withMessage('Email inválido'),
    (0, express_validator_1.body)('password').isLength({ min: 6 }).withMessage('Contraseña debe tener al menos 6 caracteres')
];
const loginValidation = [
    (0, express_validator_1.body)('email').isEmail().withMessage('Email inválido'),
    (0, express_validator_1.body)('password').notEmpty().withMessage('Contraseña requerida')
];
// ✅ Rutas tradicionales (sin cambios)
router.post('/register', registerValidation, authController_1.register);
router.post('/login', loginValidation, authController_1.login);
router.get('/me', authMiddleware_1.authenticateJWT, authController_1.getProfile);
router.put('/elo', authMiddleware_1.authenticateJWT, authController_1.updateElo);
router.put('/profile', authMiddleware_1.authenticateJWT, validationMiddleware_1.validateUpdateProfile, authController_1.updateProfile);
// ✅ NUEVAS RUTAS DE AUTENTICACIÓN SOCIAL
// --- Google ---
router.get('/auth/google', passport_1.default.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', passport_1.default.authenticate('google', {
    failureRedirect: '/login?error=google_failed',
    successRedirect: '/'
}));
// --- Facebook ---
router.get('/auth/facebook', passport_1.default.authenticate('facebook', { scope: ['email'] }));
router.get('/auth/facebook/callback', passport_1.default.authenticate('facebook', {
    failureRedirect: '/login?error=facebook_failed',
    successRedirect: '/'
}));
// --- Microsoft ---
router.get('/auth/microsoft', passport_1.default.authenticate('microsoft', {
    scope: ['openid', 'profile', 'email', 'offline_access']
}));
router.get('/auth/microsoft/callback', passport_1.default.authenticate('microsoft', {
    failureRedirect: '/login?error=microsoft_failed',
    successRedirect: '/'
}));
// --- Cerrar sesión (social) ---
router.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Error al cerrar sesión:', err);
            return res.status(500).json({ error: 'Error al cerrar sesión' });
        }
        res.redirect('/');
    });
});
// --- Endpoint para verificar autenticación social ---
router.get('/auth/session', (req, res) => {
    if (req.isAuthenticated()) {
        const user = req.user;
        res.json({
            authenticated: true,
            user: {
                id: user.id,
                nick: user.nick,
                email: user.email,
                elo: user.elo
            }
        });
    }
    else {
        res.json({ authenticated: false });
    }
});
exports.default = router;
