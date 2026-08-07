const fs = require("fs");
require("dotenv").config();

/**
 * Unica responsabilidad: leer, validar y exponer la configuracion.
 *
 * Toda la validacion ocurre AL ARRANCAR. Si una llave esta mal, el
 * servidor no levanta; es preferible a descubrirlo en el primer login.
 */

const TTL_MAXIMO_SEGUNDOS = 180; // limite impuesto por el enunciado

function requerido(nombre) {
  const valor = process.env[nombre];
  if (!valor || valor.trim() === "") {
    throw new Error(`Falta la variable de entorno ${nombre}. Revise el .env.example`);
  }
  return valor;
}

function entero(nombre, porDefecto) {
  const crudo = process.env[nombre];
  if (crudo === undefined || crudo === "") return porDefecto;
  const valor = Number.parseInt(crudo, 10);
  if (Number.isNaN(valor)) {
    throw new Error(`La variable ${nombre} debe ser un numero entero.`);
  }
  return valor;
}

function llaveDe32Bytes(nombre) {
  const bytes = Buffer.from(requerido(nombre), "base64");
  if (bytes.length !== 32) {
    throw new Error(
      `${nombre} debe decodificar a 32 bytes, no ${bytes.length}. ` +
        "Generela con: openssl rand -base64 32",
    );
  }
  return bytes;
}

function leerLlaveRsa(ruta) {
  if (!fs.existsSync(ruta)) {
    throw new Error(
      `No se encontro la llave RSA en ${ruta}. Generela con: npm run keys`,
    );
  }
  return fs.readFileSync(ruta, "utf8");
}

const jwtTtlSegundos = entero("JWT_TTL_SECONDS", 180);
const jwtGraciaSegundos = entero("JWT_GRACE_PERIOD_SECONDS", 120);

if (jwtTtlSegundos <= 0 || jwtTtlSegundos > TTL_MAXIMO_SEGUNDOS) {
  throw new Error(
    `JWT_TTL_SECONDS debe estar entre 1 y ${TTL_MAXIMO_SEGUNDOS} segundos.`,
  );
}
if (jwtGraciaSegundos < 0) {
  throw new Error("JWT_GRACE_PERIOD_SECONDS no puede ser negativo.");
}

const aesKey = llaveDe32Bytes("AES_KEY");
const blindIndexKey = llaveDe32Bytes("BLIND_INDEX_KEY");

// Reutilizar la misma llave para cifrar y para indexar debilita ambas.
if (aesKey.equals(blindIndexKey)) {
  throw new Error("AES_KEY y BLIND_INDEX_KEY deben ser distintas.");
}

const algoritmoJwt = process.env.JWT_ALGORITHM || "RS256";
if (!algoritmoJwt.startsWith("RS")) {
  throw new Error(
    "Solo se permiten algoritmos RSA. Un HS* implicaria compartir un " +
      "secreto con el microservicio de autorizacion y romperia el desacoplamiento.",
  );
}

const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
if (corsOrigin.trim() === "*") {
  throw new Error("CORS_ORIGIN no puede ser '*': es incompatible con cookies.");
}

const config = {
  puerto: entero("PORT", 3000),
  databaseUrl: requerido("DATABASE_URL"),

  aesKey,
  blindIndexKey,
  bcryptCost: entero("BCRYPT_COST", 12),

  jwt: {
    algoritmo: algoritmoJwt,
    ttlSegundos: jwtTtlSegundos,
    graciaSegundos: jwtGraciaSegundos,
    toleranciaRelojSegundos: entero("JWT_LEEWAY_SECONDS", 5),
    llavePrivada: leerLlaveRsa(process.env.JWT_PRIVATE_KEY_PATH || "./keys/jwt_private.pem"),
    llavePublica: leerLlaveRsa(process.env.JWT_PUBLIC_KEY_PATH || "./keys/jwt_public.pem"),
  },

  authz: {
    url: process.env.AUTHZ_SERVICE_URL || "http://localhost:3001",
    timeoutMs: entero("AUTHZ_TIMEOUT_MS", 1000),
    maxReintentos: entero("AUTHZ_MAX_RETRIES", 3),
    backoffBaseMs: entero("AUTHZ_BACKOFF_BASE_MS", 200),
    backoffMaxMs: entero("AUTHZ_BACKOFF_MAX_MS", 2000),
  },

  cookie: {
    nombre: process.env.COOKIE_NAME || "access_token",
    segura: process.env.COOKIE_SECURE === "true",
    sameSite: process.env.COOKIE_SAMESITE || "lax",
    // Debe cubrir TTL + gracia. Si expirara en exp, el navegador borraria
    // la cookie y el backend nunca veria el token vencido que iba a renovar.
    maxAgeMs: (jwtTtlSegundos + jwtGraciaSegundos) * 1000,
  },

  corsOrigin,
};

module.exports = config;
