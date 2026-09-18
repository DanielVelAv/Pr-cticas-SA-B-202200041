const jwt = require("jsonwebtoken");

/**
 * Unica responsabilidad: firmar y decodificar JWT con RS256.
 *
 * Es el unico archivo del backend que conoce jsonwebtoken.
 */
class TokenService {
  #privada;
  #publica;
  #algoritmo;
  #ttl;
  #tolerancia;

  constructor({ llavePrivada, llavePublica, algoritmo, ttlSegundos, toleranciaRelojSegundos }) {
    if (algoritmo.toUpperCase() === "NONE") {
      throw new Error("El algoritmo 'none' esta prohibido.");
    }
    this.#privada = llavePrivada;
    this.#publica = llavePublica;
    this.#algoritmo = algoritmo;
    this.#ttl = ttlSegundos;
    this.#tolerancia = toleranciaRelojSegundos;
  }

  firmar(usuarioId, rol) {
    return jwt.sign(
      { sub: String(usuarioId), rol },
      this.#privada,
      { algorithm: this.#algoritmo, expiresIn: this.#ttl },
    );
  }

  /**
   * verificarExpiracion es explicito a proposito. Es el UNICO punto del
   * sistema autorizado a aceptar un token vencido (para evaluar la
   * ventana de gracia); tenerlo en la firma evita que alguien lo active
   * por accidente en otro lugar.
   */
  decodificar(token, { verificarExpiracion }) {
    return jwt.verify(token, this.#publica, {
      algorithms: [this.#algoritmo],
      ignoreExpiration: !verificarExpiracion,
      clockTolerance: this.#tolerancia,
    });
  }
}

module.exports = TokenService;
