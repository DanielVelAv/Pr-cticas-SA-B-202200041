const AuthorizationClient = require("./AuthorizationClient");
const { ErrorTransitorio, ErrorDeProtocolo } = require("./RetryPolicy");

// 429 se trata como transitorio: el servicio pide explicitamente esperar.
const ESTADOS_REINTENTABLES = new Set([429, 500, 502, 503, 504]);

/**
 * Adaptador HTTP. Su unica responsabilidad es traducir entre el dominio
 * y la red, y clasificar cada resultado como transitorio o definitivo.
 * Cuantos reintentos hacer lo decide RetryPolicy.
 */
class HttpAuthorizationClient extends AuthorizationClient {
  #url;
  #timeoutMs;
  #retryPolicy;

  constructor({ baseUrl, timeoutMs, retryPolicy }) {
    super();
    this.#url = `${baseUrl.replace(/\/$/, "")}/authorize`;
    this.#timeoutMs = timeoutMs;
    this.#retryPolicy = retryPolicy;
  }

  async autorizar(token, permiso, requestId) {
    const intento = async (numeroIntento) => {
      let respuesta;
      try {
        respuesta = await fetch(this.#url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
            "X-Attempt": String(numeroIntento),
          },
          body: JSON.stringify({ token, permiso_requerido: permiso, request_id: requestId }),
          // Timeout POR INTENTO, no para el conjunto: sin esto un
          // servicio lento consumiria todo el presupuesto en el primero.
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
      } catch (error) {
        throw new ErrorTransitorio(`${error.name}: ${error.message}`);
      }

      if (ESTADOS_REINTENTABLES.has(respuesta.status)) {
        throw new ErrorTransitorio(`el servicio respondio ${respuesta.status}`);
      }
      if (respuesta.status !== 200) {
        // 4xx distinto de 429: nuestra peticion esta mal formada.
        // Reintentar produciria el mismo error N veces.
        throw new ErrorDeProtocolo(`respuesta inesperada: ${respuesta.status}`);
      }

      const cuerpo = await respuesta.json();
      if (typeof cuerpo?.permitido !== "boolean" || typeof cuerpo?.razon !== "string") {
        throw new ErrorDeProtocolo("cuerpo ilegible del servicio de autorizacion");
      }
      return { permitido: cuerpo.permitido, razon: cuerpo.razon };
    };

    return this.#retryPolicy.ejecutar(intento, requestId);
  }
}

module.exports = HttpAuthorizationClient;
