const { Pool } = require('pg');
require('dotenv').config();

// Unica responsabilidad de este archivo: crear y exponer la conexion a PostgreSQL.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Requerido por Supabase / NeonDB
});

module.exports = pool;
