"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/app.ts
const express_1 = __importDefault(require("express"));
const authRoute_1 = __importDefault(require("./routes/authRoute"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
// 💡 2. Configurar el middleware de CORS antes de tus rutas
app.use((0, cors_1.default)({
    origin: 'http://localhost:5173', // ✅ Permite peticiones explícitamente desde tu frontend de Vue
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Permite los métodos necesarios
    allowedHeaders: ['Content-Type', 'Authorization'], // Permites las cabeceras comunes
    credentials: true // Por si a futuro manejas cookies o sesiones
}));
// Middlewares básicos
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// 💡 Conectamos las rutas del CRUD/Autenticación de usuarios
app.use('/api/auth', authRoute_1.default);
app.use('/api/users', userRoutes_1.default);
// Ruta de prueba para verificar que la API responde
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor de Ajedrez corriendo correctamente' });
});
exports.default = app;
