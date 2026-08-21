"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/app.ts
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_session_1 = __importDefault(require("express-session"));
const passport_1 = __importDefault(require("./config/passport"));
const authRoute_1 = __importDefault(require("./routes/authRoute"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
// Configuración de CORS
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        const allowedOrigins = [
            process.env.CORS_ORIGIN,
            "http://localhost:5173",
            "http://localhost:3000",
        ];
        const isVercelPreview = origin.endsWith(".vercel.app");
        if (allowedOrigins.includes(origin) || isVercelPreview) {
            callback(null, true);
        }
        else {
            callback(new Error(`CORS bloqueado para el origen: ${origin}`));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
}));
// Configuración de Sesiones
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || "mi-secreto-temporal",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
    },
}));
// Passport
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
// Middlewares
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
// Rutas de la API
app.use("/api/auth", authRoute_1.default);
app.use("/api/users", userRoutes_1.default);
// 🎯 Endpoint de Health Check (Usado por Cron-Job.org para mantener activo Render)
app.get("/api/health", (req, res) => {
    res.status(200).json({
        status: "OK",
        message: "Servidor de Ajedrez activo y saludable",
        timestamp: new Date().toISOString()
    });
});
exports.default = app;
