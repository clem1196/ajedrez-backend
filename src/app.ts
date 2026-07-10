// src/app.ts
import express, { Application, Request, Response } from 'express';
import authRoutes from './routes/authRoute'
import userRoutes from './routes/userRoutes';
import cors from 'cors'

const app: Application = express();
// 💡 2. Configurar el middleware de CORS antes de tus rutas
app.use(cors({
    origin: 'http://localhost:5173', // ✅ Permite peticiones explícitamente desde tu frontend de Vue
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Permite los métodos necesarios
    allowedHeaders: ['Content-Type', 'Authorization'], // Permites las cabeceras comunes
    credentials: true // Por si a futuro manejas cookies o sesiones
}));
// Middlewares básicos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 💡 Conectamos las rutas del CRUD/Autenticación de usuarios
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Ruta de prueba para verificar que la API responde
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'Servidor de Ajedrez corriendo correctamente' });
});

export default app;