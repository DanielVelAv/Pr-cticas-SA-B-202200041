/**
 * Contrato de cifrado reversible. Define QUE se puede hacer, no COMO.
 * Cambiar AES por otro algoritmo solo exige otra implementacion de esto.
 */
class CryptoService {
  cifrar(datos) {
    throw new Error("Metodo no implementado");
  }

  descifrar(blob) {
    throw new Error("Metodo no implementado");
  }
}

module.exports = CryptoService;
