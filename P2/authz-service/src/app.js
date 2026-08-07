const express = require("express");
const config = require("./config");
const { TokenVerifier } = require("./TokenVerifier");
const { PoliticaEnMemoria } = require("./politica");
const EvaluarAcceso = require("./EvaluarAcceso");

const app = express();
app.use(express.json());

// Aqui se arman las piezas: verificador + politica -> caso de uso.
const evaluar = new EvaluarAcceso(new TokenVerifier(config), new PoliticaEnMemoria());

/**
 * SIEMPRE responde 200, incluso al denegar.
 *
 * Una denegacion es una respuesta EXITOSA del servicio, no un fallo.
 * Devolver 4xx aqui haria que el backend reintentara una decision ya
 * tomada, cuadruplicando la carga en cada acceso denegado sin cambiar
 * el resultado. Los unicos 5xx posibles son fallas reales del proceso.
 */
app.post("/authorize", (req, res) => {
  const { token, permiso_requerido: permiso, request_id: requestId } = req.body ?? {};

  if (typeof token !== "string" || typeof permiso !== "string") {
    return res.status(400).json({ errores: ["Se requieren token y permiso_requerido."] });
  }

  const decision = evaluar.ejecutar(token, permiso);

  console.log(
    `[decision] requestId=${requestId ?? "-"} permiso=${permiso} ` +
      `permitido=${decision.permitido} razon=${decision.razon}`,
  );

  return res.status(200).json({
    permitido: decision.permitido,
    razon: decision.razon,
    sujeto: decision.sujeto,
  });
});

app.get("/health", (req, res) => res.status(200).json({ estado: "ok" }));

app.use((req, res) => res.status(404).json({ errores: ["La ruta solicitada no existe."] }));

module.exports = app;
