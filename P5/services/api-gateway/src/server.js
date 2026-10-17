const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { verificarToken, requerirRol } = require("./autenticacion");
const { logger, registrarPeticiones } = require("./logger");

const app = express();
const PUERTO = Number.parseInt(process.env.PORT || "8080", 10);

const DESTINOS = {
  auth: process.env.MS_AUTH_URL || "http://ms-auth:3001",
  lotes: process.env.MS_LOTES_URL || "http://ms-lotes:3002",
  aprobaciones:
    process.env.MS_APROBACIONES_URL || "http://ms-aprobaciones:3003",
  notificaciones:
    process.env.MS_NOTIFICACIONES_URL || "http://ms-notificaciones:3004",
};

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(registrarPeticiones());

// Fallo inducido de la Practica 10 (distinto al de P8): con TASA_FALLO
// entre 0 y 1, esa fraccion de las peticiones REALES de usuarios a /api
// responde 500. Solo afecta a la version que lo tenga activado, asi que
// en un canary lo detecta el analisis por metricas (tasa de error del
// canary en Prometheus) y Argo Rollouts revierte sin intervencion.
const TASA_FALLO = Number.parseFloat(process.env.TASA_FALLO || "0");
app.use("/api", (req, res, next) => {
  if (TASA_FALLO > 0 && Math.random() < TASA_FALLO) {
    logger.error({ ruta: req.originalUrl, tasa_fallo: TASA_FALLO }, "fallo inducido: el gateway rechaza la peticion");
    return res.status(500).json({ errores: ["Error interno del Gateway."] });
  }
  return next();
});

app.get("/health", (req, res) => {
  // Fallo inducido controlado (Practica 8): SIEMPRE responde 200, para
  // que las probes de Kubernetes (startup/readiness/liveness) dejen
  // pasar al pod con normalidad -- el chequeo de negocio profundo le
  // corresponde al AnalysisTemplate de Argo Rollouts, no a Kubernetes.
  // Con SIMULAR_FALLO=true solo cambia el campo "estado" del cuerpo:
  // el AnalysisRun lo detecta (successCondition compara contra "ok"),
  // pero el pod no entra en bucle de reinicios por una probe fallida.
  const estado = process.env.SIMULAR_FALLO === "true" ? "degradado" : "ok";
  res.status(200).json({ servicio: "api-gateway", estado, destinos: DESTINOS });
});
/**
 * Propaga la identidad ya verificada hacia el microservicio destino.
 * El servicio interno no vuelve a validar el token: confia en estos
 * encabezados porque solo el Gateway esta expuesto al exterior.
 */
function propagarIdentidad(proxyReq, req) {
  if (req.usuario) {
    proxyReq.setHeader("x-usuario-id", req.usuario.id);
    proxyReq.setHeader("x-usuario-rol", req.usuario.rol);
  }
}

/**
 * Express elimina el prefijo del app.use antes de que el proxy vea la
 * peticion: en "/api/lotes/5" el proxy recibe solo "/5". Por eso hay
 * que anteponer la ruta base que espera el microservicio destino.
 */
const proxy = (destino, prefijo) =>
  createProxyMiddleware({
    target: destino,
    changeOrigin: true,
    pathRewrite: (ruta) => prefijo + (ruta === "/" ? "" : ruta),
    on: { proxyReq: propagarIdentidad },
  });

// ---------- Rutas publicas (no requieren token) ----------
app.use("/api/auth", proxy(DESTINOS.auth, "/auth"));

// ---------- Rutas protegidas ----------
app.use("/api/lotes", verificarToken, proxy(DESTINOS.lotes, "/lotes"));

app.use(
  "/api/graphql/lotes",
  verificarToken,
  proxy(DESTINOS.lotes, "/graphql"),
);

app.use(
  "/api/aprobaciones",
  verificarToken,
  proxy(DESTINOS.aprobaciones, "/solicitudes"),
);

app.use(
  "/api/graphql/aprobaciones",
  verificarToken,
  proxy(DESTINOS.aprobaciones, "/graphql"),
);

// Solo un administrador puede consultar las notificaciones enviadas.
app.use(
  "/api/notificaciones",
  verificarToken,
  requerirRol("admin"),
  proxy(DESTINOS.notificaciones, "/notificaciones"),
);

app.use((req, res) =>
  res.status(404).json({ errores: ["Ruta no encontrada en el Gateway."] }),
);

app.listen(PUERTO, "0.0.0.0", () => {
  logger.info({ puerto: PUERTO, destinos: DESTINOS, tasa_fallo: TASA_FALLO }, "api-gateway escuchando");
});
