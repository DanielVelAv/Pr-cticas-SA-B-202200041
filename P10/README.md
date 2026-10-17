# Práctica 10 — Observabilidad y operación (del síntoma a la causa)

Daniel Eduardo Velásquez Ávila · 202200041 · Software Avanzado, USAC

El ecosistema de las prácticas 8 y 9 deja de ser una caja negra. Tres servicios instrumentados con
OpenTelemetry producen **trazas, métricas y registros correlacionados por `trace_id`**. Prometheus
decide el **canary** con el tráfico real de la versión candidata, y dos **SLO** con alertas por
consumo del presupuesto dicen cuándo vale la pena intervenir. Todo el stack se despliega por
GitOps (ArgoCD) sobre el mismo clúster de la P9.

## Tabla de enlaces obligatoria (4.1)

| Ítem | Enlace o dato |
|---|---|
| Repositorio de código | https://github.com/DanielVelAv/Pr-cticas-SA-B-202200041 |
| Repositorio GitOps | https://github.com/DanielVelAv/sa-platform-gitops |
| Servicios instrumentados | `api-gateway`, `ms-auth`, `ms-lotes` — namespace `sa-p9-produccion` (código: [`P5/services/*/src/telemetria.js`](../P5/services/api-gateway/src/telemetria.js) y [`logger.js`](../P5/services/api-gateway/src/logger.js)) |
| AnalysisTemplate por métricas | `api-gateway-metricas-canary` — [`chart/charts/api-gateway/templates/analysistemplate.yaml`](https://github.com/DanielVelAv/sa-platform-gitops/blob/main/chart/charts/api-gateway/templates/analysistemplate.yaml) |
| Consultas del análisis | ver [Consultas PromQL del canary](#consultas-promql-del-canary) (tasa de error < 5 % y p95 < 1 s del pod canary) |
| SLO declarados | **Disponibilidad 99.5 %** sin 5xx, ventana **7 días** · **Latencia 99 %** en < 1 s, ventana **7 días** ([`SLO.md`](SLO.md)) |
| Reglas de alerta | PrometheusRule `slo-sa-platform` — [`observabilidad/slo-reglas.yaml`](https://github.com/DanielVelAv/sa-platform-gitops/blob/main/observabilidad/slo-reglas.yaml) |
| Tablero | [`P10/tablero/tablero-operacion.json`](tablero/tablero-operacion.json) (captura en operación: [`tablero/captura-tablero.png`](tablero/captura-tablero.png)) |
| Reversión por métricas | AnalysisRun **`sa-platform-api-gateway-79d84bb5c9-3-2`** (Failed) del Rollout **`sa-platform-api-gateway`** — [evidencia](evidencias/canary-20261017T064500Z.log) |
| Recorrido síntoma a causa | [`evidencias/sintoma-causa-20261017T070125Z.log`](evidencias/sintoma-causa-20261017T070125Z.log): alerta → traza (span `pg.query` con `relation "usuarios_v2" does not exist`) → registro en Loki con el mismo `trace_id` en **< 1 s** (automatizado); detección: primera señal 21 s, alerta 7 min 40 s ([corrida 1](evidencias/sintoma-causa-20261017T064800Z-corrida1.log)) |
| Video demostrativo | PENDIENTE — URL y minutaje abajo |

### Minutaje del video

| Minuto | Punto demostrado |
|---|---|
| PENDIENTE | Arquitectura y flujo de telemetría |
| PENDIENTE | Una petición seguida de extremo a extremo (traza → registros) |
| PENDIENTE | Métricas de negocio y tablero de las 4 señales de oro |
| PENDIENTE | SLO, reglas de registro y presupuesto |
| PENDIENTE | Canary revertido por métricas (AnalysisRun) |
| PENDIENTE | Fallo inducido: alerta → traza → registro, cronometrado |

## Consultas PromQL del canary

`{{args.canary-hash}}` es el `rollouts-pod-template-hash` de la versión candidata
(`podTemplateHashValue: Latest`). El PodMonitor lo copia a cada serie, así que se mide **solo** el
pod canary.

El análisis corre **dos veces**: con el 20 % y con el 50 % del tráfico; si cualquiera falla, Argo Rollouts revierte.

**Tasa de error** (éxito si `result[0] < 0.05`; 4 mediciones cada 30 s, falla con más de 1):
```promql
(sum(rate(http_server_request_duration_count{namespace="sa-p9-produccion", servicio="api-gateway", rollouts_pod_template_hash="{{args.canary-hash}}", http_route=~"/api.*", http_response_status_code=~"5.."}[1m])) or vector(0))
/
(sum(rate(http_server_request_duration_count{namespace="sa-p9-produccion", servicio="api-gateway", rollouts_pod_template_hash="{{args.canary-hash}}", http_route=~"/api.*"}[1m])) > 0 or vector(1))
```
**Latencia p95** (éxito si `result[0] < 1`, el doble del p95 normal medido de 0.47 s):
```promql
histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_bucket{namespace="sa-p9-produccion", servicio="api-gateway", rollouts_pod_template_hash="{{args.canary-hash}}", http_route=~"/api.*"}[1m]))) or vector(0)
```

## Documentos

| Entregable | Archivo |
|---|---|
| Informe de operación (6 campos) | [`INFORME-OPERACION.md`](INFORME-OPERACION.md) |
| Definición y justificación de los SLO | [`SLO.md`](SLO.md) |
| Runbooks (uno por alerta) | [`runbooks/SLODisponibilidadConsumoRapido.md`](runbooks/SLODisponibilidadConsumoRapido.md) · [`runbooks/SLOLatenciaConsumoRapido.md`](runbooks/SLOLatenciaConsumoRapido.md) |
| Diagrama del flujo de telemetría | [`DIAGRAMA-TELEMETRIA.md`](DIAGRAMA-TELEMETRIA.md) ([imagen](diagrama-telemetria.png)) |
| Pruebas reproducibles | [`pruebas/prueba-canary.sh`](pruebas/prueba-canary.sh) · [`pruebas/prueba-sintoma-causa.sh`](pruebas/prueba-sintoma-causa.sh) |

## Cómo se cumple cada requisito

| Requisito | Implementación |
|---|---|
| Instrumentación OTel en 3 servicios con propagación | `telemetria.js` (cargado con `node --require`): NodeSDK con auto-instrumentación de http, express y pg; la cabecera `traceparent` se propaga sola en las llamadas gateway → ms-auth y gateway → ms-lotes. Una petición `POST /api/lotes` produce una sola traza con spans de gateway, ms-lotes y PostgreSQL. |
| Métricas técnicas y de negocio | Latencia, tráfico y errores: `http_server_request_duration` (histograma de OTel). Saturación: CPU y memoria del pod frente a su límite, y retraso del event loop. Negocio: `inicios_sesion_total{resultado}`, `usuarios_registrados_total`, `lotes_creados_total`, `lotes_monto_quetzales_total`. |
| Registros estructurados | JSON (pino) con `trace_id` y `span_id` en cada línea; Promtail → Loki; consultables por campo (`\| json \| trace_id="…"`). Grafana enlaza registro → traza (derived field) y traza → registros (tracesToLogs). |
| Recolección por GitOps | Applications `kube-prometheus-stack`, `loki`, `promtail`, `tempo`, `otel-collector` y `observabilidad` en [`apps/`](https://github.com/DanielVelAv/sa-platform-gitops/tree/main/apps) del repo GitOps (app-of-apps `sa-p9-root`). |
| Canary por métricas | AnalysisTemplate de tipo `prometheus` (sin Job ni prueba sintética): tasa de error y p95 de la versión candidata. |
| SLO y alertas | 2 SLO con reglas de registro (indicador y presupuesto) y 2 alertas multi-ventana por consumo (14.4×), cada una con `runbook_url`. Las reglas por defecto se eliminaron (ruido). |
| Tablero | Organizado por las 4 señales de oro, con una fila superior de SLO; cada panel lleva como título la pregunta que responde. |
| Fallo inducido distinto a P8 | P8: `/health` respondía "degradado". P10: `TASA_FALLO` hace que una fracción de las peticiones **reales** del canary responda 500 (detección por métricas), y `FALLO_BD` rompe la consulta de login de ms-auth (recorrido síntoma → causa). |
| Conservación del flujo previo | GitOps, Argo Rollouts, Kyverno (sigue rechazando `:latest`), Sealed Secrets, Velero y las imágenes de GHCR con tags inmutables construidas por CI siguen operando; la P9 se califica sobre el mismo clúster. |

## Acceso local

```bash
kubectl --context kind-sa-p9 -n observabilidad port-forward svc/monitoring-grafana 3000:80        # Grafana (acceso anónimo)
kubectl --context kind-sa-p9 -n observabilidad port-forward svc/monitoring-prometheus 9090:9090   # Prometheus
kubectl --context kind-sa-p9 -n observabilidad port-forward svc/monitoring-alertmanager 9093:9093 # Alertmanager
```
