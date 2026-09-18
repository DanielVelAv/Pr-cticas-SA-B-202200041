const crypto = require("crypto");
const CryptoService = require("./CryptoService");

const BYTES_IV = 12; // tamano recomendado para GCM
const BYTES_TAG = 16;
const BYTES_LLAVE = 32; // AES-256

/**
 * AES-256-GCM. Formato del blob almacenado:
 *
 *   iv(12 bytes) || ciphertext || tag(16 bytes)
 *
 * GCM es un modo AUTENTICADO: detecta si el ciphertext fue manipulado.
 * CBC sin MAC no lo detecta y ECB ademas filtra patrones. Es lo que
 * exige el requisito 6 del enunciado ("informacion sensible... se
 * recomienda el algoritmo AES").
 */
class AesGcmCryptoService extends CryptoService {
  #llave;

  constructor(llave) {
    super();
    if (!Buffer.isBuffer(llave) || llave.length !== BYTES_LLAVE) {
      throw new Error(`La llave debe medir ${BYTES_LLAVE} bytes.`);
    }
    this.#llave = llave;
  }

  cifrar(datos) {
    const iv = crypto.randomBytes(BYTES_IV);
    const cifrador = crypto.createCipheriv("aes-256-gcm", this.#llave, iv);
    const texto = Buffer.concat([cifrador.update(datos), cifrador.final()]);
    return Buffer.concat([iv, texto, cifrador.getAuthTag()]);
  }

  descifrar(blob) {
    if (!Buffer.isBuffer(blob) || blob.length < BYTES_IV + BYTES_TAG) {
      throw new Error("Blob cifrado invalido o demasiado corto.");
    }

    const iv = blob.subarray(0, BYTES_IV);
    const texto = blob.subarray(BYTES_IV, blob.length - BYTES_TAG);
    const tag = blob.subarray(blob.length - BYTES_TAG);

    const descifrador = crypto.createDecipheriv("aes-256-gcm", this.#llave, iv);
    descifrador.setAuthTag(tag);

    try {
      return Buffer.concat([descifrador.update(texto), descifrador.final()]);
    } catch {
      // final() lanza si el tag no cuadra: el dato fue manipulado.
      throw new Error("El dato cifrado fue manipulado o esta corrupto.");
    }
  }
}

module.exports = AesGcmCryptoService;
