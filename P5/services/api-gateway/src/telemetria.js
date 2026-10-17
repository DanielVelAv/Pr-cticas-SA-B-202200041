// =====================================================================
// Telemetria (Practica 10). Se carga ANTES que la aplicacion:
//   node --require ./src/telemetria.js src/server.js
// - Trazas: auto-instrumentacion de http, express y pg; se exportan por
//   OTLP al OpenTelemetry Collector (OTEL_EXPORTER_OTLP_ENDPOINT). La
//   cabecera traceparent se propaga sola en las llamadas http salientes,
//   asi una peticion se sigue de extremo a extremo con un solo trace_id.
// - Metricas: exportador Prometheus en :9464/metrics (Prometheus lee el
//   pod directamente y conserva la etiqueta del pod canary).
// El nombre del servicio sale de OTEL_SERVICE_NAME.
// =====================================================================
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
const { PrometheusExporter } = require("@opentelemetry/exporter-prometheus");

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PrometheusExporter({ port: Number(process.env.METRICS_PORT || 9464) }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
      "@opentelemetry/instrumentation-net": { enabled: false },
      // El trace_id lo agrega nuestro logger (src/logger.js).
      "@opentelemetry/instrumentation-pino": { enabled: false },
      // Las probes y el scraping no son trafico de usuarios.
      "@opentelemetry/instrumentation-http": {
        ignoreIncomingRequestHook: (req) => req.url === "/health" || req.url === "/metrics",
      },
    }),
  ],
});

sdk.start();
process.on("SIGTERM", () => {
  sdk.shutdown().finally(() => process.exit(0));
});
