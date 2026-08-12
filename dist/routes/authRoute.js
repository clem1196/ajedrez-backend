"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/authRoutes.ts
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const express_validator_1 = require("express-validator");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const validationMiddleware_1 = require("../middlewares/validationMiddleware");
const router = (0, express_1.Router)();
// ✅ Validaciones
const registerValidation = [
    (0, express_validator_1.body)('nick').trim().isLength({ min: 3, max: 15 }).withMessage('Nick debe tener 3-15 caracteres'),
    (0, express_validator_1.body)('email').isEmail().withMessage('Email inválido'),
    (0, express_validator_1.body)('password').isLength({ min: 6 }).withMessage('Contraseña debe tener al menos 6 caracteres')
];
const loginValidation = [
    (0, express_validator_1.body)('email').isEmail().withMessage('Email inválido'),
    (0, express_validator_1.body)('password').notEmpty().withMessage('Contraseña requerida')
];
// ✅ Rutas
router.post('/register', registerValidation, authController_1.register);
router.post('/login', loginValidation, authController_1.login);
router.get('/me', authMiddleware_1.authenticateJWT, authController_1.getProfile);
router.put('/elo', authMiddleware_1.authenticateJWT, authController_1.updateElo);
router.put('/profile', authMiddleware_1.authenticateJWT, validationMiddleware_1.validateUpdateProfile, authController_1.updateProfile);
exports.default = router;
