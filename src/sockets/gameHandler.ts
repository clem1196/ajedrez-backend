// src/sockets/gameHandler.ts
import { Server, Socket } from "socket.io";
import { RoomManager, TIME_CONSTANTS } from "./roomManager";
import { EloService } from "../services/eloService";
import { BotService } from "../services/botService";

export const registerGameHandlers = (
  io: Server,
  socket: Socket,
  roomManager: RoomManager,
  botService: BotService,
) => {
  // --- 💬 CHAT ---
  socket.on(
    "send_message",
    ({ roomId, text }: { roomId: string; text: string }) => {
      const room = roomManager.getRoom(roomId);
      if (!room) return;

      const cleanText = text.trim();
      if (!cleanText || cleanText.length > 200) return;

      const isWhite = room.playerWhite.socketId === socket.id;
      const senderNick = isWhite
        ? room.playerWhite.nick
        : room.playerBlack.nick;

      io.to(roomId).emit("receive_message", {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        sender: senderNick,
        text: cleanText,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    },
  );

  // --- 🎯 MOVIMIENTOS ---

  socket.on(
    "make_move",
    async ({
      roomId,
      move,
    }: {
      roomId: string;
      move: { from: string; to: string; promotion?: string };
    }) => {
      const room = roomManager.getRoom(roomId);
      if (!room) {
        console.warn(`⚠️ Sala ${roomId} no encontrada para movimiento`);
        return;
      }

      if (room.gameEnded || room.isProcessingEnd) {
        console.warn(`⚠️ Partida ya terminada, ignorando movimiento`);
        return;
      }

      const currentTurn = room.chessInstance.turn();
      const expectedSocketId =
        currentTurn === "w"
          ? room.playerWhite.socketId
          : room.playerBlack.socketId;

      if (socket.id !== expectedSocketId) {
        console.warn(
          `⚠️ Movimiento ilegal: ${socket.id} no es el turno de ${currentTurn}`,
        );
        socket.emit("illegal_move", { fen: room.chessInstance.fen() });
        return;
      }

      try {
        const cleanFrom = move.from.trim().toLowerCase();
        const cleanTo = move.to.trim().toLowerCase();
        const cleanPromotion = (move.promotion || "q").trim().toLowerCase();

        const result = room.chessInstance.move({
          from: cleanFrom,
          to: cleanTo,
          promotion: cleanPromotion,
        });

        if (result) {
          console.log(
            `✅ Movimiento válido: ${cleanFrom} -> ${cleanTo} (${currentTurn === "w" ? "Blancas" : "Negras"})`,
          );

          // ✅ LIMPIAR TODOS LOS TIMERS DE AFK
          if (room.turnTimer) {
            clearTimeout(room.turnTimer);
            room.turnTimer = undefined;
          }
          if (room.afkAutoWinTimer) {
            clearTimeout(room.afkAutoWinTimer);
            room.afkAutoWinTimer = undefined;
          }
          if (room.afkCountdownInterval) {
            clearInterval(room.afkCountdownInterval);
            room.afkCountdownInterval = undefined;
          }
          room.afkCountdownStarted = false;

          // ✅ LIMPIAR ESTADO AFK EN AMBOS JUGADORES
          io.to(roomId).emit("afk_cleared");

          // ⏱️ CONTROL DE INICIO
          if (!room.gameStarted) {
            room.gameStarted = true;
            if (room.initialMoveTimer) {
              clearTimeout(room.initialMoveTimer);
              room.initialMoveTimer = undefined;
              console.log(`🏁 Primer movimiento! Cortesía cancelada.`);
            }
          }

          room.moveInactivitySeconds = 0;
          room.moveCount++;
          room.lastMoveTimestamp = Date.now();

          // ⏱️ EMITIR MOVIMIENTO
          io.to(roomId).emit("move_made", {
            move: result,
            fen: room.chessInstance.fen(),
            turn: room.chessInstance.turn(),
            whiteTime: room.whiteTime,
            blackTime: room.blackTime,
          });

          // ✅ OBTENER EL SIGUIENTE TURNO
          const nextTurnColor = room.chessInstance.turn();
          const nextPlayer =
            nextTurnColor === "w" ? room.playerWhite : room.playerBlack;

          // ✅ VERIFICAR JAQUE MATE (ANTES DE CUALQUIER OTRA COSA)
          if (room.chessInstance.isCheckmate()) {
            console.log(
              `♟️ ¡JAQUE MATE! El jugador ${nextTurnColor === "w" ? "Blancas" : "Negras"} ha perdido.`,
            );

            roomManager.clearRoomTimers(room);
            room.isProcessingEnd = true;
            room.gameEnded = true;

            const winnerResult =
              nextTurnColor === "w" ? "black_win" : "white_win";
            const loserSocketId =
              nextTurnColor === "w"
                ? room.playerWhite.socketId
                : room.playerBlack.socketId;

            const winnerNick =
              nextTurnColor === "w"
                ? room.playerBlack.nick
                : room.playerWhite.nick;
            const loserNick =
              nextTurnColor === "w"
                ? room.playerWhite.nick
                : room.playerBlack.nick;

            try {
              const { whiteEloChange, blackEloChange } =
                await EloService.processMatchEnd({
                  roomId: room.roomId,
                  whiteSocketId: room.playerWhite.socketId,
                  blackSocketId: room.playerBlack.socketId,
                  whiteNick: room.playerWhite.nick,
                  blackNick: room.playerBlack.nick,
                  result: winnerResult,
                  reason: "checkmate",
                });

              io.to(roomId).emit("game_over", {
                reason: "checkmate",
                loserSocketId,
                message: `♟️ ¡Jaque Mate! ${winnerNick} gana la partida.`,
                whiteEloChange,
                blackEloChange,
                winnerMessage: `🏆 ¡Victoria! ${winnerNick} gana por jaque mate.`,
                loserMessage: `💀 Derrota: ${loserNick} pierde por jaque mate.`,
              });

              console.log(
                `✅ Jaque mate detectado y procesado para sala ${roomId}`,
              );
            } catch (err) {
              console.error("❌ Error en jaque mate:", err);
            } finally {
              setTimeout(() => {
                if (roomManager.getRoom(roomId)) {
                  roomManager.removeRoom(roomId);
                }
              }, 60 * 1000);
            }

            // ✅ SALIR PARA NO CONTINUAR CON EL TIMER AFK
            return;
          }

          // ✅ VERIFICAR AHOGADO (STALEMATE)
          if (room.chessInstance.isStalemate()) {
            console.log(`♟️ ¡AHOGADO! La partida termina en tablas.`);

            roomManager.clearRoomTimers(room);
            room.isProcessingEnd = true;
            room.gameEnded = true;

            try {
              const { whiteEloChange, blackEloChange } =
                await EloService.processMatchEnd({
                  roomId: room.roomId,
                  whiteSocketId: room.playerWhite.socketId,
                  blackSocketId: room.playerBlack.socketId,
                  whiteNick: room.playerWhite.nick,
                  blackNick: room.playerBlack.nick,
                  result: "draw",
                  reason: "stalemate",
                });

              io.to(roomId).emit("game_over", {
                reason: "draw",
                message: "♟️ ¡Ahogado! La partida termina en tablas.",
                whiteEloChange,
                blackEloChange,
              });

              console.log(
                `✅ Ahogado detectado y procesado para sala ${roomId}`,
              );
            } catch (err) {
              console.error("❌ Error en ahogado:", err);
            } finally {
              setTimeout(() => {
                if (roomManager.getRoom(roomId)) {
                  roomManager.removeRoom(roomId);
                }
              }, 60 * 1000);
            }

            return;
          }

          // ✅ SI EL SIGUIENTE JUGADOR ES UN BOT, HACER QUE MUEVA
          if (nextPlayer && nextPlayer.isBot) {
            console.log(
              `🤖 El oponente ${nextPlayer.nick} es un bot, programando su movimiento...`,
            );

            setTimeout(() => {
              const currentRoom = roomManager.getRoom(roomId);
              if (
                !currentRoom ||
                currentRoom.gameEnded ||
                currentRoom.isProcessingEnd
              ) {
                console.log(
                  `⏭️ Partida ${roomId} ya no está activa, bot no mueve`,
                );
                return;
              }

              if (currentRoom.chessInstance.turn() !== nextTurnColor) {
                console.log(`⏭️ Ya no es turno del bot en sala ${roomId}`);
                return;
              }

              console.log(`🤖 Haciendo que el bot ${nextPlayer.nick} mueva...`);
              botService.botMakeMove(roomId, nextTurnColor);
            }, 1500);

            // ✅ SALIR PARA NO INICIAR TIMER AFK (los bots no necesitan AFK)
            return;
          }

          // ✅ INICIAR TIMER AFK PARA EL NUEVO TURNO (SOLO SI ES HUMANO)
          console.log(
            `⏱️ Iniciando timer AFK para ${nextPlayer?.nick || "desconocido"} (${nextTurnColor})`,
          );

          room.turnTimer = setTimeout(() => {
            // Verificar que la partida siga activa
            const currentRoom = roomManager.getRoom(roomId);
            if (
              !currentRoom ||
              currentRoom.gameEnded ||
              currentRoom.isProcessingEnd
            ) {
              return;
            }

            // Verificar que el turno no haya cambiado
            const currentTurnNow = currentRoom.chessInstance.turn();
            if (currentTurnNow !== nextTurnColor) {
              console.log(
                `✅ El jugador ${nextTurnColor} movió. Cancelando AFK.`,
              );
              return;
            }

            // ✅ Verificar que el countdown no se haya iniciado ya
            if (currentRoom.afkCountdownStarted) {
              console.log(`⏭️ Countdown AFK ya iniciado para sala ${roomId}`);
              return;
            }

            console.log(
              `🚨 Jugador ${nextTurnColor} AFK (70s sin mover) en sala ${roomId}`,
            );

            // ✅ Marcar que el countdown ha comenzado
            currentRoom.afkCountdownStarted = true;

            const afkPlayerNick =
              nextTurnColor === "w"
                ? currentRoom.playerWhite.nick
                : currentRoom.playerBlack.nick;

            const waitingPlayerSocketId =
              nextTurnColor === "w"
                ? currentRoom.playerBlack.socketId
                : currentRoom.playerWhite.socketId;

            const afkPlayerSocketId =
              nextTurnColor === "w"
                ? currentRoom.playerWhite.socketId
                : currentRoom.playerBlack.socketId;

            // 1. Oponente (el que espera)
            io.to(waitingPlayerSocketId).emit("player_afk", {
              afkPlayerColor: nextTurnColor,
              message: `⏳ ${afkPlayerNick} está inactivo. Esperando...`,
              isYou: false,
            });

            // 2. Jugador AFK (el que debe mover)
            io.to(afkPlayerSocketId).emit("player_afk", {
              afkPlayerColor: nextTurnColor,
              message: `⚠️ ¡Estás demorando! Tienes 20 segundos para mover o perderás.`,
              isYou: true,
              countdownStart: true,
              countdownTime: 20,
            });

            // ⏱️ INICIAR COUNTDOWN DE 20 SEGUNDOS
            let countdown = 20;

            if (currentRoom.afkCountdownInterval) {
              clearInterval(currentRoom.afkCountdownInterval);
              currentRoom.afkCountdownInterval = undefined;
            }

            currentRoom.afkCountdownInterval = setInterval(async () => {
              countdown--;

              const checkRoom = roomManager.getRoom(roomId);
              if (
                !checkRoom ||
                checkRoom.gameEnded ||
                checkRoom.isProcessingEnd
              ) {
                if (currentRoom.afkCountdownInterval) {
                  clearInterval(currentRoom.afkCountdownInterval);
                  currentRoom.afkCountdownInterval = undefined;
                }
                return;
              }

              const currentTurnCheck = checkRoom.chessInstance.turn();
              if (currentTurnCheck !== nextTurnColor) {
                console.log(
                  `✅ El jugador ${nextTurnColor} movió durante el countdown. Cancelando.`,
                );
                if (checkRoom.afkCountdownInterval) {
                  clearInterval(checkRoom.afkCountdownInterval);
                  checkRoom.afkCountdownInterval = undefined;
                }
                checkRoom.afkCountdownStarted = false;
                return;
              }

              if (countdown > 0) {
                io.to(afkPlayerSocketId).emit("afk_countdown_update", {
                  timeRemaining: countdown,
                  message: `⚠️ ¡Estás demorando! Tienes ${countdown} segundos para mover o perderás.`,
                });
              } else {
                if (currentRoom.afkCountdownInterval) {
                  clearInterval(currentRoom.afkCountdownInterval);
                  currentRoom.afkCountdownInterval = undefined;
                }
                currentRoom.afkCountdownStarted = false;

                const finalRoom = roomManager.getRoom(roomId);
                if (
                  !finalRoom ||
                  finalRoom.gameEnded ||
                  finalRoom.isProcessingEnd
                ) {
                  return;
                }

                const finalTurn = finalRoom.chessInstance.turn();
                if (finalTurn !== nextTurnColor) {
                  console.log(
                    `✅ El jugador ${nextTurnColor} movió justo antes del timeout.`,
                  );
                  return;
                }

                console.log(`🏆 Victoria automática por AFK en sala ${roomId}`);

                finalRoom.isProcessingEnd = true;
                finalRoom.gameEnded = true;
                roomManager.clearRoomTimers(finalRoom);

                const winnerResult =
                  nextTurnColor === "w" ? "black_win" : "white_win";
                const winnerNick =
                  nextTurnColor === "w"
                    ? finalRoom.playerBlack.nick
                    : finalRoom.playerWhite.nick;
                const loserNick =
                  nextTurnColor === "w"
                    ? finalRoom.playerWhite.nick
                    : finalRoom.playerBlack.nick;

                try {
                  const { whiteEloChange, blackEloChange } =
                    await EloService.processMatchEnd({
                      roomId: finalRoom.roomId,
                      whiteSocketId: finalRoom.playerWhite.socketId,
                      blackSocketId: finalRoom.playerBlack.socketId,
                      whiteNick: finalRoom.playerWhite.nick,
                      blackNick: finalRoom.playerBlack.nick,
                      result: winnerResult,
                      reason: "abandonment",
                    });

                  io.to(roomId).emit("game_over", {
                    reason: "abandonment",
                    loserSocketId:
                      nextTurnColor === "w"
                        ? finalRoom.playerWhite.socketId
                        : finalRoom.playerBlack.socketId,
                    message: `🏆 Victoria! ${winnerNick} gana por abandono de ${loserNick}.`,
                    whiteEloChange,
                    blackEloChange,
                    winnerMessage: `🏆 Victoria! ${winnerNick} gana por abandono de ${loserNick}.`,
                    loserMessage: `💀 Derrota: ${loserNick} pierde por límite de tiempo de espera.`,
                  });
                } catch (err) {
                  console.error(
                    "❌ Error en victoria automática por AFK:",
                    err,
                  );
                } finally {
                  roomManager.removeRoom(roomId);
                }
              }
            }, 1000);
          }, TIME_CONSTANTS.AFK_SECONDS * 1000); // 70 segundos
        } else {
          console.warn(`❌ Movimiento inválido: ${cleanFrom} -> ${cleanTo}`);
          socket.emit("illegal_move", { fen: room.chessInstance.fen() });
        }
      } catch (e) {
        console.error("❌ Error crítico al procesar movimiento:", e);
        socket.emit("illegal_move", { fen: room.chessInstance.fen() });
      }
    },
  );

  // --- 🏳️ ABANDONO ---
  socket.on("surrender", async ({ roomId }: { roomId: string }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.isProcessingEnd || room.gameEnded) return;

    roomManager.clearRoomTimers(room);
    room.isProcessingEnd = true;
    room.gameEnded = true;

    const IAmWhite = room.playerWhite.socketId === socket.id;
    const winnerResult = IAmWhite ? "black_win" : "white_win";
    const loserNick = IAmWhite ? room.playerWhite.nick : room.playerBlack.nick;

    const { whiteEloChange, blackEloChange } = await EloService.processMatchEnd(
      {
        roomId: room.roomId,
        whiteSocketId: room.playerWhite.socketId,
        blackSocketId: room.playerBlack.socketId,
        whiteNick: room.playerWhite.nick,
        blackNick: room.playerBlack.nick,
        result: winnerResult,
        reason: "surrender",
      },
    );

    io.to(roomId).emit("game_over", {
      reason: "surrender",
      loserSocketId: socket.id,
      message: `El jugador ${loserNick} ha abandonado.`,
      whiteEloChange,
      blackEloChange,
    });

    roomManager.removeRoom(roomId);
  });

  // --- 🤝 TABLAS ---
  socket.on("offer_draw", ({ roomId }: { roomId: string }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    socket.to(roomId).emit("draw_offered");
  });

  socket.on("cancel_draw_offer", ({ roomId }: { roomId: string }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    const opponentId =
      room.playerWhite.socketId === socket.id
        ? room.playerBlack.socketId
        : room.playerWhite.socketId;
    io.to(opponentId).emit("draw_offer_canceled");
  });

  socket.on("accept_draw", async ({ roomId }: { roomId: string }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.isProcessingEnd) return;

    roomManager.clearRoomTimers(room);
    room.isProcessingEnd = true;
    room.gameEnded = true;

    const { whiteEloChange, blackEloChange } = await EloService.processMatchEnd(
      {
        roomId: room.roomId,
        whiteSocketId: room.playerWhite.socketId,
        blackSocketId: room.playerBlack.socketId,
        whiteNick: room.playerWhite.nick,
        blackNick: room.playerBlack.nick,
        result: "draw",
        reason: "draw",
      },
    );

    io.to(roomId).emit("game_over", {
      reason: "draw",
      message: "Tablas por mutuo acuerdo.",
      whiteEloChange,
      blackEloChange,
    });

    roomManager.removeRoom(roomId);
  });

  // --- ⏱️ ABORTAR MANUAL ---
  socket.on("abort_game", ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    if (room.moveCount <= 1 && !room.gameStarted) {
      roomManager.clearRoomTimers(room);

      io.to(roomId).emit("game_over", {
        reason: "aborted",
        message: "Partida abortada. Sin cambios en Elo.",
        whiteEloChange: 0,
        blackEloChange: 0,
      });

      roomManager.removeRoom(roomId);
      console.log(`🧹 Sala ${roomId} abortada manualmente.`);
    }
  });
};
