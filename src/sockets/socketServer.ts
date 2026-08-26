// src/sockets/socketServer.ts
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { GameRoom, RoomManager, TIME_CONSTANTS } from "./roomManager";
import { registerGameHandlers } from "./gameHandler";
import { EloService } from "../services/eloService";
import { BotService } from "../services/botService";
import { BOT_CONFIG } from "../config/botConfig";
import { createAdminRoutes } from "../routes/adminRoute";
import { Application } from "express";

const roomManager = new RoomManager();

// ✅ Función para determinar si se debe crear un bot
const shouldCreateBot = (queueSize: number): boolean => {
  if (!BOT_CONFIG.ENABLED) {
    console.log(`ℹ️ Bots desactivados globalmente`);
    return false;
  }
  if (queueSize >= BOT_CONFIG.MIN_PLAYERS_TO_DISABLE_BOTS) {
    console.log(`👥 ${queueSize} jugadores en cola, no se necesita bot`);
    return false;
  }
  const random = Math.random() * 100;
  if (random > BOT_CONFIG.BOT_PROBABILITY) {
    console.log(
      `🎲 Probabilidad de bot: ${random}% > ${BOT_CONFIG.BOT_PROBABILITY}%, no se crea bot`,
    );
    return false;
  }
  return true;
};

