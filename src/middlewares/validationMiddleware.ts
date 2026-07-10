// src/middlewares/validationMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { extractId } from '../utils/paramUtil';

// ✅ Constantes de validación
const VALIDATION_RULES = {
  NICK_MIN_LENGTH: 3,
  NICK_MAX_LENGTH: 15,
  PASSWORD_MIN_LENGTH: 6,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  NICK_REGEX: /^[a-zA-Z0-9_]+$/,
} as const;



/**
 * 📝 Validación para el registro de usuario
 */
export const validateRegister = (req: Request, res: Response, next: NextFunction): void => {
  const { nick, email, password } = req.body;

  // 1. Validar que existan todos los campos
  const missingFields = [];
  if (!nick) missingFields.push('nick');
  if (!email) missingFields.push('email');
  if (!password) missingFields.push('password');

  if (missingFields.length > 0) {
    res.status(400).json({ 
      message: `Campos obligatorios faltantes: ${missingFields.join(', ')}` 
    });
    return;
  }

  // 2. Limpiar espacios
  const cleanNick = nick.trim();
  const cleanEmail = email.trim();

  // 3. Validar Nick
  if (cleanNick.length < VALIDATION_RULES.NICK_MIN_LENGTH || 
      cleanNick.length > VALIDATION_RULES.NICK_MAX_LENGTH) {
    res.status(400).json({ 
      message: `El Nick debe tener entre ${VALIDATION_RULES.NICK_MIN_LENGTH} y ${VALIDATION_RULES.NICK_MAX_LENGTH} caracteres.` 
    });
    return;
  }

  if (!VALIDATION_RULES.NICK_REGEX.test(cleanNick)) {
    res.status(400).json({ 
      message: 'El Nick solo puede contener letras, números y guiones bajos (sin espacios).' 
    });
    return;
  }

  // 4. Validar Email
  if (!VALIDATION_RULES.EMAIL_REGEX.test(cleanEmail)) {
    res.status(400).json({ 
      message: 'Por favor, proporciona un correo electrónico válido.' 
    });
    return;
  }

  // 5. Validar Contraseña
  if (password.length < VALIDATION_RULES.PASSWORD_MIN_LENGTH) {
    res.status(400).json({ 
      message: `La contraseña debe tener como mínimo ${VALIDATION_RULES.PASSWORD_MIN_LENGTH} caracteres.` 
    });
    return;
  }

  // 6. Validación adicional: contraseña no debe ser igual al nick o email
  if (password.toLowerCase() === cleanNick.toLowerCase()) {
    res.status(400).json({ 
      message: 'La contraseña no puede ser igual al nick de usuario.' 
    });
    return;
  }

  if (password.toLowerCase() === cleanEmail.split('@')[0].toLowerCase()) {
    res.status(400).json({ 
      message: 'La contraseña no puede ser igual a la parte local del email.' 
    });
    return;
  }

  req.body.nick = cleanNick;
  req.body.email = cleanEmail;
  req.body.password = password;

  next();
};

/**
 * 🔐 Validación para el login
 */
export const validateLogin = (req: Request, res: Response, next: NextFunction): void => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ 
      message: 'Email y contraseña son requeridos.' 
    });
    return;
  }

  const cleanEmail = email.trim();

  if (!VALIDATION_RULES.EMAIL_REGEX.test(cleanEmail)) {
    res.status(400).json({ 
      message: 'Por favor, proporciona un correo electrónico válido.' 
    });
    return;
  }

  if (password.length < 1) {
    res.status(400).json({ 
      message: 'La contraseña no puede estar vacía.' 
    });
    return;
  }

  req.body.email = cleanEmail;
  next();
};

/**
 * 📝 Validación para actualizar perfil
 */
