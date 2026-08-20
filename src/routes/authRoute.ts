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

// Base URL del frontend
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


// ==========================================
// 🔗 RUTA INICIAL DE VINCULACIÓN (Account Linking)
// ==========================================
// Permite guardar el JWT actual en el estado (state) de OAuth2 para reconocer al usuario al volver.
router.get("/link/:provider", (req, res, next) => {
  const { provider } = req.params;
  const token = req.query.token as string;

  if (!token) {
    return res.redirect(`${FRONTEND_URL}/profile?error=unauthorized`);
  }

  // Codificamos el token en el parámetro 'state' de OAuth2
  const state = encodeURIComponent(JSON.stringify({ linkToken: token }));

  if (provider === "google") {
    return passport.authenticate("google", { scope: ["profile", "email"], state })(req, res, next);
  } else if (provider === "github") {
    return passport.authenticate("github", { scope: ["user:email"], state })(req, res, next);
  } else if (provider === "lichess") {
    return passport.authenticate("lichess", { state })(req, res, next);
  } else {
    return res.redirect(`${FRONTEND_URL}/profile?error=invalid_provider`);
  }
});


// ==========================================
// 🔐 MANEJADOR UNIFICADO DE CALLBACKS (OAuth)
// ==========================================
const handleOAuthCallback = async (req: any, res: any) => {
  const user = req.user;
  let linkToken: string | null = null;

  // Intentamos recuperar el 'state' de la query si venía de una vinculación
  if (req.query.state) {
    try {
      const decodedState = JSON.parse(decodeURIComponent(req.query.state as string));
      linkToken = decodedState.linkToken || null;
    } catch (e) {
      console.warn("No se pudo decodificar el estado de OAuth:", e);
    }
  }

  // --- CASO A: VINCULACIÓN DE CUENTA DESDE EL PERFIL ---
  if (linkToken) {
    try {
      const secret = process.env.JWT_SECRET || "fallback_secret_key";
      const payload = jwt.verify(linkToken, secret) as any;
      const currentUserId = payload.userId || payload.id;

      // Importante: Aquí llamas a tu método para guardar el id social en el usuario actual.
      // Si en la estrategia de Passport adjuntaste el perfil como user, extraes su id según la red social:
      // Ejemplo: await linkSocialAccountToUser(currentUserId, user);

      return res.redirect(`${FRONTEND_URL}/profile?linked=${user.authProvider || "social"}`);
    } catch (error) {
      console.error("Error validando token en vinculación:", error);
      return res.redirect(`${FRONTEND_URL}/profile?error=link_failed`);
    }
  }

  // --- CASO B: LOGIN / REGISTRO NORMAL VÍA RED SOCIAL ---
  const token = jwt.sign(
    {
      userId: user.id,
      nick: user.nick || user.displayName,
      email: user.email,
      elo: user.elo || 1200,
      isAdmin: user.isAdmin || false,
      authProvider: user.authProvider || "google",
    },
    process.env.JWT_SECRET || "fallback_secret_key",
    { expiresIn: "7d" }
  );

  return res.redirect(`${FRONTEND_URL}/auth/success?token=${token}`);
};


// ==========================================
// 🌐 RUTAS CALLBACKS OAUTH
// ==========================================

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
  handleOAuthCallback
);

// --- Github ---
router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email"] })
);

router.get(
  "/github/callback",
  passport.authenticate("github", {
    failureRedirect: `${FRONTEND_URL}/login?error=github_failed`,
    session: false,
  }),
  handleOAuthCallback
);

// --- Lichess ---
router.get("/lichess", passport.authenticate("lichess"));

router.get(
  "/lichess/callback",
  passport.authenticate("lichess", {
    failureRedirect: `${FRONTEND_URL}/login?error=lichess_failed`,
    session: false,
  }),
  handleOAuthCallback
);

// --- Local ---
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