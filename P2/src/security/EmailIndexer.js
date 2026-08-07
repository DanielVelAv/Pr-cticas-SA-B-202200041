const crypto = require("crypto");

/**
 * Indice ciego: como buscar por correo cuando el correo esta cifrado.
 *
 * AES-GCM usa un IV aleatorio, asi que cifrar dos veces el mismo correo
 * produce blobs distintos y un WHERE email_enc = $1 nunca encontraria
 * nada. La solucion es una columna adicional con un HMAC-SHA256
 * determinista del correo normalizado, sobre la que va el UNIQUE.
 *
 * Es HMAC y no SHA-256 pelado a proposito: un hash sin llave permitiria
 * que quien robe la base pruebe correos por diccionario y confirme
 * quien esta registrado.
 */
class EmailIndexer {
  #llave;

  constructor(llave) {
    if (!Buffer.isBuffer(llave) || llave.length < 32) {
      throw new Error("La llave del indice debe medir al menos 32 bytes.");
    }
    this.#llave = llave;
  }

  /**
   * Normalizacion unica para indexar y para cifrar. Si esto se hiciera
   * en dos lugares distintos terminarian divergiendo y el login fallaria
   * para quien escriba su correo con mayusculas.
   */
  static normalizar(correo) {
    return correo.normalize("NFKC").trim().toLowerCase();
  }

  indexar(correo) {
    return crypto
      .createHmac("sha256", this.#llave)
      .update(EmailIndexer.normalizar(correo), "utf8")
      .digest();
  }
}

module.exports = EmailIndexer;
