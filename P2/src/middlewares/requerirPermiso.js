const crypto = require("crypto");
const { ServicioNoDisponible } = require("../security/RetryPolicy");

/**
 * Fabrica de middlewares de autorizacion, uno por permiso.
 *
 * Agregar una tercera ruta protegida no obliga a modificar esta
 * funcion: solo a invocarla con otro permiso.
 *
 * La decision NO se toma aqui. Se delega al microservicio de
 * autorizacion; este middleware solo la aplica.
 */
function crearRequerirPermiso(authorizationClient) {
  return (permiso) => async (req, res, next) => {
    const requestId = req.headers["x-request-id"] || crypto.randomUUID();

    let decision;
    try {
      // req.sesion.token puede ser el token RENOVADO: la ventana de
      // gracia se resuelve ANTES de consultar al microservicio, que por
      // eso puede rechazar tokens vencidos sin excepcion alguna.
      decision = await authorizationClient.autorizar(req.sesion.token, permiso, requestId);
    } catch (error) {
      // 503 y no 403: el acceso no fue denegado por politica, no se
      // pudo decidir. El efecto es el mismo (no entra) pero la
      // semantica es distinta y queda en el log.
      const agotado = error instanceof ServicioNoDisponible;
      console.error(`[authz] ${agotado ? "reintentos agotados" : "fallo"}: ${error.message}`);
      return res.status(503).json({
        errores: ["El servicio de autorizacion no esta disponible. Intente mas tarde."],
      });
    }

    if (!decision.permitido) {
      // 403 y no 401: la sesion es valida, el rol no alcanza.
      return res.status(403).json({
        errores: ["No tiene permisos para acceder a este recurso."],
        razon: decision.razon,
      });
    }

    return next();
  };
}

module.exports = crearRequerirPermiso;
