const express = require("express");
const solicitudRoutes = require("./routes/solicitudRoutes");

const app = express();

app.use(express.json());
app.use("/api", solicitudRoutes);

app.use((req, res) => {
  res.status(404).json({ errores: ["La ruta solicitada no existe."] });
});

// Captura errores lanzados por express.json() cuando el cuerpo no es JSON valido.
// Sin esto, Express responde con un stack trace en HTML que expone rutas internas.
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res
      .status(400)
      .json({ errores: ["El cuerpo de la peticion no es un JSON valido."] });
  }
  console.error(error);
  return res
    .status(500)
    .json({ errores: ["Ocurrio un error interno en el servidor."] });
});

module.exports = app;
