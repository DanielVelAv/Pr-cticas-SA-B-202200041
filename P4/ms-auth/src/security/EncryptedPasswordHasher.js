const PasswordHasher = require("./PasswordHasher");

/**
 * Decorador: agrega cifrado AES-256-GCM sobre el hash bcrypt.
 *
 * El orden importa. Primero hash, DESPUES cifrado. Asi la contrasena
 * original no es recuperable ni siquiera con la AES_KEY; la capa AES
 * protege el hash ante una fuga del dump de la base, porque la llave
 * vive fuera de ella.
 *
 * Cifrar una contrasena de forma reversible seria un antipatron grave.
 * Este orden cumple el requisito del enunciado ("contrasenas... se
 * recomienda AES") sin incurrir en el.
 *
 * Envuelve a otro PasswordHasher sin modificarlo (abierto/cerrado) y
 * cumple el mismo contrato (sustitucion de Liskov).
 */
class EncryptedPasswordHasher extends PasswordHasher {
  #interno;
  #crypto;

  constructor(interno, cryptoService) {
    super();
    this.#interno = interno;
    this.#crypto = cryptoService;
  }

  async hashear(password) {
    const hash = await this.#interno.hashear(password);
    return this.#crypto.cifrar(hash);
  }

  async verificar(password, almacenado) {
    const hash = this.#crypto.descifrar(almacenado);
    return this.#interno.verificar(password, hash);
  }
}

module.exports = EncryptedPasswordHasher;
