const ESTADO = {
  VIGENTE: "VIGENTE",
  EN_GRACIA: "EN_GRACIA",
  EXPIRADO: "EXPIRADO",
};

/**
 * Resuelve la sesion de una peticion y decide si hay que renovar.
 *
 * Toda la logica de la ventana de gracia (requisito 5 del enunciado)
 * vive aqui, fuera de Express, para poder probarla con un reloj
 * inyectado y sin levantar un servidor ni esperar minutos reales.
 *
 * No consulta base de datos: la decision depende solo de lo que dice
 * el propio token. Dado que el TTL maximo permitido son 3 minutos, la
 * ventana de exposicion de un token robado es corta por diseno; no hay
 * mecanismo de revocacion porque el enunciado no lo pide.
 */
class SesionService {
  #tokenService;
  #graciaSegundos;
  #reloj;

  constructor(tokenService, graciaSegundos, reloj = () => Date.now() / 1000) {
    this.#tokenService = tokenService;
    this.#graciaSegundos = graciaSegundos;
    this.#reloj = reloj;
  }

  /**
   * Las tres ventanas de vida de un token:
   *   ahora < exp                      -> VIGENTE
   *   exp <= ahora < exp + gracia      -> EN_GRACIA (se re-emite)
   *   ahora >= exp + gracia            -> EXPIRADO
   */
  estadoDe(exp, ahora) {
    if (ahora < exp) return ESTADO.VIGENTE;
    if (ahora < exp + this.#graciaSegundos) return ESTADO.EN_GRACIA;
    return ESTADO.EXPIRADO;
  }

  resolver(token) {
    let claims;
    try {
      // Se acepta un token vencido porque la ventana de gracia se
      // evalua abajo. La FIRMA si se verifica siempre.
      claims = this.#tokenService.decodificar(token, { verificarExpiracion: false });
    } catch {
      throw { tipo: "NO_AUTENTICADO", errores: ["Token invalido."] };
    }

    const estado = this.estadoDe(claims.exp, this.#reloj());

    if (estado === ESTADO.EXPIRADO) {
      throw { tipo: "NO_AUTENTICADO", errores: ["La sesion expiro."] };
    }

    if (estado === ESTADO.VIGENTE) {
      return { usuarioId: claims.sub, rol: claims.rol, token, renovado: false };
    }

    return {
      usuarioId: claims.sub,
      rol: claims.rol,
      token: this.#tokenService.firmar(claims.sub, claims.rol),
      renovado: true,
    };
  }
}

module.exports = SesionService;
module.exports.ESTADO = ESTADO;
