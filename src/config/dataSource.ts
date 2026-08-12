// src/config/dataSource.ts
import { DataSource } from 'typeorm';
import { User } from '../entities/User';
import { UserStats } from '../entities/UserStats';
import { GameHistory } from '../entities/GameHistory';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'c1l2e3m1196',
  database: process.env.DB_NAME || 'ajedrez_db',
  synchronize: true, // 💡 Auto-crea o actualiza las tablas al levantar el servidor (Ideal para desarrollo)
  logging: false,
  entities: [User, UserStats, GameHistory],
  ssl: {
    rejectUnauthorized: false
  },
  subscribers: [],
  migrations: [],
});