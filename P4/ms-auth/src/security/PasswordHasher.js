/**
 * Contrato de manejo de contrasenas. Dos implementaciones lo cumplen y
 * son intercambiables: BcryptPasswordHasher y EncryptedPasswordHasher.
 */
class PasswordHasher {
  async hashear(password) {
    throw new Error("Metodo no implementado");
  }

  async verificar(password, almacenado) {
    throw new Error("Metodo no implementado");
  }
}

module.exports = PasswordHasher;
