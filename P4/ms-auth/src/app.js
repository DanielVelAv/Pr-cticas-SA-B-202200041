const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const rutas = require("./routes");

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/auth", rutas);
app.get("/health", (req, res) => res.status(200).json({ servicio: "ms-auth", estado: "ok" }));
app.use((req, res) => res.status(404).json({ errores: ["Ruta no encontrada."] }));

module.exports = app;
