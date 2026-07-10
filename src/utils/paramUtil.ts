// src/utils/paramUtils.ts
/**
 * ✅ Función auxiliar para extraer string de params (req.params o req.query)
 */
export const extractString = (param: string | string[] | undefined): string | undefined => {
  if (!param) return undefined;
  return Array.isArray(param) ? param[0] : param;
};

/**
 * ✅ Función auxiliar para extraer número de params
 */
export const extractNumber = (param: string | string[] | undefined): number | undefined => {
  if (!param) return undefined;
  const str = Array.isArray(param) ? param[0] : param;
  const parsed = parseInt(str);
  return isNaN(parsed) ? undefined : parsed;
};

/**
 * ✅ Función auxiliar para extraer ID de params
 */
export const extractId = (param: string | string[] | undefined): number | undefined => {
  const num = extractNumber(param);
  return num && num > 0 ? num : undefined;
};