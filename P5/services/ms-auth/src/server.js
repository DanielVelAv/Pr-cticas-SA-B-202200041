const app = require("./app");
const config = require("./config/env");

app.listen(config.puerto, "0.0.0.0", () => {
  require("./logger").logger.info({ puerto: config.puerto }, "ms-auth escuchando");
});
