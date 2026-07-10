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
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ajedrez_db',
    synchronize: true, // 💡 Auto-crea o actualiza las tablas al levantar el servidor (Ideal para desarrollo)
    logging: false,
    entities: [User_1.User, UserStats_1.UserStats, GameHistory_1.GameHistory],
    subscribers: [],
    migrations: [],
});
