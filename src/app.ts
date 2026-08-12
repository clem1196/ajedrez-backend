// src/app.ts
import express, { Application, Request, Response } from 'express';
import authRoutes from './routes/authRoute';
import userRoutes from './routes/userRoutes';
import cors from 'cors';

const app: Application = express();
app.use(cors({
  origin: (origin, callback) => {
    // 1. Permite peticiones sin origin (Postman, Server-to-Server, etc.)
    if (!origin) return callback(null, true);

    // 2. Lista de orígenes explícitos (Desarrollo local + Tu dominio principal de Vercel)
    const allowedOrigins = [
      process.env.CORS_ORIGIN, // https://ajedrez-frontend.vercel.app
      'http://localhost:5173',
      'http://localhost:3000'
    ];

    // 3. Permite cualquier subdominio de Vercel perteneciente a tu proyecto (.vercel.app)
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

// Middlewares básicos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas de la aplicación
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Ruta de prueba
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'Servidor de Ajedrez corriendo correctamente' });
});

export default app;