const SolicitudRepository = require('./SolicitudRepository');
const pool = require('../config/database');

/**
 * Implementacion concreta del contrato usando PostgreSQL.
 * Todas las consultas usan parametros ($1, $2...) para evitar inyeccion SQL.
 */
class PostgresSolicitudRepository extends SolicitudRepository {

    async obtenerTodas() {
        const resultado = await pool.query(
            'SELECT * FROM solicitudes ORDER BY id ASC'
        );
        return resultado.rows.map(this.#formatear);
    }

    async obtenerPorId(id) {
        const resultado = await pool.query(
            'SELECT * FROM solicitudes WHERE id = $1',
            [id]
        );
        return resultado.rows[0] ? this.#formatear(resultado.rows[0]) : null;
    }

    async crear(solicitud) {
        const { titulo, area_solicitante, prioridad, costo_estimado, estado } = solicitud;
        const resultado = await pool.query(
            `INSERT INTO solicitudes (titulo, area_solicitante, prioridad, costo_estimado, estado)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [titulo, area_solicitante, prioridad, costo_estimado, estado]
        );
        return this.#formatear(resultado.rows[0]);
    }

    async actualizar(id, solicitud) {
        const { titulo, area_solicitante, prioridad, costo_estimado, estado } = solicitud;
        const resultado = await pool.query(
            `UPDATE solicitudes
             SET titulo = $1, area_solicitante = $2, prioridad = $3,
                 costo_estimado = $4, estado = $5
             WHERE id = $6
             RETURNING *`,
            [titulo, area_solicitante, prioridad, costo_estimado, estado, id]
        );
        return resultado.rows[0] ? this.#formatear(resultado.rows[0]) : null;
    }

    async eliminar(id) {
        const resultado = await pool.query(
            'DELETE FROM solicitudes WHERE id = $1 RETURNING id',
            [id]
        );
        return resultado.rowCount > 0;
    }

    async actualizarEstado(id, estado) {
        const resultado = await pool.query(
            'UPDATE solicitudes SET estado = $1 WHERE id = $2 RETURNING *',
            [estado, id]
        );
        return resultado.rows[0] ? this.#formatear(resultado.rows[0]) : null;
    }

    // PostgreSQL devuelve NUMERIC como texto; se convierte a numero para el JSON.
    #formatear(fila) {
        return { ...fila, costo_estimado: Number(fila.costo_estimado) };
    }
}

module.exports = PostgresSolicitudRepository;
