const { ErrorDeToken, RAZON } = require("./TokenVerifier");

/**
 * Decide si un token puede ejercer un permiso.
 *
 * Es sincrono y puro: no hace consultas, no conoce HTTP y NUNCA lanza
 * excepciones hacia afuera. Toda falla se traduce a una decision con su
 * razon, y por eso el endpoint siempre puede responder 200.
 *
 * Depende de los contratos TokenVerifier y PolicyRepository, no de
 * jsonwebtoken: por eso se puede probar con dobles sin generar claves.
 */
class EvaluarAcceso {
  #verificador;
  #politica;

  constructor(verificador, politica) {
    this.#verificador = verificador;
    this.#politica = politica;
  }

  ejecutar(token, permisoRequerido) {
    let sujeto;
    try {
      sujeto = this.#verificador.verificar(token);
    } catch (error) {
      if (error instanceof ErrorDeToken) {
        return { permitido: false, razon: error.razon, sujeto: null };
      }
      throw error;
    }

    if (!this.#politica.existePermiso(permisoRequerido)) {
      // Indica que los catalogos de los dos servicios divergieron.
      return { permitido: false, razon: RAZON.PERMISO_DESCONOCIDO, sujeto };
    }

    if (this.#politica.permisosDe(sujeto.rol).includes(permisoRequerido)) {
      return { permitido: true, razon: RAZON.PERMITIDO, sujeto };
    }

    return { permitido: false, razon: RAZON.ROL_SIN_PERMISO, sujeto };
  }
}

module.exports = EvaluarAcceso;
