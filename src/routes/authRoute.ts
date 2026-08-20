// src/routes/authRoutes.ts
import { Router } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../config/dataSource";
import { User } from "../entities/User";
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
const userRepository = AppDataSource.getRepository(User);

// Base URL del frontend
const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  process.env.CORS_ORIGIN ||
  "https://ajedrez-frontend.vercel.app";

// Validaciones
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

// Rutas tradicionales
router.post("/register", registerValidation, register);
router.post("/login", loginValidation, login);
router.get("/me", authenticateJWT, getProfile);
router.put("/elo", authenticateJWT, updateElo);
router.put("/profile", authenticateJWT, validateUpdateProfile, updateProfile);

// ==========================================
// 🔗 RUTA INICIAL DE VINCULACIÓN (Account Linking)
// ==========================================
router.get("/link/:provider", (req, res, next) => {
  const { provider } = req.params;
  const token = req.query.token as string;

  if (!token) {
    return res.redirect(`${FRONTEND_URL}/profile?error=unauthorized`);
  }

  // Guardamos el token en el parámetro 'state' de OAuth2
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
  const oAuthUser = req.user; // Usuario retornado por la estrategia de Passport
  let linkToken: string | null = null;

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

      // 1. Buscar al usuario logueado en la app (el principal)
      const currentUser = await userRepository.findOneBy({ id: currentUserId });

      if (currentUser && oAuthUser) {
        // 2. Vincular el ID de la red social correspondiente
        if (oAuthUser.googleId) currentUser.googleId = oAuthUser.googleId;
        if (oAuthUser.githubId) currentUser.githubId = oAuthUser.githubId;
        if (oAuthUser.lichessId) currentUser.lichessId = oAuthUser.lichessId;

        await userRepository.save(currentUser);

        // 3. Si Passport creó un usuario duplicado en la BD (distinto id), lo limpiamos
        if (oAuthUser.id && oAuthUser.id !== currentUser.id) {
          try {
            await userRepository.delete(oAuthUser.id);
          } catch (delError) {
            console.warn("No se pudo eliminar el usuario temporal duplicado:", delError);
          }
        }

        return res.redirect(`${FRONTEND_URL}/profile?linked=${oAuthUser.authProvider || "social"}`);
      }
    } catch (error) {
      console.error("Error validando token en vinculación:", error);
      return res.redirect(`${FRONTEND_URL}/profile?error=link_failed`);
    }
  }

  // --- CASO B: LOGIN / REGISTRO NORMAL VÍA RED SOCIAL ---
  const token = jwt.sign(
    {
      userId: oAuthUser.id,
      nick: oAuthUser.nick || oAuthUser.displayName,
      email: oAuthUser.email,
      elo: oAuthUser.elo || 1200,
      isAdmin: oAuthUser.isAdmin || false,
      authProvider: oAuthUser.authProvider || "google",
    },
    process.env.JWT_SECRET || "fallback_secret_key",
    { expiresIn: "7d" }
  );

  return res.redirect(`${FRONTEND_URL}/auth/success?token=${token}`);
};

// ==========================================
// 🌐 RUTAS CALLBACKS OAUTH
// ==========================================
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${FRONTEND_URL}/login?error=google_failed`,
    session: false,
  }),
  handleOAuthCallback
);

router.get("/github", passport.authenticate("github", { scope: ["user:email"] }));
router.get(
  "/github/callback",
  passport.authenticate("github", {
    failureRedirect: `${FRONTEND_URL}/login?error=github_failed`,
    session: false,
  }),
  handleOAuthCallback
);

router.get("/lichess", passport.authenticate("lichess"));
router.get(
  "/lichess/callback",
  passport.authenticate("lichess", {
    failureRedirect: `${FRONTEND_URL}/login?error=lichess_failed`,
    session: false,
  }),
  handleOAuthCallback
);

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