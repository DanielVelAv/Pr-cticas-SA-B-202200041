const bcrypt = require("bcryptjs");
const PasswordHasher = require("./PasswordHasher");

const MAX_BYTES = 72; // limite duro de bcrypt

/**
 * Hash bcrypt puro. Solo sabe hashear y verificar; no sabe de cifrado.
 */
class BcryptPasswordHasher extends PasswordHasher {
  #costo;

  constructor(costo = 12) {
    super();
    if (costo < 4 || costo > 16) {
      throw new Error("El costo de bcrypt esta fuera de un rango razonable.");
    }
    this.#costo = costo;
  }

  static #validarLongitud(password) {
    // bcrypt TRUNCA en 72 bytes en silencio. Rechazar explicitamente
    // evita que dos contrasenas largas distintas queden equivalentes.
    if (Buffer.byteLength(password, "utf8") > MAX_BYTES) {
      throw new Error(
        `La contrasena excede ${MAX_BYTES} bytes; debe rechazarse en la ` +
          "validacion de entrada, nunca truncarse.",
      );
    }
  }

  async hashear(password) {
    BcryptPasswordHasher.#validarLongitud(password);
    return Buffer.from(await bcrypt.hash(password, this.#costo), "utf8");
  }

  async verificar(password, almacenado) {
    try {
      BcryptPasswordHasher.#validarLongitud(password);
    } catch {
      return false;
    }
    return bcrypt.compare(password, almacenado.toString("utf8"));
  }
}

module.exports = BcryptPasswordHasher;
module.exports.MAX_BYTES = MAX_BYTES;
