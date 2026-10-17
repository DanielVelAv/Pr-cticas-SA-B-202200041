const express = require("express");
const { createHandler } = require("graphql-http/lib/use/express");
const { inicializar } = require("./db");
const repositorio = require("./repositorio");
const { schema, root } = require("./graphql");
const { metrics } = require("@opentelemetry/api");
const { logger, registrarPeticiones } = require("./logger");

// Metrica de negocio (Practica 10): lotes de pagos cargados y su monto.
const meter = metrics.getMeter("ms-lotes");
const lotesCreados = meter.createCounter("lotes_creados", { description: "Lotes de pagos cargados" });
const montoLotes = meter.createCounter("lotes_monto_quetzales", { description: "Monto total de los lotes cargados (Q)" });

const app = express();
app.use(express.json());
app.use(registrarPeticiones());
const PUERTO = Number.parseInt(process.env.PORT || "3002", 10);

app.get("/health", (req, res) => res.json({ servicio: "ms-lotes", estado: "ok" }));

// ---------- API REST ----------
app.get("/lotes", async (req, res) => {
  try {
    res.json({ lotes: await repositorio.listarLotes() });
  } catch (e) { res.status(500).json({ errores: [e.message] }); }
});

app.get("/lotes/:id", async (req, res) => {
  try {
    const lote = await repositorio.obtenerLote(Number(req.params.id));
    if (!lote) return res.status(404).json({ errores: ["Lote no encontrado."] });
    lote.transacciones = await repositorio.transaccionesDe(lote.id);
    res.json(lote);
  } catch (e) { res.status(500).json({ errores: [e.message] }); }
});

app.post("/lotes", async (req, res) => {
  try {
    const { nombreArchivo, transacciones } = req.body ?? {};
    if (!nombreArchivo || !Array.isArray(transacciones) || transacciones.length === 0) {
      return res.status(400).json({
        errores: ["Se requiere nombreArchivo y al menos una transaccion."] });
    }
    // El Gateway ya valido el token y propaga la identidad por encabezado.
    const usuarioId = req.headers["x-usuario-id"] || "anonimo";
    const lote = await repositorio.crearLote({ nombreArchivo, usuarioId, transacciones });
    lotesCreados.add(1);
    montoLotes.add(Number(lote.monto_total) || 0);
    res.status(201).json(lote);
  } catch (e) {
    logger.error({ error: e.message, codigo: e.code }, "error creando el lote");
    res.status(500).json({ errores: [e.message] });
  }
});

// Usado por ms-aprobaciones para marcar el lote como aprobado.
app.patch("/lotes/:id/estado", async (req, res) => {
  try {
    const lote = await repositorio.cambiarEstado(Number(req.params.id), req.body?.estado);
    if (!lote) return res.status(404).json({ errores: ["Lote no encontrado."] });
    res.json(lote);
  } catch (e) { res.status(500).json({ errores: [e.message] }); }
});

// ---------- API GraphQL ----------
app.all("/graphql", createHandler({ schema, rootValue: root }));

inicializar()
  .then(() => app.listen(PUERTO, "0.0.0.0", () => {
    logger.info({ puerto: PUERTO }, "ms-lotes escuchando (REST y GraphQL)");
  }))
  .catch((e) => { logger.fatal({ error: e.message }, "ms-lotes no pudo iniciar"); process.exit(1); });