export const initSocketServer = (server: HttpServer, app: Application) => {
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  const botService = new BotService(roomManager, io);
  const adminRoutes = createAdminRoutes(roomManager, io, botService);
  app.use("/api/admin", adminRoutes);

  setInterval(
    () => {
      botService.cleanupInactiveBots();
    },
    5 * 60 * 1000,
  );

  io.on("connection", (socket: Socket) => {
    console.log(`👤 Usuario conectado: ${socket.id}`);

    // --- 🎮 UNIRSE A COLA (con ELO dinámico) ---
    socket.on(
      "join_game",
      async ({ nick, minutes }: { nick: string; minutes?: number }) => {
        const gameMinutes =
          minutes && [5, 10, 15].includes(minutes) ? minutes : 10;

        const finalNick =
          nick && typeof nick === "string" && nick.trim() !== ""
            ? nick.trim()
            : `Invitado_${socket.id.substring(0, 5)}`;

        // ✅ OBTENER ELO DEL JUGADOR (desde BD o 1200 por defecto)
        let playerElo = 1200;
        try {
          const stats = await EloService.getPlayerStats(finalNick);
          if (stats && stats.elo) {
            playerElo = stats.elo;
          }
        } catch (error) {
          console.warn(
            `⚠️ No se pudo obtener ELO para ${finalNick}, usando 1200`,
          );
        }

        roomManager.removeFromQueue(socket.id);

        console.log(
          `🔍 ${finalNick} (Elo: ${playerElo}) busca partida de ${gameMinutes} min...`,
        );

        const queueSize = roomManager.getQueueSizeByMinutes(gameMinutes);
        let room: GameRoom | null = null;

        // ✅ Intentar emparejar con jugadores en cola (pasando el ELO)
        if (queueSize > 0) {
          console.log(
            `👥 ${queueSize} jugadores esperando en cola de ${gameMinutes} min`,
          );
          room = roomManager.addToGuestQueue(
            socket.id,
            finalNick,
            gameMinutes,
            playerElo,
          );
        }

        // ✅ Si no hay oponente y la config permite bots, creamos la partida contra IA
        if (!room && shouldCreateBot(queueSize)) {
          console.log(
            `🤖 No hay oponentes disponibles, creando bot para ${finalNick} (Elo: ${playerElo})`,
          );

          // 🔥 CALCULAR DIFICULTAD SEGÚN ELO DEL HUMANO
          const difficulty = botService.getDifficultyByElo(playerElo);
          const botNick = botService.getRandomBotNameByDifficulty(difficulty);
          const botElo = botService.getRandomEloByDifficulty(difficulty);
          const tempBotId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

          const botData = {
            socketId: tempBotId,
            nick: botNick,
            elo: botElo,
            color: "w" as "w" | "b",
            isBot: true as const,
          };

          room = roomManager.createRoomWithBot(
            socket.id,
            finalNick,
            gameMinutes,
            botData,
          );

          if (room) {
            const actualBotPlayer = room.playerWhite.isBot
              ? room.playerWhite
              : room.playerBlack;

            // ✅ REGISTRAR BOT CON SU DIFICULTAD (para el servicio)
            botService.addBot({
              id: actualBotPlayer.socketId,
              nick: actualBotPlayer.nick,
              elo: actualBotPlayer.elo || botElo,
              color: actualBotPlayer.color as "w" | "b",
              socketId: actualBotPlayer.socketId,
              roomId: room.roomId,
              difficulty: difficulty,
            });

            io.to(room.roomId).emit("bot_joined", {
              nick: actualBotPlayer.nick,
              elo: actualBotPlayer.elo,
              color: actualBotPlayer.color,
              difficulty: difficulty,
            });
          }
        } else if (!room) {
          // ✅ Si no hay bot y no hay oponente, esperar en cola (con ELO)
          console.log(`⏳ Esperando oponente real para ${finalNick}`);
          roomManager.addToGuestQueue(
            socket.id,
            finalNick,
            gameMinutes,
            playerElo,
          );
          socket.emit("waiting_for_opponent", {
            message: `Buscando oponente para ${gameMinutes} min...`,
          });
          return;
        }

        // ✅ Si hay sala (con bot o con oponente), configurar
        if (room) {
          console.log(`📊 Sala ${room.roomId} creada:`);
          console.log(
            `   - Blancas: ${room.playerWhite?.nick || "VACÍO"} (${room.playerWhite?.isBot ? "Bot" : "Humano"})`,
          );
          console.log(
            `   - Negras: ${room.playerBlack?.nick || "VACÍO"} (${room.playerBlack?.isBot ? "Bot" : "Humano"})`,
          );

          setupRoomSocketsAndStart(io, socket, room);

          // ⏱️ TIMER DE CORTESÍA
          room.initialMoveTimer = setTimeout(async () => {
            if (
              room.gameStarted ||
              room.isProcessingEnd ||
              room.gameEnded ||
              room.moveCount > 0
            ) {
              console.log(
                `⏭️ Partida ya iniciada, ignorando timer de cortesía`,
              );
              return;
            }

            console.log(
              `⏱️ Tiempo de cortesía agotado (${TIME_CONSTANTS.COURTESY_SECONDS}s) en sala ${room.roomId}`,
            );

            room.isProcessingEnd = true;
            room.gameEnded = true;
            roomManager.clearRoomTimers(room);

            const message = `Partida abortada: Las Blancas (${room.playerWhite?.nick || "Desconocido"}) no iniciaron el juego a tiempo.`;

            try {
              if (room.playerWhite?.isBot) {
                botService.removeBot(room.roomId, room.playerWhite.socketId);
              }
              if (room.playerBlack?.isBot) {
                botService.removeBot(room.roomId, room.playerBlack.socketId);
              }

              await EloService.processMatchEnd({
                roomId: room.roomId,
                whiteSocketId: room.playerWhite?.socketId || "",
                blackSocketId: room.playerBlack?.socketId || "",
                whiteNick: room.playerWhite?.nick || "Desconocido",
                blackNick: room.playerBlack?.nick || "Desconocido",
                result: "abort",
                reason: "abort_by_inactivity",
              });

              io.to(room.roomId).emit("game_over", {
                reason: "abort_by_inactivity",
                message,
                whiteEloChange: 0,
                blackEloChange: 0,
              });
            } catch (error) {
              console.error(
                "❌ Error al procesar aborto por inactividad:",
                error,
              );
            } finally {
              roomManager.removeRoom(room.roomId);
            }
          }, TIME_CONSTANTS.COURTESY_SECONDS * 1000);

          // ✅ Si el bot es el que debe mover primero
          const currentTurn = room.chessInstance.turn();
          const botToMove =
            currentTurn === "w" ? room.playerWhite : room.playerBlack;

          if (botToMove && botToMove.isBot) {
            console.log(
              `🤖 Bot ${botToMove.nick} debe mover primero (${currentTurn})`,
            );
            setTimeout(() => {
              botService.botMakeMove(room.roomId, currentTurn);
            }, 2000);
          }
        } else {
          console.log(`⚠️ No se pudo crear la sala para ${finalNick}`);
          socket.emit("waiting_for_opponent", {
            message: `Buscando oponente para ${gameMinutes} min...`,
          });
        }
      },
    );

    // --- 🔄 REVANCHAS ---
    socket.on("propose_rematch", async ({ roomId }) => {
      const room = roomManager.getRoom(roomId);
      if (!room || room.isProcessingEnd) return;

      const isWhite = room.playerWhite.socketId === socket.id;
      const player = isWhite ? room.playerWhite : room.playerBlack;
      const opponent = isWhite ? room.playerBlack : room.playerWhite;

      // ✅ Caso: oponente es bot
      if (opponent.isBot) {
        const botInstance = botService.getBotInstanceForPlayer(
          opponent.socketId,
        );
        if (botInstance) {
          const shouldAccept = await botInstance.shouldAcceptRematch(room);
          if (shouldAccept) {
            socket.emit("rematch_accepted");

            const newRoom = roomManager.createRematchRoom(roomId);
            if (newRoom) {
              socket.join(newRoom.roomId);

              setupRoomSocketsAndStart(io, socket, newRoom);

              io.to(newRoom.roomId).emit("game_started", {
                roomId: newRoom.roomId,
                white: {
                  id: newRoom.playerWhite.socketId,
                  nick: newRoom.playerWhite.nick,
                  time: newRoom.whiteTime,
                  isBot: newRoom.playerWhite.isBot || false,
                },
                black: {
                  id: newRoom.playerBlack.socketId,
                  nick: newRoom.playerBlack.nick,
                  time: newRoom.blackTime,
                  isBot: newRoom.playerBlack.isBot || false,
                },
                fen: newRoom.chessInstance.fen(),
                initialTime: newRoom.initialTimeAllocated,
              });

              startRoomTimer(io, newRoom);
            } else {
              socket.emit("rematch_failed", {
                message: "No se pudo crear la revancha",
              });
            }
          } else {
            socket.emit("rematch_declined");
          }
        }
        return;
      }

      // ✅ Caso: oponente es humano
      const opponentId = isWhite
        ? room.playerBlack.socketId
        : room.playerWhite.socketId;
      io.to(room.roomId).emit("rematch_requested", { from: player.nick });
    });

    socket.on("cancel_rematch_proposal", ({ roomId }) => {
      const room = roomManager.getRoom(roomId);
      if (room) {
        const opponentId =
          room.playerWhite.socketId === socket.id
            ? room.playerBlack.socketId
            : room.playerWhite.socketId;
        io.to(opponentId).emit("rematch_declined");
      }
    });

    socket.on("decline_rematch", ({ roomId }) => {
      const room = roomManager.getRoom(roomId);
      if (room) {
        const opponentId =
          room.playerWhite.socketId === socket.id
            ? room.playerBlack.socketId
            : room.playerWhite.socketId;
        io.to(opponentId).emit("rematch_declined");
      }
    });

    socket.on("accept_rematch", ({ roomId }) => {
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const isWhite = room.playerWhite.socketId === socket.id;
      const player = isWhite ? room.playerWhite : room.playerBlack;
      if (player.isBot) return;

      const newRoom = roomManager.createRematchRoom(roomId);
      if (newRoom) {
        const opponentSocket = io.sockets.sockets.get(
          newRoom.playerBlack.socketId,
        );
        const currentSocket = io.sockets.sockets.get(
          newRoom.playerWhite.socketId,
        );

        if (currentSocket && opponentSocket) {
          setupRoomSocketsAndStart(io, currentSocket, newRoom);

          io.to(newRoom.roomId).emit("game_started", {
            roomId: newRoom.roomId,
            white: {
              id: newRoom.playerWhite.socketId,
              nick: newRoom.playerWhite.nick,
              time: newRoom.whiteTime,
              isBot: newRoom.playerWhite.isBot || false,
            },
            black: {
              id: newRoom.playerBlack.socketId,
              nick: newRoom.playerBlack.nick,
              time: newRoom.blackTime,
              isBot: newRoom.playerBlack.isBot || false,
            },
            fen: newRoom.chessInstance.fen(),
            initialTime: newRoom.initialTimeAllocated,
          });

          startRoomTimer(io, newRoom);
        } else {
          roomManager.removeRoom(newRoom.roomId);
          console.error(`❌ Error: No se encontraron sockets para la revancha`);
        }
      }
    });

    // --- 🔄 RECONEXIÓN (con ELO dinámico para recrear bots) ---
    socket.on(
      "reconnect_to_room",
      async ({ roomId, nick }: { roomId: string; nick: string }) => {
        console.log(
          `🔄 Solicitud de reconexión a sala ${roomId} de ${socket.id} con nick ${nick}`,
        );

        const room = roomManager.getRoom(roomId);
        if (!room) {
          console.log(`❌ Sala ${roomId} no encontrada para reconexión`);
          socket.emit("reconnect_failed", {
            message: "La sala ya no existe. La partida ha terminado.",
          });
          return;
        }

        const isWhite = room.playerWhite.nick === nick;
        const isBlack = room.playerBlack.nick === nick;

        if (!isWhite && !isBlack) {
          console.log(`❌ Nick ${nick} no pertenece a la sala ${roomId}`);
          socket.emit("reconnect_failed", {
            message: "No perteneces a esta sala.",
          });
          return;
        }

        if (room.gameEnded || room.isProcessingEnd) {
          console.log(`❌ Partida en sala ${roomId} ya terminó`);
          socket.emit("reconnect_failed", {
            message: "La partida ya ha terminado.",
          });
          return;
        }

        socket.join(roomId);

        if (room.isPaused && room.playerDisconnected?.nick === nick) {
          console.log(
            `🔄 Jugador ${nick} estaba desconectado, reconectando...`,
          );

          const success = roomManager.setPlayerReconnected(
            roomId,
            socket.id,
            nick,
          );
          if (!success) {
            console.log(`❌ Error al reconectar a ${nick}`);
            socket.emit("reconnect_failed", {
              message: "Error al reconectar. La partida ha terminado.",
            });
            return;
          }

          // ✅ Obtener ELO del jugador que reconecta (para calcular dificultad del bot)
          let playerElo = 1200;
          try {
            const stats = await EloService.getPlayerStats(nick);
            if (stats && stats.elo) {
              playerElo = stats.elo;
            }
          } catch (error) {
            console.warn(`⚠️ No se pudo obtener ELO para ${nick}, usando 1200`);
          }

          const opponentColor = isWhite ? "b" : "w";
          const opponentPlayer = isWhite ? room.playerBlack : room.playerWhite;

          // ✅ Si el oponente es un bot y no está activo, recrearlo con dificultad calculada
          if (opponentPlayer && opponentPlayer.isBot) {
            const botExists = botService.getBotInfo(opponentPlayer.socketId);
            if (!botExists) {
              console.log(
                `🤖 Recreando bot ${opponentPlayer.nick} para sala ${roomId}`,
              );

              // 🔥 CALCULAR DIFICULTAD SEGÚN ELO DEL HUMANO
              const difficulty = botService.getDifficultyByElo(playerElo);
              const botElo = botService.getRandomEloByDifficulty(difficulty);

              botService.addBot({
                id: opponentPlayer.socketId,
                nick: opponentPlayer.nick,
                elo: botElo,
                color: opponentColor as "w" | "b",
                socketId: opponentPlayer.socketId,
                roomId: roomId,
                difficulty: difficulty,
              });

              console.log(
                `✅ Bot ${opponentPlayer.nick} recreado (dificultad: ${difficulty}) en sala ${roomId}`,
              );
            }
          }

          // Notificar al oponente
          const opponentSocketId = isWhite
            ? room.playerBlack.socketId
            : room.playerWhite.socketId;
          io.to(opponentSocketId).emit("player_reconnected", {
            message: `¡${nick} ha reconectado!`,
          });

          startRoomTimer(io, room);

          socket.emit("game_state_sync", {
            fen: room.chessInstance.fen(),
            whiteTime: room.whiteTime,
            blackTime: room.blackTime,
            turn: room.chessInstance.turn(),
            moveCount: room.moveCount,
            myColor: isWhite ? "w" : "b",
          });

          io.to(roomId).emit("game_resumed", {
            message: "La partida se reanuda.",
          });

          console.log(`✅ Jugador ${nick} reconectado a sala ${roomId}`);
          socket.emit("reconnect_success", {
            fen: room.chessInstance.fen(),
            whiteTime: room.whiteTime,
            blackTime: room.blackTime,
            turn: room.chessInstance.turn(),
            moveCount: room.moveCount,
            myColor: isWhite ? "w" : "b",
          });
        } else {
          // Si la partida no está pausada, solo unir
          console.log(`✅ Socket ${socket.id} unido a sala ${roomId}`);
          socket.emit("reconnect_success", {
            fen: room.chessInstance.fen(),
            whiteTime: room.whiteTime,
            blackTime: room.blackTime,
            turn: room.chessInstance.turn(),
            moveCount: room.moveCount,
            myColor: isWhite ? "w" : "b",
          });
        }
      },
    );

    // --- ✅ CONFIRMACIÓN DE INICIO DE JUEGO ---
    socket.on("game_start_confirmed", ({ roomId }: { roomId: string }) => {
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      console.log(`✅ Juego confirmado para sala ${roomId} por ${socket.id}`);
    });

    // ✅ Escuchar cuando un bot debe moverse
    socket.on(
      "bot_move_request",
      ({ roomId, color }: { roomId: string; color: "w" | "b" }) => {
        botService.botMakeMove(roomId, color);
      },
    );

    // --- 📡 REGISTRAR HANDLERS DEL JUEGO ---
    registerGameHandlers(io, socket, roomManager, botService);

    // --- 🔌 DESCONEXIÓN ---
    socket.on("disconnect", async () => {
      console.log(`👋 Usuario desconectado: ${socket.id}`);

      roomManager.removeFromQueue(socket.id);

      const activeRoom = roomManager.getRoomByPlayerId(socket.id);
      if (!activeRoom || activeRoom.isProcessingEnd || activeRoom.gameEnded) {
        return;
      }

      console.log(
        `⏸️ Partida en sala ${activeRoom.roomId} pausada por desconexión`,
      );

      roomManager.clearRoomTimers(activeRoom);
      activeRoom.isPaused = true;

      const isWhite = activeRoom.playerWhite.socketId === socket.id;
      const disconnectedNick = isWhite
        ? activeRoom.playerWhite.nick
        : activeRoom.playerBlack.nick;

      activeRoom.playerDisconnected = {
        socketId: socket.id,
        nick: disconnectedNick,
        disconnectedAt: Date.now(),
      };

      const opponentId = isWhite
        ? activeRoom.playerBlack.socketId
        : activeRoom.playerWhite.socketId;
      io.to(opponentId).emit("player_disconnected", {
        message: `Tu oponente (${disconnectedNick}) se ha desconectado. Esperando reconexión...`,
        waitingTime: TIME_CONSTANTS.RECONNECTION_TIMEOUT,
      });

      const reconnectionTimer = setTimeout(async () => {
        const currentRoom = roomManager.getRoom(activeRoom.roomId);
        if (!currentRoom || !currentRoom.playerDisconnected) {
          return;
        }

        console.log(
          `⏰ Tiempo de espera agotado en sala ${currentRoom.roomId}`,
        );

        const disconnectedColor = isWhite ? "w" : "b";
        const winnerResult =
          disconnectedColor === "w" ? "black_win" : "white_win";

        currentRoom.isProcessingEnd = true;
        currentRoom.gameEnded = true;
        roomManager.clearRoomTimers(currentRoom);

        try {
          const { whiteEloChange, blackEloChange } =
            await EloService.processMatchEnd({
              roomId: currentRoom.roomId,
              whiteSocketId: currentRoom.playerWhite.socketId,
              blackSocketId: currentRoom.playerBlack.socketId,
              whiteNick: currentRoom.playerWhite.nick,
              blackNick: currentRoom.playerBlack.nick,
              result: winnerResult,
              reason: "surrender",
            });

          const winnerNick = isWhite
            ? currentRoom.playerBlack.nick
            : currentRoom.playerWhite.nick;
          const loserNick = isWhite
            ? currentRoom.playerWhite.nick
            : currentRoom.playerBlack.nick;

          io.to(currentRoom.roomId).emit("game_over", {
            reason: "surrender",
            loserSocketId: socket.id,
            message: `${loserNick} no reconectó a tiempo.`,
            whiteEloChange,
            blackEloChange,
            winnerMessage: `🏆 ¡Victoria! ${winnerNick} gana por abandono.`,
            loserMessage: `💀 Derrota: ${loserNick} pierde por no reconectar.`,
          });
        } catch (error) {
          console.error("❌ Error al procesar abandono:", error);
        } finally {
          roomManager.removeRoom(currentRoom.roomId, botService);
        }
      }, TIME_CONSTANTS.RECONNECTION_TIMEOUT * 1000);

      activeRoom._reconnectionTimer = reconnectionTimer;
    });
  });
};

