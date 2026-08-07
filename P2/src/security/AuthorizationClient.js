/**
 * Contrato hacia el microservicio de autorizacion.
 *
 * El backend principal es el punto que APLICA la decision; el
 * microservicio es el que la TOMA. Este contrato es la frontera entre
 * ambos y no menciona HTTP.
 */
class AuthorizationClient {
  async autorizar(token, permiso, requestId) {
    throw new Error("Metodo no implementado");
  }
}

module.exports = AuthorizationClient;
