const fs = require("fs");
const path = require("path");
const pool = require("./config/database");
const config = require("./config/env");
const AesGcmCryptoService = require("./security/AesGcmCryptoService");
const EmailIndexer = require("./security/EmailIndexer");
const BcryptPasswordHasher = require("./security/BcryptPasswordHasher");
const EncryptedPasswordHasher = require("./security/EncryptedPasswordHasher");
const PostgresUsuarioRepository = require("./repositories/PostgresUsuarioRepository");

const SEMILLA = [
  { correo: "admin@usac.edu.gt", nombre: "Administrador", password: "Admin.12345", rol: "admin" },
  { correo: "cliente@usac.edu.gt", nombre: "Cliente Demo", password: "Cliente.12345", rol: "cliente" },
];

async function main() {
  // Aplica el esquema (idempotente por el IF NOT EXISTS)
  const schema = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
  await pool.query(schema);
  console.log("[ms-auth] esquema aplicado");

  const crypto = new AesGcmCryptoService(config.aesKey);
  const hasher = new EncryptedPasswordHasher(new BcryptPasswordHasher(config.bcryptCost), crypto);
  const repo = new PostgresUsuarioRepository(crypto, new EmailIndexer(config.blindIndexKey));

  for (const f of SEMILLA) {
    if (await repo.existePorCorreo(f.correo)) {
      console.log(`[ms-auth] ya existe: ${f.correo}`);
      continue;
    }
    await repo.crear({
      correo: f.correo, nombre: f.nombre,
      passwordSecreto: await hasher.hashear(f.password), rol: f.rol,
    });
    console.log(`[ms-auth] creado: ${f.correo} (${f.rol})`);
  }
  await pool.end();
}

main().catch((e) => { console.error("[ms-auth] seed fallo:", e.message); process.exit(1); });
