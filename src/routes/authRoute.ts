// src/routes/authRoutes.ts
import { Router } from 'express';
import { 
  register, 
  login, 
  getProfile, 
  updateElo, 
  updateProfile
} from '../controllers/authController';
import { body } from 'express-validator';
import { authenticateJWT } from '../middlewares/authMiddleware';
import { validateUpdateProfile } from '../middlewares/validationMiddleware';

const router = Router();

// ✅ Validaciones
const registerValidation = [
  body('nick').trim().isLength({ min: 3, max: 15 }).withMessage('Nick debe tener 3-15 caracteres'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Contraseña debe tener al menos 6 caracteres')
];

const loginValidation = [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Contraseña requerida')
];

// ✅ Rutas
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.get('/me', authenticateJWT, getProfile);
router.put('/elo', authenticateJWT, updateElo);
router.put('/profile', authenticateJWT, validateUpdateProfile, updateProfile);

export default router;