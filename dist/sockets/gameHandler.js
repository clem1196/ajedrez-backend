"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGameHandlers = void 0;
const registerGameHandlers = (io, socket, roomManager) => {
    // Escuchar cuando un jugador arrastra una pieza y la suelta en el tablero
    socket.on('make_move', ({ roomId, move }) => {
        // Buscamos la sala activa en el administrador de salas
        const room = roomManager.getRoom(roomId);
        if (!room) {
            console.log(`⚠️ Intento de movimiento en una sala inexistente o destruida: ${roomId}`);
            return;
        }
        if (room.initialMoveTimer) {
            console.log("🟢 Primer movimiento detectado. Cancelando temporizador de cortesía inicial.");
            clearTimeout(room.initialMoveTimer); // 🛑 Detiene el reloj para siempre
            delete room.initialMoveTimer; // Borra la propiedad de la sala
        }
        try {
            // 💡 Validamos y aplicamos el movimiento en el motor interno del servidor (chessInstance)
            const result = room.chessInstance.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion || 'q' // Por defecto promociona a Reina si llega al final
            });
            // Si el movimiento es válido según las reglas del ajedrez
            if (result) {
                console.log(`🎲 Movimiento válido en sala [${roomId}]: ${move.from} -> ${move.to}`);
                room.moveInactivitySeconds = 0;
                room.moveCount++;
                if (!room.gameStarted) {
                    room.gameStarted = true;
                    console.log(`⏱️ ¡Primer movimiento detectado! Los relojes de la sala [${roomId}] han comenzado.`);
                }
                // Retransmitimos la jugada oficial y el nuevo FEN a TODA la sala
                io.to(roomId).emit('move_made', {
                    move: result,
                    fen: room.chessInstance.fen(),
                    turn: room.chessInstance.turn() // Le indica al frontend el siguiente turno ('w' o 'b')
                });
                // 👑 REGLA DE JAQUE MATE AUTOMÁTICO
                if (room.chessInstance.isCheckmate()) {
                    if (room.timerInterval)
                        clearInterval(room.timerInterval); // Frenar el reloj en seco
                    const losingColor = room.chessInstance.turn(); // El color al que le toca mover y está en mate
                    const loserSocketId = losingColor === 'w' ? room.playerWhite.socketId : room.playerBlack.socketId;
                    io.to(roomId).emit('game_over', {
                        reason: 'checkmate',
                        loserSocketId,
                        message: '¡Jaque Mate!'
                    });
                }
            }
            else {
                console.log(`🚫 Movimiento ilegal intentado en sala [${roomId}]: ${move.from} -> ${move.to}`);
                // Si fue un error visual, le regresamos el FEN real al cliente para corregir su pantalla
                socket.emit('illegal_move', { fen: room.chessInstance.fen() });
            }
        }
        catch (e) {
            console.error("❌ Error crítico procesando el movimiento de ajedrez:", e);
            socket.emit('illegal_move', { fen: room.chessInstance.fen() });
        }
    });
    // 1. ESCUCHA DE ABANDONO
    socket.on('surrender', ({ roomId }) => {
        const room = roomManager.getRoom(roomId);
        if (!room)
            return;
        console.log(`🏳️ El jugador ${socket.id} ha abandonado en la sala: ${roomId}`);
        if (room.timerInterval) {
            clearInterval(room.timerInterval);
            console.log(`⏱️ Reloj limpiado por abandono en sala: ${roomId}`);
        }
        // Notificamos a la sala quién perdió por abandono
        io.to(roomId).emit('game_over', {
            reason: 'surrender',
            loserSocketId: socket.id,
            message: 'Partida finalizada por abandono.'
        });
        //roomManager.removeRoom(roomId);
    });
    // 2. ESCUCHA DE OFRECER TABLAS
    socket.on('offer_draw', ({ roomId }) => {
        const room = roomManager.getRoom(roomId);
        if (!room)
            return;
        console.log(`🤝 Propuesta de tablas de ${socket.id} en la sala: ${roomId}`);
        // Le enviamos la propuesta EN EXCLUSIVA al oponente (no a la sala completa)
        socket.to(roomId).emit('draw_offered');
    });
    // 3. ESCUCHA DE ACEPTAR TABLAS
    socket.on('accept_draw', ({ roomId }) => {
        const room = roomManager.getRoom(roomId);
        if (!room)
            return;
        console.log(`✅ Tablas aceptadas en la sala: ${roomId}`);
        if (room.timerInterval) {
            clearInterval(room.timerInterval);
            console.log(`⏱️ Reloj limpiado por tablas aceptadas en sala: ${roomId}`);
        }
        io.to(roomId).emit('game_over', {
            reason: 'draw',
            message: 'La partida ha terminado en tablas por mutuo acuerdo.'
        });
        //roomManager.removeRoom(roomId);
    });
    socket.on('abort_game', ({ roomId }) => {
        const room = roomManager.getRoom(roomId);
        if (!room)
            return;
        // 🛡️ REGLA: Solo se puede abortar si el total de movimientos es 0 o 1
        if (room.moveCount <= 1) {
            if (room.timerInterval)
                clearInterval(room.timerInterval);
            // Emitimos un fin de juego especial por aborto
            io.to(roomId).emit('game_over', {
                reason: 'aborted',
                message: 'Partida abortada de mutuo acuerdo o falta de acción. No hay cambios en el puntaje.'
            });
            //roomManager.removeRoom(roomId);
            console.log(`🧼 Sala ${roomId} abortada limpiamente.`);
        }
    });
};
exports.registerGameHandlers = registerGameHandlers;
