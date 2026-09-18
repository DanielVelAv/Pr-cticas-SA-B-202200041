const fs = require("fs");
const jwt = require("jsonwebtoken");

const RUTA_LLAVE_PUBLICA = process.env.JWT_PUBLIC_KEY_PATH || "/keys/jwt_public.pem";
const ALGORITMO = process.env.JWT_ALGORITHM || "RS256";
const NOMBRE_COOKIE = process.env.COOKIE_NAME || "access_token";

let llavePublicaCache = null;

/**
 * La llave publica la genera ms-auth al arrancar y queda en un volumen
 * compartido. Se carga de forma perezosa: el Gateway puede levantar
 * antes que ms-auth sin fallar, y toma la llave en la primera peticion
 * autenticada que reciba.
 */
function llavePublica() {
  if (llavePublicaCache) return llavePublicaCache;
  if (!fs.existsSync(RUTA_LLAVE_PUBLICA)) return null;
  llavePublicaCache = fs.readFileSync(RUTA_LLAVE_PUBLICA, "utf8");
  return llavePublicaCache;
}

function extraerToken(req) {
  const encabezado = req.headers.authorization;
  if (encabezado && encabezado.startsWith("Bearer ")) return encabezado.slice(7);
  return req.cookies?.[NOMBRE_COOKIE] ?? null;
}

/**
 * Punto unico de verificacion del token (patron PEP heredado de la
 * Practica 2). Los microservicios internos no repiten este trabajo:
 * confian en los encabezados que el Gateway inyecta, porque estan en
 * una red interna de Docker sin exposicion al exterior.
 */
function verificarToken(req, res, next) {
  const token = extraerToken(req);
  if (!token) {
    return res.status(401).json({ errores: ["Se requiere autenticacion."] });
  }

  const llave = llavePublica();
  if (!llave) {
    return res.status(503).json({
      errores: ["El servicio de autenticacion aun no esta listo. Reintente."],
    });
  }

  try {
    const claims = jwt.verify(token, llave, { algorithms: [ALGORITMO] });
    req.usuario = { id: String(claims.sub), rol: claims.rol };
    return next();
  } catch {
    return res.status(401).json({ errores: ["Token invalido o expirado."] });
  }
}

/** Restringe una ruta a ciertos roles. */
function requerirRol(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      return res.status(403).json({
        errores: [`Se requiere uno de los roles: ${roles.join(", ")}`],
      });
    }
    return next();
  };
}

module.exports = { verificarToken, requerirRol };
