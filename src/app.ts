// src/app.ts
import express, { Application, Request, Response } from 'express';
import authRoutes from './routes/authRoute';
import userRoutes from './routes/userRoutes';
import cors from 'cors';

const app: Application = express();

// Lista de orígenes permitidos (Producción en Vercel + Desarrollo local)
const allowedOrigins = [
  process.env.CORS_ORIGIN, // https://ajedrez-frontend.vercel.app
  'http://localhost:5173',  // Desarrollo local con Vite
  'http://localhost:3000'   // Desarrollo local alternativo
];

app.use(cors({
    origin: (origin, callback) => {
      // Permite peticiones sin origin (como Postman o Server-to-Server) o si está en la lista permitida
      if (!origin || allowedOrigins.includes(origin)) {
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