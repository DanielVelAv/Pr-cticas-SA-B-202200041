const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS lotes (
  id              SERIAL PRIMARY KEY,
  nombre_archivo  VARCHAR(200) NOT NULL,
  estado          VARCHAR(20)  NOT NULL DEFAULT 'CARGADO'
                  CHECK (estado IN ('CARGADO','VALIDADO','RECHAZADO','APROBADO')),
  total_transacciones INT      NOT NULL DEFAULT 0,
  monto_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  usuario_id      VARCHAR(50)  NOT NULL,
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transacciones (
  id                  SERIAL PRIMARY KEY,
  lote_id             INT NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  cuenta_origen       VARCHAR(20) NOT NULL,
  cuenta_destino      VARCHAR(20) NOT NULL,
  monto               NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  beneficiario_nombre VARCHAR(120) NOT NULL,
  beneficiario_email  VARCHAR(150) NOT NULL,
  valida              BOOLEAN NOT NULL DEFAULT true,
  motivo_rechazo      VARCHAR(200)
);
`;

async function inicializar() {
  for (let i = 1; i <= 15; i += 1) {
    try {
      await pool.query(ESQUEMA);
      console.log("[ms-lotes] esquema aplicado");
      return;
    } catch (e) {
      console.log(`[ms-lotes] esperando base de datos (${i}/15): ${e.code || e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("No se pudo conectar a la base de datos");
}

module.exports = { pool, inicializar };
