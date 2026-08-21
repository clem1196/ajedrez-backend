// src/app.ts
import express, { Application, Request, Response } from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "./config/passport";
import authRoutes from "./routes/authRoute";
import userRoutes from "./routes/userRoutes";
import cors from "cors";


const app: Application = express();

// Configuración de CORS
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowedOrigins = [
        process.env.CORS_ORIGIN,
        "http://localhost:5173",
        "http://localhost:3000",
      ];
      const isVercelPreview = origin.endsWith(".vercel.app");
      if (allowedOrigins.includes(origin) || isVercelPreview) {
        callback(null, true);
      } else {
        callback(new Error(`CORS bloqueado para el origen: ${origin}`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Configuración de Sesiones
app.use(
  session({
    secret: process.env.SESSION_SECRET || "mi-secreto-temporal",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 horas
    },
  }),
);

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser())
// Rutas de la API
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

// 🎯 Endpoint de Health Check (Usado por Cron-Job.org para mantener activo Render)
app.get("/api/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    message: "Servidor de Ajedrez activo y saludable",
    timestamp: new Date().toISOString()
  });
});

export default app;