/**
 * Middleware para manejar funciones async en Express
 * Captura errores en controladores async y los pasa al middleware de error
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
