// src/config/passport.ts
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { AppDataSource } from '../config/dataSource';
import { User } from '../entities/User';
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as LichessStrategy } from "passport-lichess";
import { UserStats } from '../entities/UserStats';

const userRepository = AppDataSource.getRepository(User);
const statsRepository = AppDataSource.getRepository(UserStats);

// Serialización
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialización
passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await userRepository.findOneBy({ id });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Helper para garantizar que el usuario tenga estadísticas creadas
const ensureUserStats = async (user: User, initialElo: number = 1200) => {
  let stats = await statsRepository.findOne({ where: { user: { id: user.id } } });
  
  if (!stats) {
    stats = statsRepository.create({
      user: user,
      elo: initialElo,
      wins: 0,
      losses: 0,
      draws: 0,      
    });
    await statsRepository.save(stats);
  }
  return stats;
};

// --- Estrategia Google ---
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: process.env.GOOGLE_CALLBACK_URL!,
  scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await userRepository.findOne({
      where: [
        { googleId: profile.id },
        { email: profile.emails?.[0]?.value }
      ]
    });

    if (!user) {
      // 1. Crear nuevo usuario
      user = userRepository.create({
        googleId: profile.id,
        email: profile.emails?.[0]?.value,
        nick: profile.displayName || profile.name?.givenName || 'Usuario',
        password: null,        
        authProvider: 'google',
        lastLogin: new Date()
      });
      await userRepository.save(user);

      // 2. ⚡ CREAR ESTADÍSTICAS INICIALES EN LA BD
      await ensureUserStats(user, 1200);
    } else {
      if (!user.googleId) {
        user.googleId = profile.id;
        user.authProvider = 'google';
      }
      user.lastLogin = new Date();
      await userRepository.save(user);

      // Aseguramos que tenga stats aunque haya sido creado antes
      await ensureUserStats(user, 1200);
    }

    done(null, user);
  } catch (error) {
    done(error as Error, undefined);
  }
}));


// --- Estrategia GitHub ---
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL:
        process.env.GITHUB_CALLBACK_URL ||
        "https://ajedrez-backend-scym.onrender.com/api/auth/github/callback",
      scope: ["user:email"],
    },
    async (
      accessToken: string,
      refreshToken: string,
      profile: any,
      done: any
    ) => {
      try {
        const primaryEmail =
          profile.emails && profile.emails[0]?.value
            ? profile.emails[0].value
            : `${profile.username}@github.user`;

        let user = await userRepository.findOne({
          where: [{ email: primaryEmail }, { githubId: profile.id }],
        });

        if (!user) {
          // 1. Crear usuario
          user = userRepository.create({
            nick: (profile.username || profile.displayName).substring(0, 15),
            email: primaryEmail,
            githubId: profile.id,
            authProvider: "github",
            lastLogin: new Date(),
          });
          await userRepository.save(user);

          // 2. ⚡ CREAR ESTADÍSTICAS INICIALES EN LA BD
          await ensureUserStats(user, 1200);
        } else {
          user.lastLogin = new Date();
          await userRepository.save(user);
          await ensureUserStats(user, 1200);
        }

        return done(null, user);
      } catch (error) {
        return done(error as Error, undefined);
      }
    }
  )
);


// --- Estrategia Lichess ---
passport.use(
  new LichessStrategy(
    {
      clientID: process.env.LICHESS_CLIENT_ID || "ajedrez-app-prod",
      callbackURL:
        process.env.LICHESS_CALLBACK_URL ||
        "https://ajedrez-backend-scym.onrender.com/api/auth/lichess/callback",
    },
    async (
      accessToken: string,
      refreshToken: string,
      profile: any,
      done: any
    ) => {
      try {
        const lichessEmail = `${profile.username.toLowerCase()}@lichess.user`;
        const userElo =
          profile.perfs?.blitz?.rating ||
          profile.perfs?.rapid?.rating ||
          1200;

        let user = await userRepository.findOne({
          where: [{ email: lichessEmail }, { lichessId: profile.id }],
        });

        if (!user) {
          // 1. Crear usuario
          user = userRepository.create({
            nick: profile.username.substring(0, 15),
            email: lichessEmail,
            lichessId: profile.id,
            authProvider: "lichess",
            lastLogin: new Date(),
          });
          await userRepository.save(user);

          // 2. ⚡ CREAR ESTADÍSTICAS UTILIZANDO SU ELO REAL DE LICHESS
          await ensureUserStats(user, userElo);
        } else {
          user.lastLogin = new Date();
          await userRepository.save(user);
          await ensureUserStats(user, userElo);
        }

        return done(null, user);
      } catch (error) {
        return done(error as Error, undefined);
      }
    }
  )
);

export default passport;