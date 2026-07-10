"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
require("reflect-metadata"); // 💡 INDISPENSABLE: Debe ser el primer import del archivo principal
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config(); // Carga las variables del archivo .env
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const socketServer_1 = require("./sockets/socketServer");
const dataSource_1 = require("./config/dataSource"); // Importamos tu fuente de datos
const PORT = process.env.PORT || 4000;
const server = http_1.default.createServer(app_1.default);
(0, socketServer_1.initSocketServer)(server);
// 💡 Inicializamos la conexión a MySQL con TypeORM antes de colgar el puerto a la red
dataSource_1.AppDataSource.initialize()
    .then(() => {
    console.log(`=========================================`);
    console.log(`🏛️  ¡Conexión establecida con MySQL con éxito!`);
    console.log(`📦 Tablas y relaciones sincronizadas de forma automática.`);
    console.log(`=========================================`);
    // Levantamos el servidor HTTP y los sockets únicamente si la base de datos está lista
    server.listen(PORT, () => {
        console.log(`=========================================`);
        console.log(`🚀 Servidor de Ajedrez activo en el puerto: ${PORT}`);
        console.log(`📡 Sockets e hilos de juego inicializados.`);
        console.log(`=========================================`);
    });
})
    .catch((error) => {
    console.error(`❌ ERROR CRÍTICO al inicializar la Base de Datos:`, error);
    process.exit(1); // Detiene el proceso si no se pudo conectar
});
