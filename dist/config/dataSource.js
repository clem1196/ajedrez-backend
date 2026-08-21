"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDataSource = void 0;
// src/config/dataSource.ts
const typeorm_1 = require("typeorm");
const User_1 = require("../entities/User");
const UserStats_1 = require("../entities/UserStats");
const GameHistory_1 = require("../entities/GameHistory");
exports.AppDataSource = new typeorm_1.DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'c1l2e3m1196',
    database: process.env.DB_NAME || 'ajedrez_db',
    synchronize: false, // ⚠️ En producción siempre en false
    logging: false,
    entities: [User_1.User, UserStats_1.UserStats, GameHistory_1.GameHistory],
    ssl: {
        rejectUnauthorized: false
    },
    subscribers: [],
    migrations: [],
    // ⚙️ OPTIMIZACIÓN DE CONEXIÓN PARA TiDB CLOUD (Free Tier)
    extra: {
        connectionLimit: 10, // Límite de conexiones para no saturar la capa gratuita
        connectTimeout: 20000, // 20s de espera al conectar
        waitForConnections: true, // Si se agotan las conexiones, las solicitudes se encolan
        queueLimit: 0, // Cola sin límite de peticiones pendientes
        enableKeepAlive: true, // Mantiene viva la conexión TCP
        keepAliveInitialDelay: 10000 // Envía pings de control cada 10s para prevenir desconexiones
    }
});
