/**
 * Contrato (abstraccion) que define QUE operaciones de persistencia
 * existen, sin decir COMO se hacen. Cualquier base de datos puede
 * implementarlo.
 */
class UsuarioRepository {
  async existePorCorreo(correo) {
    throw new Error("Metodo no implementado");
  }

  async obtenerPorCorreo(correo) {
    throw new Error("Metodo no implementado");
  }

  async obtenerPorId(id) {
    throw new Error("Metodo no implementado");
  }

  async crear(usuario) {
    throw new Error("Metodo no implementado");
  }

  async listarTodos() {
    throw new Error("Metodo no implementado");
  }
}

module.exports = UsuarioRepository;
