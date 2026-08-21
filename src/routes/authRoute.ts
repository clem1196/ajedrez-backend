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
  forgotPassword,
  resetPassword,
} from "../controllers/authController";
import { body } from "express-validator";
import { authenticateJWT } from "../middlewares/authMiddleware";
import { validateUpdateProfile } from "../middlewares/validationMiddleware";
import { JWT_SECRET } from "../config/jwt";

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
  // 1. Guardar el token en una cookie temporal de 10 minutos
  res.cookie("linkToken", token, {
    httpOnly: true,
    secure: true, // Requerido en producción (HTTPS/Render)
    sameSite: "none", // Necesario para redirecciones cross-domain/OAuth
    maxAge: 10 * 60 * 1000, // 10 minutos
  });
  // 2. Ejecutar la autenticación con el proveedor
  if (provider === "google") {
    return passport.authenticate("google", { scope: ["profile", "email"] })(
      req,
      res,
      next,
    );
  } else if (provider === "github") {
    return passport.authenticate("github", { scope: ["user:email"] })(
      req,
      res,
      next,
    );
  } else if (provider === "lichess") {
    return passport.authenticate("lichess")(req, res, next);
  } else {
    return res.redirect(`${FRONTEND_URL}/profile?error=invalid_provider`);
  }
});

// ==========================================
// 🔐 MANEJADOR UNIFICADO DE CALLBACKS (OAuth)
// ==========================================
const handleOAuthCallback = async (req: any, res: any) => {
  res.clearCookie("linkToken", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  const oAuthUser = req.user; // Usuario retornado por la estrategia de Passport
  let linkToken: string | null = null;

  if (req.query.state) {
    try {
      const decodedState = JSON.parse(
        decodeURIComponent(req.query.state as string),
      );
      linkToken = decodedState.linkToken || null;
    } catch (e) {
      console.warn("No se pudo decodificar el estado de OAuth:", e);
    }
  }

  // --- CASO A: VINCULACIÓN DE CUENTA DESDE EL PERFIL ---
  if (linkToken) {
    try {
      const payload = jwt.verify(linkToken, JWT_SECRET) as any;
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

        const socialId =
          oAuthUser.googleId || oAuthUser.githubId || oAuthUser.lichessId;

        if (providerField && socialId) {
          // 🔍 VERIFICACIÓN: Comprobar si otra cuenta (distinta a la actual) ya tiene este ID social
          const existingSocialUser = await userRepository.findOne({
            where: { [providerField]: socialId } as any,
          });

          if (existingSocialUser && existingSocialUser.id !== currentUser.id) {
            // Si el ID social estaba asignado a un usuario secundario/duplicado, lo desvinculamos o eliminamos
            existingSocialUser[providerField] = null as any;
            await userRepository.save(existingSocialUser);

            // Si ese usuario fue creado solo para esta red social (sin password ni otros ids), podemos borrarlo
            if (
              !existingSocialUser.password &&
              !existingSocialUser.googleId &&
              !existingSocialUser.githubId &&
              !existingSocialUser.lichessId
            ) {
              await userRepository.delete(existingSocialUser.id);
            }
          }

          // Asignamos el ID social a la cuenta del usuario actual
          currentUser[providerField] = socialId as any;
          await userRepository.save(currentUser);
        }

        // Limpiamos el usuario temporal si Passport generó uno nuevo distinto al actual
        if (oAuthUser.id && oAuthUser.id !== currentUser.id) {
          try {
            await userRepository.delete(oAuthUser.id);
          } catch (delError) {
            console.warn("No se pudo eliminar el usuario temporal:", delError);
          }
        }

        return res.redirect(
          `${FRONTEND_URL}/profile?linked=${oAuthUser.authProvider || "social"}`,
        );
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
    { expiresIn: "7d" },
  );

  return res.redirect(`${FRONTEND_URL}/auth/success?token=${token}`);
};

// ==========================================
// 🌐 RUTAS CALLBACKS OAUTH
// ==========================================
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${FRONTEND_URL}/login?error=google_failed`,
    session: false,
  }),
  handleOAuthCallback,
);

router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email"] }),
);
router.get(
  "/github/callback",
  passport.authenticate("github", {
    failureRedirect: `${FRONTEND_URL}/login?error=github_failed`,
    session: false,
  }),
  handleOAuthCallback,
);

router.get("/lichess", passport.authenticate("lichess"));
router.get(
  "/lichess/callback",
  passport.authenticate("lichess", {
    failureRedirect: `${FRONTEND_URL}/login?error=lichess_failed`,
    session: false,
  }),
  handleOAuthCallback,
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
// Rutas públicas (no requieren middleware de JWT)
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
export default router;
