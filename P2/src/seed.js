const config = require("./config/env");
const pool = require("./config/database");
const AesGcmCryptoService = require("./security/AesGcmCryptoService");
const EmailIndexer = require("./security/EmailIndexer");
const BcryptPasswordHasher = require("./security/BcryptPasswordHasher");
const EncryptedPasswordHasher = require("./security/EncryptedPasswordHasher");
const PostgresUsuarioRepository = require("./repositories/PostgresUsuarioRepository");

/**
 * Semilla idempotente. Los usuarios con rol admin se crean AQUI, nunca
 * por el endpoint de registro.
 */
const SEMILLA = [
  { correo: "admin@usac.edu.gt", nombre: "Administrador", password: "Admin.12345", rol: "admin" },
  { correo: "cliente@usac.edu.gt", nombre: "Cliente Demo", password: "Cliente.12345", rol: "cliente" },
];

async function main() {
  const crypto = new AesGcmCryptoService(config.aesKey);
  const hasher = new EncryptedPasswordHasher(new BcryptPasswordHasher(config.bcryptCost), crypto);
  const repositorio = new PostgresUsuarioRepository(crypto, new EmailIndexer(config.blindIndexKey));

  for (const fila of SEMILLA) {
    if (await repositorio.existePorCorreo(fila.correo)) {
      console.log(`ya existe: ${fila.correo}`);
      continue;
    }
    await repositorio.crear({
      correo: fila.correo,
      nombre: fila.nombre,
      passwordSecreto: await hasher.hashear(fila.password),
      rol: fila.rol,
    });
    console.log(`creado: ${fila.correo} (${fila.rol})`);
  }

  await pool.end();
}

main().catch((error) => {
  console.error("Fallo el seed:", error.message);
  process.exit(1);
});
