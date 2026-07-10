// src/server.ts
import 'reflect-metadata'; // 💡 INDISPENSABLE: Debe ser el primer import del archivo principal
import dotenv from 'dotenv';
dotenv.config(); // Carga las variables del archivo .env

import http from 'http';
import app from './app';
import { initSocketServer } from './sockets/socketServer';
import { AppDataSource } from './config/dataSource'; // Importamos tu fuente de datos

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

initSocketServer(server, app);

// 💡 Inicializamos la conexión a MySQL con TypeORM antes de colgar el puerto a la red
AppDataSource.initialize()
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