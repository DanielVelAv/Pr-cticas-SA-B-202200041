const fs = require("fs");
require("dotenv").config();

/**
 * Configuracion del servicio de autenticacion.
 * Heredado de la Practica 2 y adaptado para ejecutarse en contenedor.
 */

function requerido(nombre) {
  const v = process.env[nombre];
  if (!v || v.trim() === "") {
    throw new Error(`Falta la variable de entorno ${nombre}`);
  }
  return v;
}

function entero(nombre, porDefecto) {
  const c = process.env[nombre];
  if (c === undefined || c === "") return porDefecto;
  const v = Number.parseInt(c, 10);
  if (Number.isNaN(v)) throw new Error(`${nombre} debe ser un entero`);
  return v;
}

function llaveDe32Bytes(nombre) {
  const b = Buffer.from(requerido(nombre), "base64");
  if (b.length !== 32) {
    throw new Error(`${nombre} debe decodificar a 32 bytes, no ${b.length}`);
  }
  return b;
}

const aesKey = llaveDe32Bytes("AES_KEY");
const blindIndexKey = llaveDe32Bytes("BLIND_INDEX_KEY");
if (aesKey.equals(blindIndexKey)) {
  throw new Error("AES_KEY y BLIND_INDEX_KEY deben ser distintas");
}

const rutaPrivada = process.env.JWT_PRIVATE_KEY_PATH || "/keys/jwt_private.pem";
const rutaPublica = process.env.JWT_PUBLIC_KEY_PATH || "/keys/jwt_public.pem";

function leerLlave(ruta) {
  if (!fs.existsSync(ruta)) {
    throw new Error(`No se encontro la llave RSA en ${ruta}`);
  }
  return fs.readFileSync(ruta, "utf8");
}

module.exports = {
  puerto: entero("PORT", 3001),
  databaseUrl: requerido("DATABASE_URL"),
  aesKey,
  blindIndexKey,
  bcryptCost: entero("BCRYPT_COST", 10),
  jwt: {
    algoritmo: process.env.JWT_ALGORITHM || "RS256",
    ttlSegundos: entero("JWT_TTL_SECONDS", 900),
    toleranciaRelojSegundos: entero("JWT_LEEWAY_SECONDS", 5),
    llavePrivada: leerLlave(rutaPrivada),
    llavePublica: leerLlave(rutaPublica),
  },
  cookie: {
    nombre: process.env.COOKIE_NAME || "access_token",
    segura: process.env.COOKIE_SECURE === "true",
    sameSite: process.env.COOKIE_SAMESITE || "lax",
    maxAgeMs: entero("JWT_TTL_SECONDS", 900) * 1000,
  },
};
