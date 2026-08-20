// src/config/passport.ts
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as LichessStrategy } from 'passport-lichess';
import { AppDataSource } from '../config/dataSource';
import { User } from '../entities/User';
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

// Helper para asegurar que el usuario tenga registro en user_stats
const ensureUserStats = async (user: User, initialElo: number = 1200) => {
  let stats = await statsRepository.findOne({ where: { user: { id: user.id } } });
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

// --- Estrategia Google ---
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: process.env.GOOGLE_CALLBACK_URL!,
  scope: ['profile', 'email'],
  passReqToCallback: true
} as any, async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
  try {
    const email = profile.emails?.[0]?.value;

    // 1. Buscar si ya existe por googleId
    let user = await userRepository.findOne({ where: { googleId: profile.id } });

    // 2. Si no existe por googleId, buscar por Email real
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
        nick: profile.displayName || profile.name?.givenName || 'Usuario',
        authProvider: 'google',
        lastLogin: new Date()
      });
      await userRepository.save(user);
      await ensureUserStats(user, 1200);
    }

    return done(null, user);
  } catch (error) {
    return done(error as Error, undefined);
  }
}));

// --- Estrategia GitHub ---
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  callbackURL:
    process.env.GITHUB_CALLBACK_URL ||
    "https://ajedrez-backend-scym.onrender.com/api/auth/github/callback",
  scope: ["user:email"],
  passReqToCallback: true
} as any, async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
  try {
    const realEmail = profile.emails?.[0]?.value;

    // 1. Buscar por githubId
    let user = await userRepository.findOne({ where: { githubId: profile.id } });

    // 2. Buscar por Email real si GitHub lo proporcionó
    if (!user && realEmail) {
      user = await userRepository.findOne({ where: { email: realEmail } });
    }

    if (user) {
      user.githubId = profile.id;
      user.lastLogin = new Date();
      await userRepository.save(user);
    } else {
      user = userRepository.create({
        nick: (profile.username || profile.displayName).substring(0, 15),
        email: realEmail || `${profile.username}@github.user`,
        githubId: profile.id,
        authProvider: 'github',
        lastLogin: new Date(),
      });
      await userRepository.save(user);
      await ensureUserStats(user, 1200);
    }

    return done(null, user);
  } catch (error) {
    return done(error as Error, undefined);
  }
}));

// --- Estrategia Lichess ---
passport.use(new LichessStrategy({
  clientID: process.env.LICHESS_CLIENT_ID || "ajedrez-app-prod",
  callbackURL:
    process.env.LICHESS_CALLBACK_URL ||
    "https://ajedrez-backend-scym.onrender.com/api/auth/lichess/callback",
  passReqToCallback: true
} as any, async ( accessToken: string, refreshToken: string, profile: any, done: any) => {
  try {
    const lichessEmail = profile.emails?.[0]?.value;
    const userElo = profile.perfs?.blitz?.rating || profile.perfs?.rapid?.rating || 1200;

    // 1. Buscar por lichessId
    let user = await userRepository.findOne({ where: { lichessId: profile.id } });

    // 2. Buscar por Email si Lichess lo provee
    if (!user && lichessEmail) {
      user = await userRepository.findOne({ where: { email: lichessEmail } });
    }

    if (user) {
      user.lichessId = profile.id;
      user.lastLogin = new Date();
      await userRepository.save(user);
    } else {
      user = userRepository.create({
        nick: profile.username.substring(0, 15),
        email: lichessEmail || `${profile.username.toLowerCase()}@lichess.user`,
        lichessId: profile.id,
        authProvider: 'lichess',
        lastLogin: new Date(),
      });
      await userRepository.save(user);
      await ensureUserStats(user, userElo);
    }

    return done(null, user);
  } catch (error) {
    return done(error as Error, undefined);
  }
}));

export default passport;