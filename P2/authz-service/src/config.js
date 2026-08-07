const fs = require("fs");
require("dotenv").config();

const algoritmo = process.env.JWT_ALGORITHM || "RS256";
if (!algoritmo.startsWith("RS")) {
  throw new Error(
    "Solo se permiten algoritmos RSA. Un HS* obligaria a compartir un " +
      "secreto con el servicio de autenticacion.",
  );
}

const ruta = process.env.JWT_PUBLIC_KEY_PATH || "../keys/jwt_public.pem";
if (!fs.existsSync(ruta)) {
  throw new Error(`No se encontro la clave publica en ${ruta}.`);
}

module.exports = {
  puerto: Number.parseInt(process.env.PORT || "3001", 10),
  algoritmo,
  toleranciaRelojSegundos: Number.parseInt(process.env.JWT_LEEWAY_SECONDS || "5", 10),
  llavePublica: fs.readFileSync(ruta, "utf8"),
};
