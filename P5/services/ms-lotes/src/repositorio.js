const { pool } = require("./db");

// Limites de negocio heredados del diseno de la Practica 3.
const MONTO_MAXIMO_POR_TRANSACCION = 50000;

/**
 * Unica responsabilidad: acceso a datos de lotes y transacciones.
 * Todas las consultas van parametrizadas para evitar inyeccion SQL.
 */
const repositorio = {
  async listarLotes() {
    const r = await pool.query("SELECT * FROM lotes ORDER BY id DESC");
    return r.rows;
  },

  async obtenerLote(id) {
    const r = await pool.query("SELECT * FROM lotes WHERE id = $1", [id]);
    return r.rows[0] ?? null;
  },

  async transaccionesDe(loteId) {
    const r = await pool.query(
      "SELECT * FROM transacciones WHERE lote_id = $1 ORDER BY id", [loteId]);
    return r.rows;
  },

  /**
   * Crea el lote y valida cada transaccion contra las reglas del negocio.
   * Si alguna falla, el lote completo queda RECHAZADO: no se envia a
   * aprobacion un lote con transacciones invalidas.
   */
  async crearLote({ nombreArchivo, usuarioId, transacciones }) {
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      const lote = await cliente.query(
        `INSERT INTO lotes (nombre_archivo, usuario_id, total_transacciones, monto_total)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [nombreArchivo, usuarioId, transacciones.length,
         transacciones.reduce((a, t) => a + Number(t.monto), 0)]
      );
      const loteId = lote.rows[0].id;
      let todasValidas = true;

      for (const t of transacciones) {
        const motivo = validar(t);
        if (motivo) todasValidas = false;
        await cliente.query(
          `INSERT INTO transacciones
             (lote_id, cuenta_origen, cuenta_destino, monto,
              beneficiario_nombre, beneficiario_email, valida, motivo_rechazo)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [loteId, t.cuentaOrigen, t.cuentaDestino, t.monto,
           t.beneficiarioNombre, t.beneficiarioEmail, motivo === null, motivo]
        );
      }

      const estado = todasValidas ? "VALIDADO" : "RECHAZADO";
      const final = await cliente.query(
        "UPDATE lotes SET estado = $1 WHERE id = $2 RETURNING *", [estado, loteId]);
      await cliente.query("COMMIT");
      return final.rows[0];
    } catch (e) {
      await cliente.query("ROLLBACK");
      throw e;
    } finally {
      cliente.release();
    }
  },

  async cambiarEstado(id, estado) {
    const r = await pool.query(
      "UPDATE lotes SET estado = $1 WHERE id = $2 RETURNING *", [estado, id]);
    return r.rows[0] ?? null;
  },
};

// Reglas de validacion del negocio (version reducida del diseno de P3).
function validar(t) {
  if (!t.cuentaOrigen || !t.cuentaDestino) return "Cuenta origen o destino ausente";
  if (t.cuentaOrigen === t.cuentaDestino) return "Cuenta origen y destino son iguales";
  if (Number(t.monto) <= 0) return "El monto debe ser mayor a cero";
  if (Number(t.monto) > MONTO_MAXIMO_POR_TRANSACCION) {
    return `El monto excede el limite de ${MONTO_MAXIMO_POR_TRANSACCION}`;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.beneficiarioEmail || "")) {
    return "Correo del beneficiario invalido";
  }
  return null;
}

module.exports = repositorio;
module.exports.validar = validar;
