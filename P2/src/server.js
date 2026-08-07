const app = require("./app");
const config = require("./config/env");

app.listen(config.puerto, () => {
  console.log(`Servidor escuchando en http://localhost:${config.puerto}`);
  console.log(
    `JWT: ttl=${config.jwt.ttlSegundos}s gracia=${config.jwt.graciaSegundos}s | ` +
      `authz=${config.authz.url} reintentos=${config.authz.maxReintentos} ` +
      `backoff=${config.authz.backoffBaseMs}ms`,
  );
});
