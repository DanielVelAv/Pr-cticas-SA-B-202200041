# Informe de operación — P10

Sistema: sa-platform (api-gateway, ms-auth y ms-lotes) en el clúster kind `sa-p9`. Tráfico real
simulado y constante (~3 peticiones/s). Horas en UTC del 17/10/2026. Evidencias en `P10/evidencias/`.

## 1. SLO declarados

| SLO | Objetivo | Ventana | Por qué ese número |
|---|---|---|---|
| Disponibilidad: peticiones `/api` sin 5xx | **99.5 %** | 7 días | Un clúster de una laptop con PostgreSQL en una réplica no puede prometer 99.9 %. 99.5 % deja ~50 min por semana para un despliegue o una restauración (78 s medidos en la P9). |
| Latencia: peticiones `/api` en < 1 s | **99 %** | 7 días | La línea base medida tiene p95 = 473 ms en el login, lento a propósito por bcrypt. Con 500 ms habría alertas falsas con tráfico normal; 1 s es el límite en que la respuesta se percibe como inmediata. |

Detalle y reglas de registro: [`SLO.md`](SLO.md).

## 2. Fallo inducido

Distinto al de la P8, que solo hacía que el `/health` respondiera "degradado":

- **A. Canary defectuoso** ([`canary-20261017T064500Z.log`](evidencias/canary-20261017T064500Z.log)). Nueva versión del gateway con `TASA_FALLO=0.3`: el 30 % de las peticiones **reales** a `/api` responde 500.
- **B. Versión de ms-auth con una migración incompleta** ([`sintoma-causa-…-corrida1.log`](evidencias/sintoma-causa-20261017T064800Z-corrida1.log) y [`sintoma-causa-20261017T070125Z.log`](evidencias/sintoma-causa-20261017T070125Z.log)). `FALLO_BD=true` hace que el login consulte la tabla inexistente `usuarios_v2`. Todos los inicios de sesión fallan (500) y el resto del sistema sigue funcionando.

Ambos se activaron cambiando una variable del despliegue, con ArgoCD pausado durante la prueba.

## 3. Tiempo de detección

| Fallo | Inicio | Primera señal | Alerta / decisión | Detección |
|---|---|---|---|---|
| A. Canary | 06:45:01 | AnalysisRun: tasa de error del canary 19.5 % (> 5 %) | `RolloutAborted` 06:46:22 | **81 s** |
| B. ms-auth (corrida 1, línea base limpia) | 06:48:03 | 06:48:24: SLI de 5 min > 1 % | `SLODisponibilidadConsumoRapido` firing 06:55:43 | señal **21 s**, alerta **7 min 40 s** |
| B. ms-auth (corrida 2) | 07:01:29 | 07:02:14 | firing 07:03:45 | alerta **2 min 16 s** (la ventana de 1 h aún tenía los errores de la corrida 1) |

La alerta tarda más que la primera señal **por diseño**: exige que el consumo se sostenga en la
ventana de 1 h. Con el login caído, los errores eran ~36 % del tráfico total, y la ventana de 1 h
tardó ~7 min en superar el 7.2 % (14.4 × 0.5 %).

## 4. Recorrido hasta la causa

Pasos (corrida 2, evidencia con los IDs reales):
1. **Alerta** `SLODisponibilidadConsumoRapido` → su `runbook_url` lleva al runbook.
2. **Métricas**: en el tablero, fila *Errores*, la ruta que falla es `ms-auth /auth/login 500`.
3. **Traza**: en Tempo, TraceQL `{ resource.service.name = "ms-auth" && status = error }` → traza `1bba4303…047f` (gateway → ms-auth → PostgreSQL). El span con error es `pg.query:SELECT auth_db`, con el mensaje `relation "usuarios_v2" does not exist`.
4. **Registro**: en Loki, `{namespace="sa-p9-produccion"} | json | trace_id="1bba4303…047f" | level="error"` → línea de ms-auth con `"error":"relation \"usuarios_v2\" does not exist","codigo":"42P01"` y las líneas del gateway con el mismo `trace_id`.

**Tiempo:** el script recorre alerta → traza → registro en **menos de 1 s**. El mismo
recorrido hecho a mano en Grafana (tablero → Explore Tempo → "Logs for this span") se demuestra y
cronometra en el video. La causa (tabla inexistente en el login) se ve sin abrir los
registros de cada servicio por separado.

## 5. Tiempo de recuperación

| Fallo | Quién / qué lo resolvió | Desde → hasta | Recuperación |
|---|---|---|---|
| A. Canary | **Argo Rollouts, solo**, por el AnalysisRun `sa-platform-api-gateway-79d84bb5c9-3-2` | El aborto devolvió el tráfico a la versión estable al instante: los 2 pods estables nunca dejaron de atender | **0 s de impacto** fuera del canary (81 s con 1 de 3 pods fallando al 30 %) |
| B. ms-auth | **El operador** revierte el cambio (`FALLO_BD=false`) | corrección 06:55:44 → SLI de 5 min < 1 % a las 07:00:45 | **5 min 1 s**. Los errores reales cesan en ~30 s, al terminar el rollout de ms-auth; el resto es el arrastre de la ventana de 5 min |

Con el fallo B activo, el login estuvo caído **12 min 42 s** en total (06:48:03 → 07:00:45),
dominados por los 7 min 40 s de espera de la alerta.

## 6. Alerta faltante o sobrante

- **Faltante.** Una alerta por **trayecto de usuario** (SLO del login). El SLO global diluyó la caída: un login 100 % roto se vio como 36 % de errores, y la página tardó 7 min 40 s, cuando la primera señal estuvo a los 21 s. Un SLO del login (`http_route="/api/auth"`) con la misma regla 14.4× habría alertado en ~1 min con un indicador de 100 %, y sin agregar ruido, porque sigue siendo por consumo del presupuesto.
- **Lectura del presupuesto.** Tras las dos caídas inducidas del login, el tablero marca el presupuesto semanal de disponibilidad en **−116 %** (98.9 % sin errores, contra un objetivo de 99.5 %). Dos incidentes de 7 a 12 minutos bastan para agotar la semana. Según la política de presupuesto, eso congela los despliegues no urgentes hasta recuperarlo.
- **Sobrante.** Ninguna de las dos alertas definidas sonó sin motivo. La de latencia no se disparó en ninguna prueba, y con la línea base actual no hay razón para que lo haga. Se eliminaron las reglas por defecto de kube-prometheus-stack, que nadie habría atendido.
- **Mejora concreta a la instrumentación.** Agregar **exemplars** (el `trace_id` dentro del histograma `http_server_request_duration`): desde el panel de errores o de latencia del tablero se saltaría directo a una traza afectada, ahorrando el paso de buscar en Tempo. Además, normalizar el `trace_id` a 32 caracteres en todas las consultas: la búsqueda de Tempo omite los ceros iniciales, y en la corrida 1 eso hizo fallar el salto automático de traza a registro.
