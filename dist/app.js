"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/app.ts
const express_1 = __importDefault(require("express"));
const authRoute_1 = __importDefault(require("./routes/authRoute"));
const app = (0, express_1.default)();
// Middlewares básicos
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// 💡 Conectamos las rutas del CRUD/Autenticación de usuarios
app.use('/api/auth', authRoute_1.default);
// Ruta de prueba para verificar que la API responde
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor de Ajedrez corriendo correctamente' });
});
exports.default = app;
