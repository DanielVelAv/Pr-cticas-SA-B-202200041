const app = require("./app");
const config = require("./config/env");

app.listen(config.puerto, "0.0.0.0", () => {
  console.log(`[ms-auth] escuchando en el puerto ${config.puerto}`);
});
