// src/routes/authRoutes.ts
import { Router } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import {
  register,
  login,
  getProfile,
  updateElo,
  updateProfile,
} from "../controllers/authController";
import { body } from "express-validator";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { validateUpdateProfile } from "../middlewares/validationMiddleware";

const router = Router();

// Base URL del frontend priorizando FRONTEND_URL y luego CORS_ORIGIN
const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  process.env.CORS_ORIGIN ||
  "https://ajedrez-frontend.vercel.app";

// ✅ Validaciones
const registerValidation = [
  body("nick")
    .trim()
    .isLength({ min: 3, max: 15 })
    .withMessage("Nick debe tener 3-15 caracteres"),
  body("email").isEmail().withMessage("Email inválido"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Contraseña debe tener al menos 6 caracteres"),
];

const loginValidation = [
  body("email").isEmail().withMessage("Email inválido"),
  body("password").notEmpty().withMessage("Contraseña requerida"),
];

// ✅ Rutas tradicionales
router.post("/register", registerValidation, register);
router.post("/login", loginValidation, login);
router.get("/me", authenticateJWT, getProfile);
router.put("/elo", authenticateJWT, updateElo);
router.put("/profile", authenticateJWT, validateUpdateProfile, updateProfile);

// ✅ RUTAS DE AUTENTICACIÓN SOCIAL
// Configuración de callbacks para emitir JWT al frontend
const handleOAuthCallback = (req: any, res: any) => {
  // Generar JWT usando exclusivamente JWT_SECRET
  const token = jwt.sign(
    { id: req.user.id, email: req.user.email },
    process.env.JWT_SECRET || "mi_secreto_jwt",
    { expiresIn: "7d" }
  );

  // Redirigir a la vista de éxito del frontend pasando el token
  res.redirect(`${FRONTEND_URL}/auth/success?token=${token}`);
};

// --- Google ---
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${FRONTEND_URL}/login?error=google_failed`,
    session: false,
  }),
  (req, res) => handleOAuthCallback(req, res)
);

// --- Facebook ---
router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: ["email"] })
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

// --- Endpoint para verificar autenticación social (opcional si usas JWT puro) ---
router.get("/session", (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user as any;
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        nick: user.nick,
        email: user.email,
        elo: user.elo,
      },
    });
  } else {
    res.json({ authenticated: false });
  }
});

export default router;