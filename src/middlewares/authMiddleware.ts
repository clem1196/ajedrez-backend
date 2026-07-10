// src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ✅ Extendemos la interfaz Request de Express
export interface AuthenticatedRequest extends Request {
  userId?: number;
  userNick?: string;
  userEmail?: string;
  isAdmin?: boolean;
  user?: {
    userId: number;
    nick: string;
    email: string;
    isAdmin?: boolean;
  };
}

// ✅ Constantes de configuración
const AUTH_CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || 'fallback_secret_key',
  TOKEN_EXPIRY: '7d',
} as const;

/**
 * 🔐 Middleware de autenticación JWT
 */
export const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    // 1. Obtener token del header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ 
        message: 'Acceso denegado. No se proporcionó un token de sesión.' 
      });
      return;
    }

    // 2. Verificar formato del token
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ 
        message: 'Formato de token inválido. Debe ser: Bearer <token>' 
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({ 
        message: 'Token vacío o inválido.' 
      });
      return;
    }

    // 3. Verificar y decodificar el token
    try {
      const decoded = jwt.verify(token, AUTH_CONFIG.JWT_SECRET) as { 
        userId: number; 
        nick: string; 
        email: string;
        elo?: number;
        isAdmin?: boolean;
      };
      
      // ✅ Inyectar datos en la request (múltiples formatos para compatibilidad)
      req.user = {
        userId: decoded.userId,
        nick: decoded.nick,
        email: decoded.email,
      };
      req.userId = decoded.userId;
      req.userNick = decoded.nick;
      req.userEmail = decoded.email;
      req.isAdmin = decoded.isAdmin || false;
      
      next();
    } catch (jwtError) {
      // ✅ Manejar diferentes errores de JWT
      if (jwtError instanceof jwt.TokenExpiredError) {
        res.status(401).json({ 
          message: 'Token expirado. Por favor, inicia sesión nuevamente.' 
        });
        return;
      }
      
      if (jwtError instanceof jwt.JsonWebTokenError) {
        res.status(401).json({ 
          message: 'Token inválido. Verifica tus credenciales.' 
        });
        return;
      }
      
      // Error desconocido
      res.status(401).json({ 
        message: 'Error al verificar el token de autenticación.' 
      });
    }
  } catch (error) {
    console.error('❌ Error en autenticación:', error);
    res.status(500).json({ 
      message: 'Error interno del servidor al verificar autenticación.' 
    });
  }
};

/**
 * 🔐 Middleware de autenticación opcional (no requiere token, pero lo procesa si existe)
 */
export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      try {
        const decoded = jwt.verify(token, AUTH_CONFIG.JWT_SECRET) as { 
          userId: number; 
          nick: string; 
          email: string;
        };
        
        req.user = decoded;
        req.userId = decoded.userId;
        req.userNick = decoded.nick;
        req.userEmail = decoded.email;
      } catch (error) {
        // ✅ Si el token es inválido, simplemente ignoramos la autenticación
        console.log('⚠️ Token inválido en optionalAuth, continuando como invitado');
      }
    }
    
    next();
  } catch (error) {
    console.error('❌ Error en optionalAuth:', error);
    next();
  }
};

/**
 * 🔐 Middleware para verificar que el usuario está autenticado y es el mismo que solicita la acción
 */
export const verifyOwnership = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const userId = req.userId;

  if (!userId) {
    res.status(401).json({ 
      message: 'No autenticado.' 
    });
    return;
  }

  // ✅ CORREGIDO: Obtener targetUserId de forma segura
  let targetUserId: number | undefined;

  // Intentar obtener de params.userId
  if (req.params.userId) {
    const paramValue = req.params.userId;
    // Si es string, parsear; si es array, tomar el primero
    const paramStr = Array.isArray(paramValue) ? paramValue[0] : paramValue;
    const parsed = parseInt(paramStr);
    if (!isNaN(parsed)) {
      targetUserId = parsed;
    }
  }

  // Si no se encontró en params, intentar de body.userId
  if (!targetUserId && req.body.userId) {
    const bodyValue = req.body.userId;
    const bodyStr = typeof bodyValue === 'string' ? bodyValue : String(bodyValue);
    const parsed = parseInt(bodyStr);
    if (!isNaN(parsed)) {
      targetUserId = parsed;
    }
  }

  // Si hay un targetUserId, verificar que coincida con el userId autenticado
  if (targetUserId && userId !== targetUserId) {
    res.status(403).json({ 
      message: 'No tienes permiso para realizar esta acción.' 
    });
    return;
  }

  next();
};

/**
 * ✅ Middleware para verificar que el usuario tiene un Elo mínimo
 */
export const requireMinElo = (minElo: number) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // ✅ Asumiendo que el Elo viene en el token o se obtiene de la BD
    // Esta es una implementación simplificada
    const userElo = (req.user as any)?.elo || 1200;

    if (userElo < minElo) {
      res.status(403).json({ 
        message: `Se requiere un Elo mínimo de ${minElo} para esta acción.` 
      });
      return;
    }

    next();
  };
};
/* ✅ Función auxiliar para extraer ID de forma segura
 */
export const extractUserId = (param: string | string[] | undefined): number | undefined => {
  if (!param) return undefined;
  
  const paramStr = Array.isArray(param) ? param[0] : param;
  const parsed = parseInt(paramStr);
  
  return isNaN(parsed) ? undefined : parsed;
};

/**
 * ✅ Función auxiliar para obtener el ID del usuario autenticado
 */
export const getAuthenticatedUserId = (req: AuthenticatedRequest): number | undefined => {
  return req.userId || req.user?.userId;
};