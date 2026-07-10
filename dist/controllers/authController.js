"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dataSource_1 = require("../config/dataSource");
const User_1 = require("../entities/User");
const UserStats_1 = require("../entities/UserStats");
const userRepository = dataSource_1.AppDataSource.getRepository(User_1.User);
const register = async (req, res) => {
    try {
        const { nick, email, password } = req.body;
        // 1. Validaciones básicas de campos vacíos
        if (!nick || !email || !password) {
            res.status(400).json({ message: 'Todos los campos son obligatorios.' });
            return;
        }
        // 2. Verificar si el nick o el email ya existen en la BD
        const existingNick = await userRepository.findOne({ where: { nick } });
        if (existingNick) {
            res.status(400).json({ message: 'El nombre de usuario (Nick) ya está en uso.' });
            return;
        }
        const existingEmail = await userRepository.findOne({ where: { email } });
        if (existingEmail) {
            res.status(400).json({ message: 'El correo electrónico ya está registrado.' });
            return;
        }
        // 3. Cifrar la contraseña (Salt de 10 rondas para optimizar velocidad y seguridad)
        const salt = await bcrypt_1.default.genSalt(10);
        const hashedPassword = await bcrypt_1.default.hash(password, salt);
        // 4. Crear la entidad de Usuario
        const newUser = new User_1.User();
        newUser.nick = nick;
        newUser.email = email;
        newUser.password = hashedPassword;
        // 5. Crear la entidad de Estadísticas e inicializar el ELO en 1200
        const newStats = new UserStats_1.UserStats();
        newStats.elo = 1200;
        newStats.wins = 0;
        newStats.losses = 0;
        newStats.draws = 0;
        // Vinculamos las estadísticas al usuario (TypeORM se encarga del cascade al guardar)
        newUser.stats = newStats;
        // 6. Guardar en la Base de Datos
        await userRepository.save(newUser);
        res.status(201).json({
            status: 'success',
            message: 'Usuario registrado exitosamente con 1200 de Elo base.',
        });
    }
    catch (error) {
        console.error('❌ Error en el registro de usuario:', error);
        res.status(500).json({ message: 'Error interno del servidor al registrar usuario.' });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        // 1. Validaciones básicas
        if (!email || !password) {
            res.status(400).json({ message: 'Email y contraseña son requeridos.' });
            return;
        }
        // 2. Buscar al usuario por email trayendo también sus estadísticas vinculadas
        const user = await userRepository.findOne({
            where: { email },
            relations: ['stats'], // Trae los datos de user_stats en la misma consulta
        });
        if (!user) {
            res.status(400).json({ message: 'Credenciales inválidas (Email o contraseña incorrectos).' });
            return;
        }
        // 3. Comprobar si la contraseña coincide con el hash almacenado
        const isMatch = await bcrypt_1.default.compare(password, user.password);
        if (!isMatch) {
            res.status(400).json({ message: 'Credenciales inválidas (Email o contraseña incorrectos).' });
            return;
        }
        // 4. Generar el JWT Token firmado para la sesión (Expira en 7 días, ideal para PWAs móviles)
        const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key';
        const token = jsonwebtoken_1.default.sign({ userId: user.id, nick: user.nick, email: user.email }, jwtSecret, { expiresIn: '7d' });
        // 5. Responder con los datos del perfil y el token de acceso
        res.json({
            status: 'success',
            token,
            user: {
                id: user.id,
                nick: user.nick,
                email: user.email,
                elo: user.stats.elo,
                wins: user.stats.wins,
                losses: user.stats.losses,
                draws: user.stats.draws,
            },
        });
    }
    catch (error) {
        console.error('❌ Error en el login de usuario:', error);
        res.status(500).json({ message: 'Error interno del servidor al iniciar sesión.' });
    }
};
exports.login = login;
