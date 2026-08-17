// src/app.ts
import express, { Application, Request, Response } from 'express';
import session from 'express-session';
import passport from './config/passport';
import authRoutes from './routes/authRoute';
import userRoutes from './routes/userRoutes';
import cors from 'cors';

const app: Application = express();

// CORS (sin cambios)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowedOrigins = [
      process.env.CORS_ORIGIN,
      'http://localhost:5173',
      'http://localhost:3000'
    ];
    const isVercelPreview = origin.endsWith('.vercel.app');
    if (allowedOrigins.includes(origin) || isVercelPreview) {
      callback(null, true);
    } else {
      callback(new Error(`CORS bloqueado para el origen: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// ✅ Configurar sesión (IMPORTANTE: antes de passport)
app.use(session({
  secret: process.env.SESSION_SECRET || 'mi-secreto-temporal',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
}));

// ✅ Inicializar Passport
app.use(passport.initialize());
app.use(passport.session());

// Middlewares básicos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Ruta de prueba
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'Servidor de Ajedrez corriendo correctamente' });
});

export default app;