const { MAX_BYTES } = require("../security/BcryptPasswordHasher");

const LIMITES = {
  NOMBRE_MAX: 120,
  CORREO_MAX: 254, // RFC 5321
  PASSWORD_MIN: 8,
};

const CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Unica responsabilidad: validar los datos que entran a la API.
 * No conoce Express ni PostgreSQL.
 */
class UsuarioValidator {
  static validarRegistro(datos) {
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
      return ["El cuerpo de la peticion debe ser un objeto JSON valido."];
    }

    const errores = [];
    const { correo, nombre, password } = datos;

    // Nota: NO se valida un campo 'rol'. El rol lo decide el servidor;
    // aceptarlo del cliente seria escalacion de privilegios.
    if (datos.rol !== undefined) {
      errores.push("El campo rol no puede enviarse en el registro.");
    }

    if (!correo || typeof correo !== "string" || !CORREO_REGEX.test(correo.trim())) {
      errores.push("El campo correo es obligatorio y debe ser un correo valido.");
    } else if (correo.trim().length > LIMITES.CORREO_MAX) {
      errores.push(`El campo correo no puede exceder ${LIMITES.CORREO_MAX} caracteres.`);
    }

    if (!nombre || typeof nombre !== "string" || nombre.trim().length < 2) {
      errores.push("El campo nombre es obligatorio y debe tener al menos 2 caracteres.");
    } else if (nombre.trim().length > LIMITES.NOMBRE_MAX) {
      errores.push(`El campo nombre no puede exceder ${LIMITES.NOMBRE_MAX} caracteres.`);
    }

    if (!password || typeof password !== "string") {
      errores.push("El campo password es obligatorio y debe ser texto.");
    } else if (password.length < LIMITES.PASSWORD_MIN) {
      errores.push(`El campo password debe tener al menos ${LIMITES.PASSWORD_MIN} caracteres.`);
    } else if (Buffer.byteLength(password, "utf8") > MAX_BYTES) {
      // Se valida en BYTES, no en caracteres: con acentos o emoji, 72
      // caracteres pueden ser mas de 72 bytes y bcrypt truncaria.
      errores.push(`El campo password no puede exceder ${MAX_BYTES} bytes.`);
    }

    return errores;
  }

  static validarLogin(datos) {
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
      return ["El cuerpo de la peticion debe ser un objeto JSON valido."];
    }
    const errores = [];
    if (!datos.correo || typeof datos.correo !== "string") {
      errores.push("El campo correo es obligatorio.");
    }
    if (!datos.password || typeof datos.password !== "string") {
      errores.push("El campo password es obligatorio.");
    }
    return errores;
  }
}

module.exports = UsuarioValidator;
module.exports.LIMITES = LIMITES;
