/**
 * Politica de reintentos con backoff exponencial y jitter completo.
 *
 * Escrita a mano y no delegada a una libreria: el ciclo de reintentos
 * es un requisito explicito del enunciado (punto 9) y debe poder
 * inspeccionarse y modificarse.
 *
 * Esta separada del cliente HTTP a proposito: el cliente sabe hablar
 * HTTP, la politica sabe CUANDO reintentar y cuanto esperar. Cambiar el
 * backoff de exponencial a lineal no obliga a tocar el cliente.
 *
 * No menciona HTTP en ninguna linea: podria reintentar cualquier
 * operacion asincrona.
 */

class ErrorTransitorio extends Error {}
class ErrorDeProtocolo extends Error {}

class ServicioNoDisponible extends Error {
  constructor(intentos, transcurridoMs, ultimoError) {
    super(
      `Servicio de autorizacion inalcanzable tras ${intentos} intentos ` +
        `(${Math.round(transcurridoMs)} ms): ${ultimoError}`,
    );
    this.tipo = "AUTHZ_NO_DISPONIBLE";
    this.intentos = intentos;
    this.transcurridoMs = transcurridoMs;
  }
}

class RetryPolicy {
  #maxReintentos;
  #baseMs;
  #maxMs;
  #dormir;
  #jitter;
  #reloj;

  constructor(
    { maxReintentos, baseMs, maxMs },
    {
      // Se inyectan para que las pruebas sean deterministas y no tarden
      // segundos reales.
      dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
      jitter = Math.random,
      reloj = () => Date.now(),
    } = {},
  ) {
    if (maxReintentos < 0) throw new Error("maxReintentos no puede ser negativo.");
    if (baseMs <= 0 || maxMs < baseMs) throw new Error("Backoff mal configurado.");
    this.#maxReintentos = maxReintentos;
    this.#baseMs = baseMs;
    this.#maxMs = maxMs;
    this.#dormir = dormir;
    this.#jitter = jitter;
    this.#reloj = reloj;
  }

  get totalIntentos() {
    return this.#maxReintentos + 1; // 1 inicial + N reintentos
  }

  /**
   * Full jitter: espera uniforme en [0, min(base * 2^(n-1), techo)].
   *
   * El jitter evita que varios procesos reintenten sincronizados y
   * golpeen el servicio en el mismo milisegundo justo cuando se estaba
   * levantando.
   */
  esperaMs(intento) {
    const exponencial = this.#baseMs * 2 ** (intento - 1);
    return Math.min(exponencial, this.#maxMs) * this.#jitter();
  }

  async ejecutar(operacion, requestId) {
    const inicio = this.#reloj();
    let ultimoError = "sin detalle";

    for (let intento = 1; intento <= this.totalIntentos; intento += 1) {
      try {
        return await operacion(intento);
      } catch (error) {
        if (!(error instanceof ErrorTransitorio)) {
          throw error; // un error de protocolo no mejora reintentando
        }
        ultimoError = error.message;
        if (intento === this.totalIntentos) break;

        const espera = this.esperaMs(intento);
        console.warn(
          `[authz] intento ${intento}/${this.totalIntentos} fallo ` +
            `(requestId=${requestId}): ${ultimoError}; ` +
            `reintentando en ${Math.round(espera)} ms`,
        );
        await this.#dormir(espera);
      }
    }

    const transcurrido = this.#reloj() - inicio;
    console.error(
      `[authz] agotados ${this.totalIntentos} intentos ` +
        `(requestId=${requestId}): ${ultimoError}`,
    );
    throw new ServicioNoDisponible(this.totalIntentos, transcurrido, ultimoError);
  }
}

module.exports = RetryPolicy;
module.exports.ErrorTransitorio = ErrorTransitorio;
module.exports.ErrorDeProtocolo = ErrorDeProtocolo;
module.exports.ServicioNoDisponible = ServicioNoDisponible;
