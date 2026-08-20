// src/config/passport.ts
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as LichessStrategy } from "passport-lichess";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../config/dataSource";
import { User } from "../entities/User";
import { UserStats } from "../entities/UserStats";

const userRepository = AppDataSource.getRepository(User);
const statsRepository = AppDataSource.getRepository(UserStats);

const JWT_SECRET = process.env.JWT_SECRET || "supersecret_key";

// Serialización y Deserialización
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await userRepository.findOneBy({ id });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Helper para obtener el userId si proviene de un flujo de vinculación (/link/:provider)
const getLinkingUserId = (req: any): number | null => {
  if (req?.query?.state) {
    try {
      const decodedState = JSON.parse(
        decodeURIComponent(req.query.state as string),
      );
      if (decodedState.linkToken) {
        const payload = jwt.verify(decodedState.linkToken, JWT_SECRET) as any;
        return payload.userId || payload.id || null;
      }
    } catch (e) {
      console.error("⚠️ Error al decodificar state de vinculación:", e);
    }
  }
  return null;
};

// Helper para asegurar registros en user_stats
const ensureUserStats = async (user: User, initialElo: number = 1200) => {
  let stats = await statsRepository.findOne({
    where: { user: { id: user.id } },
  });
  if (!stats) {
    stats = statsRepository.create({
      user,
      elo: initialElo,
      wins: 0,
      losses: 0,
      draws: 0,
    });
    await statsRepository.save(stats);
  }
  return stats;
};

// ==========================================
// 1. ESTRATEGIA GOOGLE
// ==========================================
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      scope: ["profile", "email"],
      passReqToCallback: true,
    } as any,
    async (
      req: any,
      accessToken: string,
      refreshToken: string,
      profile: any,
      done: any,
    ) => {
      try {
        const email = profile.emails?.[0]?.value;
        const linkingUserId = getLinkingUserId(req);

        // 🔗 CASO 1: VINCULACIÓN (Usuario autenticado en la app)
        if (linkingUserId) {
          let user = await userRepository.findOneBy({ id: linkingUserId });
          if (user) {
            user.googleId = profile.id;
            user.lastLogin = new Date();
            await userRepository.save(user);
            return done(null, user);
          }
        }

        // 🔐 CASO 2: LOGIN / REGISTRO REGULAR
        let user = await userRepository.findOne({
          where: { googleId: profile.id },
        });

        if (!user && email) {
          user = await userRepository.findOne({ where: { email } });
        }

        if (user) {
          user.googleId = profile.id;
          user.lastLogin = new Date();
          await userRepository.save(user);
        } else {
          user = userRepository.create({
            googleId: profile.id,
            email: email,
            nick: profile.displayName || profile.name?.givenName || "Usuario",
            authProvider: "google",
            lastLogin: new Date(),
          });
          await userRepository.save(user);
          await ensureUserStats(user, 1200);
        }

        return done(null, user);
      } catch (error) {
        return done(error as Error, undefined);
      }
    },
  ),
);

// ==========================================
// 2. ESTRATEGIA GITHUB
// ==========================================
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL:
        process.env.GITHUB_CALLBACK_URL ||
        "https://ajedrez-backend-scym.onrender.com/api/auth/github/callback",
      scope: ["user:email"],
      passReqToCallback: true,
    } as any,
    async (
      req: any,
      accessToken: string,
      refreshToken: string,
      profile: any,
      done: any,
    ) => {
      try {
        const realEmail = profile.emails?.[0]?.value;
        const linkingUserId = getLinkingUserId(req);

        // 🔗 CASO 1: VINCULACIÓN (Asociar a la cuenta logueada actualmente)
        if (linkingUserId) {
          let user = await userRepository.findOneBy({ id: linkingUserId });
          if (user) {
            user.githubId = profile.id;
            user.lastLogin = new Date();
            await userRepository.save(user);
            return done(null, user);
          }
        }

        // 🔐 CASO 2: LOGIN / REGISTRO REGULAR
        let user = await userRepository.findOne({
          where: { githubId: profile.id },
        });

        if (!user && realEmail) {
          user = await userRepository.findOne({ where: { email: realEmail } });
        }

        if (user) {
          user.githubId = profile.id;
          user.lastLogin = new Date();
          await userRepository.save(user);
        } else {
          user = userRepository.create({
            nick: (
              profile.username ||
              profile.displayName ||
              "GitHubUser"
            ).substring(0, 15),
            email: realEmail || `${profile.username}@github.user`,
            githubId: profile.id,
            authProvider: "github",
            lastLogin: new Date(),
          });
          await userRepository.save(user);
          await ensureUserStats(user, 1200);
        }

        return done(null, user);
      } catch (error) {
        return done(error as Error, undefined);
      }
    },
  ),
);

// ==========================================
// 3. ESTRATEGIA LICHESS
// ==========================================
passport.use(
  new LichessStrategy(
    {
      clientID: process.env.LICHESS_CLIENT_ID || "ajedrez-app-prod",
      callbackURL:
        process.env.LICHESS_CALLBACK_URL ||
        "https://ajedrez-backend-scym.onrender.com/api/auth/lichess/callback",
      passReqToCallback: true,
    } as any,
    // 💡 Hacemos el cast '(req: any, ...' como 'any' para evitar que TypeScript reclame los 5 argumentos
    (async (
      req: any,
      accessToken: string,
      refreshToken: string,
      profile: any,
      done: any,
    ) => {
      try {
        const lichessEmail = profile.emails?.[0]?.value;
        const userElo =
          profile.perfs?.blitz?.rating || profile.perfs?.rapid?.rating || 1200;
        const linkingUserId = getLinkingUserId(req);

        // 🔗 CASO 1: VINCULACIÓN (Asociar a la cuenta logueada actualmente)
        if (linkingUserId) {
          let user = await userRepository.findOneBy({ id: linkingUserId });
          if (user) {
            user.lichessId = profile.id;
            user.lastLogin = new Date();
            await userRepository.save(user);
            return done(null, user);
          }
        }

        // 🔐 CASO 2: LOGIN / REGISTRO REGULAR
        let user = await userRepository.findOne({
          where: { lichessId: profile.id },
        });

        if (!user && lichessEmail) {
          user = await userRepository.findOne({
            where: { email: lichessEmail },
          });
        }

        if (user) {
          user.lichessId = profile.id;
          user.lastLogin = new Date();
          await userRepository.save(user);
        } else {
          user = userRepository.create({
            nick: profile.username.substring(0, 15),
            email:
              lichessEmail || `${profile.username.toLowerCase()}@lichess.user`,
            lichessId: profile.id,
            authProvider: "lichess",
            lastLogin: new Date(),
          });
          await userRepository.save(user);
          await ensureUserStats(user, userElo);
        }

        return done(null, user);
      } catch (error) {
        return done(error as Error, undefined);
      }
    }) as any, // 👈 Este 'as any' le dice a TypeScript que acepte la función con 'req'
  ),
);

export default passport;
