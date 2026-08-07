const config = require("../config/env");

/**
 * Coloca la cookie de sesion. La misma funcion se usa en el login y en
 * la renovacion automatica, para que sus atributos no diverjan.
 */
function colocarCookie(res, token) {
  res.cookie(config.cookie.nombre, token, {
    httpOnly: true, // JavaScript no puede leerla: anula el robo por XSS
    secure: config.cookie.segura,
    sameSite: config.cookie.sameSite,
    maxAge: config.cookie.maxAgeMs,
    path: "/",
  });
}

function limpiarCookie(res) {
  res.clearCookie(config.cookie.nombre, { path: "/" });
}

/**
 * Middleware de autenticacion. Verifica la sesion y, si el token esta
 * dentro de la ventana de gracia, emite uno nuevo de forma transparente
 * y deja continuar la peticion original.
 */
function crearVerificarSesion(sesionService) {
  return (req, res, next) => {
    const token = req.cookies?.[config.cookie.nombre];
    if (!token) {
      return res.status(401).json({ errores: ["No hay una sesion iniciada."] });
    }

    try {
      const sesion = sesionService.resolver(token);

      if (sesion.renovado) {
        colocarCookie(res, sesion.token);
        console.log(`[sesion] token renovado en ventana de gracia (usuario ${sesion.usuarioId})`);
      }

      req.sesion = sesion;
      return next();
    } catch (error) {
      limpiarCookie(res);
      return res.status(401).json({ errores: error.errores ?? ["Sesion invalida."] });
    }
  };
}

module.exports = { crearVerificarSesion, colocarCookie, limpiarCookie };
