// =====================================================================
// Registros estructurados (Practica 10): JSON en stdout con el trace_id
// y span_id de la peticion en curso. Promtail los lleva a Loki, y Grafana
// salta de un registro a su traza (y de una traza a sus registros).
// =====================================================================
const pino = require("pino");
const { trace, context } = require("@opentelemetry/api");

const logger = pino({
  base: { servicio: process.env.OTEL_SERVICE_NAME || "desconocido" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  mixin() {
    const span = trace.getSpan(context.active());
    if (!span) return {};
    const { traceId, spanId } = span.spanContext();
    return { trace_id: traceId, span_id: spanId };
  },
});

// Una linea por peticion atendida (excepto /health y /metrics).
function registrarPeticiones() {
  return (req, res, next) => {
    const inicio = process.hrtime.bigint();
    const activo = context.active();
    res.on("finish", () => {
      if (req.path === "/health" || req.path === "/metrics") return;
      const duracion_ms = Math.round(Number(process.hrtime.bigint() - inicio) / 1e6);
      const nivel = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      context.with(activo, () => logger[nivel]({
        metodo: req.method, ruta: req.originalUrl, estado: res.statusCode, duracion_ms,
      }, "peticion"));
    });
    next();
  };
}

module.exports = { logger, registrarPeticiones };
