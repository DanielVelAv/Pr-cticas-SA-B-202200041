const jwt = require("jsonwebtoken");

const RAZON = Object.freeze({
  PERMITIDO: "PERMITIDO",
  ROL_SIN_PERMISO: "ROL_SIN_PERMISO",
  TOKEN_EXPIRADO: "TOKEN_EXPIRADO",
  FIRMA_INVALIDA: "FIRMA_INVALIDA",
  TOKEN_MAL_FORMADO: "TOKEN_MAL_FORMADO",
  PERMISO_DESCONOCIDO: "PERMISO_DESCONOCIDO",
});

class ErrorDeToken extends Error {
  constructor(razon) {
    super(razon);
    this.razon = razon;
  }
}

/**
 * Verifica firma y expiracion con la clave publica.
 *
 * Este servicio NO conoce la ventana de gracia: un token expirado se
 * rechaza siempre. La renovacion es responsabilidad exclusiva del
 * servicio de autenticacion, que renueva ANTES de consultar aqui, asi
 * que este servicio nunca deberia recibir un token vencido.
 */
class TokenVerifier {
  #llave;
  #algoritmo;
  #tolerancia;

  constructor({ llavePublica, algoritmo, toleranciaRelojSegundos }) {
    if (algoritmo.toUpperCase() === "NONE") {
      throw new Error("El algoritmo 'none' esta prohibido.");
    }
    this.#llave = llavePublica;
    this.#algoritmo = algoritmo;
    this.#tolerancia = toleranciaRelojSegundos;
  }

  verificar(token) {
    let claims;
    try {
      claims = jwt.verify(token, this.#llave, {
        algorithms: [this.#algoritmo],
        clockTolerance: this.#tolerancia,
      });
    } catch (error) {
      if (error.name === "TokenExpiredError") throw new ErrorDeToken(RAZON.TOKEN_EXPIRADO);
      if (error.name === "JsonWebTokenError" && /signature/i.test(error.message)) {
        throw new ErrorDeToken(RAZON.FIRMA_INVALIDA);
      }
      throw new ErrorDeToken(RAZON.TOKEN_MAL_FORMADO);
    }

    if (!claims.sub || !claims.rol) {
      throw new ErrorDeToken(RAZON.TOKEN_MAL_FORMADO);
    }
    return { usuarioId: String(claims.sub), rol: String(claims.rol) };
  }
}

module.exports = { TokenVerifier, ErrorDeToken, RAZON };
