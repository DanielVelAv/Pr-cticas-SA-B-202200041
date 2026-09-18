const UsuarioRepository = require("./UsuarioRepository");
const pool = require("../config/database");

/**
 * Implementacion concreta usando PostgreSQL.
 *
 * Aqui vive TODO el cifrado de campos: el resto de la aplicacion recibe
 * y entrega texto plano. Si manana se cambiara AES por otro algoritmo,
 * ni los servicios ni los controladores se enteran.
 *
 * Excepcion deliberada: password_enc se entrega SIN abrir. Su capa AES
 * pertenece al contrato de EncryptedPasswordHasher, no al repositorio.
 *
 * Todas las consultas usan parametros ($1, $2...) para evitar inyeccion.
 */
class PostgresUsuarioRepository extends UsuarioRepository {
  #crypto;
  #indexer;

  constructor(cryptoService, emailIndexer) {
    super();
    this.#crypto = cryptoService;
    this.#indexer = emailIndexer;
  }

  async existePorCorreo(correo) {
    const resultado = await pool.query(
      "SELECT id FROM usuarios WHERE email_index = $1",
      [this.#indexer.indexar(correo)],
    );
    return resultado.rowCount > 0;
  }

  async obtenerPorCorreo(correo) {
    const resultado = await pool.query(
      "SELECT * FROM usuarios WHERE email_index = $1",
      [this.#indexer.indexar(correo)],
    );
    return resultado.rows[0] ? this.#aDominio(resultado.rows[0]) : null;
  }

  async obtenerPorId(id) {
    const resultado = await pool.query("SELECT * FROM usuarios WHERE id = $1", [id]);
    return resultado.rows[0] ? this.#aDominio(resultado.rows[0]) : null;
  }

  async crear(usuario) {
    const { correo, nombre, passwordSecreto, rol } = usuario;
    const resultado = await pool.query(
      `INSERT INTO usuarios (email_index, email_enc, nombre_enc, password_enc, rol)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        this.#indexer.indexar(correo),
        this.#crypto.cifrar(Buffer.from(correo, "utf8")),
        this.#crypto.cifrar(Buffer.from(nombre, "utf8")),
        passwordSecreto,
        rol,
      ],
    );
    return this.#aDominio(resultado.rows[0]);
  }

  async listarTodos() {
    const resultado = await pool.query("SELECT * FROM usuarios ORDER BY id ASC");
    return resultado.rows.map((fila) => {
      const usuario = this.#aDominio(fila);
      delete usuario.passwordSecreto; // nunca sale de la capa de datos
      return usuario;
    });
  }

  // Descifra los campos sensibles y arma el objeto que usa la aplicacion.
  #aDominio(fila) {
    return {
      id: fila.id,
      correo: this.#crypto.descifrar(fila.email_enc).toString("utf8"),
      nombre: this.#crypto.descifrar(fila.nombre_enc).toString("utf8"),
      passwordSecreto: fila.password_enc,
      rol: fila.rol,
      creadoEn: fila.creado_en,
    };
  }
}

module.exports = PostgresUsuarioRepository;