export const validateUpdateProfile = (req: Request, res: Response, next: NextFunction): void => {
  const { nick, email, currentPassword, newPassword } = req.body;

  if (!nick && !email && !currentPassword && !newPassword) {
    res.status(400).json({ 
      message: 'Al menos un campo debe ser proporcionado para actualizar.' 
    });
    return;
  }

  if (nick) {
    const cleanNick = nick.trim();
    if (cleanNick.length < VALIDATION_RULES.NICK_MIN_LENGTH || 
        cleanNick.length > VALIDATION_RULES.NICK_MAX_LENGTH) {
      res.status(400).json({ 
        message: `El Nick debe tener entre ${VALIDATION_RULES.NICK_MIN_LENGTH} y ${VALIDATION_RULES.NICK_MAX_LENGTH} caracteres.` 
      });
      return;
    }
    if (!VALIDATION_RULES.NICK_REGEX.test(cleanNick)) {
      res.status(400).json({ 
        message: 'El Nick solo puede contener letras, números y guiones bajos.' 
      });
      return;
    }
    req.body.nick = cleanNick;
  }

  if (email) {
    const cleanEmail = email.trim();
    if (!VALIDATION_RULES.EMAIL_REGEX.test(cleanEmail)) {
      res.status(400).json({ 
        message: 'Por favor, proporciona un correo electrónico válido.' 
      });
      return;
    }
    req.body.email = cleanEmail;
  }

  if (newPassword && !currentPassword) {
    res.status(400).json({ 
      message: 'La contraseña actual es requerida para cambiar la contraseña.' 
    });
    return;
  }

  if (newPassword && newPassword.length < VALIDATION_RULES.PASSWORD_MIN_LENGTH) {
    res.status(400).json({ 
      message: `La nueva contraseña debe tener al menos ${VALIDATION_RULES.PASSWORD_MIN_LENGTH} caracteres.` 
    });
    return;
  }

  next();
};

/**
 * 🎯 Validación para ID en parámetros - ✅ CORREGIDO
 */
export const validateIdParam = (req: Request, res: Response, next: NextFunction): void => {
  // ✅ Extraer ID de forma segura
  const id = extractId(req.params.id);

  if (!id || id <= 0) {
    res.status(400).json({ 
      message: 'ID inválido. Debe ser un número positivo.' 
    });
    return;
  }

  // ✅ Asignar el ID como string en params
  req.params.id = String(id);
  next();
};

/**
 * 🎯 Validación para ID en parámetros (versión con nombre de parámetro personalizado)
 */
export const validateParamId = (paramName: string = 'id') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = extractId(req.params[paramName]);

    if (!id || id <= 0) {
      res.status(400).json({ 
        message: `ID inválido para el parámetro "${paramName}". Debe ser un número positivo.` 
      });
      return;
    }

    req.params[paramName] = String(id);
    next();
  };
};

/**
 * 📊 Validación para paginación
 */
export const validatePagination = (req: Request, res: Response, next: NextFunction): void => {
  const page = parseInt(req.query.page as string);
  const limit = parseInt(req.query.limit as string);

  if (req.query.page && (isNaN(page) || page < 1)) {
    res.status(400).json({ 
      message: 'El parámetro "page" debe ser un número positivo.' 
    });
    return;
  }

  if (req.query.limit && (isNaN(limit) || limit < 1 || limit > 100)) {
    res.status(400).json({ 
      message: 'El parámetro "limit" debe ser un número entre 1 y 100.' 
    });
    return;
  }

  next();
};

/**
 * 🎯 Validación para array de IDs
 */
export const validateIdsArray = (req: Request, res: Response, next: NextFunction): void => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ 
      message: 'Se requiere un array de IDs válido.' 
    });
    return;
  }

  const validIds = ids.every((id: any) => Number.isInteger(id) && id > 0);

  if (!validIds) {
    res.status(400).json({ 
      message: 'Todos los IDs deben ser números enteros positivos.' 
    });
    return;
  }

  next();
};

/**
 * 📝 Validación para búsqueda
 */
export const validateSearch = (req: Request, res: Response, next: NextFunction): void => {
  const { search } = req.query;

  if (search && typeof search === 'string') {
    // ✅ Limitar longitud de búsqueda
    if (search.length > 50) {
      res.status(400).json({ 
        message: 'El término de búsqueda no puede exceder los 50 caracteres.' 
      });
      return;
    }
    req.query.search = search.trim();
  }

  next();
};