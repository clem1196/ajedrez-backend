// src/server.ts
import 'reflect-metadata'; // 💡 INDISPENSABLE: Debe ser el primer import
import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app';
import { initSocketServer } from './sockets/socketServer';
import { AppDataSource } from './config/dataSource';

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

initSocketServer(server, app);

// 🔄 Función de inicialización con reintentos automáticos para TiDB Cloud
const startServerWithRetry = async (retries = 5, delay = 5000) => {
  while (retries > 0) {
    try {
      await AppDataSource.initialize();
      console.log(`=========================================`);
      console.log(`🏛️  ¡Conexión establecida con TiDB Cloud/MySQL con éxito!`);
      console.log(`📦 Modelos y entidades cargados correctamente.`);
      console.log(`=========================================`);

      // Levantamos el servidor HTTP y WebSockets solo cuando la DB esté lista
      server.listen(PORT, () => {
        console.log(`=========================================`);
        console.log(`🚀 Servidor de Ajedrez activo en el puerto: ${PORT}`);
        console.log(`📡 Sockets e hilos de juego inicializados.`);
        console.log(`=========================================`);
      });

      break; // Salir del bucle si la conexión fue exitosa
    } catch (error) {
      retries -= 1;
      console.error(`❌ Error al conectar a la Base de Datos. Reintentos restantes: ${retries}`);
      console.error(error);

      if (retries === 0) {
        console.error(`❌ ERROR CRÍTICO: No se pudo establecer conexión con TiDB Cloud.`);
        process.exit(1);
      }

      console.log(`⏳ Reintentando conexión en ${delay / 1000} segundos...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

startServerWithRetry();