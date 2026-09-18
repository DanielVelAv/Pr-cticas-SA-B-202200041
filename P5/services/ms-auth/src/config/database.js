const { Pool } = require("pg");
const config = require("./env");

// Dentro de Docker Compose la base es un contenedor de la misma red,
// por eso no se requiere SSL (a diferencia de la Practica 2, que usaba
// una base en la nube).
const pool = new Pool({ connectionString: config.databaseUrl });

module.exports = pool;