// ⚡ FUNCIÓN AUXILIAR: Configurar sala y unir sockets
const setupRoomSocketsAndStart = (
  io: Server,
  currentSocket: Socket,
  room: GameRoom,
) => {
  currentSocket.join(room.roomId);

  const opponentId =
    room.playerWhite.socketId === currentSocket.id
      ? room.playerBlack.socketId
      : room.playerWhite.socketId;
  const opponentSocket = io.sockets.sockets.get(opponentId);
  if (opponentSocket) {
    opponentSocket.join(room.roomId);
  }

  io.to(room.roomId).emit("game_started", {
    roomId: room.roomId,
    white: {
      id: room.playerWhite.socketId,
      nick: room.playerWhite.nick,
      time: room.whiteTime,
      isBot: room.playerWhite.isBot || false,
    },
    black: {
      id: room.playerBlack.socketId,
      nick: room.playerBlack.nick,
      time: room.blackTime,
      isBot: room.playerBlack.isBot || false,
    },
    fen: room.chessInstance.fen(),
    initialTime: room.initialTimeAllocated,
  });

  startRoomTimer(io, room);
};

// ⏱️ MOTOR DEL RELOJ
const startRoomTimer = (io: Server, room: GameRoom) => {
  room.timerInterval = setInterval(async () => {
    if (!room.gameStarted || room.isProcessingEnd || room.gameEnded) {
      if (room.gameEnded && room.timerInterval) {
        clearInterval(room.timerInterval);
        room.timerInterval = undefined;
      }
      return;
    }
    const turn = room.chessInstance.turn();

    if (turn === "w") {
      if (room.whiteTime > 0) {
        room.whiteTime--;
      }
    } else {
      if (room.blackTime > 0) {
        room.blackTime--;
      }
    }

    room.moveInactivitySeconds++;

    if (room.moveInactivitySeconds >= TIME_CONSTANTS.INACTIVITY_KICK_SECONDS) {
      roomManager.clearRoomTimers(room);
      room.isProcessingEnd = true;
      room.gameEnded = true;

      const loserSocketId =
        turn === "w" ? room.playerWhite.socketId : room.playerBlack.socketId;
      const winnerResult = turn === "w" ? "black_win" : "white_win";

      console.log(
        `⏱️ Inactividad extrema (${TIME_CONSTANTS.INACTIVITY_KICK_SECONDS}s) en sala ${room.roomId}`,
      );

      try {
        const eloResult = await EloService.processMatchEnd({
          roomId: room.roomId,
          whiteSocketId: room.playerWhite.socketId,
          blackSocketId: room.playerBlack.socketId,
          whiteNick: room.playerWhite.nick,
          blackNick: room.playerBlack.nick,
          result: winnerResult,
          reason: "inactivity_kick",
        });

        io.to(room.roomId).emit("game_over", {
          reason: "inactivity_kick",
          loserSocketId,
          message:
            turn === "w"
              ? "Blancas descalificadas por inactividad (4 min)."
              : "Negras descalificadas por inactividad (4 min).",
          whiteEloChange: eloResult.whiteEloChange,
          blackEloChange: eloResult.blackEloChange,
          players: [
            {
              nick: eloResult.whiteNick,
              newElo: eloResult.whiteNewElo,
              eloChange: eloResult.whiteEloChange,
            },
            {
              nick: eloResult.blackNick,
              newElo: eloResult.blackNewElo,
              eloChange: eloResult.blackEloChange,
            },
          ],
        });
      } catch (err) {
        console.error("❌ Error en inactividad extrema:", err);
      } finally {
        roomManager.removeRoom(room.roomId);
      }
      return;
    }

    if (room.whiteTime <= 0 || room.blackTime <= 0) {
      roomManager.clearRoomTimers(room);
      room.isProcessingEnd = true;
      room.gameEnded = true;

      if (room.whiteTime < 0) room.whiteTime = 0;
      if (room.blackTime < 0) room.blackTime = 0;

      const winnerResult = room.whiteTime === 0 ? "black_win" : "white_win";
      const loserColor = room.whiteTime === 0 ? "w" : "b";

      console.log(`⏱️ Time-out en sala ${room.roomId}: ${loserColor} perdió`);

      try {
        const eloResult = await EloService.processMatchEnd({
          roomId: room.roomId,
          whiteSocketId: room.playerWhite.socketId,
          blackSocketId: room.playerBlack.socketId,
          whiteNick: room.playerWhite.nick,
          blackNick: room.playerBlack.nick,
          result: winnerResult,
          reason: "timeout",
        });

        io.to(room.roomId).emit("game_over", {
          reason: "timeout",
          message:
            room.whiteTime === 0
              ? "⏱️ Las Blancas perdieron por tiempo."
              : "⏱️ Las Negras perdieron por tiempo.",
          whiteEloChange: eloResult.whiteEloChange,
          blackEloChange: eloResult.blackEloChange,
          players: [
            {
              nick: eloResult.whiteNick,
              newElo: eloResult.whiteNewElo,
              eloChange: eloResult.whiteEloChange,
            },
            {
              nick: eloResult.blackNick,
              newElo: eloResult.blackNewElo,
              eloChange: eloResult.blackEloChange,
            },
          ],
        });
      } catch (err) {
        console.error("❌ Error en time-out:", err);
      } finally {
        roomManager.removeRoom(room.roomId);
      }
      return;
    }

    io.to(room.roomId).emit("clock_update", {
      whiteTime: room.whiteTime,
      blackTime: room.blackTime,
    });
  }, 1000);
};
