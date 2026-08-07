const { Pool } = require("pg");
const config = require("./env");

// Unica responsabilidad de este archivo: crear y exponer la conexion.
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false }, // Requerido por Supabase / NeonDB
});

module.exports = pool;
