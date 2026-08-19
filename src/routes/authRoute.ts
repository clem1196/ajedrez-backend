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
  // Extraemos el usuario que adjuntó Passport tras autenticar
  const user = req.user;

  // Generamos el JWT con el formato EXACTO que espera authMiddleware.ts
  const token = jwt.sign(
    {
      userId: user.id,                      // 👈 Requerido por req.userId
      nick: user.nick || user.displayName, // 👈 Requerido por req.userNick
      email: user.email,                   // 👈 Requerido por req.userEmail
      elo: user.elo || 1200,               // 👈 Opcional / Por defecto
      isAdmin: user.isAdmin || false,       // 👈 Opcional
      authProvider: user.authProvider || "google"
    },
    process.env.JWT_SECRET || "fallback_secret_key",
    { expiresIn: "7d" }
  );

  const frontendUrl =
    process.env.FRONTEND_URL ||
    process.env.CORS_ORIGIN ||
    "https://ajedrez-frontend.vercel.app";

  // Redirigir al frontend pasando el token completo
  res.redirect(`${frontendUrl}/auth/success?token=${token}`);
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
// Endpoint exigido por Meta para procesar la eliminación de datos de usuario
router.post("/facebook/data-deletion", (req, res) => {
  res.json({
    url: "https://ajedrez-frontend.vercel.app/data-deletion-status",
    confirmation_code: "code_" + Date.now()
  });
});
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