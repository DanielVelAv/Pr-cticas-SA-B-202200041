/**
 * Contrato (abstraccion) que define QUE operaciones de persistencia existen,
 * sin decir COMO se hacen. Cualquier base de datos puede implementarlo.
 */
class SolicitudRepository {
    async obtenerTodas() {
        throw new Error('Metodo no implementado');
    }

    async obtenerPorId(id) {
        throw new Error('Metodo no implementado');
    }

    async crear(solicitud) {
        throw new Error('Metodo no implementado');
    }

    async actualizar(id, solicitud) {
        throw new Error('Metodo no implementado');
    }

    async eliminar(id) {
        throw new Error('Metodo no implementado');
    }

    async actualizarEstado(id, estado) {
        throw new Error('Metodo no implementado');
    }
}

module.exports = SolicitudRepository;
