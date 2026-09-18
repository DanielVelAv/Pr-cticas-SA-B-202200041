const config = require("../config/env");

function colocarCookie(res, token) {
  res.cookie(config.cookie.nombre, token, {
    httpOnly: true,
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
 * Acepta el token por cookie (navegador) o por encabezado Authorization
 * Bearer (llamadas entre servicios y desde el API Gateway).
 *
 * En la Practica 2 solo existia la cookie porque el unico cliente era
 * un navegador. Aqui el Gateway reenvia el token como Bearer, asi que
 * el servicio debe entender ambos.
 */
function extraerToken(req) {
  const encabezado = req.headers.authorization;
  if (encabezado && encabezado.startsWith("Bearer ")) {
    return encabezado.slice(7);
  }
  return req.cookies?.[config.cookie.nombre] ?? null;
}

function crearVerificarSesion(tokenService) {
  return (req, res, next) => {
    const token = extraerToken(req);
    if (!token) {
      return res.status(401).json({ errores: ["No hay una sesion iniciada."] });
    }
    try {
      const claims = tokenService.decodificar(token, { verificarExpiracion: true });
      req.sesion = { usuarioId: claims.sub, rol: claims.rol, token };
      return next();
    } catch {
      limpiarCookie(res);
      return res.status(401).json({ errores: ["Token invalido o expirado."] });
    }
  };
}

module.exports = { crearVerificarSesion, colocarCookie, limpiarCookie, extraerToken };
