const app = require("./app");
const config = require("./config");

app.listen(config.puerto, () => {
  console.log(`Servicio de autorizacion escuchando en http://localhost:${config.puerto}`);
  console.log(`Algoritmo: ${config.algoritmo} (solo verifica, no puede firmar)`);
});
