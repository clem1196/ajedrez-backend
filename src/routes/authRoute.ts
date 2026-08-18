// src/routes/authRoutes.ts
import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
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

// ✅ Validaciones (sin cambios)
const registerValidation = [
  body('nick').trim().isLength({ min: 3, max: 15 }).withMessage('Nick debe tener 3-15 caracteres'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Contraseña debe tener al menos 6 caracteres')
];

const loginValidation = [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Contraseña requerida')
];

// ✅ Rutas tradicionales (sin cambios)
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.get('/me', authenticateJWT, getProfile);
router.put('/elo', authenticateJWT, updateElo);
router.put('/profile', authenticateJWT, validateUpdateProfile, updateProfile);

// ✅ NUEVAS RUTAS DE AUTENTICACIÓN SOCIAL
// Configuración de callbacks para emitir JWT al frontend
const handleOAuthCallback = (provider: string) => {
  return (req: any, res: any) => {
    // Generar el token JWT con la información del usuario deserializado[cite: 1]
    const token = jwt.sign(
      { id: req.user.id, email: req.user.email },
      process.env.JWT_SECRET || 'secreto_jwt',
      { expiresIn: '7d' }
    );

    // Redirigir al Frontend pasando el token como query param[cite: 1]
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/success?token=${token}`);
  };
};

// --- Google ---
router.get('/google', 
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/login?error=google_failed',
    successRedirect: '/' 
  })
);

// --- Google ---
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login?error=google_failed', session: false }),
  (req, res) => handleOAuthCallback('google')(req, res)
);

// --- Facebook ---
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));
router.get('/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login?error=facebook_failed', session: false }),
  (req, res) => handleOAuthCallback('facebook')(req, res)
);

// --- Microsoft ---
router.get('/microsoft', passport.authenticate('microsoft', { scope: ['openid', 'profile', 'email', 'offline_access'] }));
router.get('/microsoft/callback',
  passport.authenticate('microsoft', { failureRedirect: '/login?error=microsoft_failed', session: false }),
  (req, res) => handleOAuthCallback('microsoft')(req, res)
);

// --- Cerrar sesión (social) ---
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Error al cerrar sesión:', err);
      return res.status(500).json({ error: 'Error al cerrar sesión' });
    }
    res.redirect('/');
  });
});

// --- Endpoint para verificar autenticación social ---
router.get('/session', (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user as any;
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        nick: user.nick,
        email: user.email,
        elo: user.elo
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

export default router;