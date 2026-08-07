const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const config = require("./config/env");
const rutas = require("./routes");

const app = express();

// El frontend corre en otro origen (Vite), asi que CORS debe permitir
// credenciales. El comodin '*' es INCOMPATIBLE con cookies: el
// navegador rechaza la respuesta. Por eso el origen es explicito.
app.use(cors({ origin: config.corsOrigin, credentials: true }));

app.use(express.json());
app.use(cookieParser());

app.use("/api", rutas);

app.get("/health", (req, res) => res.status(200).json({ estado: "ok" }));

app.use((req, res) => {
  res.status(404).json({ errores: ["La ruta solicitada no existe."] });
});

// Captura errores lanzados por express.json() cuando el cuerpo no es
// JSON valido. Sin esto, Express responde con un stack trace en HTML
// que expone rutas internas.
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ errores: ["El cuerpo de la peticion no es un JSON valido."] });
  }
  console.error(error);
  return res.status(500).json({ errores: ["Ocurrio un error interno en el servidor."] });
});

module.exports = app;
