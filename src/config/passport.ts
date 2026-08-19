// src/config/passport.ts
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { AppDataSource } from '../config/dataSource'; // Ajusta la ruta a tu DataSource
import { User } from '../entities/User';

const userRepository = AppDataSource.getRepository(User);

// Serialización: guardar solo el ID en la sesión
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialización: recuperar el usuario completo desde el ID
passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await userRepository.findOneBy({ id });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// --- Estrategia Google ---
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: process.env.GOOGLE_CALLBACK_URL!,
  scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Buscar por googleId o email
    let user = await userRepository.findOne({
      where: [
        { googleId: profile.id },
        { email: profile.emails?.[0]?.value }
      ]
    });

    if (!user) {
      // Crear nuevo usuario
      user = userRepository.create({
        googleId: profile.id,
        email: profile.emails?.[0]?.value,
        nick: profile.displayName || profile.name?.givenName || 'Usuario',
        password: null,       
        authProvider: 'google',
        lastLogin: new Date()
      });
      await userRepository.save(user);
    } else if (!user.googleId) {
      // Vincular cuenta existente
      user.googleId = profile.id;
      user.authProvider = 'google';
      user.lastLogin = new Date();
      await userRepository.save(user);
    } else {
      // Actualizar último login
      user.lastLogin = new Date();
      await userRepository.save(user);
    }

    done(null, user);
  } catch (error) {
    done(error as Error, undefined);
  }
}));

// --- Estrategia Facebook ---
passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_APP_ID!,
  clientSecret: process.env.FACEBOOK_APP_SECRET!,
  callbackURL: process.env.FACEBOOK_CALLBACK_URL!,
  profileFields: ['id', 'displayName', 'emails']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await userRepository.findOne({
      where: [
        { facebookId: profile.id },
        { email: profile.emails?.[0]?.value }
      ]
    });

    if (!user) {
      user = userRepository.create({
        facebookId: profile.id,
        email: profile.emails?.[0]?.value,
        nick: profile.displayName || 'Usuario',
        password: null,       
        authProvider: 'facebook',
        lastLogin: new Date()
      });
      await userRepository.save(user);
    } else if (!user.facebookId) {
      user.facebookId = profile.id;
      user.authProvider = 'facebook';
      user.lastLogin = new Date();
      await userRepository.save(user);
    } else {
      user.lastLogin = new Date();
      await userRepository.save(user);
    }

    done(null, user);
  } catch (error) {
    done(error as Error, undefined);
  }
}));
/*
// --- Estrategia Microsoft ---
passport.use(new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID!,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  callbackURL: process.env.MICROSOFT_CALLBACK_URL!,
  passReqToCallback: true
}, async (req: any, accessToken: any, refreshToken: any, profile: any, done: any) => {
  try {
    const email = profile.Emails?.[0] || profile.emails?.[0]?.value;
    let user = await userRepository.findOne({
      where: [
        { microsoftId: profile.id },
        { email: email }
      ]
    });

    if (!user) {
      user = userRepository.create({
        microsoftId: profile.id,
        email: email,
        nick: profile.DisplayName || profile.displayName || 'Usuario',
        password: null,      
        authProvider: 'microsoft',
        lastLogin: new Date()
      });
      await userRepository.save(user);
    } else if (!user.microsoftId) {
      user.microsoftId = profile.id;
      user.authProvider = 'microsoft';
      user.lastLogin = new Date();
      await userRepository.save(user);
    } else {
      user.lastLogin = new Date();
      await userRepository.save(user);
    }

    done(null, user);
  } catch (error) {
    done(error as Error, undefined);
  }
}));*/

export default passport;