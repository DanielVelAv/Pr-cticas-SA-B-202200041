# Diagrama del flujo de telemetría

Recorrido de cada señal desde el servicio hasta el tablero, la alerta y la decisión del canary.
Versión en imagen: [diagrama-telemetria.png](diagrama-telemetria.png).

```mermaid
flowchart LR
  U(["Usuarios<br/>(generador de tráfico)"]) --> GW

  subgraph APP["namespace sa-p9-produccion"]
    GW["api-gateway<br/>(Rollout canary)"]
    AU["ms-auth"]
    LO["ms-lotes"]
    PG[("PostgreSQL")]
    GW -- "HTTP + traceparent" --> AU
    GW -- "HTTP + traceparent" --> LO
    AU --> PG
    LO --> PG
  end

  subgraph OBS["namespace observabilidad (desplegado por ArgoCD)"]
    OC["OpenTelemetry<br/>Collector"]
    TE[("Tempo<br/>trazas")]
    PT["Promtail<br/>(DaemonSet)"]
    LK[("Loki<br/>registros")]
    PR[("Prometheus<br/>métricas + reglas SLO")]
    AM["Alertmanager"]
    GF["Grafana<br/>tablero 4 señales de oro"]
  end

  GW & AU & LO -- "TRAZAS<br/>OTLP/HTTP :4318" --> OC --> TE
  GW & AU & LO -- "REGISTROS<br/>JSON stdout con trace_id" --> PT --> LK
  PR -- "MÉTRICAS<br/>scrape :9464 (PodMonitor)<br/>conserva el hash del pod canary" --> GW & AU & LO

  PR -- "reglas de registro<br/>SLI y presupuesto" --> PR
  PR -- "alertas por consumo<br/>del presupuesto" --> AM -- "runbook_url" --> OP(["Operador"])
  GF --> PR & LK & TE
  LK <-. "trace_id: registro ↔ traza" .-> TE

  AR["Argo Rollouts<br/>AnalysisTemplate"] -- "PromQL: error y p95<br/>del canary" --> PR
  AR -- "aborta y revierte" --> GW
  OP --> GF

  classDef app fill:#bbdefb,stroke:#0d47a1,color:#000
  classDef obs fill:#c8e6c9,stroke:#1b5e20,color:#000
  classDef ext fill:#ffe0b2,stroke:#e65100,color:#000
  class GW,AU,LO,PG app
  class OC,TE,PT,LK,PR,AM,GF obs
  class U,OP,AR ext
```

| Señal | Origen | Transporte | Almacén | Uso |
|---|---|---|---|---|
| **Trazas** | SDK OTel (auto-instrumentación http, express, pg) | OTLP → Collector | Tempo | recorrido de una petición entre servicios; span que falló |
| **Métricas** | SDK OTel, exportador Prometheus `:9464` | scrape de Prometheus (PodMonitor) | Prometheus | tablero, SLO, alertas y análisis del canary |
| **Registros** | logger pino (JSON con `trace_id`) | stdout → Promtail | Loki | detalle del error; se enlaza con la traza por `trace_id` |
